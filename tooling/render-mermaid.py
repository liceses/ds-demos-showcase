#!/usr/bin/env python3
"""
dsh-project-model renderer — JGF → Mermaid 流程图（v1，分层布局）。

分层策略（design.md §4.4）：graph TD + 层前缀命名。Mermaid 无原生分层布局，
用"层名作为子图"近似——每层一个 subgraph，模块节点放层内；依赖边/工作流边
用实线/虚线区分。工作流边仅在选定一条 workflow 时输出高亮（--workflow）。

用法：
  python render-mermaid.py <pim.json> [--workflow NAME] [--out graph.mmd]
输出：Mermaid markdown（可进仓库、GitHub 原生渲染、PR 可 diff）。
"""
import argparse
import json
import sys
from collections import defaultdict
from pathlib import Path


def load_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def main():
    ap = argparse.ArgumentParser(description="PIM → Mermaid 渲染器")
    ap.add_argument("pims", nargs="+", help="PIM 实例文件（骨架 + 语义段合并渲染，同 validate.py 视图）")
    ap.add_argument("--workflow", help="仅输出该工作流的高亮路径（不输出则画全量依赖图）")
    ap.add_argument("--out", help="输出文件（默认 stdout）")
    args = ap.parse_args()

    nodes = {}
    edges = []
    for p in args.pims:
        if not Path(p).exists():
            continue  # glob 无匹配安全
        doc = load_json(p)
        g = doc.get("graph", {})
        nodes.update(g.get("nodes", {}))
        edges.extend(g.get("edges", []))

    # 分层：unassigned 归到 "unassigned"
    layers = defaultdict(list)
    for nid, n in nodes.items():
        layer = n.get("metadata", {}).get("layer", "unassigned") or "unassigned"
        layers[layer].append(nid)

    line = []
    line.append("```mermaid")
    line.append("flowchart TD")

    # 层子图（Mermaid 不支持子图内跨层边自动排布，仅做视觉分组）
    for layer, nids in sorted(layers.items()):
        line.append(f"    subgraph L_{layer.replace(chr(32), '_')}[{layer}]")
        for nid in sorted(nids):
            label = nodes[nid].get("label", nid)
            line.append(f"        {nid.replace('-', '_')}[\"{label}\"]")
        line.append("    end")

    # 边：dependency 实线 -->；workflow 虚线 -.->（仅 --workflow 指定的那条）
    wf_filter = args.workflow
    dep_count = 0
    wf_count = 0
    for e in edges:
        rel = e.get("relation")
        src = e.get("source", "").replace("-", "_")
        dst = e.get("target", "").replace("-", "_")
        if rel == "dependency":
            line.append(f"    {src} --> {dst}")
            dep_count += 1
        elif rel == "workflow" and wf_filter and e.get("metadata", {}).get("workflow") == wf_filter:
            line.append(f"    {src} -.-> {dst}")
            wf_count += 1

    line.append("```")
    line.append(f"<!-- deps:{dep_count} workflows-shown:{wf_count} -->")
    out = "\n".join(line)

    if args.out:
        Path(args.out).write_text(out + "\n", encoding="utf-8")
        print(f"wrote {args.out}")
    else:
        print(out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
