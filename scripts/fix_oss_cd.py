#!/usr/bin/env python3
"""一键修复 OSS demo 对象元数据：把 Content-Disposition 从 attachment 改为 inline。

背景：历史迁移工具给 OSS 上的 demo 文件标了 `Content-Disposition: attachment`，
导致前端「OSS 直链预览」在 iframe 里把 HTML 页面当成下载 → 白屏 / Download is disallowed。
本脚本把 `demos/` 前缀下非 zip 对象的 Content-Disposition 置为 inline（幂等，可反复跑）。

两种改法（--method）：
  inline —— oss2.update_object_meta（快；部分账号对标准 HTTP 头的落存可能不及时）
  copy   —— oss2.copy_object 自拷贝 + x-oss-metadata-directive: REPLACE
             （重写对象=穿透边缘缓存，并显式带上 Content-Type，最可靠；比 inline 慢一点）
推荐先试 inline，若公共 GET 仍返回 attachment，改用 copy。

运行方式（无需在服务器装任何东西，直接用后端容器里的 python/oss2）：
    cd web
    git pull
    # 预检（只统计会处理多少个，不写入）
    docker compose exec -T backend python - --dry-run < scripts/fix_oss_cd.py
    # 方式一：update_object_meta
    docker compose exec -T backend python - < scripts/fix_oss_cd.py
    # 方式二（保险）：自拷贝 REPLACE
    docker compose exec -T backend python - --method copy < scripts/fix_oss_cd.py

依赖环境变量（后端容器已由 docker-compose 注入，本地跑需自行 export）：
    OSS_ENDPOINT / OSS_BUCKET / OSS_ACCESS_KEY_ID / OSS_ACCESS_KEY_SECRET
"""

import argparse
import os
import sys

import oss2


def main() -> int:
    ap = argparse.ArgumentParser(description="把 OSS demo 对象 Content-Disposition 改为 inline")
    ap.add_argument("--method", choices=("inline", "copy"), default="inline",
                    help="inline=update_object_meta（快）；copy=自拷贝 REPLACE（最可靠）")
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
            if args.method == "copy":
                hdr = bkt.head_object(key)
                meta = {
                    "Content-Type": hdr.content_type or "application/octet-stream",
                    "Content-Disposition": "inline",
                }
                cc = hdr.headers.get("Cache-Control")
                if cc:
                    meta["Cache-Control"] = cc
                # 同桶自拷贝 + 元数据 REPLACE：内容不变、元数据重写、新版本号=穿透边缘缓存
                bkt.copy_object(bucket_name, key, key, meta=meta,
                                headers={"x-oss-metadata-directive": "REPLACE"})
            else:
                bkt.update_object_meta(key, {"Content-Disposition": "inline"})
            if html_sample is None and key.lower().endswith((".html", ".htm")):
                html_sample = key
            fixed += 1
        except Exception as e:  # noqa: BLE001
            print("失败:", key, type(e).__name__, str(e)[:120], file=sys.stderr)
            failed += 1

    mode = "dry-run(未写入)" if args.dry_run else f"已写入(method={args.method})"
    print(f"[{mode}] fixed={fixed} skipped_zip={skipped} failed={failed}")

    if not args.dry_run and html_sample:
        # SDK（签名）视角的元数据
        h = bkt.head_object(html_sample)
        print("SDK head 抽查:", html_sample)
        print("  content-type        :", h.content_type)
        print("  content-disposition :", h.headers.get("Content-Disposition"))
        print("提示：请再通过公共 GET（浏览器/curl https://<bucket>.<endpoint>/<key>）确认也已是 inline。")

    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
