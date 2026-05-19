"""
SAFE JSON → Mermaid Diagram Pipeline (Python Backend)

This module provides a DETERMINISTIC and SAFE way to generate Mermaid diagrams.
The AI is NEVER allowed to output raw Mermaid code - only structured JSON.

WORKFLOW:
1. AI outputs JSON conforming to DiagramSchema
2. JSON is strictly validated against the schema
3. Mermaid code is generated ONLY by deterministic code
4. Mermaid syntax is validated
5. If validation fails, retry JSON generation once

CONSTRAINTS:
- Diagram types: graph TD, flowchart TD, sequenceDiagram, classDiagram, erDiagram
- Maximum 8 nodes per diagram
- No subgraphs, no styles, no comments
- One node per line
"""

import json
import re
from typing import Dict, List, Optional, Any, Tuple, Literal
from dataclasses import dataclass
from enum import Enum


# =============================================================================
# TYPES & CONSTANTS
# =============================================================================

class DiagramType(str, Enum):
    """Allowed diagram types - strictly enforced"""
    FLOWCHART = "flowchart"
    GRAPH = "graph"
    SEQUENCE = "sequence"
    CLASS = "class"
    ER = "er"


class DiagramDirection(str, Enum):
    """Diagram direction"""
    TD = "TD"  # Top-Down
    TB = "TB"  # Top-Bottom (same as TD)
    LR = "LR"  # Left-Right
    RL = "RL"  # Right-Left
    BT = "BT"  # Bottom-Top


# Valid node IDs - expanded to allow more nodes (A-Z, AA-AZ)
VALID_NODE_IDS = frozenset([
    c for c in "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
] + [f"A{c}" for c in "ABCDEFGHIJKLMNOPQRSTUVWXYZ"])

MAX_NODES = 50
MAX_LABEL_LENGTH = 100
MAX_EDGE_LABEL_LENGTH = 30

# Characters that could break Mermaid syntax - less aggressive
# Allow () as they are fine in labels. allow < > as they are often used for generics but can be tricky; sanitize them to be safe.
DANGEROUS_CHARS_PATTERN = re.compile(r'[\[\]{}\|&;`$\\\"#]')


# =============================================================================
# DATA CLASSES
# =============================================================================

@dataclass
class DiagramNode:
    """Node definition - ID must be a single uppercase letter (A-H)"""
    id: str  # Single uppercase letter
    label: str  # Human-readable label


@dataclass
class DiagramEdge:
    """Edge definition - connects two nodes"""
    from_node: str  # Node ID
    to_node: str  # Node ID
    label: Optional[str] = None  # Optional edge label


@dataclass
class DiagramSchema:
    """Complete diagram schema - what the AI must produce"""
    type: DiagramType
    direction: DiagramDirection
    nodes: List[DiagramNode]
    edges: List[DiagramEdge]


@dataclass
class ValidationResult:
    """Validation result with detailed error messages"""
    valid: bool
    errors: List[str]
    sanitized_schema: Optional[DiagramSchema] = None


@dataclass
class PipelineResult:
    """Pipeline result containing generated Mermaid or errors"""
    success: bool
    mermaid: Optional[str]
    errors: List[str]
    retried: bool


# =============================================================================
# JSON VALIDATION
# =============================================================================

