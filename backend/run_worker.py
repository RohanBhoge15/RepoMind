"""
RQ worker startup script.
Run this to start the background job worker.
"""
import asyncio
import redis
from rq import Worker, Queue, Connection
from config import get_settings
from worker import index_repository_task

settings = get_settings()

# Redis connection
redis_conn = redis.from_url(settings.redis_url)


class AsyncJobWorker(Worker):
    """Worker that properly executes async jobs by wrapping them in asyncio.run()."""

    def perform_job(self, job, queue):
        if job.func_name.endswith('index_repository_task'):
            # Wrap the async function in a sync wrapper
            original_func = job.func

            def sync_wrapper(*args, **kwargs):
                return asyncio.run(original_func(*args, **kwargs))

            job.func = sync_wrapper
        return super().perform_job(job, queue)


if __name__ == '__main__':
    print("🚀 Starting RQ worker for indexing jobs (Windows mode)...")
    with Connection(redis_conn):
        worker = AsyncJobWorker(['indexing'], connection=redis_conn)
        worker.work()

