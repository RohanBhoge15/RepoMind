"""
API endpoints for cache management.
"""
import logging
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import Dict, Any

from database import get_db
from models import User
from cache_service import get_cache_service
from auth import get_current_user
from helpers import verify_repository_access

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/cache", tags=["cache"])


@router.get("/stats/{repo_id}")
async def get_cache_stats(
    repo_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    """Get cache statistics for a repository."""
    repo = verify_repository_access(repo_id, current_user.id, db)

    cache_service = get_cache_service()
    stats = cache_service.get_cache_stats(repo.github_repo_id)

    return {
        "repository_id": repo_id,
        "github_repo_id": repo.github_repo_id,
        "cache_stats": stats,
        "total_cached_items": sum(stats.values())
    }


@router.delete("/invalidate/{repo_id}")
async def invalidate_cache(
    repo_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Dict[str, str]:
    """Invalidate all cache entries for a repository."""
    repo = verify_repository_access(repo_id, current_user.id, db)

    cache_service = get_cache_service()
    cache_service.invalidate_repo_cache(repo.github_repo_id)

    return {
        "message": f"Cache invalidated for repository {repo.name}",
        "repository_id": repo_id
    }


@router.get("/health")
async def cache_health() -> Dict[str, Any]:
    """Check cache service health."""
    try:
        cache_service = get_cache_service()
        cache_service.redis.ping()
        return {
            "status": "healthy",
            "service": "redis",
            "message": "Cache service is operational"
        }
    except Exception as e:
        logger.error(f"Cache health check failed: {e}")
        return {
            "status": "unhealthy",
            "service": "redis",
            "error": "Service unavailable"
        }