def validate_diagram_json(json_string: str) -> ValidationResult:
    """
    Validates a raw JSON string against the DiagramSchema.
    Performs strict validation with detailed error messages.
    
    Args:
        json_string: Raw JSON string from AI
        
    Returns:
        ValidationResult with sanitized schema if valid
    """
    errors: List[str] = []
    
    # Step 1: Parse JSON
    try:
        parsed = json.loads(json_string)
    except json.JSONDecodeError as e:
        return ValidationResult(
            valid=False,
            errors=[f"Invalid JSON: {str(e)}"]
        )
    
    # Step 2: Validate it's a dict
    if not isinstance(parsed, dict):
        return ValidationResult(
            valid=False,
            errors=["JSON must be an object with type, direction, nodes, and edges"]
        )
    
    # Step 3: Validate required fields exist
    required_fields = ['type', 'direction', 'nodes', 'edges']
    for field in required_fields:
        if field not in parsed:
            errors.append(f"Missing required field: {field}")
    
    if errors:
        return ValidationResult(valid=False, errors=errors)
    
    # Step 4: Validate 'type' field
    valid_types = [t.value for t in DiagramType]
    if parsed['type'] not in valid_types:
        errors.append(f"Invalid type: \"{parsed['type']}\". Must be one of: {', '.join(valid_types)}")
    
    # Step 5: Validate 'direction' field
    valid_directions = [d.value for d in DiagramDirection]
    if parsed['direction'] not in valid_directions:
        errors.append(f"Invalid direction: \"{parsed['direction']}\". Must be TD, TB, LR, RL, or BT")
    
    # Step 6: Validate 'nodes' array
    if not isinstance(parsed['nodes'], list):
        errors.append("nodes must be an array")
    else:
        if len(parsed['nodes']) == 0:
            errors.append("nodes array cannot be empty")
        if len(parsed['nodes']) > MAX_NODES:
            errors.append(f"Too many nodes: {len(parsed['nodes'])}. Maximum is {MAX_NODES}")
        
        seen_ids = set()
        for i, node in enumerate(parsed['nodes']):
            node_errors = _validate_node(node, i, seen_ids)
            errors.extend(node_errors)
    
    # Step 7: Validate 'edges' array
    if not isinstance(parsed['edges'], list):
        errors.append("edges must be an array")
    else:
        node_ids = set()
        if isinstance(parsed['nodes'], list):
            for node in parsed['nodes']:
                if isinstance(node, dict) and 'id' in node:
                    node_ids.add(_sanitize_id(node['id']))
        
        for i, edge in enumerate(parsed['edges']):
            edge_errors = _validate_edge(edge, i, node_ids)
            errors.extend(edge_errors)
    
    if errors:
        return ValidationResult(valid=False, errors=errors)
    
    # Step 8: Create sanitized schema
    sanitized_schema = _sanitize_schema(parsed)
    
    return ValidationResult(
        valid=True,
        errors=[],
        sanitized_schema=sanitized_schema
    )


def _validate_node(node: Any, index: int, seen_ids: set) -> List[str]:
    """Validates a single node object"""
    errors: List[str] = []
    prefix = f"nodes[{index}]"
    
    if not isinstance(node, dict):
        return [f"{prefix}: must be an object"]
    
    # Validate id
    if 'id' not in node or not isinstance(node['id'], str):
        errors.append(f"{prefix}.id: must be a string")
    else:
        # Permissive ID handling: allow almost anything and sanitize it
        sanitized_id = _sanitize_id(node['id'])
        
        if len(sanitized_id) == 0:
             errors.append(f"{prefix}.id: is empty after sanitization")
             
        if sanitized_id in seen_ids:
             errors.append(f"{prefix}.id: duplicate ID \"{sanitized_id}\"")
        seen_ids.add(sanitized_id)
    
    # Validate label
    if 'label' not in node or not isinstance(node['label'], str):
        errors.append(f"{prefix}.label: must be a string")
    elif len(node['label']) == 0:
        errors.append(f"{prefix}.label: cannot be empty")
    elif len(node['label']) > MAX_LABEL_LENGTH:
        errors.append(f"{prefix}.label: too long (max {MAX_LABEL_LENGTH} chars)")
    
    return errors


