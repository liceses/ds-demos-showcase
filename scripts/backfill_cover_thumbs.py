"""一次性脚本：给历史封面补 200px 缩略图（写 demos.cover_thumb_url + <封面名>-thumb.webp）。

背景：探索页「题目」段的代表封面走的是 200px 缩略图（设计稿 §3）。新上传由
`storage.save_cover()` 自动产出两份文件；**存量封面（944 件）只有那份 1280px 原图**，
所以列表页在回填之前不会显示任何图片（`cover_thumb_url` 全空 → 前端不渲染 <img>，
页面与改动前一模一样，不会坏，只是没图）。

运行（**生产推荐这一条**；compose 把仓库只读挂在 /site-repo，所以容器内能直接按路径执行）：

    docker compose exec backend python /site-repo/scripts/backfill_cover_thumbs.py

stdin 形式同样可用（脚本已做兜底，见 _repo_root）：

    docker compose exec -T backend python - < scripts/backfill_cover_thumbs.py

本地：`python scripts/backfill_cover_thumbs.py`

顺序纪律：**先上线后端（列自愈）→ 再跑本脚本**。脚本写的是新列，列还没建时直接报错退出。

幂等：已有 `cover_thumb_url` 且本地缩略图文件在 → 跳过；生成逻辑只依赖磁盘上的原图，
同一输入产出的字节可重复，重复运行不产生新文件、不改内容。

不做备份：本脚本不改结构、只补一个列值与新文件，且"先落文件后写库" —— 任一步失败，
重跑即可补齐（比回滚备份更省事）。
"""

import os
import sys
from pathlib import Path


def _repo_root() -> Path:
    """定位仓库根，三种执行方式都要能跑：

    ① 按文件路径执行（`python /site-repo/scripts/xxx.py`）→ `__file__` 可用；
    ② **stdin 执行（`python - < scripts/xxx.py`）→ `__file__` 未定义**（这不是小概率：
       运维文档给的就是这种形式），此时用 compose 注入的 `SITE_REPO_DIR`（= /site-repo）；
    ③ 都没有 → 当前工作目录兜底。

    为什么值得专门写一段：`python - <` 下直接 `Path(__file__)` 会 **NameError 当场崩**，
    而这正是上线时才暴露的那类错（本地按路径跑永远看不到）。

    ⚠️ 第二个坑（实测才发现）：`python -` 下 `__file__` **不是未定义，而是字符串 `"<stdin>"`**
    —— 只判 `if here` 会拿它去 `resolve().parents[1]` 得到盘根（`D:\`），于是 `import app` 报
    `ModuleNotFoundError: No module named 'app'`。所以这里按**"是不是真实存在的文件"**判，不按真假判。
    """
    here = globals().get("__file__") or ""
    if here and Path(here).is_file():
        return Path(here).resolve().parents[1]
    env = os.environ.get("SITE_REPO_DIR")
    if env and (Path(env) / "backend").is_dir():
        return Path(env)
    return Path.cwd()


sys.path.insert(0, str(_repo_root() / "backend"))

from app.config import settings  # noqa: E402
from app.database import SessionLocal  # noqa: E402
from app.models import Demo  # noqa: E402
from app.services import oss, storage  # noqa: E402

COVERS_DIR = settings.media_path / "covers"


def _local_name(url: str) -> str:
    """'/media/covers/x.webp' → 'x.webp'（非 covers 路径返回 ""）。"""
    prefix = storage.COVER_URL_PREFIX
    return url[len(prefix) :] if url.startswith(prefix) else ""


def main() -> None:
    if not COVERS_DIR.exists():
        print(f"covers 目录不存在，退出：{COVERS_DIR}")
        return

    db = SessionLocal()
    made = skipped_have = skipped_ext = missing = failed = 0
    made_bytes = 0
    try:
        for demo in db.query(Demo).all():
            url = (demo.cover_url or "").strip()
            if not url.startswith(storage.COVER_URL_PREFIX):
                continue
            name = _local_name(url)
            thumb_url = storage.cover_thumb_url(url)
            if not thumb_url:
                # default.svg / SVG 封面 / 历史非 webp：没有可栅格化的源，跳过（前端不渲染图片）
                skipped_ext += 1
                continue

            thumb_name = _local_name(thumb_url)
            if demo.cover_thumb_url == thumb_url and (COVERS_DIR / thumb_name).is_file():
                skipped_have += 1
                continue

            src = COVERS_DIR / name
            if not src.is_file():
                print(f"[skip] 本地无原图: {name}")
                missing += 1
                continue

            try:
                thumb_data = storage.make_cover_thumb(src.read_bytes())
            except Exception as e:  # noqa: BLE001
                print(f"[error] 生成失败 {name}: {e}")
                failed += 1
                continue

            (COVERS_DIR / thumb_name).write_bytes(thumb_data)
            try:  # OSS 同步 best-effort（与 recompress_covers.py 一致：失败不回滚本地产物）
                oss.put_bytes(
                    f"media/covers/{thumb_name}",
                    thumb_data,
                    "image/webp",
                    extra_headers={"Cache-Control": "public, max-age=86400, immutable"},
                )
            except Exception as e:  # noqa: BLE001
                print(f"[warn] OSS 上传失败 {thumb_name}: {e}")

            demo.cover_thumb_url = thumb_url
            made += 1
            made_bytes += len(thumb_data)
            src_kb = src.stat().st_size // 1024
            print(f"[ok] {name} ({src_kb}KB) -> {thumb_name} ({len(thumb_data) // 1024}KB)")

        db.commit()
    finally:
        db.close()

    print(
        f"\n完成：生成 {made} 个缩略图（共 {made_bytes // 1024}KB）"
        f"｜跳过（已有）{skipped_have}｜跳过（非 webp/SVG）{skipped_ext}"
        f"｜无原图 {missing}｜失败 {failed}"
    )
    if made:
        print("提示：列表页下一跳即可看到封面；浏览器/OSS 缓存是 immutable，同名文件不会变。")


if __name__ == "__main__":
    main()
