#!/usr/bin/env python3
"""
dsh-project-model 模块选点（D4）——信号 → 分数 → 推荐语义档位。

算法给排序，AI 加判断：分数只决定"哪个模块值得深挖"，不决定最终内容。

信号（全部来自骨架 generated 指标，零新成本）：
  fan_in（×2）高 = 耦合中心，改它影响面大 → 值得 detailed/deep
  fan_out（×1）高 = 聚合/编排点 → 值得 deep
  loc（/500）大 = 维护成本高 → 值得 detailed
  todo_density（×1000）高 = 代码异味 → 值得 deep（顺带发现债务）

陷阱提示：fan_in 极高的"桶"（如 re-export 包）分数虚高，输出时标注
suspicious=包桶嫌疑，供人工降权。

用法：
  python select-modules.py <pim.generated.json> [--top N] [--frontend TOP]
输出：分数降序列表 + 推荐档位 + 桶嫌疑标记。
"""
import argparse
import json
import re
import sys

FAN_IN_W, FAN_OUT_W, LOC_W, TODO_W = 2.0, 1.0, 1.0 / 500, 1000.0


def score(m):
    fan_in = m["fan_in"] * FAN_IN_W
    fan_out = m["fan_out"] * FAN_OUT_W
    loc = m["loc"] * LOC_W
    todo = m["todo_density"] * TODO_W
    return fan_in + fan_out + loc + todo, (fan_in, fan_out, loc, todo)


def suspicious(nid, m):
    """桶嫌疑：fan_in 高但 loc 极小（re-export / barrel 文件）。"""
    return m["fan_in"] >= 10 and m["loc"] <= 30


def main():
    ap = argparse.ArgumentParser(description="模块选点 (D4)")
    ap.add_argument("pim", help="pim.generated.json")
    ap.add_argument("--top", type=int, default=10, help="后端或前端各自取 top N（默认 10）")
    args = ap.parse_args()

    doc = json.load(open(args.pim, encoding="utf-8"))
    nodes = doc["graph"]["nodes"]

    backend, frontend = [], []
    for nid, n in nodes.items():
        m = n["metadata"]["metrics"]
        s, parts = score(m)
        if nid.startswith("fe:"):
            frontend.append((nid, n["metadata"].get("layer", ""), m, s, parts))
        else:
            backend.append((nid, n["metadata"].get("layer", ""), m, s, parts))

    def fmt(items, tag):
        print(f"===== {tag} top {args.top} =====")
        for nid, layer, m, s, parts in sorted(items, key=lambda x: -x[3])[: args.top]:
            flag = " <<桶嫌疑(re-export?)" if suspicious(nid, m) else ""
            rec = "deep" if parts[0] >= 20 or parts[1] >= 8 else ("detailed" if parts[0] >= 8 or m["loc"] >= 600 else "brief")
            print(f"{nid:38s} score={s:6.1f} in={m['fan_in']:3d} out={m['fan_out']:3d} "
                  f"loc={m['loc']:5d} todo={m['todo_density']:.3f} → 推荐 {rec}{flag}")

    fmt(backend, "backend")
    fmt(frontend, "frontend")
    return 0


if __name__ == "__main__":
    sys.exit(main())