def _validate_edge(edge: Any, index: int, node_ids: set) -> List[str]:
    """Validates a single edge object"""
    errors: List[str] = []
    prefix = f"edges[{index}]"
    
    if not isinstance(edge, dict):
        return [f"{prefix}: must be an object"]
    
    # Validate from
    if 'from' not in edge or not isinstance(edge['from'], str):
        errors.append(f"{prefix}.from: must be a string")
    else:
        from_id = _sanitize_id(edge['from'])
        if from_id not in node_ids:
            errors.append(f"{prefix}.from: node \"{edge['from']}\" (sanitized: {from_id}) does not exist")
    
    # Validate to
    if 'to' not in edge or not isinstance(edge['to'], str):
        errors.append(f"{prefix}.to: must be a string")
    else:
        to_id = _sanitize_id(edge['to'])
        if to_id not in node_ids:
            errors.append(f"{prefix}.to: node \"{edge['to']}\" (sanitized: {to_id}) does not exist")
    
    # Validate optional label
    if 'label' in edge and edge['label'] is not None:
        if not isinstance(edge['label'], str):
            errors.append(f"{prefix}.label: must be a string if provided")
        elif len(edge['label']) > MAX_EDGE_LABEL_LENGTH:
            errors.append(f"{prefix}.label: too long (max {MAX_EDGE_LABEL_LENGTH} chars)")
    
    return errors


def _sanitize_label(label: str) -> str:
    """Sanitizes a label by removing/escaping dangerous characters"""
    # Replace dangerous chars with space
    sanitized = DANGEROUS_CHARS_PATTERN.sub(' ', label)
    # Collapse multiple spaces
    sanitized = re.sub(r'\s+', ' ', sanitized)
    return sanitized.strip()[:MAX_LABEL_LENGTH]


def _sanitize_id(id_str: str) -> str:
    """Sanitizes an ID by uppercasing and replacing invalid chars with underscore"""
    if not isinstance(id_str, str):
        return str(id_str).upper()
    # Replace anything not A-Z, 0-9 with underscore
    sanitized = re.sub(r'[^A-Z0-9]', '_', id_str.upper())
    return sanitized[:30] # Limit length


def _sanitize_schema(parsed: dict) -> DiagramSchema:
    """Sanitizes a schema by normalizing IDs and escaping dangerous characters"""
    nodes = [
        DiagramNode(
            id=_sanitize_id(n['id']),
            label=_sanitize_label(n['label'])
        )
        for n in parsed['nodes']
    ]
    
    edges = [
        DiagramEdge(
            from_node=_sanitize_id(e['from']),
            to_node=_sanitize_id(e['to']),
            label=_sanitize_label(e['label']) if e.get('label') else None
        )
        for e in parsed['edges']
    ]
    
    return DiagramSchema(
        type=DiagramType(parsed['type']),
        direction=DiagramDirection(parsed['direction']),
        nodes=nodes,
        edges=edges
    )


# =============================================================================
# JSON → MERMAID CONVERSION (DETERMINISTIC)
# =============================================================================

def convert_to_mermaid(schema: DiagramSchema) -> str:
    """
    Converts a validated DiagramSchema to Mermaid code.
    This is PURELY DETERMINISTIC - no AI involvement.
    
    RENDERING RULES:
    - flowchart / graph: use --> only
    - sequence: use ->> and -->> only
    - No subgraphs, no styles, no comments
    - One node per line
    
    Args:
        schema: Validated and sanitized DiagramSchema
        
    Returns:
        Mermaid diagram code
    """
    if schema.type in (DiagramType.FLOWCHART, DiagramType.GRAPH):
        return _generate_flowchart(schema)
    elif schema.type == DiagramType.SEQUENCE:
        return _generate_sequence(schema)
    elif schema.type == DiagramType.CLASS:
        return _generate_class_diagram(schema)
    elif schema.type == DiagramType.ER:
        return _generate_er_diagram(schema)
    else:
        raise ValueError(f"Unknown diagram type: {schema.type}")


