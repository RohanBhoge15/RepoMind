"""Script to clear cache for a specific repository."""
import redis
import sys
from config import get_settings
from database import SessionLocal
from models import Repository

app_settings = get_settings()
redis_client = redis.from_url(app_settings.redis_url, decode_responses=True)

def clear_repo_cache_by_github_id(github_repo_id):
    """Clear all cache keys for a specific repository by GitHub ID."""
    print(f"Clearing cache for GitHub ID: {github_repo_id}...")
    
    patterns = [
        f"file:{github_repo_id}:*",
        f"tree:{github_repo_id}:*",
        f"hash:{github_repo_id}:*",
        f"ai:{github_repo_id}:*",
        f"docs:{github_repo_id}",
    ]
    
    total_deleted = 0
    for pattern in patterns:
        keys = list(redis_client.scan_iter(match=pattern))
        if keys:
            print(f"   Found {len(keys)} keys for pattern '{pattern}'")
            redis_client.delete(*keys)
            total_deleted += len(keys)
        else:
            print(f"   No keys found for pattern '{pattern}'")
            
    print(f"Deleted {total_deleted} cache entries.")
    return total_deleted

def clear_repo_cache(repo_db_id):
    """Clear cache for a repository by its database ID."""
    db = SessionLocal()
    try:
        repo = db.query(Repository).filter(Repository.id == repo_db_id).first()
        if not repo:
            print(f"Repository with ID {repo_db_id} not found in database")
            return False
        
        print(f"Found repository: {repo.name} (DB ID: {repo.id}, GitHub ID: {repo.github_repo_id})")
        clear_repo_cache_by_github_id(repo.github_repo_id)
        print(f"Cache cleared for repository: {repo.name}")
        return True
    finally:
        db.close()

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python clear_cache.py <repo_db_id>")
        print("Example: python clear_cache.py 2")
        sys.exit(1)
    
    repo_id = int(sys.argv[1])
    clear_repo_cache(repo_id)
