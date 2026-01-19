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
    # for browser-reachable URLs (public/proxied endpoint, NOT localhost)
    return _client(settings.s3_presign_endpoint_url)

def ensure_bucket():
    c = s3_internal_client()
    try:
        c.head_bucket(Bucket=settings.s3_bucket)
    except Exception:
        c.create_bucket(Bucket=settings.s3_bucket)

def presign_put(object_key: str, content_type: str | None, expires_sec: int = 900) -> tuple[str, dict]:
    # IMPORTANT: do not sign Content-Type (browser reliability)
    c = s3_presign_client()
    params = {"Bucket": settings.s3_bucket, "Key": object_key}
    url = c.generate_presigned_url(
        ClientMethod="put_object",
        Params=params,
        ExpiresIn=expires_sec,
    )
    return url, {}

def presign_get(
    object_key: str,
    expires_sec: int = 900,
    response_content_type: str | None = None,
    response_content_disposition: str | None = None,
) -> str:
    c = s3_presign_client()
    params: dict = {"Bucket": settings.s3_bucket, "Key": object_key}
    if response_content_type:
        params["ResponseContentType"] = response_content_type
    if response_content_disposition:
        params["ResponseContentDisposition"] = response_content_disposition

    return c.generate_presigned_url(
        ClientMethod="get_object",
        Params=params,
        ExpiresIn=expires_sec,
    )