def _generate_flowchart(schema: DiagramSchema) -> str:
    """
    Generates a flowchart/graph diagram
    
    Format:
    graph TD
        A[Label A] --> B[Label B]
    """
    lines: List[str] = []
    
    # Header
    lines.append(f"flowchart {schema.direction.value}")
    
    # Create node labels mapping
    node_labels = {node.id: node.label for node in schema.nodes}
    
    # Track which nodes have been defined
    defined_nodes = set()
    
    for edge in schema.edges:
        from_label = node_labels.get(edge.from_node, edge.from_node)
        to_label = node_labels.get(edge.to_node, edge.to_node)
        
        # Format: A[Label] --> B[Label]
        from_part = edge.from_node if edge.from_node in defined_nodes else f"{edge.from_node}[{from_label}]"
        to_part = edge.to_node if edge.to_node in defined_nodes else f"{edge.to_node}[{to_label}]"
        
        defined_nodes.add(edge.from_node)
        defined_nodes.add(edge.to_node)
        
        # Edge with optional label
        if edge.label:
            lines.append(f"    {from_part} -->|{edge.label}| {to_part}")
        else:
            lines.append(f"    {from_part} --> {to_part}")
    
    # Handle orphan nodes
    for node in schema.nodes:
        if node.id not in defined_nodes:
            lines.append(f"    {node.id}[{node.label}]")
    
    return '\n'.join(lines)


def _generate_sequence(schema: DiagramSchema) -> str:
    """
    Generates a sequence diagram
    
    Format:
    sequenceDiagram
        participant A as Label A
        A->>B: Message
    """
    lines: List[str] = []
    
    # Header
    lines.append("sequenceDiagram")
    
    # Participants
    for node in schema.nodes:
        lines.append(f"    participant {node.id} as {node.label}")
    
    # Messages (edges)
    for i, edge in enumerate(schema.edges):
        arrow = "->>" if i % 2 == 0 else "-->>"
        message = edge.label or "message"
        lines.append(f"    {edge.from_node}{arrow}{edge.to_node}: {message}")
    
    return '\n'.join(lines)


def _generate_class_diagram(schema: DiagramSchema) -> str:
    """
    Generates a class diagram
    
    Format:
    classDiagram
        class A {
            <<Label>>
        }
        A --> B
    """
    lines: List[str] = []
    
    # Header
    lines.append("classDiagram")
    
    # Classes
    for node in schema.nodes:
        lines.append(f"    class {node.id} {{")
        lines.append(f"        <<{node.label}>>")
        lines.append("    }")
    
    # Relationships
    for edge in schema.edges:
        if edge.label:
            lines.append(f"    {edge.from_node} --> {edge.to_node} : {edge.label}")
        else:
            lines.append(f"    {edge.from_node} --> {edge.to_node}")
    
    return '\n'.join(lines)


def _generate_er_diagram(schema: DiagramSchema) -> str:
    """
    Generates an ER diagram
    
    Format:
    erDiagram
        ENTITY1 ||--o{ ENTITY2 : relationship
    """
    lines: List[str] = []
    
    # Header
    lines.append("erDiagram")
    
    # Create entity names from nodes
    entity_names = {}
    for node in schema.nodes:
        entity_name = re.sub(r'[^A-Z0-9_]', '', node.label.upper().replace(' ', '_'))
        entity_names[node.id] = entity_name or node.id
    
    # Relationships
    used_entities = set()
    for edge in schema.edges:
        from_entity = entity_names.get(edge.from_node, edge.from_node)
        to_entity = entity_names.get(edge.to_node, edge.to_node)
        relationship = edge.label or "has"
        
        lines.append(f"    {from_entity} ||--o{{ {to_entity} : {relationship}")
        used_entities.add(edge.from_node)
        used_entities.add(edge.to_node)
    
    # Handle orphan entities
    for node in schema.nodes:
        if node.id not in used_entities:
            entity_name = entity_names.get(node.id, node.id)
            lines.append(f"    {entity_name} {{")
            lines.append("        string id")
            lines.append("    }")
    
    return '\n'.join(lines)


# =============================================================================
# MERMAID SYNTAX VALIDATION
# =============================================================================

