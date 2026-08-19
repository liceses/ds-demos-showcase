import io
import mimetypes
import re
import shutil
import uuid
import zipfile
from pathlib import Path

from fastapi import HTTPException

from ..config import settings
from . import oss

SLUG_RE = re.compile(r"^[a-zA-Z0-9_-]{1,128}$")


def validate_slug(slug: str) -> str:
    if not SLUG_RE.match(slug):
        raise HTTPException(status_code=400, detail="非法的 demo 标识", )
    return slug


def demo_dir(slug: str) -> Path:
    validate_slug(slug)
    return settings.demos_path / slug


def demo_files_dir(slug: str) -> Path:
    return demo_dir(slug) / "files"


def demo_sessions_dir(slug: str) -> Path:
    return demo_dir(slug) / "sessions"


def _safe_extract(zf: zipfile.ZipFile, target: Path) -> None:
    for member in zf.infolist():
        raw = member.filename.replace("\\", "/")
        # 跳过目录与隐藏文件
        if raw.endswith("/") or raw.split("/")[-1].startswith("."):
            continue
        parts = [p for p in raw.split("/") if p not in ("", ".")]
        dest = target.joinpath(*parts)
        if not str(dest.resolve()).startswith(str(target.resolve())):
            raise HTTPException(status_code=400, detail="zip 中存在非法路径")
        dest.parent.mkdir(parents=True, exist_ok=True)
        with zf.open(member) as src, open(dest, "wb") as out:
            shutil.copyfileobj(src, out)


def extract_zip(zip_bytes: bytes, slug: str, require_index: bool = True) -> None:
    """解压 zip 到 demo files 目录。
    - require_index=True（web 类型）：要求存在 index.html（允许唯一顶层目录包裹）
    - require_index=False（zip 文件包）：不要求 index.html，仅解包单层包裹目录
    """
    validate_slug(slug)
    target = demo_files_dir(slug)
    if target.exists():
        shutil.rmtree(target, ignore_errors=True)
    target.mkdir(parents=True, exist_ok=True)

    try:
        zf = zipfile.ZipFile(io.BytesIO(zip_bytes))
    except zipfile.BadZipFile:
        raise HTTPException(status_code=400, detail="zip 文件非法", )

    tmp = target / ".tmp_extract"
    if tmp.exists():
        shutil.rmtree(tmp, ignore_errors=True)
    tmp.mkdir(parents=True, exist_ok=True)

    try:
        _safe_extract(zf, tmp)
    finally:
        zf.close()

    if require_index:
        # 定位 index.html：优先根目录；否则若只有一个顶层目录且内含 index.html 则取之
        root: Path = tmp
        index_candidates = list(tmp.rglob("index.html"))
        if (tmp / "index.html").exists():
            root = tmp
        elif len(index_candidates) == 1:
            root = index_candidates[0].parent
        else:
            shutil.rmtree(tmp, ignore_errors=True)
            raise HTTPException(status_code=400, detail="zip 中缺少 index.html（需要单层或单目录包裹）", )

        if not (root / "index.html").is_file():
            shutil.rmtree(tmp, ignore_errors=True)
            raise HTTPException(status_code=400, detail="zip 中缺少 index.html", )
    else:
        # 文件包：不要求 index.html；若只有一个顶层目录则解包一层，否则保留原结构
        top = list(tmp.iterdir())
        root = top[0] if len(top) == 1 and top[0].is_dir() else tmp

    # 拷贝到正式目录
    for item in root.iterdir():
        dst = target / item.name
        if item.is_dir():
            shutil.copytree(item, dst, dirs_exist_ok=True)
        else:
            shutil.copy2(item, dst)
    shutil.rmtree(tmp, ignore_errors=True)

    # 若 zip 顶层带 sessions/ 目录，视为会话日志，移动到 sessions 区
    sessions_in = target / "sessions"
    if sessions_in.is_dir():
        sessions_out = demo_sessions_dir(slug)
        sessions_out.mkdir(parents=True, exist_ok=True)
        for item in sessions_in.iterdir():
            dst = sessions_out / item.name
            if item.is_dir():
                shutil.copytree(item, dst, dirs_exist_ok=True)
            else:
                shutil.copy2(item, dst)
        shutil.rmtree(sessions_in, ignore_errors=True)


def dir_size(path: Path) -> int:
    total = 0
    for p in path.rglob("*"):
        if p.is_file():
            try:
                total += p.stat().st_size
            except OSError:
                pass
    return total


def demo_storage_size(slug: str) -> int:
    d = demo_dir(slug)
    return dir_size(d) if d.exists() else 0


def save_cover(data: bytes, ext: str | None = None) -> str:
    """保存封面到 media/covers，返回 /media/covers/<name>。"""
    if not data:
        raise HTTPException(status_code=400, detail="封面为空")
    if len(data) > settings.max_cover_size:
        raise HTTPException(status_code=413, detail="封面超过大小限制")
    ext = (ext or "png").lower()
    if ext not in {"png", "jpg", "jpeg", "gif", "webp", "svg"}:
        raise HTTPException(status_code=400, detail="不支持的封面格式")
    name = uuid.uuid4().hex + "." + ext
    folder = settings.media_path / "covers"
    folder.mkdir(parents=True, exist_ok=True)
    (folder / name).write_bytes(data)
    content_type = mimetypes.guess_type(name)[0] or "application/octet-stream"
    # 封面文件名唯一、不可变 → 浏览器/OSS 长期缓存
    oss.put_bytes(
        f"media/covers/{name}",
        data,
        content_type,
        extra_headers={"Cache-Control": "public, max-age=86400, immutable"},
    )
    return f"/media/covers/{name}"


def delete_demo_from_oss(slug: str) -> None:
    """删除 OSS 上某个 demo 的全部对象。"""
    validate_slug(slug)
    oss.delete_prefix(f"demos/{slug}/")


def upload_demo_to_oss(slug: str) -> None:
    """把本地已解压的 demo 文件镜像到 OSS（files + sessions）。"""
    if not oss.enabled():
        return
    validate_slug(slug)

    files_root = demo_files_dir(slug)
    if files_root.exists():
        for p in files_root.rglob("*"):
            if p.is_file():
                rel = p.relative_to(files_root).as_posix()
                content_type = mimetypes.guess_type(p.name)[0] or "application/octet-stream"
                # inline：直接以 OSS 直链在 iframe 里当页面/资源渲染（历史对象曾被误标 attachment）
                oss.put_file(
                    f"demos/{slug}/files/{rel}",
                    p,
                    content_type,
                    extra_headers={"Content-Disposition": "inline"},
                )

    sessions_root = demo_sessions_dir(slug)
    if sessions_root.exists():
        for p in sessions_root.rglob("*"):
            if p.is_file():
                rel = p.relative_to(sessions_root).as_posix()
                content_type = mimetypes.guess_type(p.name)[0] or "text/plain; charset=utf-8"
                oss.put_file(
                    f"demos/{slug}/sessions/{rel}",
                    p,
                    content_type,
                    extra_headers={"Content-Disposition": "inline"},
                )


def make_slug(title: str) -> str:
    base = re.sub(r"[^a-zA-Z0-9_-]+", "-", title).strip("-").lower()
    if not base:
        base = "demo"
    base = base[:60]
    return f"{base}-{uuid.uuid4().hex[:8]}"
