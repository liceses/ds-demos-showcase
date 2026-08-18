"""读取网站自身 git 仓库的提交记录，用于生成「更新公告」。"""

import subprocess
from pathlib import Path

from ..config import settings


def list_site_commits(limit: int = 30) -> list[dict]:
    """返回网站仓库最近 commit：{hash, message, author, date}。仓库缺失/不可用返回 []。"""
    repo: Path = settings.site_repo_path
    if not (repo / ".git").exists():
        return []
    try:
        proc = subprocess.run(
            [
                "git",
                "-C",
                str(repo),
                "log",
                "--pretty=format:%H%x1f%s%x1f%an%x1f%ai",
                "-n",
                str(limit),
            ],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=15,
        )
    except (subprocess.TimeoutExpired, OSError):
        return []
    if proc.returncode != 0:
        return []

    result: list[dict] = []
    for line in proc.stdout.splitlines():
        parts = line.split("\x1f")
        if len(parts) < 4:
            continue
        full_hash, message, author, date = parts[0], parts[1], parts[2], parts[3]
        result.append(
            {
                "hash": full_hash[:8],
                "message": message,
                "author": author,
                "date": date,
            }
        )
    return result
