"""
Repository management routes.
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Any
from github import Github

from database import get_db
from models import User, Repository, File, IndexingStatus
from schemas import (
    RepositoryResponse, RepositoryListResponse, IndexingStatusResponse,
    FileResponse, FileTreeNode, RepositoryUrlRequest
)
from auth import get_current_user, get_github_token
from worker import enqueue_indexing_job
from helpers import verify_repository_access

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/repos", tags=["Repositories"])


@router.get("", response_model=RepositoryListResponse)
async def list_repositories(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100)
):
    """
    List all repositories for the current user from GitHub.
    Also returns indexed repositories from database.
    
    Args:
        current_user: Current authenticated user
        db: Database session
        page: Page number for pagination
        limit: Items per page
        
    Returns:
        List of repositories
    """
    # Get GitHub token
    github_token = get_github_token(current_user)
    g = Github(github_token)
    
    try:
        # Get user's repositories from GitHub (for ones not yet indexed)
        github_user = g.get_user()
        github_repos = list(github_user.get_repos())
        
        # Get indexed repositories from database
        indexed_repos = db.query(Repository).filter(
            Repository.user_id == current_user.id
        ).all()
        
        indexed_map = {repo.github_repo_id: repo for repo in indexed_repos}
        
        # Create a set of GitHub repo IDs for quick lookup
        github_repo_ids = {str(r.id) for r in github_repos}
        
        # Start with ALL repositories from the database (these are already indexed or indexing)
        repositories = []
        for repo in indexed_repos:
            # It's imported if it's NOT in the user's GitHub repo list
            is_imported = repo.github_repo_id not in github_repo_ids
            
            # Create response object and set is_imported
            repo_response = RepositoryResponse.from_orm(repo)
            repo_response.is_imported = is_imported
            repositories.append(repo_response)
        
        # Add placeholder repositories for GitHub repos that aren't indexed yet
        for gh_repo in github_repos:
            repo_id_str = str(gh_repo.id)
            
            if repo_id_str not in indexed_map:
                # Create placeholder repository object for unindexed GitHub repo
                repo_data = RepositoryResponse(
                    id=0,
                    github_repo_id=repo_id_str,
                    name=gh_repo.name,
                    full_name=gh_repo.full_name,
                    description=gh_repo.description,
                    url=gh_repo.html_url,
                    default_branch=gh_repo.default_branch or "main",
                    indexing_status=IndexingStatus.PENDING,
                    indexing_progress=0,
                    indexing_message=None,
                    indexed_at=None,
                    total_files=0,
                    total_lines=0,
                    languages={},
                    created_at=gh_repo.created_at,
                    updated_at=gh_repo.updated_at,
                    language=gh_repo.language,
                    stars_count=gh_repo.stargazers_count,
                    forks_count=gh_repo.forks_count,
                    is_imported=False  # User's own repo
                )
                repositories.append(repo_data)
        
        # Sort repositories: show Indexed/Indexing ones first
        repositories.sort(key=lambda x: (x.id == 0, x.name.lower()))
        
        # Pagination
        start = (page - 1) * limit
        end = start + limit
        paginated = repositories[start:end]
        
        return RepositoryListResponse(
            repositories=paginated,
            total=len(repositories)
        )
        
    except Exception as e:
        logger.error(f"Failed to fetch repositories: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch repositories"
        )


def _handle_indexing_logic(db: Session, current_user: User, gh_repo: Any, github_token: str) -> Repository:
    """Helper to handle repo creation/update and job queuing."""
    github_repo_id = str(gh_repo.id)
    
    # Check if repository already exists
    existing_repo = db.query(Repository).filter(
        Repository.github_repo_id == github_repo_id
    ).first()
    
    if existing_repo:
        # Re-index existing repository
        # If already being processed, just return the repo
        if existing_repo.indexing_status in [IndexingStatus.CLONING,
                                               IndexingStatus.ANALYZING, IndexingStatus.CHUNKING,
                                               IndexingStatus.EMBEDDING, IndexingStatus.GENERATING_DOCS]:
            logger.info(f"Repository {github_repo_id} is already being indexed (status: {existing_repo.indexing_status})")
            return existing_repo

        # Reset status for re-indexing
        existing_repo.indexing_status = IndexingStatus.CLONING
        existing_repo.indexing_progress = 0
        existing_repo.indexing_message = "Queued for indexing"
        existing_repo.current_file = None
        existing_repo.processed_files = 0
        existing_repo.current_step = None
        existing_repo.error_message = None
        
        # Take ownership if needed
        existing_repo.user_id = current_user.id
        db.commit()

        repo = existing_repo
    else:
        # Create new repository record
        repo = Repository(
            user_id=current_user.id,
            github_repo_id=github_repo_id,
            name=gh_repo.name,
            full_name=gh_repo.full_name,
            description=gh_repo.description,
            url=gh_repo.html_url,
            default_branch=gh_repo.default_branch or "main",
            indexing_status=IndexingStatus.CLONING,
            indexing_progress=0,
            indexing_message="Queued for indexing",
            language=gh_repo.language,
            stars_count=gh_repo.stargazers_count,
            forks_count=gh_repo.forks_count
        )
        db.add(repo)
        db.commit()
        db.refresh(repo)
    
    # Enqueue background job
    enqueue_indexing_job(repo.id, github_token)
    
    return repo


@router.post("/import", response_model=RepositoryResponse)
async def import_repository_by_url(
    request: RepositoryUrlRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Import and index a repository by PUBLIC GitHub URL.
    """
    github_token = get_github_token(current_user)
    g = Github(github_token)
    
    try:
        # Parse URL — request.url is a pydantic AnyUrl object, coerce to str
        url_clean = str(request.url).strip()
        
        # Extract owner/repo
        # Handle cases:
        # https://github.com/owner/repo
        # https://github.com/owner/repo.git
        # owner/repo
        
        if "github.com/" in url_clean:
            parts = url_clean.split("github.com/")
            path = parts[1]
        else:
            path = url_clean
            
        path = path.strip('/')
        if path.endswith('.git'):
            path = path[:-4]
            
        path_parts = path.split('/')
        if len(path_parts) < 2:
            raise HTTPException(status_code=400, detail="Invalid GitHub URL. Must be 'owner/repo' or full URL.")
             
        full_name = f"{path_parts[0]}/{path_parts[1]}"
        
        try:
            gh_repo = g.get_repo(full_name)
        except Exception:
            raise HTTPException(
                status_code=404, 
                detail=f"Repository '{full_name}' not found or not accessible."
            )
            
        return _handle_indexing_logic(db, current_user, gh_repo, github_token)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to import repository: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to import repository"
        )


