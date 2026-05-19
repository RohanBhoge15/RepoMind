"""
Windows-compatible worker for background jobs.
Uses polling instead of fork/signals.
"""
import time
import asyncio
import redis
from rq import Queue
from config import get_settings
from worker import index_repository_task

settings = get_settings()

# Redis connection
redis_conn = redis.from_url(settings.redis_url)
queue = Queue('indexing', connection=redis_conn)

def run_worker():
    """
    Simple polling worker for Windows.
    """
    print("🚀 Starting Windows-compatible worker for indexing jobs...")
    print("📡 Polling for jobs every 2 seconds...")
    print("Press Ctrl+C to stop")

    while True:
        try:
            # Get jobs from the queue
            jobs = queue.get_jobs()

            if jobs:
                for job in jobs:
                    if job.get_status() == 'queued':
                        print(f"\n✅ Processing job: {job.id}")
                        print(f"   Function: {job.func_name}")
                        print(f"   Args: {job.args}")

                        try:
                            # Execute the job
                            job.set_status('started')
                            # Run async function with asyncio.run()
                            result = asyncio.run(index_repository_task(*job.args))
                            job.set_status('finished')
                            print(f"✅ Job {job.id} completed successfully!")
                        except Exception as e:
                            job.set_status('failed')
                            print(f"❌ Job {job.id} failed with error: {e}")
                            import traceback
                            traceback.print_exc()
                            
                            # Update repository status in database to FAILED
                            try:
                                from database import SessionLocal
                                from models import Repository, IndexingStatus
                                
                                db = SessionLocal()
                                repo_id = job.args[0] if job.args else None
                                if repo_id:
                                    repo = db.query(Repository).filter(Repository.id == repo_id).first()
                                    if repo:
                                        repo.indexing_status = IndexingStatus.FAILED
                                        repo.indexing_progress = 0
                                        repo.indexing_message = f"Indexing failed: {str(e)[:200]}"
                                        repo.error_message = str(e)[:500]
                                        repo.current_step = "Indexing failed - please try again"
                                        db.commit()
                                        print(f"📋 Updated repository {repo_id} status to FAILED")
                                db.close()
                            except Exception as db_error:
                                print(f"⚠️ Could not update DB status: {db_error}")

            # Wait before checking again
            time.sleep(2)

        except KeyboardInterrupt:
            print("\n\n👋 Worker stopped by user")
            break
        except Exception as e:
            print(f"❌ Worker error: {e}")
            import traceback
            traceback.print_exc()
            time.sleep(5)

if __name__ == '__main__':
    run_worker()

