import shutil
import subprocess
from pathlib import Path

from fastapi import HTTPException

from .storage import demo_dir, validate_slug

GIT = "git"


def _run(slug: str, *args: str, check: bool = True) -> subprocess.CompletedProcess:
    if shutil.which(GIT) is None:
        raise HTTPException(status_code=503, detail="git 依赖不可用")
    cwd: Path = demo_dir(slug)
    if not cwd.exists():
        raise HTTPException(status_code=404, detail="Demo 不存在")
    try:
        proc = subprocess.run(
            [GIT, *args],
            cwd=str(cwd),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=30,
        )
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=500, detail="git 操作超时")
    if check and proc.returncode != 0:
        raise HTTPException(status_code=500, detail=proc.stderr.strip() or "git 操作失败")
    return proc


def ensure_repo(slug: str) -> None:
    validate_slug(slug)
    d = demo_dir(slug)
    d.mkdir(parents=True, exist_ok=True)
    if not (d / ".git").exists():
        _run(slug, "init", "-b", "main", check=False)
        _run(slug, "config", "user.name", "demo-site")
        _run(slug, "config", "user.email", "demo-site@local")


def commit_all(slug: str, author_name: str = "demo-site", author_email: str = "demo-site@local") -> bool:
    ensure_repo(slug)
    _run(slug, "add", "-A")
    # 没有变化时 git commit 会失败，返回 False
    proc = _run(
        slug,
        "-c",
        f"user.name={author_name}",
        "-c",
        f"user.email={author_email}",
        "commit",
        "-m",
        "update demo",
        check=False,
    )
    if proc.returncode != 0:
        return False
    return True


def list_commits(slug: str) -> list[dict]:
    validate_slug(slug)
    if not (demo_dir(slug) / ".git").exists():
        return []
    proc = _run(
        slug,
        "log",
        "--pretty=format:%H%x1f%an%x1f%ai%x1f%s",
        "--date=iso-strict",
        "-n",
        "200",
    )
    result: list[dict] = []
    for line in proc.stdout.splitlines():
        parts = line.split("\x1f")
        if len(parts) < 4:
            continue
        full_hash, author, date, message = parts[0], parts[1], parts[2], parts[3]
        result.append(
            {
                "hash_short": full_hash[:8],
                "message": message,
                "author": author,
                "date": date,
            }
        )
    return result


def get_commit(slug: str, hash_value: str) -> dict:
    validate_slug(slug)
    if not (demo_dir(slug) / ".git").exists():
        raise HTTPException(status_code=404, detail="Demo 没有 git 记录")
    # 校验 hash 存在
    _run(slug, "rev-parse", "--verify", f"{hash_value}^{{commit}}")

    # 提交元信息
    meta = _run(
        slug,
        "show",
        "--no-patch",
        "--pretty=format:%H%x1f%an%x1f%ai%x1f%s",
        hash_value,
    )
    parts = meta.stdout.split("\x1f")
    if len(parts) < 4:
        raise HTTPException(status_code=500, detail="git 输出解析失败")
    full_hash, author, date, message = parts[0], parts[1], parts[2], parts[3]

    # 文件变更
    name_status = _run(slug, "show", "--name-status", "--format=", hash_value)
    files: list[dict] = []
    for line in name_status.stdout.splitlines():
        line = line.strip()
        if not line:
            continue
        cols = line.split("\t")
        if len(cols) >= 2:
            status = cols[0]
            path = cols[-1]
            files.append({"path": path, "status": status, "additions": 0, "deletions": 0})

    # 行数统计
    try:
        numstat = _run(slug, "show", "--numstat", "--format=", hash_value)
        num_lines = numstat.stdout.splitlines()
        if len(num_lines) == len(files):
            for i, line in enumerate(num_lines):
                cols = line.split("\t")
                if len(cols) >= 2 and cols[0].isdigit() and cols[1].isdigit():
                    files[i]["additions"] = int(cols[0])
                    files[i]["deletions"] = int(cols[1])
    except HTTPException:
        pass

    diff = _run(slug, "show", "--format=", hash_value)
    return {
        "hash": full_hash,
        "message": message,
        "author": author,
        "date": date,
        "files": files,
        "diff_text": diff.stdout,
    }
