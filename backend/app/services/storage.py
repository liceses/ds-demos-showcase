import hashlib
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
    - 越界判定用 `Path.is_relative_to`，不再用 startswith（后者对同前缀路径失效）。

    压缩比口径（KB-28 修正）：**累计解压量 / 累计压缩量**，且只在解压量超过
    `zip_ratio_min_bytes` 时才判 —— 见下方注释里记录的旧实现错在哪。
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
        total_compressed += int(member.compress_size or 0)
        # KB-28 修正：旧实现写的是 `total_bytes / member.compress_size` ——
        # 拿**累计解压量**除以**当前这一个成员**的压缩量：每多一个成员分子就涨，
        # 而分母只算最后一个文件，于是最后那个文件越小比值越离谱（正常的多文件 demo
        # 只要最后一个成员是几百字节的小文件就会爆表，被误判成压缩炸弹）。
        # 正确口径是「累计解压 / 累计压缩」；并且只在解压量够大时才判 ——
        # 解压后总共才几百 KB 的包，压缩比再高也不构成磁盘威胁，
        # 而极小文件的压缩比天然可以极大（比如一份几十字节的重复内容）。
        if (
            total_bytes >= settings.zip_ratio_min_bytes
            and total_compressed > 0
            and total_bytes / total_compressed > settings.zip_max_ratio
        ):
            raise HTTPException(
                status_code=413,
                detail=(
                    f"zip 压缩比异常（疑似压缩炸弹）：解压 {total_bytes // (1024 * 1024)}MB / "
                    f"压缩 {max(total_compressed // 1024, 1)}KB，超过 {settings.zip_max_ratio}:1"
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


COVER_URL_PREFIX = "/media/covers/"
COVER_THUMB_SUFFIX = "-thumb"
# 列表缩略图最长边（设计稿 §3 定的 200px 档：8 张 ≤120KB，替代 8 张原图 580KB）
COVER_THUMB_MAX_SIDE = 200


def cover_thumb_url(cover_url: str) -> str:
    """缩略图 URL 规则的**唯一定义处**：`/media/covers/<stem>.webp` → `/media/covers/<stem>-thumb.webp`。

    返回 "" 表示**没有缩略图**，前端据此不渲染 `<img>`（不给假封面、不留空洞）：
      · SVG（含站内 `default.svg`，Pillow 无法栅格化）；
      · 历史遗留的非 webp 封面（`scripts/recompress_covers.py` 之前的产物）；
      · 非 covers 路径（外链封面）或空值。

    回填脚本（`scripts/backfill_cover_thumbs.py`）与写入路径共用本函数 —— 命名规则只写一遍。
    """
    url = (cover_url or "").strip()
    if not url.startswith(COVER_URL_PREFIX) or not url.lower().endswith(".webp"):
        return ""
    stem = url[len(COVER_URL_PREFIX) : -len(".webp")]
    if not stem or "/" in stem or "\\" in stem:
        return ""
    if stem.endswith(COVER_THUMB_SUFFIX):
        return url  # 规则幂等：已经是缩略图就原样返回，重复套用不会叠后缀
    return f"{COVER_URL_PREFIX}{stem}{COVER_THUMB_SUFFIX}.webp"


def make_cover_thumb(cover_bytes: bytes) -> bytes:
    """从**已压缩的封面 WebP** 生成列表缩略图：最长边 200（只缩不放）、WebP q80。

    为什么入参是"压缩产物"而不是上传原图：新上传与历史回填走**同一条路** ——
    回填时手上只有磁盘上的 1280px webp，所以统一以它为源；顺带让本函数对同一输入字节
    可重复（幂等），回填脚本重跑不产生新文件、不改内容。
    通道规则与 compress_cover 一致（透明保留 RGBA，其余 RGB）。
    """
    try:
        from PIL import Image
    except ImportError:
        raise HTTPException(status_code=500, detail="服务端缺少 Pillow，无法生成封面缩略图", )
    try:
        img = Image.open(io.BytesIO(cover_bytes))
        img.load()
    except Exception:
        raise HTTPException(status_code=400, detail="封面不是有效图片", )

    if img.mode in ("RGBA", "LA", "P"):
        img = img.convert("RGBA")
    else:
        img = img.convert("RGB")

    w, h = img.size
    if max(w, h) > COVER_THUMB_MAX_SIDE:
        scale = COVER_THUMB_MAX_SIDE / max(w, h)
        img = img.resize((max(1, int(w * scale)), max(1, int(h * scale))), Image.LANCZOS)

    out = io.BytesIO()
    img.save(out, format="WEBP", quality=80, method=4)
    return out.getvalue()


def save_cover(data: bytes, ext: str | None = None) -> tuple[str, str]:
    """保存封面：自动压缩为 WebP（只保留压缩版），返回 **(封面 URL, 缩略图 URL)**。

    不做上传体积限制（原图多大都收），压缩后通常几 KB ~ 几十 KB。
    返回二元组而不是单个 URL：两个文件必须一起写、一起用 —— 调用点只有 2 处，
    把「写了封面忘了缩略图」变成编译期就能发现的事（单值返回时它只会静默少图）。
    SVG 分支没有缩略图（返回 ""），前端据此不渲染图片。
    """
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

    cover_url = f"{COVER_URL_PREFIX}{name}"
    thumb_url = cover_thumb_url(cover_url)
    if thumb_url:
        # 名字由规则派生（<stem>-thumb.webp）—— 不许另起一套命名，否则回填脚本对不上
        thumb_name = thumb_url[len(COVER_URL_PREFIX) :]
        thumb_data = make_cover_thumb(out_data)
        (folder / thumb_name).write_bytes(thumb_data)
        oss.put_bytes(
            f"media/covers/{thumb_name}",
            thumb_data,
            "image/webp",
            extra_headers={"Cache-Control": "public, max-age=86400, immutable"},
        )
    return cover_url, thumb_url


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


def save_avatar(user_id: int, data: bytes) -> str:
    """头像：居中裁方 → 512×512 → WebP q82 → /media/avatars/{uid}-{sha8}.webp。

    端侧已压过一次，这里再归一化一次是**双保险**（也能兜住端侧解不了的格式）。
    文件名带内容哈希：换头像即换 URL，CDN/浏览器缓存不会顽固地给旧图。
    """
    try:
        from PIL import Image
    except ImportError:
        raise HTTPException(status_code=500, detail="服务端缺少 Pillow，无法处理头像")
    limit = settings.cover_max_pixels
    try:
        img = Image.open(io.BytesIO(data))
        w, h = img.size
        if w * h > limit:
            raise HTTPException(status_code=413, detail=f"图片像素过大（{w}x{h}）")
        img.load()
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=400, detail="不是有效图片")

    size = min(img.size)
    left = (img.width - size) // 2
    top = (img.height - size) // 2
    img = img.crop((left, top, left + size, top + size)).resize((512, 512), Image.LANCZOS)
    if img.mode not in ("RGB", "RGBA"):
        img = img.convert("RGBA" if "A" in img.getbands() else "RGB")

    buf = io.BytesIO()
    img.save(buf, format="WEBP", quality=82, method=4)
    payload = buf.getvalue()
    digest = hashlib.sha256(payload).hexdigest()[:8]

    target_dir = settings.media_path / "avatars"
    target_dir.mkdir(parents=True, exist_ok=True)
    name = f"{user_id}-{digest}.webp"
    (target_dir / name).write_bytes(payload)
    return f"/media/avatars/{name}"


def delete_media_file(url: str) -> None:
    """删除 /media 下的文件（只允许 avatars/covers 目录，拒绝越权路径）。"""
    rel = url.removeprefix("/media/").lstrip("/")
    if rel.startswith("avatars/") or rel.startswith("covers/"):
        p = (settings.media_path / rel).resolve()
        root = settings.media_path.resolve()
        if str(p).startswith(str(root)) and p.is_file():
            p.unlink()