@router.post("/{github_repo_id}/index", response_model=RepositoryResponse)
async def trigger_indexing(
    github_repo_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Trigger indexing for a repository.
    """
    github_token = get_github_token(current_user)
    g = Github(github_token)
    
    try:
        # Get repository directly by ID (works for both owned and imported public repos)
        try:
            gh_repo = g.get_repo(int(github_repo_id))
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Repository not found on GitHub"
            )
            
        return _handle_indexing_logic(db, current_user, gh_repo, github_token)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to trigger indexing: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to trigger indexing"
        )


@router.get("/{repo_id}/status", response_model=IndexingStatusResponse)
async def get_indexing_status(
    repo_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get indexing status for a repository.

    Args:
        repo_id: Repository ID
        current_user: Current authenticated user
        db: Database session

    Returns:
        Indexing status
    """
    repo = verify_repository_access(repo_id, current_user.id, db)

    return IndexingStatusResponse(
        repository_id=repo.id,
        status=repo.indexing_status,
        progress=repo.indexing_progress,
        message=repo.indexing_message,
        total_files=repo.total_files,
        indexed_at=repo.indexed_at,
        current_file=repo.current_file,
        processed_files=repo.processed_files,
        current_step=repo.current_step,
        error=repo.error_message
    )


@router.delete("/{repo_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_repository(
    repo_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Delete a repository and all associated data (files, chunks, chat history).
    Best-effort cleanup of cache and Qdrant vectors.
    """
    repo = verify_repository_access(repo_id, current_user.id, db)

    # Best-effort: invalidate cache entries
    try:
        from cache_service import get_cache_service
        get_cache_service().invalidate_repo_cache(repo.github_repo_id)
    except Exception as e:
        logger.warning(f"Cache cleanup failed for repo {repo_id}: {e}")

    # Best-effort: drop Qdrant vectors for this repo
    try:
        from embeddings import get_embedding_service
        get_embedding_service().delete_repository_chunks(repo.id)
    except Exception as e:
        logger.warning(f"Vector cleanup failed for repo {repo_id}: {e}")

    # Cascade delete via SQLAlchemy relationships handles files/chunks/chat
    db.delete(repo)
    db.commit()
    logger.info(f"Repository {repo_id} ({repo.name}) deleted by user {current_user.id}")
    return None


@router.get("/{repo_id}/files", response_model=List[FileTreeNode])
async def get_file_tree(
    repo_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get file tree for a repository.
    
    Args:
        repo_id: Repository ID
        current_user: Current authenticated user
        db: Database session
        
    Returns:
        File tree structure
    """
    verify_repository_access(repo_id, current_user.id, db)

    # Get all files
    files = db.query(File).filter(File.repository_id == repo_id).all()
    
    # Build tree structure
    tree = build_file_tree(files)
    
    return tree


def build_file_tree(files: List[File]) -> List[FileTreeNode]:
    """Build hierarchical file tree from flat file list."""
    root = {}
    
    for file in files:
        # Normalize path separators (handle both / and \)
        normalized_path = file.path.replace('\\', '/')
        parts = [p for p in normalized_path.split('/') if p]  # Filter empty parts
        
        if not parts:
            continue
            
        current = root
        
        for i, part in enumerate(parts):
            if part not in current:
                is_file = i == len(parts) - 1
                current[part] = {
                    '_node': FileTreeNode(
                        name=part,
                        path='/'.join(parts[:i+1]),
                        type='file' if is_file else 'directory',
                        file_id=file.id if is_file else None,
                        language=file.language if is_file else None,
                        children=[] if not is_file else None
                    ),
                    '_children': {} if not is_file else None
                }
            
            if i < len(parts) - 1:
                current = current[part]['_children']
    
    def extract_nodes(node_dict):
        nodes = []
        for key, value in sorted(node_dict.items()):
            node = value['_node']
            if value['_children'] is not None:
                node.children = extract_nodes(value['_children'])
            nodes.append(node)
        return nodes
    
    return extract_nodes(root)