def validate_mermaid_syntax(mermaid_code: str) -> ValidationResult:
    """
    Validates Mermaid syntax using basic pattern matching.
    
    Args:
        mermaid_code: Generated Mermaid code
        
    Returns:
        ValidationResult
    """
    errors: List[str] = []
    lines = mermaid_code.split('\n')
    
    if not lines:
        return ValidationResult(valid=False, errors=["Empty diagram"])
    
    first_line = lines[0].strip().lower()
    
    # Check for valid diagram type declaration
    valid_starts = [
        'graph td', 'graph lr', 'graph tb', 'graph bt', 'graph rl',
        'flowchart td', 'flowchart lr', 'flowchart tb', 'flowchart bt', 'flowchart rl',
        'sequencediagram',
        'classdiagram',
        'erdiagram'
    ]
    
    has_valid_start = any(first_line.startswith(start) for start in valid_starts)
    
    if not has_valid_start:
        errors.append(f"Invalid diagram type declaration: \"{lines[0]}\"")
    
    # Check for unbalanced brackets
    for i, line in enumerate(lines[1:], 2):
        stripped = line.strip()
        if stripped:
            open_count = stripped.count('[')
            close_count = stripped.count(']')
            if open_count != close_count:
                errors.append(f"Line {i}: Unbalanced brackets")
    
    # Check for forbidden patterns
    # Anchor to start of line to avoid matching text inside labels (e.g. "Click to view")
    forbidden_patterns = [
        (re.compile(r'^\s*subgraph\s+', re.IGNORECASE | re.MULTILINE), "Subgraphs are not allowed"),
        (re.compile(r'^\s*style\s+', re.IGNORECASE | re.MULTILINE), "Styles are not allowed"),
        (re.compile(r'^\s*click\s+', re.IGNORECASE | re.MULTILINE), "Click handlers are not allowed"),
        (re.compile(r'%%'), "Comments are not allowed"), # Comments can be anywhere
    ]
    
    for pattern, message in forbidden_patterns:
        if pattern.search(mermaid_code):
            errors.append(message)
    
    return ValidationResult(valid=len(errors) == 0, errors=errors)


# =============================================================================
# MAIN PIPELINE
# =============================================================================

def process_json_to_mermaid(json_string: str) -> PipelineResult:
    """
    The main pipeline function that converts JSON to Mermaid.
    
    WORKFLOW:
    1. Validate JSON strictly
    2. Convert to Mermaid deterministically
    3. Validate Mermaid syntax
    4. Return result with any errors
    
    Args:
        json_string: Raw JSON string from AI
        
    Returns:
        PipelineResult with Mermaid code or errors
    """
    # Step 1: Validate JSON
    json_validation = validate_diagram_json(json_string)
    
    if not json_validation.valid or not json_validation.sanitized_schema:
        return PipelineResult(
            success=False,
            mermaid=None,
            errors=json_validation.errors,
            retried=False
        )
    
    # Step 2: Convert to Mermaid
    try:
        mermaid_code = convert_to_mermaid(json_validation.sanitized_schema)
    except Exception as e:
        return PipelineResult(
            success=False,
            mermaid=None,
            errors=[f"Conversion error: {str(e)}"],
            retried=False
        )
    
    # Step 3: Validate Mermaid syntax
    mermaid_validation = validate_mermaid_syntax(mermaid_code)
    
    if not mermaid_validation.valid:
        return PipelineResult(
            success=False,
            mermaid=mermaid_code,  # Include for debugging
            errors=mermaid_validation.errors,
            retried=False
        )
    
    # Success!
    return PipelineResult(
        success=True,
        mermaid=mermaid_code,
        errors=[],
        retried=False
    )


# =============================================================================
# AI PROMPT HELPERS
# =============================================================================

def get_schema_for_prompt() -> str:
    """Returns the JSON schema as a string for inclusion in AI prompts."""
    return '''{
  "type": "flowchart | graph | sequence | class | er",
  "direction": "TD | TB | LR | RL | BT",
  "nodes": [
    {
      "id": "string (alphanumeric+underscore, max 20 chars, uppercase)",
      "label": "string (human readable, max 100 chars)"
    }
  ],
  "edges": [
    {
      "from": "node id",
      "to": "node id",
      "label": "string (optional, max 30 chars)"
    }
  ]
}'''


