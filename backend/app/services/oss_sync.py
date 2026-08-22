"""OSS 与本地存储一致性同步：只补传 OSS 中缺失的对象（幂等）。"""

import io
import mimetypes
import zipfile

from ..config import settings
from ..database import SessionLocal
from ..models import Demo
from ..services import oss, storage


def sync_all(force: bool = False) -> dict:
    """把本地已有 demo 文件/zip/封面补传到 OSS。
    - force=False：缺失才传（幂等，zip/封面已存在则跳过——用「zip 在 OSS」作整 demo 已同步标记）
    - force=True：强制全量重传（本地与 OSS 有差异/标记误判时用）
    返回统计：{demos_ok, demos_fail, covers_ok, covers_fail}"""
    stats = {"demos_ok": 0, "demos_fail": 0, "covers_ok": 0, "covers_fail": 0}
    if not oss.enabled():
        return stats

    db = SessionLocal()
    try:
        for demo in db.query(Demo).all():
            if demo.demo_type == "link":
                continue  # 链接类型无文件
            try:
                zip_key = f"demos/{demo.slug}/{demo.slug}.zip"
                if force or not oss.object_exists(zip_key):
                    # 文件/会话日志镜像 + zip 一并上传
                    storage.upload_demo_to_oss(demo.slug)
                    files_dir = storage.demo_files_dir(demo.slug)
                    if files_dir.exists():
                        buf = io.BytesIO()
                        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
                            for p in files_dir.rglob("*"):
                                if p.is_file():
                                    zf.write(p, p.relative_to(files_dir))
                        oss.put_bytes(
                            zip_key,
                            buf.getvalue(),
                            "application/zip",
                            extra_headers={"Cache-Control": "public, max-age=3600"},
                        )
                    stats["demos_ok"] += 1
            except Exception as e:  # noqa: BLE001
                stats["demos_fail"] += 1
                print(f"[oss-sync] {demo.slug} 失败: {e}", flush=True)
    finally:
        db.close()

    covers_dir = settings.media_path / "covers"
    if covers_dir.exists():
        for p in covers_dir.iterdir():
            if not p.is_file():
                continue
            key = f"media/covers/{p.name}"
            try:
                if force or not oss.object_exists(key):
                    content_type = mimetypes.guess_type(p.name)[0] or "image/png"
                    oss.put_bytes(
                        key,
                        p.read_bytes(),
                        content_type,
                        extra_headers={"Cache-Control": "public, max-age=86400, immutable"},
                    )
                stats["covers_ok"] += 1
            except Exception as e:  # noqa: BLE001
                stats["covers_fail"] += 1
                print(f"[oss-sync] cover {p.name} 失败: {e}", flush=True)

    return stats
