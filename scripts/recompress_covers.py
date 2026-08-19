"""一次性脚本：把历史封面压缩为 WebP 并迁移（更新 demos.cover_url）。

用法（在 web/ 目录下）：
    python scripts/recompress_covers.py

说明：
- 只处理本地 media/covers 下存在、且非 .webp 的封面（default.svg 除外）
- 压缩后写入新的 .webp 文件名，更新数据库 cover_url，删除旧的本地文件与 OSS 对象
- 幂等：已迁移过的（.webp）自动跳过，可重复运行
"""

import os
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from app.database import SessionLocal  # noqa: E402
from app.models import Demo  # noqa: E402
from app.services import oss, storage  # noqa: E402
from app.config import settings  # noqa: E402

COVERS_DIR = settings.media_path / "covers"


def main() -> None:
    if not COVERS_DIR.exists():
        print("covers 目录不存在，退出")
        return

    db = SessionLocal()
    total = 0
    freed = 0
    try:
        demos = db.query(Demo).all()
        for demo in demos:
            url = demo.cover_url or ""
            if not url.startswith("/media/covers/"):
                continue
            name = url.rsplit("/", 1)[-1]
            if not name or name.endswith(".webp"):
                continue
            src = COVERS_DIR / name
            if not src.exists():
                print(f"[skip] 本地无文件: {name}")
                continue

            old_size = src.stat().st_size
            try:
                new_data, ext = storage.compress_cover(src.read_bytes())
            except Exception as e:  # noqa: BLE001
                print(f"[error] 压缩失败 {name}: {e}")
                continue

            new_name = uuid.uuid4().hex + "." + ext
            dst = COVERS_DIR / new_name
            dst.write_bytes(new_data)
            oss.put_bytes(
                f"media/covers/{new_name}",
                new_data,
                "image/webp",
                extra_headers={"Cache-Control": "public, max-age=86400, immutable"},
            )

            demo.cover_url = f"/media/covers/{new_name}"
            freed += old_size - len(new_data)
            total += 1

            # 清理旧对象（本地 + OSS）
            src.unlink(missing_ok=True)
            oss.delete_object(f"media/covers/{name}")
            print(f"[ok] {name} ({old_size//1024}KB) -> {new_name} ({len(new_data)//1024}KB)")

        db.commit()
    finally:
        db.close()

    print(f"\n完成：迁移 {total} 个封面，释放约 {max(freed, 0) // 1024} KB")
    if total:
        print("提示：浏览器有 immutable 缓存，老 URL 可能短期仍命中缓存；OSS 旧对象已删除。")


if __name__ == "__main__":
    main()