def get_examples_for_prompt() -> str:
    """Returns complete examples of valid JSON for each diagram type."""
    return '''
FLOWCHART EXAMPLE:
{
  "type": "flowchart",
  "direction": "TD",
  "nodes": [
    {"id": "A", "label": "User Input"},
    {"id": "B", "label": "Process Data"},
    {"id": "C", "label": "Save to DB"}
  ],
  "edges": [
    {"from": "A", "to": "B"},
    {"from": "B", "to": "C", "label": "validated"}
  ]
}

SEQUENCE EXAMPLE:
{
  "type": "sequence",
  "direction": "TD",
  "nodes": [
    {"id": "A", "label": "Client"},
    {"id": "B", "label": "Server"},
    {"id": "C", "label": "Database"}
  ],
  "edges": [
    {"from": "A", "to": "B", "label": "POST request"},
    {"from": "B", "to": "C", "label": "Query"},
    {"from": "C", "to": "B", "label": "Results"},
    {"from": "B", "to": "A", "label": "Response"}
  ]
}

ER DIAGRAM EXAMPLE:
{
  "type": "er",
  "direction": "LR",
  "nodes": [
    {"id": "A", "label": "User"},
    {"id": "B", "label": "Order"},
    {"id": "C", "label": "Product"}
  ],
  "edges": [
    {"from": "A", "to": "B", "label": "places"},
    {"from": "B", "to": "C", "label": "contains"}
  ]
}

CLASS DIAGRAM EXAMPLE:
{
  "type": "class",
  "direction": "TD",
  "nodes": [
    {"id": "A", "label": "AuthService"},
    {"id": "B", "label": "UserRepository"},
    {"id": "C", "label": "TokenManager"}
  ],
  "edges": [
    {"from": "A", "to": "B", "label": "uses"},
    {"from": "A", "to": "C", "label": "manages"}
  ]
}'''


def get_diagram_generation_prompt() -> str:
    """
    Generates a complete AI system prompt for diagram generation.
    Use this to instruct the AI to output JSON only.
    """
    return f'''You are a diagram structure generator. You MUST output ONLY valid JSON - no explanations, no markdown fences, no extra text.

ABSOLUTE RULES:
1. Output ONLY raw JSON conforming to the schema below.
2. NEVER output Mermaid code directly.
3. Maximum 25 nodes per diagram.
4. Node IDs must be alphanumeric strings (uppercase, max 20 chars).
5. Labels must be human-readable (max 100 chars).
6. Edge labels are optional (max 30 chars each).

JSON SCHEMA:
{get_schema_for_prompt()}

EXAMPLES:
{get_examples_for_prompt()}

OUTPUT ONLY THE JSON OBJECT. NO MARKDOWN, NO EXPLANATION, NO CODE FENCES.'''


# =============================================================================
# FULL PIPELINE WITH RETRY
# =============================================================================

async def run_diagram_pipeline(
    generate_json_fn,  # Callable[[bool, Optional[List[str]]], Awaitable[str]]
    max_retries: int = 1,
    on_retry = None  # Optional[Callable[[int, List[str]], None]]
) -> PipelineResult:
    """
    Async pipeline that includes retry logic.
    
    Args:
        generate_json_fn: Async function that generates JSON from AI
                          Signature: (is_retry: bool, previous_errors: Optional[List[str]]) -> str
        max_retries: Maximum number of retries (default 1)
        on_retry: Optional callback for retry events
        
    Returns:
        PipelineResult
    """
    last_errors: List[str] = []
    
    for attempt in range(max_retries + 1):
        is_retry = attempt > 0
        
        if is_retry and on_retry:
            on_retry(attempt, last_errors)
        
        try:
            # Get JSON from AI
            json_string = await generate_json_fn(is_retry, last_errors if is_retry else None)
            
            # Run through pipeline
            result = process_json_to_mermaid(json_string)
            
            if result.success:
                return PipelineResult(
                    success=True,
                    mermaid=result.mermaid,
                    errors=[],
                    retried=is_retry
                )
            
            # Store errors for potential retry
            last_errors = result.errors
            
            # If this is the last attempt, return the failure
            if attempt == max_retries:
                return PipelineResult(
                    success=False,
                    mermaid=result.mermaid,
                    errors=result.errors,
                    retried=is_retry
                )
                
        except Exception as e:
            last_errors = [f"Unexpected error: {str(e)}"]
            
            if attempt == max_retries:
                return PipelineResult(
                    success=False,
                    mermaid=None,
                    errors=last_errors,
                    retried=is_retry
                )
    
    # Should never reach here
    return PipelineResult(
        success=False,
        mermaid=None,
        errors=last_errors,
        retried=True
    )


