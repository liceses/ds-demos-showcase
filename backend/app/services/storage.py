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

    # DSH 会话轨迹：dsh 导出的 zip 常带 session.jsonl / trace*.jsonl 等，
    # 自动提取进会话日志目录（demo_sessions/），供「会话日志」Tab 展示
    _DSH_PATTERNS = ("*.jsonl", "session*.json", "trace*.json", "trace*.jsonl")
    dsh_files: list[Path] = []
    for pat in _DSH_PATTERNS:
        dsh_files.extend(target.rglob(pat))
    if dsh_files:
        sessions_out = demo_sessions_dir(slug)
        sessions_out.mkdir(parents=True, exist_ok=True)
        seen: set[str] = set()
        for p in dsh_files:
            name = p.name
            final = name
            i = 1
            while final in seen or (sessions_out / final).exists():
                final = f"{p.stem}-{i}{p.suffix}"
                i += 1
            seen.add(final)
            shutil.move(str(p), str(sessions_out / final))

    # 会话日志只进 OSS、不占服务器磁盘（OSS 未启用时保留本地兜底）
    _offload_sessions_to_oss(slug)


def _offload_sessions_to_oss(slug: str) -> None:
    """若启用 OSS：把会话日志上传到 OSS（demos/{slug}/sessions/）并清空本地磁盘。
    OSS 未启用则保留本地（功能照常）。"""
    if not oss.enabled():
        return
    sessions_dir = demo_sessions_dir(slug)
    if not sessions_dir.exists():
        return
    prefix = f"demos/{slug}/sessions"
    oss.delete_prefix(prefix + "/")
    for p in sessions_dir.rglob("*"):
        if p.is_file():
            rel = p.relative_to(sessions_dir).as_posix()
            content_type = "application/json" if p.suffix in (".json", ".jsonl") else "text/plain; charset=utf-8"
            oss.put_file(
                f"{prefix}/{rel}",
                p,
                content_type,
                extra_headers={"Content-Disposition": "inline"},
            )
    # 释放本地磁盘
    shutil.rmtree(sessions_dir, ignore_errors=True)


def save_single_file(slug: str, ext: str, data: bytes) -> None:
    """保存单文件 demo（html/svg）到 files 目录。ext: 'html' | 'svg'。"""
    validate_slug(slug)
    target = demo_files_dir(slug)
    if target.exists():
        shutil.rmtree(target, ignore_errors=True)
    target.mkdir(parents=True, exist_ok=True)
    name = "index.html" if ext == "html" else "index.svg"
    (target / name).write_bytes(data)


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


def compress_cover(data: bytes) -> tuple[bytes, str]:
    """把封面压缩为 WebP（最大边 1280、质量 82），返回 (bytes, 'webp')。"""
    try:
        from PIL import Image
    except ImportError:
        raise HTTPException(status_code=500, detail="服务端缺少 Pillow，无法处理封面", )
    try:
        img = Image.open(io.BytesIO(data))
        img.load()
    except Exception:
        raise HTTPException(status_code=400, detail="封面不是有效图片", )

    # 统一通道：保留透明 → RGBA；否则 RGB（WebP 均支持）
    if img.mode in ("RGBA", "LA"):
        img = img.convert("RGBA")
    elif img.mode == "P":
        img = img.convert("RGBA")
    else:
        img = img.convert("RGB")

    # 限制最大边，等比缩小
    max_side = 1280
    w, h = img.size
    if max(w, h) > max_side:
        scale = max_side / max(w, h)
        img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)

    out = io.BytesIO()
    img.save(out, format="WEBP", quality=82, method=4)
    return out.getvalue(), "webp"


def save_cover(data: bytes, ext: str | None = None) -> str:
    """保存封面：自动压缩为 WebP（只保留压缩版），返回 /media/covers/<name>。
    不做上传体积限制（原图多大都收），压缩后通常几 KB ~ 几十 KB。"""
    if not data:
        raise HTTPException(status_code=400, detail="封面为空")

    ext = (ext or "").lower()
    if ext == "svg":
        # SVG 是文本，直接原样保存（Pillow 无法处理且没必要压缩）
        out_data, out_ext = data, "svg"
    else:
        out_data, out_ext = compress_cover(data)

    name = uuid.uuid4().hex + "." + out_ext
    folder = settings.media_path / "covers"
    folder.mkdir(parents=True, exist_ok=True)
    (folder / name).write_bytes(out_data)
    content_type = "image/svg+xml" if out_ext == "svg" else "image/webp"
    # 封面文件名唯一、不可变 → 浏览器/OSS 长期缓存
    oss.put_bytes(
        f"media/covers/{name}",
        out_data,
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
                    extra_headers={
                        "Content-Disposition": "inline",
                        "Cache-Control": "no-cache",
                    },
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
                    extra_headers={
                        "Content-Disposition": "inline",
                        "Cache-Control": "no-cache",
                    },
                )


def make_slug(title: str) -> str:
    base = re.sub(r"[^a-zA-Z0-9_-]+", "-", title).strip("-").lower()
    if not base:
        base = "demo"
    base = base[:60]
    return f"{base}-{uuid.uuid4().hex[:8]}"
