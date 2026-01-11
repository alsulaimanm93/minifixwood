from redis import Redis
from rq import Queue
from .core.config import settings

def get_queue() -> Queue:
    redis = Redis.from_url(settings.redis_url)
    return Queue("default", connection=redis)

def enqueue_job(job_id: str):
    q = get_queue()
    # Worker function path must match worker.py
    q.enqueue("worker.run_job", job_id, job_timeout=60*60)
