from pathlib import Path

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = "sqlite:///./data/app.db"
    storage_dir: str = "./storage"

    jwt_secret: str = "please-change-me-to-a-long-random-string"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7  # 7 天

    auto_approve: bool = True
    # 匿名上传信任通道：agent 带 UPLOAD_CODE 上传 = 可信（绕过审核，见 API_CONTRACT 第 6 节）
    upload_code: str = ""

    max_upload_size: int = 200 * 1024 * 1024  # 200MB
    max_file_size: int = 200 * 1024 * 1024
    max_cover_size: int = 5 * 1024 * 1024     # 5MB

    # 阿里云 OSS（可选；配置后文件双写备份到 OSS，log 只存 OSS）
    # oss_enabled 总开关：false 时即使填了 AK 也强制走本地存储（含 log）
    oss_enabled_flag: bool = Field(default=True, validation_alias=AliasChoices("oss_enabled_flag", "OSS_ENABLED"))
    oss_endpoint: str = ""
    oss_bucket: str = ""
    oss_access_key_id: str = ""
    oss_access_key_secret: str = ""
    # 服务模式：True=本地服务器下发（OSS 仅作备份/存 log，省 OSS 下行钱）；
    # False=预览/下载直连 OSS 省服务器带宽（需 OSS 公有读）
    oss_serve_local: bool = Field(default=True, validation_alias=AliasChoices("oss_serve_local", "OSS_SERVE_LOCAL"))
    # 可选：绑定到 OSS 的自定义域名（如 https://oss.deepdemos.top）。
    # 阿里云对 OSS 默认域名访问 HTML 会强制附加 x-oss-force-download 下载，
    # 用自定义域名访问可规避该安全策略（详情：OSS 文档「如何配置访问 OSS 文件时的预览行为」）。
    oss_custom_domain: str = ""

    # 预览入口的公开地址：demo 预览 iframe 所走的主机（如 http://demo.deepdemos.top）。
    # 与主站不同源才能安全地开 allow-same-origin（localStorage 可用）；
    # 且 HTML 由后端 /preview 返回，规避 OSS 默认域名对 HTML 的 x-oss-force-download 强制下载。
    preview_base_url: str = ""

    # 网站自身 git 仓库目录（用于「更新公告」= 网站仓库 commit 信息）
    # 本地开发缺省自动定位到仓库根目录；Docker 内用 /site-repo
    site_repo_dir: str = ""

    @property
    def oss_enabled(self) -> bool:
        return bool(
            self.oss_enabled_flag
            and self.oss_endpoint
            and self.oss_bucket
            and self.oss_access_key_id
            and self.oss_access_key_secret
        )

    @property
    def oss_public_base(self) -> str:
        # 优先级：自定义域名 > 默认域名
        if self.oss_custom_domain:
            return self.oss_custom_domain.rstrip("/")
        return f"https://{self.oss_bucket}.{self.oss_endpoint}"

    @property
    def site_repo_path(self) -> Path:
        if self.site_repo_dir:
            return Path(self.site_repo_dir).resolve()
        # 本地开发默认：backend/app/config.py -> 仓库根目录（web/）
        return Path(__file__).resolve().parents[2]

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
