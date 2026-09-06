#!/usr/bin/env python3
"""
dsh-project-model renderer — JGF → Mermaid 流程图（v1.1，分视图）。

视图（均基于同一份数据，merge 后渲染）：
  默认    : 全量依赖图（本地排查用；GitHub 内嵌渲染对大图会超时）
  --by-layer OUT_DIR : 层概览图（节点=层，边=层间依赖计数）+ 每个 curated 层一张细节图
                       （层内边 + 跨层边计数注释）——GitHub 可渲染的"一眼看到问题"视图
  --workflow NAME --backing-only : 仅该工作流边 + 其依赖背书边（小图，可渲染）

用法：
  python render-mermaid.py <pim.json>...                  # 全量（默认）
  python render-mermaid.py <pim.json>... --by-layer docs/ # 层视图集
  python render-mermaid.py <pim.json>... --workflow 上传 --backing-only
"""
import argparse
import json
import sys
from collections import defaultdict
from pathlib import Path


def load_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def merge(pims):
    nodes, edges = {}, []
    for p in pims:
        if not Path(p).exists():
            continue
        g = load_json(p).get("graph", {})
        nodes.update(g.get("nodes", {}))
        edges.extend(g.get("edges", []))
    return nodes, edges


def layer_of(nodes, nid):
    return nodes.get(nid, {}).get("metadata", {}).get("layer", "unassigned") or "unassigned"


def emit(nodes, edges, out_path, note, title=None):
    """输出 markdown 文件（.md），内含 mermaid fenced block。
    GitHub 官方承诺渲染 .md 内的 ```mermaid；.mmd 文件不支持/不稳定
    （community discussion #121855 → Error rendering embedded code）。"""
    if title is None:
        title = Path(out_path).stem
    body = [
        f"# {title}",
        "",
        "<!-- 由 dsh-project-model render-mermaid 生成，勿手改；数据源为 docs/model/*.json -->",
        "",
    ]
    body.extend(lines_from(nodes, edges, note))
    Path(out_path).write_text("\n".join(body) + "\n", encoding="utf-8")
    print(f"wrote {out_path}")
    return len(edges)
    for layer, nids in sorted(group_by_layer(nodes).items()):
        lines.append(f"    subgraph L_{san(layer)}[{layer}]")
        for nid in sorted(nids):
            label = nodes[nid].get("label", nid)
            lines.append(f"        {san(nid)}[\"{label}\"]")
        lines.append("    end")
    for e in edges:
        rel, src, dst = e.get("relation"), san(e.get("source", "")), san(e.get("target", ""))
        arrow = "-->" if rel == "dependency" else "-.->"
        lines.append(f"    {src} {arrow} {dst}")
    lines.append("```")
    lines.append(f"<!-- {note} -->")
    out = "\n".join(lines) + "\n"
    Path(out_path).write_text(out, encoding="utf-8")
    print(f"wrote {out_path}")
    return len(edges)


def group_by_layer(nodes):
    layers = defaultdict(list)
    for nid, n in nodes.items():
        layers[n.get("metadata", {}).get("layer", "unassigned") or "unassigned"].append(nid)
    return layers


def san(s):
    """节点/层 id 消毒：点号与 `-` 是 Mermaid 词法风险字符，统一替换。"""
    return s.replace(".", "_").replace("-", "_")


def write_doc(path, title, body_lines, note_lines):
    """写 markdown 文档：# 标题 + html 注释（图元数据）+ mermaid block。"""
    out = [f"# {title}", "", "<!-- 由 dsh-project-model render-mermaid 生成，勿手改；数据源见注释 -->", ""]
    out.extend(body_lines)
    out.extend(["", f"<!-- {note_lines} -->", ""])
    Path(path).write_text("\n".join(out) + "\n", encoding="utf-8")
    print(f"wrote {path}")


def emit_overview(nodes, edges, out_dir):
    """层概览：节点=层，边=层间依赖计数（自环不计入，注释展示）。"""
    layers = group_by_layer(nodes)
    layer_edges = defaultdict(int)
    loop = defaultdict(int)
    for e in edges:
        s, t = layer_of(nodes, e.get("source", "")), layer_of(nodes, e.get("target", ""))
        if s == t:
            loop[s] += 1
        else:
            layer_edges[(s, t)] += 1
    lines = ["```mermaid", "flowchart TD"]
    labels = {l: san(l) for l in layers}
    for l in sorted(labels):
        lines.append(f'    {labels[l]}["{l} ({len(layers[l])} 模块)"]')
    for (s, t), n in sorted(layer_edges.items()):
        lines.append(f'    {labels[s]} -->|"{n}"| {labels[t]}')
    lines.append("```")
    loop_note = "，".join(f"{l}:{n}" for l, n in sorted(loop.items()))
    write_doc(
        Path(out_dir) / "graph-layers.md",
        "层概览（PIM）",
        lines,
        f"层内依赖（未画边）：{loop_note or '无'}",
    )


