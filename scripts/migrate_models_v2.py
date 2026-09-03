"""v2 B1 数据迁移：Tag(key=model) → models / model_aliases / demo_models；demos.prompt → prompts。

用法（web/ 目录下）：
    python scripts/migrate_models_v2.py [--dry-run]
容器内：
    docker compose exec backend python /site-repo/scripts/migrate_models_v2.py [--dry-run]

幂等：按名称/别名去重、demo_models 存在性检查、prompt 按 hash 去重，可重复运行。
--dry-run：全程不提交，结束时回滚，仅打印统计。
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))


def main() -> None:
    parser = argparse.ArgumentParser(description="v2 实体化数据迁移（幂等）")
    parser.add_argument("--dry-run", action="store_true", help="只统计不写库")
    args = parser.parse_args()

    from sqlalchemy import func

    from app.database import SessionLocal
    from app.main import init_db  # 幂等：建新表（models/tasks/prompts/...）+ 补列（tier/prompt_id）
    from app.models import Demo, DemoModel, Model, Tag
    from app.services import model_service

    init_db()
    db = SessionLocal()
    stats = {
        "model_tags": 0,
        "models_created": 0,
        "models_existing": 0,
        "links_added": 0,
        "links_existing": 0,
        "demos_with_prompt": 0,
        "prompts_created": 0,
        "run_meta_filled": 0,
        "merge_suggestions": 0,
    }
    try:
        # 1) model 标签值 → Model 实体（迁移批次视为已确认：active；ds-unknown 自动 unverified）
        tags = db.query(Tag).filter(Tag.key == "model").all()
        stats["model_tags"] = len(tags)
        for t in tags:
            _, created = model_service.get_or_create_model(
                db, t.value, vendor=t.group, status="active", description=t.description or ""
            )
            stats["models_created" if created else "models_existing"] += 1

        # 2) demo 的 model 标签 → demo_models
        demos = db.query(Demo).all()
        for d in demos:
            for dt in d.tag_associations:
                if dt.tag.key != "model":
                    continue
                m, _created = model_service.get_or_create_model(db, dt.tag.value, status="active")
                link = (
                    db.query(DemoModel)
                    .filter(DemoModel.demo_id == d.id, DemoModel.model_id == m.id)
                    .first()
                )
                if link is None:
                    db.add(DemoModel(demo_id=d.id, model_id=m.id))
                    stats["links_added"] += 1
                else:
                    stats["links_existing"] += 1

        # 3) prompts 回填（规范化去重；prompts_created 按表行数差值统计）
        from app.models import Prompt

        prompts_before = db.query(func.count(Prompt.id)).scalar() or 0
        for d in demos:
            if not (d.prompt or "").strip():
                continue
            stats["demos_with_prompt"] += 1
            model_service.set_demo_prompt(db, d)
        stats["prompts_created"] = (db.query(func.count(Prompt.id)).scalar() or 0) - prompts_before

        # 4) run 元数据回填（v2 B5′）：rounds/time/platform 标签 → demo 列
        #    每次都重算（幂等）：标签仍是事实源之一，列可被后台改标签后再次对齐
        for d in demos:
            model_service.sync_run_meta(d)
            if d.gen_rounds is not None or d.gen_minutes is not None or d.gen_platform:
                stats["run_meta_filled"] += 1

        # 5) 规范化同名冲突 → 生成合并候选（不静默合并：Canonical 是人的决定）
        #    例：标签里同时存在 dsv4-flash 与 dsv4flash，normalize 后同键，
        #    别名映射 setdefault 会让第三种写法归属不确定 —— 交收件箱人工裁决。
        from collections import defaultdict

        from app.services import matching_service, suggestion_service

        buckets: dict[str, list] = defaultdict(list)
        for m in db.query(Model).all():
            buckets[matching_service.normalize(m.name)].append(m)
        for _norm, group in buckets.items():
            if len(group) < 2:
                continue
            # 引用最多者为建议归宿，其余各生成一条 merge_model 候选
            group.sort(key=lambda m: (-db.query(func.count(DemoModel.demo_id)).filter(DemoModel.model_id == m.id).scalar(), m.id))
            target = group[0]
            for src in group[1:]:
                made = suggestion_service.create(
                    db,
                    kind="merge_model",
                    payload={
                        "source_id": src.id,
                        "target_id": target.id,
                        "source_name": src.name,
                        "target_name": target.name,
                        "note": "规范化后同名（分隔符/大小写差异），疑似同一模型的两种写法",
                    },
                    confidence=0.95,
                    source="imported",
                    ref_id=src.id,
                )
                if made is not None:
                    stats["merge_suggestions"] += 1

        if args.dry_run:
            db.rollback()
            print("[dry-run] 未写库，统计如下：")
        else:
            db.commit()
            print("迁移完成：")
        for k, v in stats.items():
            print(f"  {k}: {v}")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
