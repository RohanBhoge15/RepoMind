"""
Background worker for repository indexing tasks.
Uses RQ (Redis Queue) for job management.
"""
import logging

logger = logging.getLogger(__name__)

import os
import shutil
from typing import Dict, Any, List
from pathlib import Path
import git
from github import Github
from sqlalchemy.orm import Session
from sqlalchemy.sql import func
import redis
from rq import Queue
import subprocess
import json
import asyncio

from config import get_settings
from database import SessionLocal
from models import Repository, File, DocumentationSection, IndexingStatus
from embeddings import get_embedding_service
from ai_service import get_ai_service
from cache_service import get_cache_service

settings = get_settings()

# Redis connection
redis_conn = redis.from_url(settings.redis_url)
task_queue = Queue('indexing', connection=redis_conn)


def update_repo_status(
    db: Session,
    repo_id: int,
    status: IndexingStatus,
    progress: int,
    message: str = None,
    current_file: str = None,
    processed_files: int = None,
    current_step: str = None,
    error: str = None
):
    """Update repository indexing status with detailed progress."""
    repo = db.query(Repository).filter(Repository.id == repo_id).first()
    if repo:
        repo.indexing_status = status
        repo.indexing_progress = progress
        if message:
            repo.indexing_message = message
        if current_file is not None:
            repo.current_file = current_file
        if processed_files is not None:
            repo.processed_files = processed_files
        if current_step is not None:
            repo.current_step = current_step
        if error is not None:
            repo.error_message = error
        db.commit()


def clone_repository(repo_url: str, clone_path: str, access_token: str) -> bool:
    """
    Clone a GitHub repository.

    Args:
        repo_url: Repository URL
        clone_path: Local path to clone to
        access_token: GitHub access token

    Returns:
        True if successful
    """
    try:
        # Normalize path for Windows
        clone_path = os.path.normpath(clone_path)

        # Remove existing directory if it exists
        if os.path.exists(clone_path):
            logger.info(f"Removing existing directory: {clone_path}")
            try:
                # Windows-specific: Remove read-only attributes before deletion
                import stat
                def handle_remove_readonly(func, path, exc):
                    """Error handler for Windows read-only files."""
                    os.chmod(path, stat.S_IWRITE)
                    func(path)
                
                shutil.rmtree(clone_path, onerror=handle_remove_readonly)
                logger.info(f"Successfully removed existing directory")
            except Exception as e:
                logger.info(f"⚠️ Failed to remove directory: {e}")
                logger.info(f"Attempting force removal with git command...")
                try:
                    # Use git clean as a last resort
                    subprocess.run(['git', 'clean', '-fdx'], cwd=os.path.dirname(clone_path), 
                                 capture_output=True, timeout=10)
                    shutil.rmtree(clone_path, onerror=handle_remove_readonly)
                except Exception as e2:
                    logger.info(f"❌ All removal attempts failed: {e2}")
                    # If removal fails, try using a different directory
                    import time
                    clone_path = f"{clone_path}_{int(time.time())}"
                    logger.info(f"Using alternative path: {clone_path}")

        # Use GitPython's environment variable for authentication (avoids token in URL)
        logger.info(f"Cloning to: {clone_path}")
        git.Repo.clone_from(repo_url, clone_path, depth=1, env={
            'GIT_ASKPASS': 'echo',
            'GIT_USERNAME': 'token',
            'GIT_PASSWORD': access_token
        })
        logger.info(f"✅ Clone successful!")
        return True
    except Exception as e:
        logger.info(f"❌ Clone failed: {e}")
        return False


