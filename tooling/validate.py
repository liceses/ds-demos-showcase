#!/usr/bin/env python3
"""
dsh-project-model validator — 校验 PIM 实例（M1）是否符合契约（M2）。

校验三条（design.md §5.2 / §6.1）：
  1. JSON Schema 合规（relation 枚举 / provenance 规则 / 必填 / additionalProperties）
  2. 边去重：禁止重复 (relation, source, target)
  3. 交叉校验：每条 workflow 边必须有对应的 dependency 边背书（语义声明被代码事实背书）
  4. hash 门禁辅助：计算骨架段 canonical hash，供 CI 与当前代码产物比对

用法：
  python validate.py <schema.json> <pim.json>...          # 校验 + 交叉校验
  python validate.py --hash <pim.json>                    # 输出 canonical sha256（供门禁比对）
  python validate.py --check-hash <pim.json> <expected>   # 比对 hash，不等则退出码 1
退出码：0 通过，1 校验失败，2 使用错误。
"""
import argparse
import hashlib
import json
import sys
from pathlib import Path

try:
    import jsonschema
except ImportError:
    jsonschema = None


def load_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def validate_schema(schema_doc, model_doc):
    """JSON Schema 校验；缺失 jsonschema 库时降级为结构自检并告警。"""
    if jsonschema is not None:
        jsonschema.validate(model_doc, schema_doc)
        return []
    errors = []
    # 结构自检（降级路径）：只做最必要的存在性检查
    g = model_doc.get("graph", {})
    if "nodes" not in g or "edges" not in g:
        errors.append("graph 缺少 nodes/edges")
    if jsonschema is None:
        errors.append("[warn] jsonschema 未安装，仅做结构自检（pip install jsonschema 启用完整校验）")
    return errors


def check_dedupe(edges):
    seen = set()
    for e in edges:
        key = (e.get("relation"), e.get("source"), e.get("target"))
        if key in seen:
            return [f"重复边: relation={key[0]} {key[1]} -> {key[2]}"]
        seen.add(key)
    return []


def check_backing(edges):
    """workflow 边必须有 dependency 边背书。"""
    deps = {(e["source"], e["target"]) for e in edges if e.get("relation") == "dependency"}
    return [
        f"workflow 边无依赖背书: {e['source']} -> {e['target']}"
        for e in edges
        if e.get("relation") == "workflow" and (e["source"], e["target"]) not in deps
    ]


def check_functions(fn_doc, skeleton_nodes):
    """函数级数据存在性校验（分层门禁：不比对 hash，只查引用完整性）。

    1. 函数节点 parent 必须存在于骨架节点（引用完整性）
    2. call 边端点必须存在于函数级节点
    3. 函数节点必须 provenance=generated（契约已强制，此处兜底）
    """
    errors = []
    g = fn_doc.get("graph", {})
    fn_nodes = g.get("nodes", {})
    for nid, n in fn_nodes.items():
        md = n.get("metadata", {})
        if md.get("kind") == "function":
            parent = md.get("parent")
            if not parent:
                errors.append(f"函数节点 {nid} 缺 parent")
            elif parent not in skeleton_nodes:
                errors.append(f"函数节点 {nid} 的 parent {parent} 不在骨架中（模块不存在或 id 写错）")
            if md.get("provenance") != "generated":
                errors.append(f"函数节点 {nid} 的 provenance 必须是 generated")
    for e in g.get("edges", []):
        if e.get("relation") == "call":
            if e.get("source") not in fn_nodes:
                errors.append(f"call 边 source {e.get('source')} 不在函数级节点中")
            if e.get("target") not in fn_nodes:
                errors.append(f"call 边 target {e.get('target')} 不在函数级节点中")
    return errors


def check_usecase(uc_doc, skeleton_nodes):
    """用例图引用完整性校验（CIM：不比对 hash，只查引用）。

    1. usecase 节点 supportModules 必须存在于骨架（支撑模块真实存在）
    2. association 边端点必须存在（actor—usecase）
    """
    errors = []
    g = uc_doc.get("graph", {})
    uc_nodes = g.get("nodes", {})
    for nid, n in uc_nodes.items():
        md = n.get("metadata", {})
        if md.get("kind") == "usecase":
            for m in md.get("supportModules", []):
                if m not in skeleton_nodes:
                    errors.append(f"用例 {nid} 的支撑模块 {m} 不在骨架中（模块不存在或 id 写错）")
    for e in g.get("edges", []):
        if e.get("relation") == "association":
            if e.get("source") not in uc_nodes:
                errors.append(f"association 边 source {e.get('source')} 不在用例图节点中")
            if e.get("target") not in uc_nodes:
                errors.append(f"association 边 target {e.get('target')} 不在用例图节点中")
    return errors


