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
    """解压到 target，带三道闸（KB-11/KB-13）：

    - 成员名含 `..` 直接拒绝（旧实现只做字符串前缀比较，`../x` 会落到同前缀兄弟目录）；
    - 累计解压字节 / 成员数 / 压缩比超限即中断（zip 炸弹打满磁盘会连带拖死同盘 SQLite）；
    - 压缩比按同一口径相除：整包 = 累计解压 / 累计压缩，单成员 = 本成员解压 / 本成员压缩。
      旧实现分子取累计字节、分母取「当前这一个成员」的压缩字节，量纲不对齐 —— 那个除法
      不是压缩比：累计量随遍历单调增长而分母不变，包一大就必然越限，正常作品包一律 413
      （实测 4.44MB/60 成员的正常包在第 5 个成员处算出 111.5 > 100 被拒）；
    - 越界判定用 `Path.is_relative_to`，不再用 startswith（后者对同前缀路径失效）。
    """
    root = target.resolve()
    total_bytes = 0
    total_compressed = 0
    members = 0
    for member in zf.infolist():
        raw = member.filename.replace("\\", "/")
        # 跳过目录与隐藏文件
        if raw.endswith("/") or raw.split("/")[-1].startswith("."):
            continue
        parts = [p for p in raw.split("/") if p not in ("", ".")]
        if any(p == ".." for p in parts):
            raise HTTPException(status_code=400, detail="zip 中存在非法路径")
        members += 1
        if members > settings.zip_max_members:
            raise HTTPException(
                status_code=413,
                detail=f"zip 成员数超过上限（{settings.zip_max_members}）",
            )
        total_bytes += int(member.file_size or 0)
        if total_bytes > settings.zip_max_uncompressed:
            raise HTTPException(
                status_code=413,
                detail=f"zip 解压后体积超过上限（{settings.zip_max_uncompressed // (1024 * 1024)}MB）",
            )
        compressed = int(member.compress_size or 0)
        total_compressed += compressed
        # 整包口径：正常作品包比值 1~3，上限 100 留足余量，判错也只误伤真炸弹
        if total_compressed and total_bytes / total_compressed > settings.zip_max_ratio:
            raise HTTPException(
                status_code=413,
                detail=f"zip 压缩比异常（疑似压缩炸弹）：解压 {total_bytes} / 压缩 {total_compressed}",
            )
        # 单成员口径：整包口径会被大量正常成员稀释（40MB 零填充 + 400MB 随机数据总比才 ~1.1），
        # 单成员膨胀比才是高压缩比成员的兜底闸
        member_size = int(member.file_size or 0)
        if compressed and member_size / compressed > settings.zip_max_ratio:
            raise HTTPException(
                status_code=413,
                detail=(
                    f"zip 成员膨胀比异常（疑似压缩炸弹）：{raw} "
                    f"解压 {member_size} / 压缩 {compressed}"
                ),
            )
        dest = target.joinpath(*parts)
        if not dest.resolve().is_relative_to(root):
            raise HTTPException(status_code=400, detail="zip 中存在非法路径")
        dest.parent.mkdir(parents=True, exist_ok=True)
        with zf.open(member) as src, open(dest, "wb") as out:
            shutil.copyfileobj(src, out)


def _atomic_replace_dir(target: Path, tmp: Path) -> None:
    """把 tmp 目录原子换成 target：失败路径不动 target（KB-11）。

    旧实现先 `rmtree(target)` 再校验新 zip —— 坏包/缺 index.html 会把线上作品文件删光。
    """
    target.parent.mkdir(parents=True, exist_ok=True)
    old: Path | None = None
    if target.exists():
        old = target.with_name(f".old_{uuid.uuid4().hex[:8]}")
        target.rename(old)
    try:
        tmp.rename(target)
    except OSError:
        if old is not None:  # 换名失败：把旧目录放回去，绝不留下「没有文件」的作品
            old.rename(target)
        raise
    if old is not None:
        shutil.rmtree(old, ignore_errors=True)


def extract_zip(zip_bytes: bytes, slug: str, require_index: bool = True) -> None:
    """解压 zip 到 demo files 目录。
    - require_index=True（web 类型）：要求存在 index.html（允许唯一顶层目录包裹）
    - require_index=False（zip 文件包）：不要求 index.html，仅解包单层包裹目录
    - 先解压到临时目录、全部校验通过后才原子替换（失败不动线上文件）
    """
    validate_slug(slug)
    target = demo_files_dir(slug)
    parent = demo_dir(slug)
    parent.mkdir(parents=True, exist_ok=True)

    try:
        zf = zipfile.ZipFile(io.BytesIO(zip_bytes))
    except zipfile.BadZipFile:
        raise HTTPException(status_code=400, detail="zip 文件非法", )

    tmp = parent / f".tmp_extract_{uuid.uuid4().hex[:8]}"
    tmp.mkdir(parents=True, exist_ok=True)

    try:
        _safe_extract(zf, tmp)
    except Exception:
        shutil.rmtree(tmp, ignore_errors=True)
        raise
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

    # 正式目录只接受 root 的内容：先在 tmp 内展平，再原子替换
    staged = parent / f".staged_{uuid.uuid4().hex[:8]}"
    staged.mkdir(parents=True, exist_ok=True)
    for item in root.iterdir():
        dst = staged / item.name
        if item.is_dir():
            shutil.copytree(item, dst, dirs_exist_ok=True)
        else:
            shutil.copy2(item, dst)
    shutil.rmtree(tmp, ignore_errors=True)
    _atomic_replace_dir(target, staged)

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
    """保存单文件 demo（html/svg）到 files 目录。ext: 'html' | 'svg'。

    与 extract_zip 同规：先写临时目录再原子替换，写失败不动线上文件。
    """
    validate_slug(slug)
    target = demo_files_dir(slug)
    parent = demo_dir(slug)
    parent.mkdir(parents=True, exist_ok=True)
    staged = parent / f".staged_{uuid.uuid4().hex[:8]}"
    staged.mkdir(parents=True, exist_ok=True)
    name = "index.html" if ext == "html" else "index.svg"
    (staged / name).write_bytes(data)
    _atomic_replace_dir(target, staged)


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
    """把封面压缩为 WebP（最大边 1280、质量 82），返回 (bytes, 'webp')。

    KB-11：解码前先限像素（封面接口收 200MB，Pillow 默认只在 >1.78 亿像素时才抛
    DecompressionBomb，1 亿像素的图足以把进程 RSS 顶到几百 MB）→ 超限直接 413。
    """
    try:
        from PIL import Image
    except ImportError:
        raise HTTPException(status_code=500, detail="服务端缺少 Pillow，无法处理封面", )
    limit = settings.cover_max_pixels
    try:
        img = Image.open(io.BytesIO(data))
        w, h = img.size
        if w * h > limit:
            raise HTTPException(
                status_code=413,
                detail=f"封面像素过大（{w}x{h}，上限 {limit}）",
            )
        img.load()
    except HTTPException:
        raise
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
                        "Cache-Control": "public, max-age=86400, immutable",
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
                        "Cache-Control": "public, max-age=86400, immutable",
                    },
                )


def make_slug(title: str) -> str:
    base = re.sub(r"[^a-zA-Z0-9_-]+", "-", title).strip("-").lower()
    if not base:
        base = "demo"
    base = base[:60]
    return f"{base}-{uuid.uuid4().hex[:8]}"