def detect_language(file_path: str) -> str:
    """Detect programming language from file extension."""
    ext_map = {
        '.py': 'Python',
        '.js': 'JavaScript',
        '.ts': 'TypeScript',
        '.jsx': 'JavaScript',
        '.tsx': 'TypeScript',
        '.java': 'Java',
        '.cpp': 'C++',
        '.c': 'C',
        '.h': 'C',
        '.hpp': 'C++',
        '.cs': 'C#',
        '.go': 'Go',
        '.rs': 'Rust',
        '.rb': 'Ruby',
        '.php': 'PHP',
        '.swift': 'Swift',
        '.kt': 'Kotlin',
        '.scala': 'Scala',
        '.r': 'R',
        '.m': 'Objective-C',
        '.sql': 'SQL',
        '.sh': 'Shell',
        '.bash': 'Bash',
        '.html': 'HTML',
        '.css': 'CSS',
        '.scss': 'SCSS',
        '.json': 'JSON',
        '.xml': 'XML',
        '.yaml': 'YAML',
        '.yml': 'YAML',
        '.md': 'Markdown',
        '.txt': 'Text',
        '.ipynb': 'Jupyter Notebook',
    }
    ext = Path(file_path).suffix.lower()
    return ext_map.get(ext, 'Unknown')


def should_index_file(file_path: str) -> bool:
    """Determine if file should be indexed."""
    # Skip common non-code files and directories
    skip_patterns = [
        'node_modules', '.git', '__pycache__', 'venv', 'env',
        '.next', 'dist', 'build', 'target', '.idea', '.vscode',
        'package-lock.json', 'yarn.lock', '.DS_Store'
    ]

    path_str = str(file_path)
    for pattern in skip_patterns:
        if pattern in path_str:
            return False

    # Only index text files
    text_extensions = {
        '.py', '.js', '.ts', '.jsx', '.tsx', '.java', '.cpp', '.c', '.h',
        '.cs', '.go', '.rs', '.rb', '.php', '.swift', '.kt', '.scala',
        '.html', '.css', '.scss', '.json', '.xml', '.yaml', '.yml', '.md',
        '.sql', '.sh', '.bash', '.r', '.m', '.txt', '.ipynb'
    }

    return Path(file_path).suffix.lower() in text_extensions


def analyze_file_with_bandit(file_path: str, language: str) -> List[Dict[str, Any]]:
    """Run static analysis on Python files."""
    vulnerabilities = []
    
    if language == 'Python':
        try:
            result = subprocess.run(
                ['bandit', '-f', 'json', file_path],
                capture_output=True,
                text=True,
                timeout=10
            )
            if result.stdout:
                data = json.loads(result.stdout)
                for issue in data.get('results', []):
                    vulnerabilities.append({
                        'severity': issue.get('issue_severity', 'UNKNOWN'),
                        'type': issue.get('test_id', 'UNKNOWN'),
                        'description': issue.get('issue_text', ''),
                        'line': issue.get('line_number', 0)
                    })
        except Exception as e:
            logger.info(f"Bandit analysis failed: {e}")
    
    return vulnerabilities


def extract_imports_python(content: str, file_path: str) -> List[str]:
    """
    Extract import statements from Python code.
    Returns list of import paths (relative and absolute).
    """
    import re
    imports = []
    
    for line in content.split('\n'):
        line = line.strip()
        
        # from .module import ... (relative imports)
        match = re.match(r'^from\s+(\.+[a-zA-Z0-9_\.]*)\s+import', line)
        if match:
            imports.append(match.group(1))
            continue
            
        # from module import ... (absolute imports)
        match = re.match(r'^from\s+([a-zA-Z_][a-zA-Z0-9_\.]*)\s+import', line)
        if match:
            imports.append(match.group(1))
            continue
            
        # import module (simple import)
        match = re.match(r'^import\s+([a-zA-Z_][a-zA-Z0-9_\.]+)', line)
        if match:
            # Handle comma-separated imports: import os, sys, json
            modules = match.group(1).split(',')
            for mod in modules:
                mod = mod.strip().split()[0]  # Handle "import x as y"
                if mod:
                    imports.append(mod)
    
    return list(set(imports))  # Remove duplicates


