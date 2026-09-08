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


# ── 函数级提取（--depth function）──────────────────────────────────────────
# 输出 pim-functions 类型图：节点 = 函数（parent 指向骨架模块 id），
# 边 = call（函数调用）。独立文件、gitignore、不参与 hash 门禁（分层门禁设计）。


def signature_of(node):
    """函数签名文本：name(args) -> ret。"""
    args = node.args
    parts = []
    pos = list(args.posonlyargs) + list(args.args)
    defaults = [None] * (len(pos) - len(args.defaults)) + list(args.defaults)
    for a, d in zip(pos, defaults):
        s = a.arg
        if a.annotation:
            try:
                s += f": {ast.unparse(a.annotation)}"
            except Exception:
                pass
        if d is not None:
            try:
                s += f" = {ast.unparse(d)}"
            except Exception:
                pass
        parts.append(s)
    if args.vararg:
        parts.append(f"*{args.vararg.arg}")
    for a in args.kwonlyargs:
        s = a.arg
        if a.annotation:
            try:
                s += f": {ast.unparse(a.annotation)}"
            except Exception:
                pass
        parts.append(s)
    if args.kwarg:
        parts.append(f"**{args.kwarg.arg}")
    ret = ""
    if node.returns:
        try:
            ret = f" -> {ast.unparse(node.returns)}"
        except Exception:
            pass
    return f"{node.name}({', '.join(parts)}){ret}"


def collect_vars(node):
    """函数体内赋值的目标变量名（去重，截断 20 个）。"""
    out = []
    for sub in ast.walk(node):
        if isinstance(sub, ast.Assign):
            for t in sub.targets:
                if isinstance(t, ast.Name):
                    out.append(t.id)
        elif isinstance(sub, (ast.AnnAssign, ast.AugAssign)) and isinstance(sub.target, ast.Name):
            out.append(sub.target.id)
    return list(dict.fromkeys(out))[:20]


def extract_functions(roots, dotted_of, self_dotted):
    """函数级子图：函数节点 + call 边。parent 引用骨架模块 id。"""
    # 项目内函数集合：(module_dotted, func_name) -> node_id
    func_ids = {}
    file_funcs = {}  # file -> [FunctionDef nodes]
    for f, d in dotted_of.items():
        try:
            src = f.read_text(encoding="utf-8")
            tree = ast.parse(src, filename=str(f))
        except (UnicodeDecodeError, OSError, SyntaxError):
            continue
        fns = [n for n in ast.walk(tree) if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))]
        file_funcs[f] = fns
        for n in fns:
            func_ids[(d, n.name)] = f"{d}::{n.name}"

    # 每模块的 import 符号表：symbol -> 目标函数 node_id（跨模块调用解析用）
    imported = {}  # module_dotted -> {symbol: node_id}
    for f, d in dotted_of.items():
        try:
            src = f.read_text(encoding="utf-8")
            tree = ast.parse(src, filename=str(f))
        except (UnicodeDecodeError, OSError, SyntaxError):
            continue
        syms = {}
        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom) and node.module:
                for a in node.names:
                    if a.name == "*":
                        continue
                    tgt = f"{node.module}::{a.name}"
                    if tgt in func_ids.values():
                        syms[a.name] = tgt
            elif isinstance(node, ast.Import):
                for a in node.names:
                    if a.name in self_dotted:
                        syms[a.name.split('.')[-1]] = a.name  # 模块别名 → 模块 dotted
        imported[d] = syms

    nodes = {}
    call_edges = []  # (src_id, dst_id)
    for f, d in dotted_of.items():
        for n in file_funcs.get(f, []):
            nid = func_ids[(d, n.name)]
            calls = set()
            for sub in ast.walk(n):
                if not isinstance(sub, ast.Call):
                    continue
                fn = sub.func
                if isinstance(fn, ast.Name):
                    name = fn.id
                    if (d, name) in func_ids:
                        calls.add(func_ids[(d, name)])
                    elif name in imported.get(d, {}):
                        tgt = imported[d][name]
                        if tgt in func_ids.values():
                            calls.add(tgt)
                elif isinstance(fn, ast.Attribute) and isinstance(fn.value, ast.Name):
                    # obj.method：obj 是 import 的模块 → module::method
                    obj = fn.value.id
                    mod = imported.get(d, {}).get(obj)
                    if mod and f"{mod}::{fn.attr}" in func_ids.values():
                        calls.add(f"{mod}::{fn.attr}")
            nodes[nid] = {
                "label": n.name,
                "metadata": {
                    "kind": "function",
                    "parent": d,
                    "provenance": "generated",
                    "signature": signature_of(n),
                    "line": n.lineno,
                    "file": f.name,
                    "calls": sorted(calls),
                    "variables": collect_vars(n),
                },
            }
            for c in calls:
                call_edges.append((nid, c))

    # called_by 反推
    called_by = {}
    for src, dst in call_edges:
        called_by.setdefault(dst, set()).add(src)
    for nid, n in nodes.items():
        n["metadata"]["called_by"] = sorted(called_by.get(nid, ()))

    edges = [
        {
            "id": f"call-{src}->{dst}",
            "source": src,
            "target": dst,
            "relation": "call",
            "metadata": {"provenance": "generated"},
        }
        for src, dst in sorted(set(call_edges))
    ]
    return nodes, edges


def main():
    ap = argparse.ArgumentParser(description="PIM 骨架提取器 (dsh-project-model)")
    ap.add_argument("roots", nargs="+", help="源码根目录（Python 包）")
    ap.add_argument("--dst", required=True, help="输出 pim.generated.json")
    ap.add_argument("--hash-out", help="同时输出 canonical sha256 到该文件")
    ap.add_argument("--depth", choices=["module", "function"], default="module",
                    help="提取深度：module=骨架（默认，参与 hash 门禁）；function=函数级子图（独立文件，不参与门禁）")
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

    # ── 函数级模式：独立子图，带 generated_at（不参与 hash 门禁）──
    if args.depth == "function":
        nodes, edges = extract_functions(roots, dotted_of, self_dotted)
        doc = {
            "graph": {
                "id": "pim-functions",
                "directed": True,
                "type": "pim-functions",
                "metadata": {
                    "schema_contract": "docs/model/contract.schema.json",
                    "generated_at": __import__("datetime").datetime.now(
                        __import__("datetime").timezone.utc
                    ).isoformat(),
                },
                "nodes": nodes,
                "edges": edges,
            }
        }
        out = Path(args.dst)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(doc, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"wrote {out} — {len(nodes)} function nodes, {len(edges)} call edges (depth=function)")
        return 0


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
