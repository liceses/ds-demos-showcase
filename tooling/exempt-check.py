#!/usr/bin/env python3
"""
dsh-project-model 豁免检查（D6）——门禁的逃生门。

三要素（design.md §6.1 / D6）：
  1. 解析 PR 描述中的豁免声明 `model-exempt: #<issue>`（title/body 均可）
  2. 防滥用护栏：声明时改到模型文件 → 豁免无效（model 变更不许豁免）
  3. issue 时效：豁免 issue 必须 open 且未超期（硬时限，默认 7 天）

用法（退出码 0=通过，1=fail，2=使用错误）：
  python exempt-check.py \
    --pr-body "… model-exempt: #42 …" \
    --changed "backend/app/x.py frontend/src/y.ts" \
    --issue-state open --issue-created-at "2026-09-06T10:00:00Z" \
    [--ttl-days 7] [--now "2026-09-13T10:00:00Z"]

说明：CI 中用 GitHub API 预取 issue 状态/时间戳传入；本脚本纯函数
（不发起网络请求），本地可测、CI 可跑。
"""
import argparse
import datetime as dt
import re
import sys
from pathlib import Path

MODEL_PATHS = ("docs/model/", "tooling/", "AGENTS.md", ".github/workflows/model-gate.yml")


def parse_exempt_issue(text):
    """从 PR title/body 提取 model-exempt: #<N>；返回 issue 号或 None。"""
    if not text:
        return None
    m = re.search(r"model-exempt\s*:\s*#?(\d+)", text)
    return int(m.group(1)) if m else None


def touches_model(changed_paths):
    """变更集合是否触碰模型/工具链（触碰则豁免无效）。"""
    return any(p.startswith(MODEL_PATHS) or Path(p).name in ("AGENTS.md",) for p in changed_paths)


def issue_expired(created_at, now, ttl_days):
    """issue 是否超期：created_at + ttl_days < now。"""
    fmt = "%Y-%m-%dT%H:%M:%SZ"
    try:
        created = dt.datetime.strptime(created_at, fmt).replace(tzinfo=dt.timezone.utc)
        now_dt = dt.datetime.strptime(now, fmt).replace(tzinfo=dt.timezone.utc)
    except ValueError:
        return True  # 无法解析 → 视为超期（fail-safe）
    return now_dt - created > dt.timedelta(days=ttl_days)


def main():
    ap = argparse.ArgumentParser(description="D6 豁免检查")
    ap.add_argument("--pr-body", required=True, help="PR title + body 全文")
    ap.add_argument("--changed", required=True, help="PR 变更文件列表（空格分隔）")
    ap.add_argument("--issue-state", default="", help="豁免 issue 状态（open/closed）")
    ap.add_argument("--issue-created-at", default="", help="豁免 issue created_at ISO8601")
    ap.add_argument("--ttl-days", type=int, default=7)
    ap.add_argument("--now", default=None, help="当前时间 ISO8601（默认取系统时间）")
    args = ap.parse_args()

    changed = args.changed.split()

    # 0) 模型工具链自身变更：无论有无豁免，都必须走完整校验（护栏 1/2）
    if touches_model(changed):
        print("PASS-SKIP: 变更触碰模型/工具链，豁免逻辑不适用（模型变更不许豁免）")
        return 0

    issue_no = parse_exempt_issue(args.pr_body)
    if issue_no is None:
        print("FAIL: 骨架漂移且无豁免声明——运行 tooling 三件套重算并提交更新，或声明 model-exempt: #<issue>")
        return 1

    # 护栏 3：豁免必须有 open 且未超期的 issue
    if args.issue_state != "open":
        print(f"FAIL: 豁免 issue #{issue_no} 未 open（state={args.issue_state or 'unknown'}）；先开 issue 声明确认")
        return 1
    now = args.now or dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    if issue_expired(args.issue_created_at, now, args.ttl_days):
        print(f"FAIL: 豁免 issue #{issue_no} 超过 {args.ttl_days} 天硬时限；请同步模型或重新申请")
        return 1

    print(f"PASS-EXEMPT: issue #{issue_no} open 且未超期，豁免生效（{args.ttl_days} 天计时：{args.issue_created_at} → {now}）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
