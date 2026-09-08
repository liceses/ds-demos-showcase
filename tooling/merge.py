#!/usr/bin/env python3
"""
dsh-project-model merge — 前后端骨架 fragment 合并 → pim.generated.json + hash。

- 后端节点：无前缀（app.routers.tasks 等 dotted id，extract.py 输出）
- 前端节点：fe: 前缀（views/HomeView 等路径 id，extract-ts.mjs 输出）
  前缀隔离两个子图的命名空间，避免 id 冲突（后端有 routers，前端有 router）。

用法：
  python merge.py --out pim.generated.json --hash-out pim.generated.hash \
      backend/app --fe-json /tmp/fe.json
"""
import argparse
import hashlib
import json
import sys
from pathlib import Path


def canonical(doc):
    return json.dumps(doc, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


def main():
    ap = argparse.ArgumentParser(description="前后端骨架合并 (dsh-project-model)")
    ap.add_argument("--py-roots", nargs="+", help="Python 源码根（交给 extract.py）")
    ap.add_argument("--fe-json", help="前端 fragment JSON（extract-ts.mjs 产物）")
    ap.add_argument("--extractor", default=None, help="extract.py 路径（未给则用 --py-fragment）")
    ap.add_argument("--py-fragment", help="后端 fragment JSON（已提取好，跳过 extract.py）")
    ap.add_argument("--out", required=True, help="输出 pim.generated.json")
    ap.add_argument("--hash-out", help="同时输出 canonical sha256")
    ap.add_argument("--fn-fe-json", help="函数级前端 fragment（extract-ts.mjs --depth function 产物）：合并进函数级输出")
    ap.add_argument("--fn-out", help="函数级合并输出（pim.functions.json；与骨架分开，不参与 hash 门禁）")
    args = ap.parse_args()

    merged_nodes = {}
    merged_edges = []

    # 后端 fragment
    if args.py_fragment:
        fe_doc = json.load(open(args.py_fragment, encoding="utf-8"))
        g = fe_doc["graph"]
        if g.get("type") == "pim-functions":
            print("py-fragment 是函数级数据（pim-functions），骨架合并跳过（函数级走 --fn-out）")
        else:
            merged_nodes.update(g.get("nodes", {}))
            merged_edges.extend(g.get("edges", []))
            print(f"backend fragment: {len(g.get('nodes', {}))} nodes, {len(g.get('edges', []))} edges")
    else:
        if not args.py_roots:
            print("需要 --py-fragment 或 --py-roots", file=sys.stderr)
            return 2
        print("提示：后端 fragment 请用 extract.py 单独生成（本脚本不做嵌套调用）", file=sys.stderr)
        return 2

    # 前端 fragment：加 fe: 前缀
    if args.fe_json:
        fe = json.load(open(args.fe_json, encoding="utf-8"))
        fe_g = fe["graph"]
        for nid, n in fe_g.get("nodes", {}).items():
            pfx = "fe:" + nid
            n2 = dict(n)
            n2["label"] = nid.split("/")[-1]
            merged_nodes[pfx] = n2
        for e in fe_g.get("edges", []):
            merged_edges.append({
                "id": f"dep-{e['source']}->{e['target']}",
                "source": "fe:" + e["source"],
                "target": "fe:" + e["target"],
                "relation": "dependency",
                "metadata": {"provenance": "generated"},
            })
        print(f"frontend fragment: {len(fe_g.get('nodes', {}))} nodes, {len(fe_g.get('edges', []))} edges (fe: 前缀)")

    doc = {
        "graph": {
            "id": "pim-skeleton",
            "directed": True,
            "type": "pim-skeleton",
            "metadata": {"schema_contract": "docs/model/contract.schema.json"},
            "nodes": merged_nodes,
            "edges": merged_edges,
        }
    }

    # 契约自检：id 唯一性（fe: 前缀隔离后不应冲突）
    if len(merged_nodes) != len(set(merged_nodes)):
        print("fatal: 节点 id 冲突", file=sys.stderr)
        return 1

    h = hashlib.sha256(canonical(doc)).hexdigest()
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(doc, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"wrote {out} — {len(merged_nodes)} nodes, {len(merged_edges)} edges, sha256={h[:16]}…")
    if args.hash_out:
        Path(args.hash_out).write_text(h, encoding="utf-8")
        print(f"wrote hash {args.hash_out}")

    # ── 函数级合并（可选）：后端函数 fragment（--py-fragment 同源）+ 前端 fe: 前缀 ──
    if args.fn_out:
        fn_nodes = {}
        fn_edges = []
        if args.py_fragment:
            be = json.load(open(args.py_fragment, encoding="utf-8"))
            if be["graph"].get("type") == "pim-functions":
                fn_nodes.update(be["graph"].get("nodes", {}))
                fn_edges.extend(be["graph"].get("edges", []))
        if args.fn_fe_json:
            fe = json.load(open(args.fn_fe_json, encoding="utf-8"))
            fe_g = fe["graph"]
            for nid, n in fe_g.get("nodes", {}).items():
                n2 = dict(n)
                md = dict(n2.get("metadata", {}))
                if md.get("parent"):
                    md["parent"] = "fe:" + md["parent"]
                n2["metadata"] = md
                fn_nodes["fe:" + nid] = n2
            for e in fe_g.get("edges", []):
                fn_edges.append({
                    "id": f"call-{e['source']}->{e['target']}",
                    "source": "fe:" + e["source"],
                    "target": "fe:" + e["target"],
                    "relation": "call",
                    "metadata": {"provenance": "generated"},
                })
        fn_doc = {
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
                "nodes": fn_nodes,
                "edges": fn_edges,
            }
        }
        fn_out = Path(args.fn_out)
        fn_out.parent.mkdir(parents=True, exist_ok=True)
        fn_out.write_text(json.dumps(fn_doc, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"wrote {fn_out} — {len(fn_nodes)} function nodes, {len(fn_edges)} call edges")
    return 0


if __name__ == "__main__":
    sys.exit(main())