def extract_imports_javascript(content: str, file_path: str) -> List[str]:
    """
    Extract import statements from JavaScript/TypeScript code.
    Returns list of import paths (relative only for graph building).
    """
    import re
    imports = []
    
    # Various import patterns
    patterns = [
        # import ... from './path' or "./path"
        r'import\s+.*?\s+from\s+[\'"]([^\'"]+)[\'"]',
        # import './path'
        r'import\s+[\'"]([^\'"]+)[\'"]',
        # require('./path')
        r'require\s*\(\s*[\'"]([^\'"]+)[\'"]\s*\)',
        # dynamic import('./path')
        r'import\s*\(\s*[\'"]([^\'"]+)[\'"]\s*\)',
        # export ... from './path'
        r'export\s+.*?\s+from\s+[\'"]([^\'"]+)[\'"]',
    ]
    
    for pattern in patterns:
        matches = re.findall(pattern, content)
        imports.extend(matches)
    
    return list(set(imports))  # Remove duplicates


def extract_imports_java(content: str, file_path: str) -> List[str]:
    """Extract import statements from Java code."""
    import re
    imports = []
    
    # import com.example.package...
    pattern = r'^import\s+(?:static\s+)?([a-zA-Z][a-zA-Z0-9_\.]+);'
    for line in content.split('\n'):
        match = re.match(pattern, line.strip())
        if match:
            imports.append(match.group(1))
    
    return list(set(imports))


def extract_imports_go(content: str, file_path: str) -> List[str]:
    """Extract import statements from Go code."""
    import re
    imports = []
    
    # Single import: import "package"
    single_pattern = r'^import\s+"([^"]+)"'
    # Multi-import block
    multi_pattern = r'import\s*\(([\s\S]*?)\)'
    
    for line in content.split('\n'):
        match = re.match(single_pattern, line.strip())
        if match:
            imports.append(match.group(1))
    
    # Handle import blocks
    multi_matches = re.findall(multi_pattern, content)
    for block in multi_matches:
        for line in block.split('\n'):
            line = line.strip().strip('"')
            if line and not line.startswith('//'):
                # Remove alias if present
                parts = line.split()
                if len(parts) >= 2:
                    line = parts[-1].strip('"')
                imports.append(line)
    
    return list(set(imports))


def extract_imports_c_cpp(content: str, file_path: str) -> List[str]:
    """Extract #include statements from C/C++ code."""
    import re
    imports = []
    
    # #include "header.h" (local) or #include <header.h> (system)
    pattern = r'#include\s*[<"]([^>"]+)[>"]'
    matches = re.findall(pattern, content)
    imports.extend(matches)
    
    return list(set(imports))


def extract_file_imports(content: str, language: str, file_path: str) -> List[str]:
    """
    Extract imports from a file based on its language.
    Returns list of import paths/modules.
    """
    if not content:
        return []
    
    extractors = {
        'Python': extract_imports_python,
        'JavaScript': extract_imports_javascript,
        'TypeScript': extract_imports_javascript,
        'Java': extract_imports_java,
        'Go': extract_imports_go,
        'C': extract_imports_c_cpp,
        'C++': extract_imports_c_cpp,
    }
    
    extractor = extractors.get(language)
    if extractor:
        try:
            return extractor(content, file_path)
        except Exception as e:
            logger.info(f"Error extracting imports from {file_path}: {e}")
            return []
    
    return []