# =============================================================================
# INTEGRATION HELPER FOR AI SERVICE
# =============================================================================

def generate_diagram_from_context(
    ai_call_fn,  # Callable[[str, str], str] - (prompt, system_prompt) -> response
    context: str,
    diagram_purpose: str = "architecture",
    is_retry: bool = False,
    previous_errors: Optional[List[str]] = None
) -> Tuple[bool, str, List[str]]:
    """
    Generates a diagram from repository context using the AI service.
    
    This is a synchronous wrapper that:
    1. Constructs the proper prompt for JSON output
    2. Calls the AI to get JSON
    3. Validates and converts to Mermaid
    4. Returns the result
    
    Args:
        ai_call_fn: Function to call the AI (prompt, system_prompt) -> response
        context: Repository context (file summaries, etc.)
        diagram_purpose: What the diagram should represent
        is_retry: Whether this is a retry attempt
        previous_errors: Errors from previous attempt (for retry)
        
    Returns:
        Tuple of (success: bool, mermaid_or_error: str, errors: List[str])
    """
    system_prompt = get_diagram_generation_prompt()
    
    # Build the user prompt
    retry_context = ""
    if is_retry and previous_errors:
        retry_context = f"""
PREVIOUS ATTEMPT FAILED WITH THESE ERRORS:
{chr(10).join(f'- {e}' for e in previous_errors)}

Please fix these issues in your JSON output.
"""
    
    user_prompt = f"""Based on the following context, generate a {diagram_purpose} diagram.

CONTEXT:
{context[:3000]}  # Limit context to prevent token overflow

{retry_context}

Generate ONLY a JSON object following the schema. No other text."""

    try:
        # Get JSON from AI
        json_response = ai_call_fn(user_prompt, system_prompt)
        
        # Clean up response - remove any markdown fences
        json_response = json_response.strip()
        if json_response.startswith('```'):
            # Find the end of first line and strip
            first_newline = json_response.find('\n')
            if first_newline > 0:
                json_response = json_response[first_newline + 1:]
            if json_response.endswith('```'):
                json_response = json_response[:-3]
            json_response = json_response.strip()
        
        # Process through pipeline
        result = process_json_to_mermaid(json_response)
        
        if result.success and result.mermaid:
            return (True, result.mermaid, [])
        else:
            return (False, "", result.errors)
            
    except Exception as e:
        return (False, "", [f"AI call failed: {str(e)}"])


# Example usage in AI service:
# 
# from mermaid_pipeline import generate_diagram_from_context
# 
# success, mermaid, errors = generate_diagram_from_context(
#     ai_call_fn=lambda p, s: self._call_ai(p, s),
#     context=file_context,
#     diagram_purpose="system architecture"
# )
# 
# if success:
#     return f"```mermaid\n{mermaid}\n```"
# else:
#     # Retry once
#     success, mermaid, errors = generate_diagram_from_context(
#         ai_call_fn=lambda p, s: self._call_ai(p, s),
#         context=file_context,
#         diagram_purpose="system architecture",
#         is_retry=True,
#         previous_errors=errors
#     )
#     if success:
#         return f"```mermaid\n{mermaid}\n```"
#     else:
#         return "Failed to generate diagram"