def canonical_json(doc):
    """canonical 化：排序键、紧凑、UTF-8。用于可复现 hash。"""
    return json.dumps(doc, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


def main():
    ap = argparse.ArgumentParser(description="PIM validator (dsh-project-model)")
    ap.add_argument("--schema", help="contract.schema.json (M2 契约)")
    ap.add_argument("pims", nargs="*", help="PIM 实例文件（可多个：先骨架后语义，合并校验）")
    ap.add_argument("--functions", help="函数级数据文件（pim.functions.json）：存在性校验，不比对 hash")
    ap.add_argument("--usecase", help="用例图文件（usecase.json）：引用完整性校验，不比对 hash")
    ap.add_argument("--hash", action="store_true", help="输出 canonical sha256")
    ap.add_argument("--check-hash", metavar="EXPECTED", help="比对 canonical sha256")
    args = ap.parse_args()

    if args.hash or args.check_hash:
        if not args.pims:
            print("--hash 需要至少一个 pim 文件", file=sys.stderr)
            return 2
        merged = {"graph": {"id": "merged-check", "nodes": {}, "edges": []}}
        for p in args.pims:
            doc = load_json(p)
            # 骨架 + 语义合并视图：nodes/edges 都合并（校验用）
            g = doc.get("graph", {})
            for nid, n in g.get("nodes", {}).items():
                merged["graph"]["nodes"][nid] = n
            merged["graph"]["edges"].extend(g.get("edges", []))
        h = hashlib.sha256(canonical_json(merged)).hexdigest()
        if args.check_hash:
            expected = args.check_hash.strip()  # Windows 下 bash 命令替换会带 \r\n
            ok = h == expected
            print(f"{'MATCH' if ok else 'MISMATCH'} {h}")
            return 0 if ok else 1
        print(h)
        return 0

    if not args.schema:
        print("缺少 --schema", file=sys.stderr)
        return 2
    if not args.pims:
        print("缺少 PIM 文件", file=sys.stderr)
        return 2

    schema_doc = load_json(args.schema)
    errors = []
    # 合并视图：PIM 实例 = 骨架 + 语义段的逻辑图（dependency 在 generated，
    # workflow 在 curated——交叉校验必须在合并图上做，逐文件必然误报）
    merged_edges = []
    merged_nodes = {}
    for p in args.pims:
        if not Path(p).exists():
            continue  # glob 无匹配时 shell 传字面量；跳过而非误失败（CI 安全）
        model = load_json(p)
        try:
            errors += validate_schema(schema_doc, model)
        except jsonschema.exceptions.ValidationError as exc:
            errors.append(f"{Path(p).name}: schema 违规: {exc.message} @ {list(exc.absolute_path)}")
        g = model.get("graph", {})
        merged_edges.extend(g.get("edges", []))
        merged_nodes.update(g.get("nodes", {}))

    # 合并视图上的图级约束
    errors += check_dedupe(merged_edges)
    errors += check_backing(merged_edges)

    # 函数级存在性校验（分层门禁：引用完整性，不比对 hash）
    if args.functions:
        if not Path(args.functions).exists():
            errors.append(f"--functions 文件不存在: {args.functions}")
        else:
            fn_doc = load_json(args.functions)
            try:
                errors += validate_schema(schema_doc, fn_doc)
            except jsonschema.exceptions.ValidationError as exc:
                errors.append(f"{Path(args.functions).name}: schema 违规: {exc.message} @ {list(exc.absolute_path)}")
            errors += check_functions(fn_doc, merged_nodes)

    # 用例图引用完整性校验（CIM：引用完整性，不比对 hash）
    if args.usecase:
        if not Path(args.usecase).exists():
            errors.append(f"--usecase 文件不存在: {args.usecase}")
        else:
            uc_doc = load_json(args.usecase)
            try:
                errors += validate_schema(schema_doc, uc_doc)
            except jsonschema.exceptions.ValidationError as exc:
                errors.append(f"{Path(args.usecase).name}: schema 违规: {exc.message} @ {list(exc.absolute_path)}")
            errors += check_usecase(uc_doc, merged_nodes)

    if errors:
        for e in errors:
            print(f"[fail] {e}", file=sys.stderr)
        return 1
    print("OK: 所有 PIM 文件通过契约校验")
    return 0


if __name__ == "__main__":
    sys.exit(main())