async def index_repository_task(repo_id: int, access_token: str):
    """
    Main background task for indexing a repository.

    Args:
        repo_id: Repository ID
        access_token: GitHub access token
    """
    db = SessionLocal()
    embedding_service = get_embedding_service()
    ai_service = get_ai_service()
    cache_service = get_cache_service()
    clone_path = None

    try:
        # Get repository
        repo = db.query(Repository).filter(Repository.id == repo_id).first()
        if not repo:
            return

        # Get existing file paths for incremental update detection
        existing_files = {f.path: f for f in db.query(File).filter(File.repository_id == repo_id).all()}
        logger.info(f"📂 Found {len(existing_files)} existing file records in database")
        
        # Only clean up documentation sections (will be regenerated)
        # Keep file records for incremental updates
        db.query(DocumentationSection).filter(DocumentationSection.repository_id == repo_id).delete()
        db.commit()
        logger.info(f"📄 Cleared old documentation sections")

        # Show cache stats
        cache_stats = cache_service.get_cache_stats(repo.github_repo_id)
        logger.info(f"📊 Cache stats: {cache_stats['files']} files, {cache_stats['hashes']} hashes, {cache_stats['ai_explanations']} AI explanations cached")

        # Step 1: Clone repository
        update_repo_status(
            db, repo_id, IndexingStatus.CLONING, 10,
            "Cloning repository...",
            current_step="Cloning repository from GitHub",
            processed_files=0
        )

        clone_path = os.path.join(settings.clone_dir, str(repo_id))
        # Ensure parent directory exists
        os.makedirs(settings.clone_dir, exist_ok=True)

        if not clone_repository(repo.url, clone_path, access_token):
            update_repo_status(
                db, repo_id, IndexingStatus.FAILED, 0,
                "Failed to clone repository",
                error="Failed to clone repository from GitHub"
            )
            return

        # Get current commit SHA for caching
        try:
            git_repo = git.Repo(clone_path)
            commit_sha = git_repo.head.commit.hexsha
            logger.info(f"📌 Current commit: {commit_sha[:8]}")
        except Exception as e:
            logger.info(f"⚠️ Could not get commit SHA: {e}")
            commit_sha = "unknown"

        # Step 2: Analyze files
        update_repo_status(
            db, repo_id, IndexingStatus.ANALYZING, 20,
            "Analyzing repository structure...",
            current_step="Scanning files and detecting languages"
        )

        all_files = []
        files_needing_ai = []  # Files that need AI explanation (new or changed)
        files_with_cached_ai = []  # Files with cached AI explanations (unchanged)
        language_stats = {}
        cache_hits = 0
        cache_misses = 0

        for root, dirs, files in os.walk(clone_path):
            for file in files:
                file_path = os.path.join(root, file)
                rel_path = os.path.relpath(file_path, clone_path)

                if should_index_file(rel_path):
                    language = detect_language(file_path)
                    language_stats[language] = language_stats.get(language, 0) + 1

                    try:
                        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                            content = f.read()

                        file_data = {
                            'path': rel_path,
                            'filename': file,
                            'language': language,
                            'content': content,
                            'size_bytes': os.path.getsize(file_path),
                            'lines_of_code': content.count('\n') + 1 if content else 0,
                            # Extract imports for dependency graph
                            'raw_imports': extract_file_imports(content, language, rel_path)
                        }
                        
                        # Check if file content has changed
                        file_changed = cache_service.is_file_changed(repo.github_repo_id, rel_path, content)
                        
                        # Check for cached AI explanation
                        cached_ai = cache_service.get_cached_ai_explanation(repo.github_repo_id, rel_path)
                        
                        if not file_changed and cached_ai:
                            # File unchanged AND has cached AI explanation - can skip AI call!
                            file_data['cached_ai'] = cached_ai
                            files_with_cached_ai.append(file_data)
                            cache_hits += 1
                        else:
                            # File is new/changed OR has no cached AI - needs AI processing
                            files_needing_ai.append(file_data)
                            cache_misses += 1
                        
                        all_files.append(file_data)
                        
                        # Always update file hash
                        cache_service.set_file_hash(repo.github_repo_id, rel_path,
                                                   cache_service.compute_file_hash(content))
                    except Exception as e:
                        logger.info(f"Error reading {rel_path}: {e}")

        logger.info(f"📊 AI Cache: {cache_hits} hits (skip AI), {cache_misses} misses (need AI)")
        logger.info(f"   ⚡ {len(files_with_cached_ai)} files will use cached AI explanations")
        logger.info(f"   🤖 {len(files_needing_ai)} files need new AI explanations")

        # Update repository stats
        repo.total_files = len(all_files)
        repo.total_lines = sum(f['lines_of_code'] for f in all_files)
        repo.languages = language_stats
        db.commit()

        update_repo_status(
            db, repo_id, IndexingStatus.ANALYZING, 25,
            f"Found {len(all_files)} files ({len(files_needing_ai)} need AI processing)",
            current_step=f"Detected {len(language_stats)} programming languages"
        )
        
        # Step 3: Process each file (OPTIMIZED - Parallel AI calls)
        update_repo_status(
            db, repo_id, IndexingStatus.CHUNKING, 30,
            "Starting file processing...",
            current_step="Preparing to process files"
        )

        file_summaries = []
        all_chunks_for_embedding = []  # Collect all chunks for batch embedding
        total_files = len(all_files)
        
        # Step 3a: Process files with CACHED AI explanations (FAST - no AI calls!)
        db_files_cached = []
        if files_with_cached_ai:
            logger.info(f"⚡ Processing {len(files_with_cached_ai)} files with CACHED AI explanations (no API calls)...")
            for idx, file_data in enumerate(files_with_cached_ai):
                update_repo_status(
                    db, repo_id, IndexingStatus.CHUNKING,
                    30 + int((idx / total_files) * 5),
                    f"Using cached AI for file {idx+1}/{len(files_with_cached_ai)}",
                    current_file=file_data['path'],
                    processed_files=idx,
                    current_step=f"Restoring cached AI explanations"
                )
                
                # Check if file exists in DB (update) or needs to be created (insert)
                existing_db_file = existing_files.get(file_data['path'])
                
                if existing_db_file:
                    # Update existing record
                    existing_db_file.language = file_data['language']
                    existing_db_file.size_bytes = file_data['size_bytes']
                    existing_db_file.lines_of_code = file_data['lines_of_code']
                    existing_db_file.content = file_data['content']
                    # Use cached AI explanation
                    cached_ai = file_data['cached_ai']
                    existing_db_file.explanation = cached_ai.get('explanation', '')
                    existing_db_file.key_functions = cached_ai.get('key_functions', [])
                    # Use raw imports for dependency graph (not AI descriptions)
                    existing_db_file.dependencies = file_data.get('raw_imports', [])
                    existing_db_file.vulnerabilities = cached_ai.get('vulnerabilities', [])
                    db.commit()
                    db_file = existing_db_file
                else:
                    # Create new record with cached AI
                    cached_ai = file_data['cached_ai']
                    db_file = File(
                        repository_id=repo_id,
                        path=file_data['path'],
                        filename=file_data['filename'],
                        language=file_data['language'],
                        size_bytes=file_data['size_bytes'],
                        lines_of_code=file_data['lines_of_code'],
                        content=file_data['content'],
                        explanation=cached_ai.get('explanation', ''),
                        key_functions=cached_ai.get('key_functions', []),
                        # Use raw imports for dependency graph (not AI descriptions)
                        dependencies=file_data.get('raw_imports', []),
                        vulnerabilities=cached_ai.get('vulnerabilities', [])
                    )
                    db.add(db_file)
                    db.commit()
                    db.refresh(db_file)
                
                db_files_cached.append((db_file, file_data))
                
                # Add to summaries
                cached_ai = file_data['cached_ai']
                file_summaries.append({
                    'path': file_data['path'],
                    'explanation': cached_ai.get('explanation', ''),
                    'dependencies': file_data.get('raw_imports', []),
                    'vulnerabilities': cached_ai.get('vulnerabilities', [])
                })
                
                # Prepare chunks for embedding
                file_chunks = embedding_service.prepare_chunks_for_batch(
                    repo_id,
                    db_file.id,
                    file_data['path'],
                    file_data['content'],
                    file_data['language']
                )
                all_chunks_for_embedding.extend(file_chunks)
            
            logger.info(f"✅ Restored {len(files_with_cached_ai)} files from cache (ZERO API calls!)")
        
        # Step 3b: Process files NEEDING AI explanations (API calls required)
        db_files_needing_ai = []
        if files_needing_ai:
            logger.info(f"🤖 Creating database records for {len(files_needing_ai)} files needing AI...")
            for idx, file_data in enumerate(files_needing_ai):
                update_repo_status(
                    db, repo_id, IndexingStatus.CHUNKING,
                    35 + int((idx / len(files_needing_ai)) * 5),
                    f"Recording file {idx+1}/{len(files_needing_ai)}",
                    current_file=file_data['path'],
                    processed_files=len(files_with_cached_ai) + idx,
                    current_step=f"Creating file records for AI processing"
                )
                
                # Check if file exists in DB (update) or needs to be created (insert)
                existing_db_file = existing_files.get(file_data['path'])
                
                if existing_db_file:
                    # Update existing record (will update AI fields later)
                    existing_db_file.language = file_data['language']
                    existing_db_file.size_bytes = file_data['size_bytes']
                    existing_db_file.lines_of_code = file_data['lines_of_code']
                    existing_db_file.content = file_data['content']
                    db.commit()
                    db_file = existing_db_file
                else:
                    # Create new record
                    db_file = File(
                        repository_id=repo_id,
                        path=file_data['path'],
                        filename=file_data['filename'],
                        language=file_data['language'],
                        size_bytes=file_data['size_bytes'],
                        lines_of_code=file_data['lines_of_code'],
                        content=file_data['content']
                    )
                    db.add(db_file)
                    db.commit()
                    db.refresh(db_file)
                
                db_files_needing_ai.append((db_file, file_data))
                
                # Prepare chunks for embedding
                file_chunks = embedding_service.prepare_chunks_for_batch(
                    repo_id,
                    db_file.id,
                    file_data['path'],
                    file_data['content'],
                    file_data['language']
                )
                all_chunks_for_embedding.extend(file_chunks)
        
        # Step 3c: Generate AI explanations ONLY for files that need it
        if db_files_needing_ai:
            PARALLEL_BATCH_SIZE = 3  # Process 3 files at a time (stable with free APIs)
            logger.info(f"🤖 Generating AI explanations for {len(db_files_needing_ai)} files (parallel batches of {PARALLEL_BATCH_SIZE})...")
            
            async def process_file_ai(db_file, file_data, idx):
                """Process AI explanation for a single file."""
                file_name = file_data['path']
                try:
                    logger.info(f"   🔄 [{idx+1}] Starting: {file_name}")
                    
                    # Generate AI explanation
                    explanation_data = await ai_service.generate_file_explanation(
                        file_data['path'],
                        file_data['content'],
                        file_data['language']
                    )
                    
                    logger.info(f"   ✅ [{idx+1}] Completed: {file_name}")
                    
                    # Cache the AI explanation for future re-indexes!
                    cache_service.cache_ai_explanation(
                        repo.github_repo_id, 
                        file_data['path'], 
                        {
                            'explanation': explanation_data.get('explanation', ''),
                            'key_functions': explanation_data.get('key_functions', []),
                            'dependencies': explanation_data.get('dependencies', []),
                            'vulnerabilities': explanation_data.get('vulnerabilities', [])
                        }
                    )
                    
                    # Run vulnerability scan (synchronous but fast)
                    file_path_full = os.path.join(clone_path, file_data['path'])
                    vulnerabilities = analyze_file_with_bandit(file_path_full, file_data['language'])
                    
                    return {
                        'db_file': db_file,
                        'explanation': explanation_data.get('explanation', ''),
                        'key_functions': explanation_data.get('key_functions', []),
                        # Use raw imports from code parsing (not AI descriptions)
                        'raw_imports': file_data.get('raw_imports', []),
                        'vulnerabilities': vulnerabilities,
                        'path': file_data['path'],
                        'idx': idx
                    }
                except Exception as e:
                    logger.info(f"   ⚠️ [{idx+1}] Failed: {file_name} - {str(e)[:50]}")
                    return {
                        'db_file': db_file,
                        'explanation': f"AI analysis failed: {str(e)}",
                        'key_functions': [],
                        # Use raw imports from code parsing even if AI fails
                        'raw_imports': file_data.get('raw_imports', []),
                        'vulnerabilities': [],
                        'path': file_data['path'],
                        'idx': idx
                    }
            
            # Process in parallel batches (ONLY files needing AI!)
            for batch_start in range(0, len(db_files_needing_ai), PARALLEL_BATCH_SIZE):
                batch_end = min(batch_start + PARALLEL_BATCH_SIZE, len(db_files_needing_ai))
                batch = db_files_needing_ai[batch_start:batch_end]
                
                update_repo_status(
                    db, repo_id, IndexingStatus.EMBEDDING,
                    40 + int((batch_start / len(db_files_needing_ai)) * 35),
                    f"AI analysis batch {batch_start//PARALLEL_BATCH_SIZE + 1}: files {batch_start+1}-{batch_end}/{len(db_files_needing_ai)}",
                    processed_files=len(files_with_cached_ai) + batch_start,
                    current_step=f"Parallel AI processing ({len(batch)} files)"
                )
                
                # Create tasks for parallel execution
                tasks = [
                    process_file_ai(db_file, file_data, batch_start + i)
                    for i, (db_file, file_data) in enumerate(batch)
                ]
                
                # Execute in parallel
                results = await asyncio.gather(*tasks)
                
                for result in results:
                    db_file = result['db_file']
                    db_file.explanation = result['explanation']
                    db_file.key_functions = result['key_functions']
                    # Use raw imports for dependency graph (not AI descriptions)
                    db_file.dependencies = result.get('raw_imports', [])
                    db_file.vulnerabilities = result['vulnerabilities']
                    db.commit()
                    
                    file_summaries.append({
                        'path': result['path'],
                        'explanation': result['explanation'],
                        'dependencies': result.get('raw_imports', []),
                        'vulnerabilities': result['vulnerabilities']
                    })
                
                logger.info(f"✅ Completed AI batch {batch_start//PARALLEL_BATCH_SIZE + 1}: {len(results)} files")
        else:
            logger.info(f"⚡ ALL files had cached AI explanations - ZERO API calls needed!")
        
        # Step 3.5: Batch process all embeddings at once (OPTIMIZED)
        if all_chunks_for_embedding:
            update_repo_status(
                db, repo_id, IndexingStatus.EMBEDDING, 75,
                f"Generating embeddings for {len(all_chunks_for_embedding)} chunks...",
                current_step="Batch processing vector embeddings"
            )
            
            logger.info(f"🚀 Batch processing {len(all_chunks_for_embedding)} chunks...")
            total_chunks_stored = embedding_service.batch_store_chunks(all_chunks_for_embedding, batch_size=50)
            logger.info(f"✅ Stored {total_chunks_stored} chunks in vector database")
        
        # Step 4: Generate documentation (with caching optimization)
        # If ALL files used cached AI explanations, we can potentially use cached docs too
        if len(files_needing_ai) == 0:
            # Check for cached documentation
            cached_docs = cache_service.get_cached_documentation(repo.github_repo_id)
            if cached_docs:
                logger.info(f"⚡ Using CACHED documentation (no changes detected)")
                doc_sections = cached_docs
                
                update_repo_status(
                    db, repo_id, IndexingStatus.GENERATING_DOCS, 92,
                    "Restoring cached documentation...",
                    current_step="Using cached documentation (no changes)",
                    processed_files=total_files
                )
            else:
                # No cached docs, generate new ones
                update_repo_status(
                    db, repo_id, IndexingStatus.GENERATING_DOCS, 85,
                    "Generating comprehensive documentation...",
                    current_step="AI is analyzing repository structure",
                    processed_files=total_files
                )

                def _doc_progress(idx: int, total: int, title: str):
                    # Walk 85 -> 92 across all sections (7% range).
                    pct = 85 + int(round(7 * idx / total))
                    update_repo_status(
                        db, repo_id, IndexingStatus.GENERATING_DOCS, pct,
                        f"Section {idx}/{total}: {title}",
                        current_step=f"AI is writing section {idx} of {total}",
                        processed_files=total_files,
                    )

                doc_sections = await ai_service.generate_repository_documentation(
                    repo.name,
                    file_summaries,
                    language_stats,
                    progress_callback=_doc_progress,
                )

                # Cache the documentation for future use
                cache_service.cache_documentation(repo.github_repo_id, doc_sections)
                logger.info(f"📦 Cached documentation for future re-indexes")
        else:
            # Files changed, regenerate documentation
            update_repo_status(
                db, repo_id, IndexingStatus.GENERATING_DOCS, 85,
                "Generating comprehensive documentation...",
                current_step="AI is analyzing repository structure",
                processed_files=total_files
            )

            def _doc_progress(idx: int, total: int, title: str):
                pct = 85 + int(round(7 * idx / total))
                update_repo_status(
                    db, repo_id, IndexingStatus.GENERATING_DOCS, pct,
                    f"Section {idx}/{total}: {title}",
                    current_step=f"AI is writing section {idx} of {total}",
                    processed_files=total_files,
                )

            doc_sections = await ai_service.generate_repository_documentation(
                repo.name,
                file_summaries,
                language_stats,
                progress_callback=_doc_progress,
            )

            # Cache the new documentation
            cache_service.cache_documentation(repo.github_repo_id, doc_sections)
            logger.info(f"📦 Cached new documentation for future re-indexes")

        update_repo_status(
            db, repo_id, IndexingStatus.GENERATING_DOCS, 92,
            "Saving documentation sections...",
            current_step="Storing generated documentation"
        )

        for section in doc_sections:
            db_section = DocumentationSection(
                repository_id=repo_id,
                section_name=section['section_name'],
                content=section['content'],
                order=section['order']
            )
            db.add(db_section)
        db.commit()

        # Step 5: Complete
        update_repo_status(
            db, repo_id, IndexingStatus.COMPLETED, 100,
            "Indexing completed successfully!",
            current_step="Repository is ready to explore",
            processed_files=total_files,
            current_file=None
        )
        repo.indexed_at = func.now()
        db.commit()
        
        # Print summary
        logger.info(f"\n" + "="*60)
        logger.info(f"📊 INDEXING SUMMARY FOR {repo.name}")
        logger.info(f"="*60)
        logger.info(f"   Total files: {total_files}")
        logger.info(f"   ⚡ Cached (no AI needed): {len(files_with_cached_ai)}")
        logger.info(f"   🤖 AI calls made: {len(files_needing_ai)}")
        api_savings = (len(files_with_cached_ai) / total_files * 100) if total_files > 0 else 0
        logger.info(f"   💰 API calls saved: {api_savings:.1f}%")
        if len(files_needing_ai) == 0:
            logger.info(f"   🎉 FULL CACHE HIT - Zero API calls!")
        logger.info(f"="*60 + "\n")
        
        # Cleanup
        logger.info(f"Cleaning up clone directory: {clone_path}")
        shutil.rmtree(clone_path, ignore_errors=True)

    except Exception as e:
        logger.info(f"Indexing failed: {e}")
        import traceback
        traceback.print_exc()

        from helpers import sanitize_error_message
        error_message = sanitize_error_message(str(e))
        if len(error_message) > 500:
            error_message = error_message[:500] + "..."

        update_repo_status(
            db, repo_id, IndexingStatus.FAILED, 0,
            f"Indexing failed: {error_message}",
            error=error_message,
            current_step="Indexing failed"
        )
        # Cleanup on failure too
        try:
            if clone_path and os.path.exists(clone_path):
                logger.info(f"Cleaning up after failure: {clone_path}")
                shutil.rmtree(clone_path, ignore_errors=True)
        except:
            pass
    finally:
        db.close()


def enqueue_indexing_job(repo_id: int, access_token: str) -> str:
    """
    Enqueue a repository indexing job.
    
    Args:
        repo_id: Repository ID
        access_token: GitHub access token
        
    Returns:
        Job ID
    """
    job = task_queue.enqueue(
        index_repository_task,
        repo_id,
        access_token,
        job_timeout='1h'
    )
    return job.id

