#!/usr/bin/env python3
"""一次性渲染：usecase.json → Mermaid 用例图（docs/model/graph-usecase.md）。

用例图语义（CIM 视角）：
- actor 节点 = 火柴人（staleface），只画主要参与者
- usecase 节点 = 椭圆（ellipse）
- association 边 = actor → usecase
- draft 用例虚线样式（stroke-dasharray），approved 实线
"""
import json
import sys
from pathlib import Path

USECASE = Path("docs/model/usecase.json")
OUT = Path("docs/model/graph-usecase.md")


def main() -> int:
    doc = json.loads(USECASE.read_text(encoding="utf-8"))
    g = doc["graph"]
    nodes = g["nodes"]
    edges = g["edges"]

    lines = [
        "# 用例图（Use Case · CIM 视角）",
        "",
        "<!-- 由 dsh-project-model 用例图渲染生成，勿手改；数据源 docs/model/usecase.json -->",
        "",
        "```mermaid",
        "graph LR",
    ]
    for nid, n in nodes.items():
        md = n["metadata"]
        label = (n.get("label") or nid).replace('"', "'")
        if md.get("kind") == "actor":
            lines.append(f'    {nid}["{label}"]:::actor')
        else:
            dashed = "stroke-dasharray: 6 4" if md.get("status") != "approved" else ""
            style = f",{dashed}" if dashed else ""
            lines.append(f'    {nid}("{label}")')
    for e in edges:
        lines.append(f"    {e['source']} --> {e['target']}")
    lines += [
        "    classDef actor fill:#ffd93d,stroke:#141414,stroke-width:2px",
        "```",
        "",
        "## 图例",
        "- 黄色火柴人 = 主要参与者（访客 / 登录用户 / 管理员 / AI 上传助手）",
        "- 椭圆 = 用例（用户视角的动宾短语，讲 What 不讲 How）",
        "- 实线 = 已确认（approved）；虚线 = 草案（draft，待用户在项目模型视图确认）",
        "",
        f"共 {len(nodes)} 节点（{sum(1 for n in nodes.values() if n['metadata'].get('kind')=='actor')} actor + {sum(1 for n in nodes.values() if n['metadata'].get('kind')=='usecase')} 用例）、{len(edges)} 条关联。",
    ]
    OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"wrote {OUT} ({len(lines)} lines)")
    return 0


if __name__ == "__main__":
    sys.exit(main())