#!/usr/bin/env python3
"""一次性脚本：把 visit_daily 里统计 bug 造成的异常日清零。

背景：2026-08-22 / 2026-08-23 因统计方法 bug 各产生约 292 万 / 189 万虚高访问
（已定性为统计方法 bug，非刷量；统计口径已改正）。历史行不清则
GET /api/v1/stats/visits 的 total 持续虚高，需等 90 天滚动删除才自愈（11 月下旬）。
本脚本先做行内一致快照备份，再把两天 count 归零、ips 清空（ips 列已停写，见 models.py）。

运行（后端容器内，web/ 目录下执行）：
    docker compose exec -T backend python - < scripts/fix_visit_anomaly.py

幂等：重复执行只是重复清零，无副作用；每次运行都会先产出一份新备份。
"""

import os
import sqlite3
import time

DB_PATH = os.environ.get("VISIT_FIX_DB", "/app/data/app.db")
BACKUP_DIR = os.environ.get("VISIT_FIX_BACKUP_DIR", "/app/storage/backups")
ANOMALY_DATES = ("2026-08-22", "2026-08-23")


def main() -> None:
    stamp = time.strftime("%Y%m%d-%H%M%S")
    os.makedirs(BACKUP_DIR, exist_ok=True)
    backup_path = f"{BACKUP_DIR}/app-before-visit-fix-{stamp}.db"

    src = sqlite3.connect(DB_PATH)
    dst = sqlite3.connect(backup_path)
    src.backup(dst)
    dst.close()
    print(f"备份完成: {backup_path}")

    cur = src.cursor()
    for day in ANOMALY_DATES:
        row = cur.execute("SELECT count FROM visit_daily WHERE date = ?", (day,)).fetchone()
        if row is None:
            print(f"{day}: 表中无此行，跳过")
            continue
        cur.execute("UPDATE visit_daily SET count = 0, ips = '[]' WHERE date = ?", (day,))
        print(f"{day}: {row[0]} -> 0")
    src.commit()

    total = cur.execute("SELECT COALESCE(SUM(count), 0) FROM visit_daily").fetchone()[0]
    print(f"修正后全表合计（total 将立即按此口径展示）: {total}")
    src.close()


if __name__ == "__main__":
    main()
