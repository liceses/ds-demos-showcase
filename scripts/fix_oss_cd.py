#!/usr/bin/env python3
"""一键修复 OSS demo 对象元数据：把 Content-Disposition 从 attachment 改为 inline。

背景：历史迁移工具给 OSS 上的 demo 文件标了 `Content-Disposition: attachment`，
导致前端「OSS 直链预览」在 iframe 里把 HTML 页面当成下载 → 白屏 / Download is disallowed。
本脚本把 `demos/` 前缀下非 zip 对象的 Content-Disposition 置为 inline（幂等，可反复跑）。

运行方式（无需在服务器装任何东西，直接用后端容器里的 python/oss2）：
    cd web
    git pull
    # 第一步：预检（只统计会处理多少个，不写入）
    docker compose exec -T backend python - --dry-run < scripts/fix_oss_cd.py
    # 第二步：真正执行
    docker compose exec -T backend python - < scripts/fix_oss_cd.py

依赖环境变量（后端容器已由 docker-compose 注入，本地跑需自行 export）：
    OSS_ENDPOINT / OSS_BUCKET / OSS_ACCESS_KEY_ID / OSS_ACCESS_KEY_SECRET
"""

import argparse
import os
import sys

import oss2


def main() -> int:
    ap = argparse.ArgumentParser(description="把 OSS demo 对象 Content-Disposition 改为 inline")
    ap.add_argument("--prefix", default="demos/", help="对象前缀（默认 demos/）")
    ap.add_argument("--dry-run", action="store_true", help="只统计不写入")
    args = ap.parse_args()

    endpoint = os.environ.get("OSS_ENDPOINT", "").strip()
    bucket_name = os.environ.get("OSS_BUCKET", "").strip()
    ak_id = os.environ.get("OSS_ACCESS_KEY_ID", "").strip()
    ak_secret = os.environ.get("OSS_ACCESS_KEY_SECRET", "").strip()
    if not (endpoint and bucket_name and ak_id and ak_secret):
        print(
            "缺少 OSS 环境变量（OSS_ENDPOINT/OSS_BUCKET/OSS_ACCESS_KEY_ID/OSS_ACCESS_KEY_SECRET）",
            file=sys.stderr,
        )
        return 2

    bkt = oss2.Bucket(oss2.Auth(ak_id, ak_secret), f"https://{endpoint}", bucket_name)

    fixed = skipped = failed = 0
    html_sample = None
    for obj in oss2.ObjectIterator(bkt, prefix=args.prefix):
        key = obj.key
        if key.lower().endswith(".zip"):
            skipped += 1  # 下载包保持 attachment 语义
            continue
        if args.dry_run:
            fixed += 1
            continue
        try:
            bkt.update_object_meta(key, {"Content-Disposition": "inline"})
            if html_sample is None and key.lower().endswith((".html", ".htm")):
                html_sample = key
            fixed += 1
        except Exception as e:  # noqa: BLE001
            print("失败:", key, type(e).__name__, str(e)[:120], file=sys.stderr)
            failed += 1

    mode = "dry-run(未写入)" if args.dry_run else "已写入"
    print(f"[{mode}] fixed={fixed} skipped_zip={skipped} failed={failed}")

    if not args.dry_run and failed == 0 and html_sample:
        h = bkt.head_object(html_sample)
        print("抽查:", html_sample)
        print("  content-type        :", h.content_type)
        print("  content-disposition :", h.headers.get("Content-Disposition"))
        print("若 content-type 仍为 text/html 且 content-disposition 为 inline，即修复成功。")

    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
