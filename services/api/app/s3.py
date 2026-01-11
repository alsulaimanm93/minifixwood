import boto3
from botocore.config import Config as BotoConfig
from .core.config import settings

def _client(endpoint_url: str):
    return boto3.client(
        "s3",
        endpoint_url=endpoint_url,
        region_name=settings.s3_region,
        aws_access_key_id=settings.s3_access_key,
        aws_secret_access_key=settings.s3_secret_key,
        config=BotoConfig(signature_version="s3v4"),
    )

def s3_internal_client():
    # for server->minio inside docker network
    return _client(settings.s3_endpoint_url)

def s3_presign_client():
    # for browser-reachable URLs (localhost)
    return _client(settings.s3_presign_endpoint_url)

def ensure_bucket():
    c = s3_internal_client()
    try:
        c.head_bucket(Bucket=settings.s3_bucket)
    except Exception:
        c.create_bucket(Bucket=settings.s3_bucket)

def presign_put(object_key: str, content_type: str | None, expires_sec: int = 900) -> tuple[str, dict]:
    c = s3_presign_client()
    params = {"Bucket": settings.s3_bucket, "Key": object_key}
    if content_type:
        params["ContentType"] = content_type
    url = c.generate_presigned_url(
        ClientMethod="put_object",
        Params=params,
        ExpiresIn=expires_sec,
    )
    headers = {}
    if content_type:
        headers["Content-Type"] = content_type
    return url, headers

def presign_get(object_key: str, expires_sec: int = 900) -> str:
    c = s3_presign_client()
    return c.generate_presigned_url(
        ClientMethod="get_object",
        Params={"Bucket": settings.s3_bucket, "Key": object_key},
        ExpiresIn=expires_sec,
    )
