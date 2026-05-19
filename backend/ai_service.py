"""
AI service for generating documentation and explanations using NVIDIA NIM.
All LLM traffic (file analysis, documentation, diagrams, chat) goes through
a single OpenAI-compatible NIM endpoint.
"""
import logging

logger = logging.getLogger(__name__)

import asyncio
import requests
import re
import json
import time
from typing import List, Dict, Any, Optional, Tuple
from config import get_settings

# Import the safe Mermaid pipeline
from mermaid_pipeline import (
    process_json_to_mermaid,
    get_diagram_generation_prompt,
    get_schema_for_prompt,
    get_examples_for_prompt,
    ValidationResult
)

settings = get_settings()


class AIService:
    """Service for AI-powered code analysis and documentation generation.

    All requests (file analysis, documentation, diagrams, chat) go to a single
    NVIDIA NIM endpoint using the OpenAI-compatible chat-completions API.
    """

    def __init__(self):
        """Initialize the NVIDIA NIM client."""
        self.api_key = settings.nvidia_api_key
        self.model_name = settings.nvidia_model
        self.api_url = settings.nvidia_api_url

        if not self.api_key:
            raise ValueError("No AI API configured! Set NVIDIA_API_KEY.")

        # NVIDIA's free tier is generous (~40 RPM) so a small inter-call delay
        # for bulk file analysis is enough to stay well under any provider cap.
        self._bulk_call_delay_seconds = 1.5

        logger.info(f"✅ NVIDIA NIM configured: {self.model_name}")

    def _call_nvidia(self, prompt: str, system_prompt: str = None, timeout: int = 120) -> str:
        """
        Call NVIDIA NIM chat-completions endpoint (OpenAI-compatible).

        Args:
            prompt: User prompt
            system_prompt: Optional system prompt for context
            timeout: Request timeout in seconds

        Returns:
            Assistant message content
        """
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        data = {
            "model": self.model_name,
            "messages": messages,
            "temperature": settings.llm_temperature,
            "max_tokens": settings.llm_max_tokens,
            "top_p": settings.llm_top_p,
            "frequency_penalty": settings.llm_frequency_penalty,
            "presence_penalty": settings.llm_presence_penalty,
            "stream": False,
        }

        logger.info(f"🟢 Calling NVIDIA NIM ({self.model_name})...")
        response = requests.post(self.api_url, headers=headers, json=data, timeout=timeout)

        if response.status_code >= 200 and response.status_code < 300:
            result = response.json()
            choice = result["choices"][0]
            msg = choice.get("message", {})
            content = msg.get("content")
            # Reasoning models (e.g. stepfun-ai/step-3.5-flash) may put output in
            # `reasoning_content` and leave `content` null if max_tokens was too
            # small. Fall back, and on hard length-truncation surface an error
            # rather than returning None to downstream parsers.
            if not content:
                content = msg.get("reasoning_content") or msg.get("reasoning") or ""
            if not content:
                finish = choice.get("finish_reason")
                raise Exception(
                    f"NVIDIA NIM returned empty content "
                    f"(finish_reason={finish}, model={self.model_name})"
                )
            return content

        error_msg = "Unknown error"
        try:
            error_data = response.json()
            error_msg = error_data.get("error", {}).get("message", response.text)
        except Exception:
            error_msg = response.text

        raise Exception(f"NVIDIA NIM HTTP {response.status_code}: {error_msg[:200]}")

    def _call_ai(self, prompt: str, system_prompt: str = None) -> str:
        """General-purpose AI call (chat, diagrams, anything not bulk)."""
        return self._call_nvidia(prompt, system_prompt)

    def _call_bulk(self, prompt: str, system_prompt: str = None) -> str:
        """Bulk-call variant used for per-file analysis. Adds a small delay
        to keep average rate well under provider limits."""
        result = self._call_nvidia(prompt, system_prompt)
        time.sleep(self._bulk_call_delay_seconds)
        return result

    async def generate_file_explanation(
        self,
        file_path: str,
        content: str,
        language: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Generate comprehensive explanation for a code file.
        
        Args:
            file_path: Path to the file
            content: File content
            language: Programming language
            
        Returns:
            Dict with explanation, key_functions, dependencies, and vulnerabilities
        """
        # Limit content to avoid token limits
        max_content_length = 6000  # Reduced to stay within limits
        if len(content) > max_content_length:
            content_preview = content[:max_content_length] + "\n... (file truncated for analysis)"
        else:
            content_preview = content
            
        system_prompt = """You are an expert code documentation specialist. Generate clear, well-formatted explanations of code files.

CRITICAL FORMATTING RULES:
1. Use clean, professional Markdown
2. Start with a 2-3 sentence summary of what the file does
3. Use "## Purpose" as the main section header
4. Use bullet points (•) for listing functionalities
5. Bold (**) key terms and component names
6. Use inline code (`backticks`) for code references like function names, variables, file names
7. Be concise but thorough - explain the WHY not just the WHAT"""

        prompt = f"""Analyze this {language or 'code'} file and generate a well-formatted explanation.

File: `{file_path}`

```{language or 'code'}
{content_preview}
```

Generate your response in this EXACT format:

[Start with 2-3 sentences summarizing what this file does and its role in the project. Mention specific components like `ComponentName` using backticks.]

## Purpose

This file is [describe its primary responsibility]. It's responsible for [main functionality]. Key functionalities include:

• **[First Key Feature]:** [Description using `code references` where appropriate]

• **[Second Key Feature]:** [Description]

• **[Third Key Feature]:** [Description]

• **[Fourth Key Feature]:** [Description if applicable]

• **[Fifth Key Feature]:** [Description if applicable]

IMPORTANT RULES:
1. Each bullet point MUST start on its own line with "• **"
2. Always use `backticks` for code elements (function names, file names, variables, imports)
3. Keep descriptions clear and informative
4. Focus on practical, useful information about what the code does
5. Be specific - reference actual functions/classes from the code
6. Include 4-6 bullet points covering the main functionalities"""

        try:
            # Use OpenRouter for bulk file analysis (saves Gemini quota for docs)
            text = await asyncio.to_thread(self._call_bulk, prompt, system_prompt)

            # Extract sections using improved parsing
            explanation = text.strip()  # Use the full formatted response as explanation
            key_functions = self._extract_list_items(text, ["Key Functions", "Key Classes", "Key Components", "Functions", "Classes"])
            dependencies = self._extract_list_items(text, ["Dependencies", "Imports", "External Libraries"])
            vulnerabilities = self._extract_list_items(text, ["Potential Issues", "Security Concerns", "Issues", "Vulnerabilities"])
            
            return {
                'explanation': explanation if explanation else f"Analysis of {file_path} - a {language or 'code'} file.",
                'key_functions': self._format_key_functions(key_functions),
                'dependencies': dependencies,
                'vulnerabilities': self._format_vulnerabilities(vulnerabilities)
            }
            
        except Exception as e:
            # Fallback if AI generation fails
            logger.info(f"❌ AI generation failed for {file_path}: {e}")
            import traceback
            traceback.print_exc()
            return {
                'explanation': f"Error analyzing {file_path}. This is a {language or 'code'} file with {len(content)} characters.",
                'key_functions': [],
                'dependencies': [],
                'vulnerabilities': []
            }
    
    # -- Section specs for split-generation ------------------------------------
    # Each tuple: (number, title, body_template_for_user_prompt)
    # The user prompt is appended after a shared "shared_context" block.
    DOC_SECTIONS: List[Tuple[int, str, str]] = [
        (1, "Project Overview",
         """Provide:
- **Purpose and goals** of the repository
- **Tech stack** used (languages, frameworks, databases, libraries)
- **Key problem** the repo solves
- **Main features** and capabilities

Write 3-4 well-structured paragraphs (300-500 words total).

**Include this diagram placeholder at the end**: [[DIAGRAM:architecture:High-level system overview showing main components and tech stack]]"""),
        (2, "Architecture Summary",
         """Describe the high-level system architecture:
- How the main **modules, APIs, and components interact**
- Key **design patterns** (e.g., MVC, microservices, event-driven)
- **Logical layers** (frontend, backend, data, ML, etc.)
- **Folder structure** and organization
- **Component relationships**

Write 300-500 words.

**Include this diagram placeholder**: [[DIAGRAM:architecture:Detailed architecture showing component interactions and data flow]]"""),
        (3, "Module-by-Module Breakdown",
         """For each core directory or significant file, document it using this template:

### [Module Name / Path]
**Purpose**: Role in the system

**Core Functions & Classes**:
- Function/Class name: Description, responsibilities, interactions

**Dependencies**:
- Internal: Other repo modules
- External: Libraries, APIs

**Input/Output**: Data consumed/produced

Organize by logical groupings (Frontend, Backend, Services, etc.). Aim for 400-600 words total."""),
        (4, "Data Flow & Process",
         """Explain how data moves through the system:
- **Pipelines, API calls, processing chains**
- How **user input** or external data is handled
- **Step-by-step flow** for key operations
- **Request/response cycles**
- **State management** and persistence
- **Async operations, queues, background jobs**

Write 300-500 words.

**Include this diagram placeholder**: [[DIAGRAM:sequence:Main user workflow showing request flow through system components]]"""),
        (5, "Integration & APIs",
         """Document:
- **API endpoints** and responsibilities
- **Database integrations** and ORM
- **External service integrations** (AI, third-party APIs)
- **Authentication & authorization**
- **Frontend-backend communication**
- **Protocols** (REST, WebSocket, GraphQL)

Write 300-500 words.

**Include this diagram placeholder**: [[DIAGRAM:er:Database schema showing main entities and their relationships]]"""),
        (6, "Setup & Configuration",
         """Document:
- **Setup scripts** and installation
- **Configuration files** (.env, configs)
- **Dependencies** and package management
- **Environment variables**
- **Database setup** and migrations
- **Build and deployment**
- **Dev vs Production** configs

Write 300-500 words. No diagram needed for this section."""),
        (7, "Example Usage & Workflow",
         """Show end-to-end interaction:
- **User journey** from start to finish
- **CLI commands** or API calls
- **UI flow** and interactions
- **Common use cases**
- **Code examples** for key operations
- **Integration examples**

Write 300-500 words.

**Include this diagram placeholder**: [[DIAGRAM:data_flow:User workflow from input through processing to output]]"""),
        (8, "Observations & Recommendations",
         """Provide:

**Strengths**:
- Code organization and modularity
- Design patterns and architecture
- Code quality and clarity
- Performance considerations
- Security measures

**Possible Improvements**:
- Refactoring opportunities
- Naming conventions
- Code duplication
- Missing documentation
- Test coverage
- Scalability concerns

**Architectural Risks or Bottlenecks**:
- Performance bottlenecks
- Security vulnerabilities
- Scalability limitations
- Technical debt
- Dependency risks

Be constructive, specific, and actionable. 300-500 words total."""),
    ]

    async def generate_repository_documentation(
        self,
        repo_name: str,
        file_summaries: List[Dict[str, Any]],
        languages: Dict[str, int],
        progress_callback: Optional[Any] = None,
    ) -> List[Dict[str, str]]:
        """Generate repository documentation as 8 separate sections.

        Each section is a single NIM call (~15-40s each). Calling them
        independently avoids the 120s timeout on the monolithic prompt and
        gives a usable progress signal.

        Args:
            repo_name: Repository name
            file_summaries: List of file metadata and explanations
            languages: Language distribution
            progress_callback: Optional callable (section_idx, total, section_title)
                invoked after each section completes. Used by the worker to
                update DB progress.

        Returns:
            List of documentation sections with name, content, order.
        """
        logger.info(f"🔍 Generating documentation for {repo_name} (8 sections, split calls)...")

        file_context = self._prepare_file_context(file_summaries)
        detailed_files = self._format_detailed_files(file_summaries[:25])
        self._current_file_context = file_context

        languages_str = ', '.join([f'{lang} ({pct}%)' for lang, pct in languages.items()])

        system_prompt = """You are a Senior Technical Documentation Engineer specializing in codebase documentation.

You are generating ONE section of a multi-section documentation. Stay focused on the requested section only — do NOT write any other section's content.

CRITICAL REQUIREMENTS:
1. **Stay on topic** — only produce the section that was requested.
2. **Word count** — target 300-500 words unless the section spec says otherwise.
3. **Diagram placeholders** — when a placeholder is requested, use the EXACT format `[[DIAGRAM:type:description]]` on its own line. Do not write raw Mermaid code.

FORMATTING RULES:
- Use ## for the section header (matching the requested title exactly).
- Use ### for subsections.
- Use bullet points with `-` and **bold** for emphasis.
- Use `backticks` for code terms.
- NO triple asterisks (***), NO raw Mermaid code.

Write like a senior engineer: factual, structured, educational, actionable."""

        shared_context = f"""Repository: **{repo_name}**

Languages: {languages_str}
Total Files: {len(file_summaries)}

## File Context
{file_context[:1500]}

## Detailed File Information
{detailed_files[:2000]}

---
"""

        sections: List[Dict[str, Any]] = []
        total = len(self.DOC_SECTIONS)

        for idx, (number, title, body) in enumerate(self.DOC_SECTIONS, start=1):
            section_user_prompt = (
                f"{shared_context}"
                f"Generate ONLY section **{number}. {title}** of the documentation.\n\n"
                f"Begin with this exact heading on its own line:\n"
                f"## {number}. {title}\n\n"
                f"Then produce the body following this spec:\n\n{body}"
            )

            logger.info(f"📡 [{idx}/{total}] Generating section: {number}. {title}")
            try:
                # Per-section timeout of 30s — non-reasoning llama-4 model returns
                # in ~10-20s for a 500-word section.
                section_text = await asyncio.to_thread(
                    self._call_nvidia, section_user_prompt, system_prompt, 30
                )
                logger.info(f"✅ [{idx}/{total}] Section {number}. {title} done ({len(section_text)} chars)")
            except Exception as e:
                logger.info(f"❌ [{idx}/{total}] Section {number}. {title} failed: {e}")
                section_text = (
                    f"## {number}. {title}\n\n"
                    f"_Generation of this section failed: {str(e)[:200]}_"
                )

            # Replace diagram placeholders in this section only
            try:
                section_text = await self._replace_diagram_placeholders(section_text, file_context)
            except Exception as e:
                logger.info(f"⚠️ Diagram pass failed for section {number}: {e}")

            sections.append({
                'section_name': f"{number}. {title}",
                'content': section_text.strip(),
                'order': number,
            })

            if progress_callback is not None:
                try:
                    cb_result = progress_callback(idx, total, f"{number}. {title}")
                    if asyncio.iscoroutine(cb_result):
                        await cb_result
                except Exception as cb_err:
                    logger.info(f"⚠️ progress_callback raised: {cb_err}")

        logger.info(f"🎉 Documentation complete: {len(sections)} sections")
        return sections

    async def _replace_diagram_placeholders(self, content: str, file_context: str) -> str:
        """
        Replace [[DIAGRAM:type:description]] placeholders with actual Mermaid diagrams.
        
        Each placeholder is processed through the JSON pipeline to ensure valid syntax.
        
        Args:
            content: Documentation content with placeholders
            file_context: File context for diagram generation
            
        Returns:
            Content with placeholders replaced by Mermaid diagrams
        """
        import re
        
        # Pattern to match [[DIAGRAM:type:description]]
        placeholder_pattern = r'\[\[DIAGRAM:(\w+):([^\]]+)\]\]'
        
        # Find all placeholders
        matches = list(re.finditer(placeholder_pattern, content))
        
        if not matches:
            logger.info("ℹ️ No diagram placeholders found in documentation")
            # Check if there are raw mermaid blocks that need validation
            if '```mermaid' in content:
                logger.info("📊 Found raw Mermaid blocks, validating...")
                return await asyncio.to_thread(self.post_process_documentation_diagrams, content, file_context)
            return content
        
        logger.info(f"📊 Found {len(matches)} diagram placeholders to generate")
        
        # Process each placeholder
        for i, match in enumerate(matches, 1):
            diagram_type = match.group(1).lower()
            description = match.group(2).strip()
            placeholder = match.group(0)
            
            logger.info(f"  🔄 Generating diagram {i}/{len(matches)}: {diagram_type} - {description[:50]}...")
            
            # Map placeholder types to our diagram types
            type_map = {
                'architecture': 'architecture',
                'data_flow': 'data_flow',
                'dataflow': 'data_flow',
                'sequence': 'sequence',
                'class': 'class',
                'er': 'er',
                'database': 'database',
                'overview': 'overview',
                'flowchart': 'architecture'
            }
            mapped_type = type_map.get(diagram_type, 'architecture')
            
            # Build context for this specific diagram
            diagram_context = f"""
Repository Context:
{file_context[:2000]}

Diagram Purpose:
{description}

Generate a diagram that accurately represents: {description}
Use actual component/entity names from the context above.
"""
            
            # Generate the diagram via JSON pipeline
            mermaid_diagram = await asyncio.to_thread(
                self.generate_diagram_with_retry,
                diagram_context,
                mapped_type,
                1
            )
            
            # Replace the placeholder with the generated diagram
            content = content.replace(placeholder, mermaid_diagram, 1)
            logger.info(f"  ✅ Diagram {i} generated successfully")
        
        logger.info(f"🎉 All {len(matches)} diagrams generated!")
        return content

    
    async def generate_chat_response(
        self,
        question: str,
        context_chunks: List[Dict[str, Any]]
    ) -> str:
        """
        Generate in-depth response to user question using RAG context.

        Args:
            question: User's question
            context_chunks: Retrieved code chunks for context

        Returns:
            AI-generated detailed answer with proper breakdown
        """
        # Format context with enhanced structure
        context_text = "\n\n".join([
            f"📄 **File: {chunk['file_path']}** (lines {chunk['start_line']}-{chunk['end_line']})\n```\n{chunk['content']}\n```"
            for chunk in context_chunks[:5]  # Limit to top 5 chunks
        ])

        system_prompt = """You are an expert senior software engineer and technical documentation specialist with deep knowledge of software architecture, design patterns, and best practices.

Your role is to provide comprehensive, in-depth answers to code-related questions. When answering:

1. **Be Thorough**: Provide detailed explanations with proper context
2. **Use Structure**: Break down complex answers into clear sections
3. **Add Examples**: Include code examples when relevant
4. **Explain Why**: Don't just say what the code does, explain why it's designed that way
5. **Consider Implications**: Discuss potential issues, edge cases, and best practices
6. **Be Technical**: Use proper technical terminology but explain complex concepts
7. **Provide Context**: Connect the specific code to broader architectural patterns
8. **Use Diagrams**: Include Mermaid diagrams to visualize concepts (flowcharts, sequence diagrams, class diagrams)

Format your responses with clean Markdown:
- Use proper headers (##, ###) - NO triple asterisks (***)
- Use **bold** for emphasis, not ***
- Use bullet points (-) for lists
- Use code blocks with language tags (```python, ```javascript)
- Include Mermaid diagrams where helpful to visualize:
  - Process flows (flowchart)
  - Component interactions (sequenceDiagram)
  - Class relationships (classDiagram)
  - Architecture (graph)

**CRITICAL MERMAID DIAGRAM RULES (Mermaid v11.x compatibility)**:
When writing Mermaid diagrams, you MUST follow these rules STRICTLY:
1. **NO subgraph** - NEVER use subgraph, it causes syntax errors
2. **NO style** - NEVER use style directives (style A fill:#xxx)
3. **NO click** - NEVER use click handlers
4. **NO %% comments** - NEVER use %% comments inside diagrams
5. **Simple node labels** - Use only alphanumeric characters, spaces, and basic punctuation in labels
6. **Quote special characters** - If a label contains special characters like parentheses, wrap the entire label in quotes
7. **Use simple IDs** - Node IDs should be simple: A, B, C or descriptive like UserInput, Database
8. **Keep diagrams small** - Maximum 8-10 nodes per diagram for clarity

VALID Mermaid example:
```mermaid
graph LR
    A[User Input] --> B[Process Data]
    B --> C[Database]
    C --> D[Return Result]
```

INVALID (DO NOT USE):
```mermaid
graph LR
    subgraph Frontend
        A[Component]
    end
    style A fill:#e0f7fa
```"""

        prompt = f"""Based on the following code context from the repository, provide a comprehensive answer to the user's question.

## User Question
{question}

## Relevant Code Context
{context_text}

## Instructions
Analyze the code thoroughly and provide an in-depth answer that:
- Directly addresses the question with specific details
- Explains the implementation and design decisions
- Discusses how different components interact
- Highlights important patterns, practices, or potential concerns
- Provides actionable insights or recommendations if applicable

If the provided context doesn't contain sufficient information to fully answer the question, clearly state what's missing and provide the best answer possible with available information."""

        try:
            # Call AI with Gemini-first, OpenRouter-fallback strategy
            response = await asyncio.to_thread(self._call_ai, prompt, system_prompt)
            # Sanitize any Mermaid diagrams in the response for v11.x compatibility
            return self._sanitize_mermaid_in_response(response)
        except Exception as e:
            return f"I apologize, but I encountered an error generating a response: {str(e)}"
    
    def _sanitize_mermaid_in_response(self, response: str) -> str:
        """
        Sanitize Mermaid diagrams in the response for Mermaid v11.x compatibility.
        
        Removes:
        - subgraph blocks (causes syntax errors in v11.x)
        - style directives
        - click handlers
        - %% comments
        
        Args:
            response: The AI-generated response containing potential Mermaid diagrams
            
        Returns:
            Response with sanitized Mermaid diagrams
        """
        import re
        
        # Find all mermaid code blocks
        mermaid_pattern = r'```mermaid\n(.*?)```'
        
        def sanitize_diagram(match):
            diagram = match.group(1)
            original_diagram = diagram
            
            # Remove subgraph blocks entirely (keep content inside, remove subgraph wrapper)
            # Pattern: subgraph Title\n...content...\nend
            subgraph_pattern = r'^\s*subgraph\s+[^\n]*\n(.*?)^\s*end\s*$'
            diagram = re.sub(subgraph_pattern, r'\1', diagram, flags=re.MULTILINE | re.DOTALL)
            
            # If the above didn't work (different formatting), try simpler patterns
            # Remove 'subgraph ...' lines
            diagram = re.sub(r'^\s*subgraph\s+.*$\n?', '', diagram, flags=re.MULTILINE)
            # Remove 'end' lines that close subgraphs (be careful not to remove 'end' in labels)
            diagram = re.sub(r'^\s*end\s*$\n?', '', diagram, flags=re.MULTILINE)
            
            # Remove style directives (style A fill:#xxx, stroke:#xxx, etc.)
            diagram = re.sub(r'^\s*style\s+\w+\s+.*$\n?', '', diagram, flags=re.MULTILINE)
            
            # Remove click handlers (click A callback, click A "url", etc.)
            diagram = re.sub(r'^\s*click\s+\w+\s+.*$\n?', '', diagram, flags=re.MULTILINE)
            
            # Remove %% comments
            diagram = re.sub(r'%%.*$', '', diagram, flags=re.MULTILINE)
            
            # Remove linkStyle directives
            diagram = re.sub(r'^\s*linkStyle\s+.*$\n?', '', diagram, flags=re.MULTILINE)
            
            # Remove classDef directives
            diagram = re.sub(r'^\s*classDef\s+.*$\n?', '', diagram, flags=re.MULTILINE)
            
            # Remove class assignments (class A,B className)
            diagram = re.sub(r'^\s*class\s+[\w,]+\s+\w+\s*$\n?', '', diagram, flags=re.MULTILINE)
            
            # Clean up multiple empty lines
            diagram = re.sub(r'\n\s*\n\s*\n', '\n\n', diagram)
            diagram = diagram.strip()
            
            # If diagram is now empty or invalid, return a placeholder
            if not diagram or len(diagram.strip()) < 10:
                return '```mermaid\ngraph LR\n    A[Start] --> B[End]\n```'
            
            return f'```mermaid\n{diagram}\n```'
        
        # Apply sanitization to all mermaid blocks
        sanitized = re.sub(mermaid_pattern, sanitize_diagram, response, flags=re.DOTALL)
        
        return sanitized
    
    # ============= Helper Methods =============
    
    def _extract_markdown_section(self, text: str, section_name: str, end_markers: List[str]) -> str:
        """Extract text from a markdown section."""
        try:
            # Try to find the section header (with ## or ***)
            patterns = [
                f"## {section_name}",
                f"**{section_name}**",
                f"### {section_name}",
                f"{section_name}:",
                section_name
            ]
            
            start_pos = -1
            for pattern in patterns:
                start_pos = text.find(pattern)
                if start_pos != -1:
                    start_pos += len(pattern)
                    break
            
            if start_pos == -1:
                return ""
            
            # Find the end of this section
            end_pos = len(text)
            for end_marker in end_markers:
                for pattern in [f"## {end_marker}", f"**{end_marker}**", f"### {end_marker}"]:
                    pos = text.find(pattern, start_pos)
                    if pos != -1 and pos < end_pos:
                        end_pos = pos
            
            section_text = text[start_pos:end_pos].strip()
            
            # Remove leading newlines and clean up
            lines = section_text.split('\n')
            cleaned_lines = [line.strip() for line in lines if line.strip() and not line.strip().startswith('#')]
            
            return ' '.join(cleaned_lines)
        except Exception as e:
            logger.info(f"Error extracting section {section_name}: {e}")
            return ""
    
    def _extract_list_items(self, text: str, section_names: List[str]) -> List[str]:
        """Extract list items from a section."""
        try:
            # Find the section
            section_text = ""
            for section_name in section_names:
                for pattern in [f"## {section_name}", f"**{section_name}**", f"### {section_name}"]:
                    start_pos = text.find(pattern)
                    if start_pos != -1:
                        # Find next section
                        end_pos = len(text)
                        next_section = text.find("##", start_pos + len(pattern))
                        if next_section != -1:
                            end_pos = next_section
                        section_text = text[start_pos:end_pos]
                        break
                if section_text:
                    break
            
            if not section_text:
                return []
            
            # Extract list items (lines starting with -, *, or numbers)
            items = []
            lines = section_text.split('\n')
            for line in lines:
                line = line.strip()
                if line.startswith('- '):
                    items.append(line[2:].strip())
                elif line.startswith('* '):
                    items.append(line[2:].strip())
                elif len(line) > 2 and line[0].isdigit() and line[1:3] in ['. ', ') ']:
                    items.append(line[3:].strip())
            
            return items
        except Exception as e:
            logger.info(f"Error extracting list items: {e}")
            return []
    
    def _format_key_functions(self, items: List[str]) -> List[Dict[str, str]]:
        """Format key functions list items into structured format."""
        result = []
        for item in items:
            # Try to split on : or - to separate name from description
            if ':' in item:
                parts = item.split(':', 1)
                name = parts[0].strip()
                description = parts[1].strip() if len(parts) > 1 else ""
            elif '-' in item:
                parts = item.split('-', 1)
                name = parts[0].strip()
                description = parts[1].strip() if len(parts) > 1 else ""
            else:
                name = item
                description = ""
            
            result.append({
                'name': name,
                'description': description
            })
        
        return result
    
    def _format_vulnerabilities(self, items: List[str]) -> List[Dict[str, str]]:
        """Format vulnerability list items into structured format."""
        result = []
        for item in items:
            # Try to extract severity and description
            severity = "medium"
            vuln_type = "code-quality"
            description = item
            
            # Check for severity indicators
            lower_item = item.lower()
            if 'high' in lower_item or 'critical' in lower_item or 'security' in lower_item:
                severity = "high"
                vuln_type = "security"
            elif 'low' in lower_item or 'minor' in lower_item:
                severity = "low"
            
            # Try to extract type in parentheses
            if '(' in item and ')' in item:
                start = item.find('(')
                end = item.find(')', start)
                extracted = item[start+1:end].strip()
                if any(word in extracted.lower() for word in ['high', 'medium', 'low', 'critical']):
                    severity = extracted.lower()
                    description = item[:start].strip() + ' ' + item[end+1:].strip()
            
            result.append({
                'severity': severity,
                'type': vuln_type,
                'description': description.strip()
            })
        
        return result
    
    def _extract_section(self, text: str, start_marker: str, end_marker: str) -> str:
        """Extract text between two markers (legacy method)."""
        try:
            start = text.find(start_marker)
            end = text.find(end_marker)
            if start != -1 and end != -1:
                return text[start + len(start_marker):end].strip()
        except:
            pass
        return "No description available"
    
    async def _generate_section(self, prompt: str, system_prompt: str = None) -> str:
        """Generate a documentation section via NVIDIA NIM."""
        try:
            return await asyncio.to_thread(self._call_nvidia, prompt, system_prompt)
        except Exception as e:
            logger.info(f"❌ Section generation failed: {e}")
            import traceback
            traceback.print_exc()
            return "Content generation failed"

    def _prepare_file_context(self, files: List[Dict[str, Any]]) -> str:
        """Prepare comprehensive file context for documentation generation."""
        context = []
        for f in files[:30]:  # Limit to top 30 files
            path = f.get('path', 'unknown')
            explanation = f.get('explanation', '')
            context.append(f"- **{path}**: {explanation[:200]}...")
        return "\n".join(context)

    def _format_detailed_files(self, files: List[Dict[str, Any]]) -> str:
        """Format files with detailed information for documentation."""
        result = []
        for f in files:
            path = f.get('path', 'unknown')
            explanation = f.get('explanation', 'No description')
            key_functions = f.get('key_functions', [])
            dependencies = f.get('dependencies', [])

            result.append(f"\n### {path}")
            result.append(f"**Purpose**: {explanation[:300]}")

            if key_functions:
                result.append("\n**Key Functions/Classes**:")
                for func in key_functions[:5]:
                    name = func.get('name', 'Unknown')
                    desc = func.get('description', '')
                    result.append(f"- `{name}`: {desc}")

            if dependencies:
                result.append(f"\n**Dependencies**: {', '.join(dependencies[:10])}")

            result.append("")  # Empty line

        return "\n".join(result)

    def _parse_documentation_sections(self, full_doc: str) -> List[Dict[str, str]]:
        """
        Parse comprehensive documentation into individual sections.
        Handles multiple header formats:
        - # 1. Section Name
        - ## 1. Section Name  
        - # Section Name
        - ## Section Name
        - **1. Section Name**
        """
        import re

        sections = []

        # Multiple patterns to match section headers
        patterns = [
            r'^#{1,2}\s+(\d+)\.\s+(.+?)$',           # # 1. Section or ## 1. Section
            r'^#{1,2}\s+(\d+)\)\s+(.+?)$',           # # 1) Section
            r'^\*\*(\d+)\.\s+(.+?)\*\*$',            # **1. Section**
            r'^---+$',                               # --- divider (will trigger section split)
        ]
        
        # Also try to match headers without numbers
        unnumbered_patterns = [
            r'^#{1,2}\s+(Project Overview|Architecture|Module|Data Flow|Integration|Setup|Example|Usage|Observations|Recommendations|Summary|Overview|Components|Dependencies|Security|API|Configuration|Workflow|Installation|Getting Started|Features|Tech Stack|Technologies).*$',
        ]

        lines = full_doc.split('\n')
        current_section = None
        current_content = []
        current_order = 0
        section_counter = 1

        for line in lines:
            found_match = False
            
            # Try numbered patterns first
            for pattern in patterns:
                if pattern == r'^---+$':
                    # Divider - check if we should split
                    if re.match(pattern, line.strip()) and current_section and len(current_content) > 5:
                        continue  # Skip dividers for now
                    continue
                    
                match = re.match(pattern, line.strip())
                if match:
                    # Save previous section if exists
                    if current_section and current_content:
                        sections.append({
                            'section_name': current_section,
                            'content': '\n'.join(current_content).strip(),
                            'order': current_order
                        })

                    # Start new section
                    order_num = match.group(1)
                    section_name = match.group(2).strip()
                    current_section = f"{order_num}. {section_name}"
                    current_order = int(order_num)
                    current_content = []
                    found_match = True
                    break
            
            # Try unnumbered patterns
            if not found_match:
                for pattern in unnumbered_patterns:
                    match = re.match(pattern, line.strip(), re.IGNORECASE)
                    if match:
                        # Save previous section if exists
                        if current_section and current_content:
                            sections.append({
                                'section_name': current_section,
                                'content': '\n'.join(current_content).strip(),
                                'order': current_order
                            })

                        # Start new section with auto-numbering
                        section_name = match.group(1).strip() if match.lastindex else line.strip().lstrip('#').strip()
                        current_section = f"{section_counter}. {section_name}"
                        current_order = section_counter
                        section_counter += 1
                        current_content = []
                        found_match = True
                        break
            
            if not found_match:
                # Add line to current section content
                if current_section:
                    current_content.append(line)
                elif line.strip():  # No section yet, start a default one
                    current_section = "1. Documentation"
                    current_order = 1
                    current_content = [line]

        # Don't forget the last section
        if current_section and current_content:
            sections.append({
                'section_name': current_section,
                'content': '\n'.join(current_content).strip(),
                'order': current_order
            })

        logger.info(f"📄 Parsed {len(sections)} documentation sections")
        
        # If still no sections, try a simpler approach - split by ## headers
        if len(sections) == 0 and full_doc.strip():
            logger.info("📋 Trying alternative parsing with ## headers...")
            parts = re.split(r'\n(?=##\s+)', full_doc)
            for i, part in enumerate(parts):
                if part.strip():
                    # Extract title from first line
                    first_line = part.strip().split('\n')[0]
                    title = first_line.lstrip('#').strip()[:50]
                    if not title:
                        title = f"Section {i+1}"
                    sections.append({
                        'section_name': f"{i+1}. {title}",
                        'content': part.strip(),
                        'order': i + 1
                    })
            logger.info(f"📄 Alternative parsing found {len(sections)} sections")
        
        return sections
    
    def _format_file_list(self, files: List[Dict[str, Any]]) -> str:
        """Format file list for prompts."""
        return "\n".join([f"- {f.get('path', 'unknown')}" for f in files])
    
    def _generate_tech_stack(self, languages: Dict[str, int], files: List[Dict[str, Any]]) -> str:
        """Generate tech stack section."""
        content = "## Languages\n\n"
        for lang, pct in sorted(languages.items(), key=lambda x: x[1], reverse=True):
            content += f"- **{lang}**: {pct}%\n"
        return content
    
    def _generate_file_descriptions(self, files: List[Dict[str, Any]]) -> str:
        """Generate file descriptions section."""
        content = ""
        for f in files:
            content += f"### {f.get('path', 'unknown')}\n\n"
            content += f"{f.get('explanation', 'No description')}\n\n"
        return content
    
    def _generate_dependencies_section(self, files: List[Dict[str, Any]]) -> str:
        """Generate dependencies section."""
        all_deps = set()
        for f in files:
            all_deps.update(f.get('dependencies', []))
        
        content = "## External Dependencies\n\n"
        for dep in sorted(all_deps):
            content += f"- {dep}\n"
        return content
    
    def _generate_security_section(self, files: List[Dict[str, Any]]) -> str:
        """Generate security section."""
        all_vulns = []
        for f in files:
            all_vulns.extend(f.get('vulnerabilities', []))
        
        if not all_vulns:
            return "No security vulnerabilities detected."
        
        content = "## Detected Issues\n\n"
        for vuln in all_vulns:
            content += f"- **{vuln.get('severity', 'Unknown')}**: {vuln.get('description', '')}\n"
        return content
    
    # ============= Safe Diagram Generation (JSON Pipeline) =============
    
    def generate_diagram_json(
        self, 
        context: str, 
        diagram_type: str = "architecture",
        is_retry: bool = False,
        previous_errors: Optional[List[str]] = None
    ) -> Tuple[bool, str, List[str]]:
        """
        Generate a diagram using the safe JSON pipeline.
        
        The AI outputs JSON only, which is then deterministically converted to Mermaid.
        This ensures consistent, valid diagram syntax.
        
        Args:
            context: Repository/file context for the diagram
            diagram_type: Type of diagram (architecture, data_flow, sequence, etc.)
            is_retry: Whether this is a retry attempt
            previous_errors: Errors from previous attempt
            
        Returns:
            Tuple of (success, mermaid_code, errors)
        """
        system_prompt = self._get_professional_diagram_system_prompt()
        
        # Build retry context if applicable
        retry_context = ""
        if is_retry and previous_errors:
            retry_context = f"""
PREVIOUS ATTEMPT FAILED. Fix these errors:
{chr(10).join(f'- {e}' for e in previous_errors)}

"""
        
        # Map diagram type to JSON type and get specialized instructions
        type_configs = {
            "architecture": {
                "json_type": "flowchart",
                "focus": "Show the high-level system architecture with actual component names from the codebase. Include Frontend, Backend, Database layers if present. Show APIs, services, and their connections.",
                "node_examples": "Frontend App, API Gateway, Auth Service, User Service, PostgreSQL, Redis Cache, WebSocket Handler"
            },
            "data_flow": {
                "json_type": "flowchart", 
                "focus": "Show how data flows through the system. Include user input, processing steps, storage, and output. Label edges with data types or actions.",
                "node_examples": "User Input, Form Validation, API Request, Business Logic, Database Query, Cache Check, Response"
            },
            "sequence": {
                "json_type": "sequence",
                "focus": "Show the interaction sequence between components for a key workflow. Include actual service/component names from the code.",
                "node_examples": "Client, AuthController, UserService, Database, TokenService"
            },
            "class": {
                "json_type": "class",
                "focus": "Show key classes/modules and their relationships. Include actual class names from the codebase with their primary responsibility.",
                "node_examples": "UserController, AuthService, DatabaseRepository, CacheManager, WebSocketHandler"
            },
            "er": {
                "json_type": "er",
                "focus": "Show the data model with actual entity names from the codebase. Include primary entities and their relationships.",
                "node_examples": "User, Repository, File, Documentation, ChatMessage, Session"
            },
            "database": {
                "json_type": "er",
                "focus": "Show database tables/collections and their relationships. Use actual model names from the code.",
                "node_examples": "users, repositories, files, documentation_sections, chat_messages"
            },
            "overview": {
                "json_type": "flowchart",
                "focus": "Show a bird's-eye view of the entire system. Include all major components and how they connect.",
                "node_examples": "Web UI, Mobile App, API Server, Worker Queue, Database, Cache, External APIs"
            }
        }
        
        config = type_configs.get(diagram_type, type_configs["architecture"])
        json_type = config["json_type"]
        
        user_prompt = f"""{retry_context}You are a senior software architect analyzing this codebase. Generate a professional {diagram_type} diagram.

CODEBASE CONTEXT:
{context[:3000]}

YOUR TASK:
{config["focus"]}

PROFESSIONAL REQUIREMENTS:
1. Use ACTUAL component/class/service names from the context - not generic placeholders
2. Node labels should be specific: "{config["node_examples"]}" style, not "Component A, Process B"
3. Edge labels should describe the actual relationship or data flow (e.g., "REST API", "WebSocket", "queries", "validates", "caches")
4. Include 6-8 nodes to show meaningful architecture depth
5. Show realistic software engineering relationships, not abstract connections

JSON REQUIREMENTS:
- Type: "{json_type}"
- Direction: "TD" for vertical, "LR" for horizontal (choose what fits the diagram best)
- Node IDs: A through H (single uppercase letters)
- Node labels: Descriptive names from the actual codebase (max 50 chars)
- Edge labels: Describe the relationship/action (optional, max 30 chars)

Think like a software engineer documenting their system. What would YOU draw on a whiteboard?

Output ONLY the JSON object. No markdown fences, no explanation."""

        try:
            # Get JSON from AI
            json_response = self._call_ai(user_prompt, system_prompt)
            
            # Clean up response - remove markdown fences if present
            json_response = json_response.strip()
            if json_response.startswith('```'):
                first_newline = json_response.find('\n')
                if first_newline > 0:
                    json_response = json_response[first_newline + 1:]
                if json_response.endswith('```'):
                    json_response = json_response[:-3]
                json_response = json_response.strip()
            
            # Process through the safe pipeline
            result = process_json_to_mermaid(json_response)
            
            if result.success and result.mermaid:
                logger.info(f"✅ Diagram generated successfully via JSON pipeline")
                return (True, result.mermaid, [])
            else:
                logger.info(f"⚠️ Diagram pipeline failed: {result.errors}")
                return (False, "", result.errors)
                
        except Exception as e:
            logger.info(f"❌ Diagram generation error: {e}")
            return (False, "", [f"AI call failed: {str(e)}"])
    
    def _get_professional_diagram_system_prompt(self) -> str:
        """Get system prompt for professional diagram generation."""
        return f"""You are a SENIOR SOFTWARE ARCHITECT with 15+ years of experience documenting complex systems.

YOUR EXPERTISE:
- Designing and documenting microservices architectures
- Creating clear, professional diagrams for technical documentation
- Understanding codebases and extracting meaningful component relationships

ABSOLUTE RULES FOR JSON OUTPUT:
1. Output ONLY valid JSON conforming to the schema below - no markdown, no explanation
2. NEVER output Mermaid code directly
3. detailed, comprehensive diagrams are required (10-25 nodes)
4. Node IDs can be descriptive (e.g., "AuthService", "UserDB") - they will be sanitized automatically
5. Labels must be professional and specific - use ACTUAL names from the codebase

JSON SCHEMA:
{get_schema_for_prompt()}

PROFESSIONAL DIAGRAM PRINCIPLES:
- Use REAL component names from the code (e.g., "AuthService" not "Service A")
- Show meaningful relationships with descriptive edge labels
- Group related components logically
- For architecture: show layers (Frontend → API → Services → Database)
- For sequence: show actual method calls or API endpoints
- For ER: show actual entity/table names and relationships
- AVOID generic "Frontend -> Backend -> DB" flows. Be specific!

EXAMPLE OF PROFESSIONAL OUTPUT (for a web app):
{{
  "type": "flowchart",
  "direction": "TD",
  "nodes": [
    {{"id": "ReactApp", "label": "React Frontend (Client)"}},
    {{"id": "NextAPI", "label": "Next.js API Routes"}},
    {{"id": "AuthCtrl", "label": "AuthController"}},
    {{"id": "UserSvc", "label": "UserService"}},
    {{"id": "Postgres", "label": "PostgreSQL DB"}},
    {{"id": "Redis", "label": "Redis Cache"}},
    {{"id": "JWT", "label": "JWT TokenManager"}},
    {{"id": "OAuth", "label": "External OAuth"}}
  ],
  "edges": [
    {{"from": "ReactApp", "to": "NextAPI", "label": "HTTP requests"}},
    {{"from": "NextAPI", "to": "AuthCtrl", "label": "routes to"}},
    {{"from": "AuthCtrl", "to": "JWT", "label": "validates token"}},
    {{"from": "AuthCtrl", "to": "UserSvc", "label": "fetches user"}},
    {{"from": "UserSvc", "to": "Postgres", "label": "SQL queries"}},
    {{"from": "UserSvc", "to": "Redis", "label": "caches"}},
    {{"from": "AuthCtrl", "to": "OAuth", "label": "OAuth flow"}}
  ]
}}

OUTPUT ONLY THE JSON. NO OTHER TEXT."""
    
    def generate_diagram_with_retry(
        self, 
        context: str, 
        diagram_type: str = "architecture",
        max_retries: int = 1
    ) -> str:
        """
        Generate a diagram with automatic retry on failure.
        
        Args:
            context: Context for the diagram
            diagram_type: Type of diagram
            max_retries: Number of retry attempts
            
        Returns:
            Mermaid diagram code wrapped in code fence, or fallback diagram
        """
        last_errors = []
        
        for attempt in range(max_retries + 1):
            is_retry = attempt > 0
            
            if is_retry:
                logger.info(f"🔄 Retrying diagram generation (attempt {attempt + 1})...")
            
            success, mermaid, errors = self.generate_diagram_json(
                context=context,
                diagram_type=diagram_type,
                is_retry=is_retry,
                previous_errors=last_errors if is_retry else None
            )
            
            if success:
                return f"\n\n```mermaid\n{mermaid}\n```\n\n"
            
            last_errors = errors
        
        # All attempts failed - return a simple fallback diagram
        logger.info(f"⚠️ Diagram generation failed after {max_retries + 1} attempts, using fallback")
        return self._get_fallback_diagram(diagram_type)
    
    def _get_fallback_diagram(self, diagram_type: str) -> str:
        """Get a simple fallback diagram when generation fails."""
        fallbacks = {
            "architecture": """```mermaid
flowchart TD
    User[User] --> Frontend[Frontend Application]
    Frontend --> API[API Gateway]
    API --> Service[Backend Service]
    Service --> DB[(Database)]
```""",
            "sequence": """```mermaid
sequenceDiagram
    participant Client
    participant Server
    participant Database
    Client->>Server: Request
    Server->>Database: Query
    Database-->>Server: Data
    Server-->>Client: Response
```""",
            "er": """```mermaid
erDiagram
    USER ||--o{ RESOURCE : owns
    RESOURCE {
        string id
        string details
    }
```""",
            "class": """```mermaid
classDiagram
    class SystemComponent {
        +operation()
    }
```"""
        }
        fallback = fallbacks.get(diagram_type, fallbacks["architecture"])
        return f"\n\n{fallback}\n\n"
    
    def post_process_documentation_diagrams(self, content: str, file_context: str) -> str:
        """
        Post-process documentation to replace diagram placeholders or fix broken diagrams.
        
        This method scans the content for Mermaid code blocks and validates them.
        If a diagram fails validation, it attempts to regenerate it using the JSON pipeline.
        
        Args:
            content: Documentation content with potential Mermaid diagrams
            file_context: File context for diagram regeneration
            
        Returns:
            Content with validated/fixed diagrams
        """
        # Pattern to find Mermaid code blocks
        mermaid_pattern = r'```mermaid\n(.*?)```'
        
        def replace_diagram(match):
            diagram_content = match.group(1).strip()
            
            # Basic validation - check if it starts with a valid type
            valid_starts = ['graph ', 'flowchart ', 'sequenceDiagram', 'classDiagram', 'erDiagram']
            is_valid = any(diagram_content.startswith(s) for s in valid_starts)
            
            if is_valid:
                return match.group(0)  # Keep the original
            
            # Try to regenerate the diagram
            logger.info(f"⚠️ Found potentially broken diagram, attempting regeneration...")
            new_diagram = self.generate_diagram_with_retry(file_context, "architecture", max_retries=1)
            return new_diagram
        
        # Replace broken diagrams
        result = re.sub(mermaid_pattern, replace_diagram, content, flags=re.DOTALL)
        return result
    
    def fix_mermaid_diagram(self, broken_diagram: str, error_message: str = "") -> str:
        """
        Fix a broken Mermaid diagram using the JSON pipeline.
        
        Instead of asking the AI to fix the Mermaid syntax directly,
        we ask it to describe the diagram as JSON, then convert deterministically.
        
        Args:
            broken_diagram: The broken Mermaid diagram code
            error_message: Optional error message from the renderer
            
        Returns:
            Fixed Mermaid diagram code
        """
        system_prompt = self._get_professional_diagram_system_prompt()
        
        error_context = ""
        if error_message:
            error_context = f"""
MERMAID PARSE ERROR:
{error_message}

This error indicates what went wrong. Fix the structure while preserving the intent.
"""
        
        # Detect diagram type from the broken diagram
        detected_type = "flowchart"
        if "sequenceDiagram" in broken_diagram or "participant" in broken_diagram:
            detected_type = "sequence"
        elif "classDiagram" in broken_diagram or "class " in broken_diagram:
            detected_type = "class"
        elif "erDiagram" in broken_diagram or "||" in broken_diagram:
            detected_type = "er"
        
        user_prompt = f"""You are a senior software architect. The following Mermaid diagram has syntax errors and failed to render.
        
BROKEN DIAGRAM:
```
{broken_diagram}
```
{error_context}

YOUR TASK:
1. Understand what this diagram is trying to represent
2. Extract the ACTUAL component/entity names from the broken diagram
3. Preserve the logical relationships and structure
4. Output a valid JSON representation that captures the same information

IMPORTANT:
- Keep the SAME component names from the original diagram (e.g., if it mentions "AuthService", use that)
- Keep the SAME relationships (which components connect to which)
- Just fix the syntax issues, don't redesign the diagram
- Use diagram type: "{detected_type}"
- LIMIT: Max 25 nodes
- IDs: Use simplified component names (alphanumeric, max 20 chars)

Output ONLY the JSON object. No markdown, no explanation."""

        try:
            json_response = self._call_ai(user_prompt, system_prompt)
            
            # Clean response
            json_response = json_response.strip()
            if json_response.startswith('```'):
                first_newline = json_response.find('\n')
                if first_newline > 0:
                    json_response = json_response[first_newline + 1:]
                if json_response.endswith('```'):
                    json_response = json_response[:-3]
                json_response = json_response.strip()
            
            # Process through pipeline
            result = process_json_to_mermaid(json_response)
            
            if result.success and result.mermaid:
                logger.info(f"✅ Diagram fixed via JSON pipeline")
                return result.mermaid
            else:
                # Retry once with error context
                logger.info(f"⚠️ First fix attempt failed, retrying... Errors: {result.errors}")
                
                # RECURSIVE RETRY with explicit error feedback
                success, mermaid, _ = self.generate_diagram_json( 
                    context=f"Original broken diagram:\n{broken_diagram}\n\nValidation Errors from first attempt:\n{json.dumps(result.errors)}\n\nPLEASE FIX THESE ERRORS.",
                    diagram_type=detected_type if detected_type != "flowchart" else "architecture",
                    is_retry=True,
                    previous_errors=result.errors
                ) 
                
                # NOTE: generate_diagram_json returns a tuple, we just want the mermaid code if successful
                if success:
                    return mermaid
                    
        except Exception as e:
            logger.info(f"❌ Diagram fix failed: {e}")
        
        return f"""flowchart TD
    A[Diagram Fix Failed] --> B[AI could not repair syntax]
    B --> C[Original Error]"""



# Global instance
_ai_service: Optional[AIService] = None


def get_ai_service() -> AIService:
    """Get or create global AI service instance."""
    global _ai_service
    if _ai_service is None:
        _ai_service = AIService()
    return _ai_service

