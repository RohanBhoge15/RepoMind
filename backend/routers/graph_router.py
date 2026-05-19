"""
Dependency graph routes.
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import Dict, Set, List
import re

from database import get_db
from models import User, File
from schemas import DependencyGraphResponse, GraphNode, GraphEdge
from auth import get_current_user
from helpers import verify_repository_access

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/graph", tags=["Graph"])


# Cyclomatic-complexity heuristic: count branching keywords per LoC.
# Cheap, language-agnostic, no AST parse — good enough for viz heatmaps.
_BRANCH_PATTERN = re.compile(
    r'\b(if|elif|else|for|while|switch|case|catch|except|&&|\|\||\?)\b'
)


def estimate_complexity(content: str | None, loc: int) -> float:
    if not content or loc <= 0:
        return 0.0
    branches = len(_BRANCH_PATTERN.findall(content))
    return round(1.0 + branches / max(loc, 1) * 10.0, 2)


def extract_imports_python(content: str) -> List[str]:
    """Extract import statements from Python code."""
    imports = []

    # Match: import module, from module import ...
    # Capture relative imports (starting with .)
    relative_patterns = [
        r'^\s*from\s+(\.+[a-zA-Z0-9_\.]*)\s+import',  # from .module import or from .. import
    ]

    # Capture absolute imports
    absolute_patterns = [
        r'^\s*import\s+([a-zA-Z0-9_\.]+)',  # import module
        r'^\s*from\s+([a-zA-Z0-9_][a-zA-Z0-9_\.]*)\s+import',  # from module import
    ]

    for line in content.split('\n'):
        # Check for relative imports first
        for pattern in relative_patterns:
            match = re.match(pattern, line)
            if match:
                import_path = match.group(1)
                imports.append(import_path)
                break
        else:
            # Check for absolute imports (only local modules, not stdlib/external)
            for pattern in absolute_patterns:
                match = re.match(pattern, line)
                if match:
                    import_path = match.group(1)
                    # Only include if it looks like a local module (no common stdlib names)
                    # We'll filter external packages later based on file existence
                    imports.append(import_path)
                    break

    return imports


def extract_imports_javascript(content: str) -> List[str]:
    """Extract import statements from JavaScript/TypeScript code."""
    imports = []

    # Match: import ... from 'module', require('module')
    # Only capture relative imports (starting with ./ or ../)
    import_patterns = [
        r'import\s+.*\s+from\s+[\'"](\.[^\'"]+)[\'"]',  # import ... from './file'
        r'require\([\'"](\.[^\'"]+)[\'"]\)',  # require('./file')
        r'import\s*\([\'"](\.[^\'"]+)[\'"]\)',  # dynamic import('./file')
    ]

    for pattern in import_patterns:
        matches = re.findall(pattern, content)
        imports.extend(matches)

    return imports


def extract_dependencies(content: str, language: str) -> List[str]:
    """Extract dependencies based on language."""
    if language == 'Python':
        return extract_imports_python(content)
    elif language in ['JavaScript', 'TypeScript']:
        return extract_imports_javascript(content)
    else:
        return []


def normalize_import_path(import_path: str, file_path: str) -> str:
    """
    Normalize import path to match file paths.
    Resolves relative imports based on the importing file's location.
    """
    import os

    # Get the directory of the importing file
    file_dir = os.path.dirname(file_path)

    # Handle JavaScript/TypeScript relative imports
    if import_path.startswith('./'):
        # Same directory
        import_path = import_path[2:]
        resolved_path = os.path.join(file_dir, import_path)
    elif import_path.startswith('../'):
        # Parent directory
        resolved_path = os.path.normpath(os.path.join(file_dir, import_path))
    # Handle Python relative imports (starting with dots)
    elif import_path.startswith('.'):
        # Count leading dots
        dot_count = len(import_path) - len(import_path.lstrip('.'))
        module_path = import_path[dot_count:]

        # Go up directories based on dot count
        current_dir = file_dir
        for _ in range(dot_count - 1):
            current_dir = os.path.dirname(current_dir)

        # Append module path
        if module_path:
            module_path = module_path.replace('.', '/')
            resolved_path = os.path.join(current_dir, module_path)
        else:
            resolved_path = current_dir
    else:
        # Absolute or module import - convert dots to slashes
        resolved_path = import_path.replace('.', '/')

    # Normalize path separators
    resolved_path = resolved_path.replace('\\', '/')

    return resolved_path


@router.get("/repos/{repo_id}", response_model=DependencyGraphResponse)
async def get_dependency_graph(
    repo_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get dependency graph for a repository.
    
    Args:
        repo_id: Repository ID
        current_user: Current authenticated user
        db: Database session
        
    Returns:
        Dependency graph with nodes and edges
    """
    verify_repository_access(repo_id, current_user.id, db)

    # Get all files
    files = db.query(File).filter(File.repository_id == repo_id).all()
    
    # Build nodes
    nodes = []
    file_map = {}  # Map file paths to file IDs
    
    for file in files:
        vuln_count = len(file.vulnerabilities) if isinstance(file.vulnerabilities, list) else 0
        node = GraphNode(
            id=str(file.id),
            label=file.filename,
            path=file.path,
            language=file.language,
            type='file',
            loc=file.lines_of_code or 0,
            size_bytes=file.size_bytes or 0,
            complexity=estimate_complexity(file.content, file.lines_of_code or 0),
            last_modified=file.updated_at or file.created_at,
            indexed_at=file.last_analyzed,
            vulnerability_count=vuln_count,
            has_explanation=bool(file.explanation),
        )
        nodes.append(node)
        
        # Create multiple mappings for dependency resolution
        file_id = str(file.id)
        
        # Original path (e.g., "game/events.py" or "game\events.py")
        normalized_path = file.path.replace('\\', '/')
        file_map[normalized_path] = file_id
        file_map[file.path] = file_id
        
        # Without extension (e.g., "game/events")
        path_no_ext = normalized_path.rsplit('.', 1)[0]
        file_map[path_no_ext] = file_id
        
        # Python module style (e.g., "game.events")
        module_path = path_no_ext.replace('/', '.')
        file_map[module_path] = file_id
        
        # Just the filename without extension (e.g., "events") 
        filename_no_ext = file.filename.rsplit('.', 1)[0]
        # Only add if not already mapped (avoid conflicts)
        if filename_no_ext not in file_map:
            file_map[filename_no_ext] = file_id
    
    # Build edges from dependencies by parsing actual imports
    edges = []
    seen_edges = set()

    logger.info(f"Building dependency graph for {len(files)} files")

    for file in files:
        source_id = str(file.id)

        # First, use stored dependencies (these are now raw import paths from indexing)
        imports = []
        if file.dependencies and len(file.dependencies) > 0:
            imports = list(file.dependencies)
            # print(f"File: {file.path} - Using {len(imports)} stored imports")
        # Fallback: Extract imports from file content if no stored dependencies
        elif file.content:
            imports = extract_dependencies(file.content, file.language)
            # print(f"File: {file.path} - Extracted {len(imports)} imports from content")

        # Remove duplicates
        imports = list(set(imports))

        for import_path in imports:
            # Try to match this import to a file in the repository
            # First, check if import_path directly matches (handles Python modules like 'game.config')
            if import_path in file_map:
                target_id = file_map[import_path]
                edge_key = f"{source_id}-{target_id}"
                if edge_key not in seen_edges and source_id != target_id:
                    edges.append(GraphEdge(
                        source=source_id,
                        target=target_id,
                        type='imports'
                    ))
                    seen_edges.add(edge_key)
                continue

            # Normalize the import path
            normalized_dep = normalize_import_path(import_path, file.path)
            normalized_dep_clean = normalized_dep.replace('\\', '/')

            # Check various possible matches
            possible_paths = [
                normalized_dep,
                normalized_dep_clean,
                f"{normalized_dep_clean}.py",
                f"{normalized_dep_clean}.js",
                f"{normalized_dep_clean}.ts",
                f"{normalized_dep_clean}.tsx",
                f"{normalized_dep_clean}.jsx",
                f"{normalized_dep_clean}/index.js",
                f"{normalized_dep_clean}/index.ts",
                f"{normalized_dep_clean}/index.tsx",
                f"{normalized_dep_clean}/__init__.py",
                # Python module format
                normalized_dep_clean.replace('/', '.'),
                import_path.replace('.', '/'),
                f"{import_path.replace('.', '/')}.py",
            ]

            # Also try without file extension if import has one
            if '.' in import_path.split('/')[-1]:
                base_path = import_path.rsplit('.', 1)[0]
                possible_paths.append(base_path)

            for path in possible_paths:
                if path in file_map:
                    target_id = file_map[path]
                    edge_key = f"{source_id}-{target_id}"

                    if edge_key not in seen_edges and source_id != target_id:
                        edges.append(GraphEdge(
                            source=source_id,
                            target=target_id,
                            type='imports'
                        ))
                        seen_edges.add(edge_key)
                    break

    logger.info(f"Dependency graph built: {len(nodes)} nodes, {len(edges)} edges")

    return DependencyGraphResponse(
        nodes=nodes,
        edges=edges
    )