def emit_layer_detail(nodes, edges, layer, out_dir):
    """层细节：该层节点 + 层内边；跨层边以注释计数。"""
    nids = {nid for nid, n in nodes.items() if (n.get("metadata", {}).get("layer", "unassigned") or "unassigned") == layer}
    intra = [e for e in edges if e.get("source", "") in nids and e.get("target", "") in nids]
    cross = defaultdict(int)
    for e in edges:
        s, t = e.get("source", ""), e.get("target", "")
        if (s in nids) != (t in nids):  # 恰好一端在层内
            other = layer_of(nodes, t if s in nids else s)
            cross[other] += 1
    lines = ["```mermaid", "flowchart TD"]
    for nid in sorted(nids):
        label = nodes[nid].get("label", nid)
        lines.append(f'    {san(nid)}["{label}"]')
    for e in intra:
        rel, src, dst = e.get("relation"), san(e.get("source", "")), san(e.get("target", ""))
        arrow = "-->" if rel == "dependency" else "-.->"
        lines.append(f"    {src} {arrow} {dst}")
    lines.append("```")
    cross_note = "，".join(f"→{k}:{v}" for k, v in sorted(cross.items())) or "无"
    write_doc(
        Path(out_dir) / f"graph-{san(layer)}.md",
        f"{layer} 层（PIM）",
        lines,
        f"跨层依赖：{cross_note}",
    )


def main():
    ap = argparse.ArgumentParser(description="PIM → Mermaid 渲染器")
    ap.add_argument("pims", nargs="+", help="PIM 实例文件（骨架 + 语义段合并渲染）")
    ap.add_argument("--workflow", help="仅输出该工作流的高亮路径")
    ap.add_argument("--backing-only", action="store_true", help="配合 --workflow：边仅含工作流边及其依赖背书边")
    ap.add_argument("--by-layer", metavar="OUT_DIR", help="输出层概览 + 每层细节图到目录（.md）")
    ap.add_argument("--out", help="输出文件（.md，默认 stdout）")
    ap.add_argument("--title", help="markdown 标题行（默认取文件名的图 id）")
    args = ap.parse_args()

    nodes, edges = merge(args.pims)

    if args.by_layer:
        out_dir = Path(args.by_layer)
        out_dir.mkdir(parents=True, exist_ok=True)
        emit_overview(nodes, edges, out_dir)
        for layer in group_by_layer(nodes):
            if layer == "unassigned":
                continue
            emit_layer_detail(nodes, edges, layer, out_dir)
        return 0

    if args.workflow:
        wf = [e for e in edges if e.get("relation") == "workflow" and e.get("metadata", {}).get("workflow") == args.workflow]
        shown = wf
        if args.backing_only:
            back = {(e["source"], e["target"]) for e in edges if e.get("relation") == "dependency"}
            deps = [e for e in edges if e.get("relation") == "dependency" and (e["source"], e["target"]) in back and
                    (e["source"], e["target"]) in {(x["source"], x["target"]) for x in wf}]
            shown = wf + deps
        note = f"workflow:{args.workflow} edges:{len(shown)}"
        if args.out:
            emit(nodes, shown, args.out, note)
        else:
            for line in lines_from(nodes, shown, note):
                print(line)
        return 0

    note = f"deps:{sum(1 for e in edges if e.get('relation')=='dependency')} total:{len(edges)}"
    if args.out:
        emit(nodes, edges, args.out, note)
    else:
        for line in lines_from(nodes, edges, note):
            print(line)
    return 0


def lines_from(nodes, edges, note):
    lines = ["```mermaid", "flowchart TD"]
    for layer, nids in sorted(group_by_layer(nodes).items()):
        lines.append(f"    subgraph L_{san(layer)}[{layer}]")
        for nid in sorted(nids):
            label = nodes[nid].get("label", nid)
            lines.append(f"        {san(nid)}[\"{label}\"]")
        lines.append("    end")
    for e in edges:
        rel, src, dst = e.get("relation"), san(e.get("source", "")), san(e.get("target", ""))
        arrow = "-->" if rel == "dependency" else "-.->"
        lines.append(f"    {src} {arrow} {dst}")
    lines.append("```")
    lines.append(f"<!-- {note} -->")
    return lines


if __name__ == "__main__":
    sys.exit(main())
