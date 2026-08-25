"""OSS 与本地存储一致性同步：只补传 OSS 中缺失的对象（幂等）。

支持后台任务：start_sync() 起线程执行，get_sync_status() 查进度/失败原因。
"""

import io
import mimetypes
import threading
import time
import zipfile

from ..config import settings
from ..database import SessionLocal
from ..models import Demo
from ..services import oss, storage

# 后台任务状态（全局单任务，避免并发同步互相踩）
_job_lock = threading.Lock()
_job = {
    "running": False,
    "force": False,
    "total": 0,
    "done": 0,
    "ok": 0,
    "fail": 0,
    "covers_ok": 0,
    "covers_fail": 0,
    "current": "",
    "last_error": "",
    "started_at": None,
    "finished_at": None,
}


def _update_job(**kw) -> None:
    with _job_lock:
        _job.update(kw)


def get_sync_status() -> dict:
    with _job_lock:
        return dict(_job)


def sync_all(force: bool = False, progress_cb=None) -> dict:
    """把本地已有 demo 文件/zip/封面补传到 OSS。
    - force=False：缺失才传（幂等，zip/封面已存在则跳过——用「zip 在 OSS」作整 demo 已同步标记）
    - force=True：强制全量重传（本地与 OSS 有差异/标记误判时用）
    - progress_cb：可选回调，每处理完一个 demo/封面后调用，用于后台任务进度展示。
    返回统计：{demos_ok, demos_fail, covers_ok, covers_fail}"""
    stats = {"demos_ok": 0, "demos_fail": 0, "covers_ok": 0, "covers_fail": 0}
    if not oss.enabled():
        return stats

    db = SessionLocal()
    try:
        demos = [d for d in db.query(Demo).all() if d.demo_type != "link"]
        total = len(demos)
        if progress_cb:
            progress_cb(total=total, done=0, current="")
        for demo in demos:
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
                msg = f"{demo.slug}: {e}"
                print(f"[oss-sync] {msg}", flush=True)
                if progress_cb:
                    progress_cb(last_error=msg)
            if progress_cb:
                progress_cb(done=stats["demos_ok"] + stats["demos_fail"], ok=stats["demos_ok"], fail=stats["demos_fail"], current=demo.slug)
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
                msg = f"cover {p.name}: {e}"
                print(f"[oss-sync] {msg}", flush=True)
                if progress_cb:
                    progress_cb(last_error=msg)
            if progress_cb:
                progress_cb(covers_ok=stats["covers_ok"], covers_fail=stats["covers_fail"])

    return stats


def run_sync_job(force: bool) -> dict:
    """后台线程入口：更新任务状态 → 执行同步 → 收尾。"""
    _update_job(
        running=True,
        force=force,
        total=0,
        done=0,
        ok=0,
        fail=0,
        covers_ok=0,
        covers_fail=0,
        current="",
        last_error="",
        started_at=time.time(),
        finished_at=None,
    )
    try:
        stats = sync_all(force=force, progress_cb=_update_job)
        return stats
    finally:
        _update_job(running=False, finished_at=time.time())


def start_sync(force: bool = False) -> bool:
    """启动后台同步；若已有任务在跑则返回 False。"""
    with _job_lock:
        if _job["running"]:
            return False
    threading.Thread(target=run_sync_job, args=(force,), daemon=True).start()
    return True
