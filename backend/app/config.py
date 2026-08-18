from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = "sqlite:///./data/app.db"
    storage_dir: str = "./storage"

    jwt_secret: str = "please-change-me-to-a-long-random-string"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7  # 7 天

    auto_approve: bool = True

    max_upload_size: int = 200 * 1024 * 1024  # 200MB
    max_file_size: int = 200 * 1024 * 1024
    max_cover_size: int = 5 * 1024 * 1024     # 5MB

    # 阿里云 OSS（可选；配置后文件走 OSS 直连，不占服务器带宽）
    oss_endpoint: str = ""
    oss_bucket: str = ""
    oss_access_key_id: str = ""
    oss_access_key_secret: str = ""

    @property
    def oss_enabled(self) -> bool:
        return bool(self.oss_endpoint and self.oss_bucket and self.oss_access_key_id and self.oss_access_key_secret)

    @property
    def oss_public_base(self) -> str:
        # 公有读桶的公开访问地址
        return f"https://{self.oss_bucket}.{self.oss_endpoint}"

    @property
    def storage_path(self) -> Path:
        return Path(self.storage_dir).resolve()

    @property
    def demos_path(self) -> Path:
        return self.storage_path / "demos"

    @property
    def media_path(self) -> Path:
        return self.storage_path / "media"


settings = Settings()
