#!/usr/bin/env python3
"""
dsh-project-model extractor v1 — 静态分析生成 PIM 骨架段（Generated，零 token）。

输入：一个或一组源码根目录（如 backend/app）
输出：
  - JGF 图：节点 = Python 模块（相对根的 dotted path），边 = 项目内 import 依赖
  - 全部节点/边 provenance=generated；layer 一律 "unassigned"（分层是 Curated
    数据，见 design.md——Generated 只做机械提取，不做语义判断）
  - 指标：loc / todo_density / fan_in / fan_out（图指标与可视化热度共用）

用法：
  python extract.py --dst pim.generated.json --hash-out pim.generated.hash backend/app frontend/src? (v1 仅 py)

退出码：0 成功，1 失败。
"""
import argparse
import ast
import hashlib
import json
import sys
import re
from collections import defaultdict
from pathlib import Path

TODO_RE = re.compile(r"#\s*(TODO|FIXME|HACK|XXX)\b", re.IGNORECASE)


def dotted_from_file(root: Path, file: Path):
    """相对 root 的 dotted module 名：backend/app/routers/tasks.py → app.routers.tasks"""
    rel = file.relative_to(root)
    parts = list(rel.parts[:-1]) + [rel.stem]
    if parts[-1] == "__init__":
        parts.pop()
    return ".".join(parts) if parts else None


class ImportCollector(ast.NodeVisitor):
    def __init__(self, file):
        self.file = file
        self.direct = []  # (target_dotted, line)
        self.froms = []  # (module_dotted, [symbols], line)  — 相对导入解析后填充
        self.relative = []  # (level, module_or_none, [symbols], line)

    def visit_Import(self, node):
        for alias in node.names:
            self.direct.append((alias.name, node.lineno))
        self.generic_visit(node)

    def visit_ImportFrom(self, node):
        symbols = [a.name for a in node.names if a.name != "*"]
        if node.level and node.level > 0:  # 相对导入：.x / ..y
            self.relative.append((node.level, node.module, symbols, node.lineno))
        elif node.module:
            self.froms.append((node.module, symbols, node.lineno))
        self.generic_visit(node)


def resolve_relative(level, module, self_dotted):
    """相对导入 → 绝对 dotted；解析失败返回 None。"""
    self_parts = self_dotted.split(".")
    if module:
        base = self_parts[: len(self_parts) - level] + module.split(".")
    else:
        base = self_parts[: len(self_parts) - level]
    return ".".join(base)


def main():
    ap = argparse.ArgumentParser(description="PIM 骨架提取器 (dsh-project-model)")
    ap.add_argument("roots", nargs="+", help="源码根目录（Python 包）")
    ap.add_argument("--dst", required=True, help="输出 pim.generated.json")
    ap.add_argument("--hash-out", help="同时输出 canonical sha256 到该文件")
    args = ap.parse_args()

    roots = [Path(r).resolve() for r in args.roots]
    for root in roots:
        if not root.is_dir():
            print(f"err: 目录不存在: {root}", file=sys.stderr)
            return 1

    # dotted_of: 文件 → 其所在根的相对 dotted 名
    dotted_of = {}
    for root in roots:
        for f in root.rglob("*.py"):
            d = dotted_from_file(root, f)
            if d:
                dotted_of[f] = d
    self_dotted = set(dotted_of.values())

    edges = defaultdict(set)  # (src, dst) -> set of lines
    locs = {}
    todos = {}
    file_of_dotted = {d: f for f, d in dotted_of.items()}

    for f, d in dotted_of.items():
        try:
            src = f.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            locs[d] = 0
            todos[d] = 0
            continue
        locs[d] = src.count("\n") + 1
        todos[d] = len(TODO_RE.findall(src))
        try:
            tree = ast.parse(src, filename=str(f))
        except SyntaxError:
            continue
        col = ImportCollector(f)
        col.visit(tree)
        for target, _line in col.direct:
            if target in self_dotted:
                edges[(d, target)].add(_line)
        # `from X import sym1, sym2`：X 是模块 = 依赖；sym 若是本地模块 = 依赖
        for module, symbols, _line in col.froms:
            if module in self_dotted:
                edges[(d, module)].add(_line)
            for sym in symbols:
                if module + "." + sym in self_dotted:
                    edges[(d, module + "." + sym)].add(_line)
        for level, module, symbols, _line in col.relative:
            resolved = resolve_relative(level, module, d)
            if resolved in self_dotted:
                edges[(d, resolved)].add(_line)
            for sym in symbols:
                if resolved + "." + sym in self_dotted:
                    edges[(d, resolved + "." + sym)].add(_line)

    # 指标：fan_in / fan_out
    fan_in = defaultdict(int)
    fan_out = defaultdict(int)
    edge_list = []
    for (src, dst), lines in sorted(edges.items()):
        fan_out[src] += 1
        fan_in[dst] += 1
        edge_list.append(
            {
                "id": f"dep-{src}->{dst}",
                "source": src,
                "target": dst,
                "relation": "dependency",
                "metadata": {"provenance": "generated"},
            }
        )

    nodes = {}
    for d in sorted(self_dotted):
        loc = locs.get(d, 0)
        nodes[d] = {
            "label": d.split(".")[-1],
            "metadata": {
                "layer": "unassigned",
                "provenance": "generated",
                "metrics": {
                    "loc": loc,
                    "todo_density": round(todos.get(d, 0) / loc, 4) if loc else 0,
                    "fan_in": fan_in.get(d, 0),
                    "fan_out": fan_out.get(d, 0),
                },
            },
        }

    doc = {
        "graph": {
            "id": "pim-skeleton",
            "directed": True,
            "type": "pim-skeleton",
            # 注意：不写 generated_at —— 时间戳会破坏可复现 hash（门禁比对用）
            "metadata": {
                "schema_contract": "docs/model/contract.schema.json",
            },
            "nodes": nodes,
            "edges": edge_list,
        }
    }

    # 可复现 hash：generated_at 不参与内容（None at write time, filled by gate? no——留固定）
    h = hashlib.sha256(
        json.dumps(doc, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    ).hexdigest()

    out = Path(args.dst)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(doc, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"wrote {out} — {len(nodes)} nodes, {len(edge_list)} edges, sha256={h[:16]}…")
    if args.hash_out:
        Path(args.hash_out).write_text(h, encoding="utf-8")
        print(f"wrote hash {args.hash_out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
