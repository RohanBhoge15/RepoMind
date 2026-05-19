"""
Script to reset repository indexing status.
Use this when a repository is stuck in processing state.
"""
from database import SessionLocal
from models import Repository, IndexingStatus
import sys

def reset_repository_status(repo_id: int = None):
    """
    Reset repository status to allow re-indexing.
    
    Args:
        repo_id: Specific repository ID to reset, or None to reset all processing repos
    """
    db = SessionLocal()
    
    try:
        if repo_id:
            # Reset specific repository
            repo = db.query(Repository).filter(Repository.id == repo_id).first()
            if not repo:
                print(f"❌ Repository with ID {repo_id} not found")
                return
            
            print(f"📋 Repository: {repo.name}")
            print(f"   Current status: {repo.indexing_status}")
            print(f"   Progress: {repo.indexing_progress}%")
            
            repo.indexing_status = IndexingStatus.PENDING
            repo.indexing_progress = 0
            repo.indexing_message = "Ready to index"
            repo.current_file = None
            repo.processed_files = 0
            repo.current_step = None
            repo.error_message = None
            
            db.commit()
            print(f"✅ Repository status reset to PENDING")
            print(f"   You can now trigger indexing from the dashboard")
            
        else:
            # Reset all repositories stuck in processing states
            stuck_statuses = [
                IndexingStatus.CLONING,
                IndexingStatus.ANALYZING,
                IndexingStatus.CHUNKING,
                IndexingStatus.EMBEDDING,
                IndexingStatus.GENERATING_DOCS
            ]
            
            repos = db.query(Repository).filter(
                Repository.indexing_status.in_(stuck_statuses)
            ).all()
            
            if not repos:
                print("✅ No repositories stuck in processing state")
                return
            
            print(f"Found {len(repos)} repositories stuck in processing:")
            for repo in repos:
                print(f"\n📋 Repository: {repo.name} (ID: {repo.id})")
                print(f"   Status: {repo.indexing_status}")
                print(f"   Progress: {repo.indexing_progress}%")
                
                repo.indexing_status = IndexingStatus.PENDING
                repo.indexing_progress = 0
                repo.indexing_message = "Ready to index"
                repo.current_file = None
                repo.processed_files = 0
                repo.current_step = None
                repo.error_message = None
            
            db.commit()
            print(f"\n✅ Reset {len(repos)} repositories to PENDING status")
            print(f"   You can now trigger indexing from the dashboard")
            
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()


def list_repositories():
    """List all repositories and their status."""
    db = SessionLocal()
    
    try:
        repos = db.query(Repository).all()
        
        if not repos:
            print("No repositories found")
            return
        
        print(f"\n{'ID':<5} {'Name':<30} {'Status':<15} {'Progress':<10}")
        print("-" * 70)
        
        for repo in repos:
            print(f"{repo.id:<5} {repo.name[:30]:<30} {repo.indexing_status.value:<15} {repo.indexing_progress}%")
        
        print()
        
    except Exception as e:
        print(f"❌ Error: {e}")
    finally:
        db.close()


if __name__ == '__main__':
    print("🔧 Repository Status Reset Tool\n")
    
    # List all repositories first
    list_repositories()
    
    if len(sys.argv) > 1:
        # Reset specific repository by ID
        try:
            repo_id = int(sys.argv[1])
            reset_repository_status(repo_id)
        except ValueError:
            print("❌ Invalid repository ID. Please provide a number.")
            print("Usage: python reset_repo_status.py [repo_id]")
    else:
        # Ask user what to do
        print("Options:")
        print("1. Reset all stuck repositories")
        print("2. Reset specific repository by ID")
        print("3. Exit")
        
        choice = input("\nEnter your choice (1-3): ").strip()
        
        if choice == '1':
            reset_repository_status()
        elif choice == '2':
            repo_id = input("Enter repository ID: ").strip()
            try:
                reset_repository_status(int(repo_id))
            except ValueError:
                print("❌ Invalid repository ID")
        else:
            print("👋 Exiting")

