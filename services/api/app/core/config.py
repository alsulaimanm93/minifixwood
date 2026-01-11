from pydantic_settings import BaseSettings
from pydantic import AnyHttpUrl
from typing import List

class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/workshop"

    jwt_secret: str = "dev_change_me"
    jwt_issuer: str = "workshop"
    jwt_audience: str = "workshop-web"
    jwt_expire_minutes: int = 720

    s3_endpoint_url: str = "http://localhost:9000"
    # Used only to generate presigned URLs that the browser can reach
    s3_presign_endpoint_url: str = "http://localhost:9000"

    s3_region: str = "us-east-1"
    s3_access_key: str = "minio"
    s3_secret_key: str = "minio12345"
    s3_bucket: str = "workshop"
    s3_public_base_url: str = "http://localhost:9000/workshop"

    redis_url: str = "redis://localhost:6379/0"

    cors_origins: str = "http://localhost:3000"

    @property
    def cors_origin_list(self) -> List[str]:
        return [x.strip() for x in self.cors_origins.split(",") if x.strip()]

    class Config:
        env_file = ".env"
        case_sensitive = False

settings = Settings()
