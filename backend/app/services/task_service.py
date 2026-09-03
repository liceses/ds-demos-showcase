"""题目实体服务（v2）：CRUD / 挂题摘题 / 合并 / 按模型对比（Benchmark 数据源）。

冷启动（落地计划 §8.3 + 评审与重排.md B3′）：Task 不会从现有标签自动长出来——
先由 prompt 聚类产出建议（cluster_service），管理员「命名 + 点成题」一次落库；
在此之前靠 admin 手工建题挂 demo。规则建议进收件箱，LLM 后置。

写路径与 model_service 同约定：一律经本 service、同事务落 audit_log。
"""

from fastapi import HTTPException
from sqlalchemy import case, func
from sqlalchemy.orm import Session

from ..models import Demo, DemoModel, DemoTask, Model, Prompt, Task
from . import audit_service, cluster_service, matching_service

TASK_STATUSES = ("candidate", "active", "merged", "hidden")


def _invalidate_indexes() -> None:
    """题目写后统一失效：相似召回索引 + prompt 聚类缓存（成题后同簇不得再被推荐）。"""
    matching_service.bump_task_index()
    cluster_service.invalidate()


def _slugify_unique(db: Session, title: str) -> str:
    """题目 slug 用 slugify（保留连字符，可按题面拼 URL），匹配仍走 normalize。"""
    base = matching_service.slugify(title)[:100] or "task"
    slug = base
    i = 1
    while db.query(Task.id).filter(Task.slug == slug).first() is not None:
        i += 1
        slug = f"{base}-{i}"
    return slug


def get_by_slug(db: Session, slug: str) -> Task | None:
    return db.query(Task).filter(Task.slug == slug).first()


def get_task_or_404(db: Session, ident: str | int) -> Task:
    """按 id 或 slug 取题目（admin 接口统一入口）。"""
    task = None
    if isinstance(ident, int) or str(ident).isdigit():
        task = db.get(Task, int(ident))
    if task is None:
        task = db.query(Task).filter(Task.slug == str(ident)).first()
    if task is None:
        raise HTTPException(status_code=404, detail="题目不存在")
    return task


def create_task(
    db: Session,
    title: str,
    description: str = "",
    category: str | None = None,
    status: str = "active",
    created_by: int | None = None,
    reason: str = "",
) -> Task:
    """建题。status 只接受合法值；管理员手工建题默认 active（冷启动要能立刻出内容）。"""
    if status not in TASK_STATUSES:
        raise HTTPException(status_code=422, detail=f"非法状态，可选：{', '.join(TASK_STATUSES)}")
    task = Task(
        slug=_slugify_unique(db, title),
        title=(title or "").strip(),
        description=description or "",
        category=category or None,
        status=status,
        created_by=created_by,
    )
    db.add(task)
    db.flush()
    audit_service.record(
        db,
        action="create",
        entity_type="task",
        entity_id=task.id,
        actor_id=created_by,
        after=audit_service.snapshot_task(task),
        reason=reason or f"新建题目《{task.title}》",
    )
    db.commit()
    _invalidate_indexes()
    return task


def update_task(db: Session, task: Task, actor_id: int | None = None, **fields) -> Task:
    """改题面字段（title/description/category/status）。"""
    if "status" in fields and fields["status"] and fields["status"] not in TASK_STATUSES:
        raise HTTPException(status_code=422, detail=f"非法状态，可选：{', '.join(TASK_STATUSES)}")
    before = audit_service.snapshot_task(task)
    for f in ("title", "description", "category", "status"):
        if f in fields and fields[f] is not None:
            setattr(task, f, fields[f])
    if "category" in fields and fields["category"] == "":
        task.category = None
    audit_service.record(
        db,
        action="update",
        entity_type="task",
        entity_id=task.id,
        actor_id=actor_id,
        before=before,
        after=audit_service.snapshot_task(task),
        reason="编辑题目",
    )
    db.commit()
    _invalidate_indexes()
    return task


def attach_demos(db: Session, task: Task, demo_ids: list[int], actor_id: int | None = None) -> int:
    """批量挂题（冷启动 + prompt 簇「成题」的主手段）。返回新挂载数。"""
    added = 0
    for did in demo_ids:
        if db.query(Demo.id).filter(Demo.id == did).first() is None:
            continue
        exists = (
            db.query(DemoTask)
            .filter(DemoTask.demo_id == did, DemoTask.task_id == task.id)
            .first()
        )
        if exists is None:
            db.add(DemoTask(demo_id=did, task_id=task.id))
            added += 1
    if added:
        audit_service.record(
            db,
            action="attach",
            entity_type="task",
            entity_id=task.id,
            actor_id=actor_id,
            after={**audit_service.snapshot_task(task), "attached": added},
            reason=f"挂载 {added} 个作品",
        )
    db.commit()
    cluster_service.invalidate()  # 挂题改变 covered，面板不该再推同簇
    return added


def detach_demo(db: Session, task: Task, demo_id: int, actor_id: int | None = None) -> bool:
    """摘题（幂等：不存在返回 False）。"""
    row = (
        db.query(DemoTask)
        .filter(DemoTask.demo_id == demo_id, DemoTask.task_id == task.id)
        .first()
    )
    if row is None:
        return False
    db.delete(row)
    audit_service.record(
        db,
        action="detach",
        entity_type="task",
        entity_id=task.id,
        actor_id=actor_id,
        reason=f"摘除作品 demo_id={demo_id}",
    )
    db.commit()
    cluster_service.invalidate()
    return True


def _assert_task_no_cycle(db: Session, source: Task, target: Task) -> None:
    """合并防呆：target 的 merged_into 链回到 source 即成环。"""
    seen: set[int] = {source.id}
    cur_id: int | None = target.id
    for _ in range(20):
        if cur_id is None:
            return
        if cur_id in seen:
            raise HTTPException(status_code=422, detail="合并会形成环，已拒绝")
        seen.add(cur_id)
        row = db.query(Task.merged_into_id).filter(Task.id == cur_id).first()
        cur_id = row[0] if row else None
    raise HTTPException(status_code=422, detail="合并链过深（疑似脏数据），已拒绝")


def merge_task(
    db: Session,
    source: Task,
    target: Task,
    dry_run: bool = False,
    actor_id: int | None = None,
    reason: str = "",
) -> dict:
    """把 source 合并进 target：迁挂载关系 → 源标 merged（单事务 + 审计，可回溯）。"""
    if source.id == target.id:
        raise HTTPException(status_code=422, detail="不能合并到自身")
    if target.status not in ("active", "candidate"):
        raise HTTPException(status_code=422, detail="合并目标须为 active/candidate 题目")
    if source.status == "merged" and source.merged_into_id:
        raise HTTPException(status_code=422, detail="源题目已被合并过，请直接用其归宿")
    _assert_task_no_cycle(db, source, target)

    affected = db.query(func.count(DemoTask.demo_id)).filter(DemoTask.task_id == source.id).scalar() or 0
    preview = {
        "source": {"id": source.id, "slug": source.slug, "title": source.title},
        "target": {"id": target.id, "slug": target.slug, "title": target.title},
        "affected_demos": affected,
        "dry_run": dry_run,
    }
    if dry_run:
        return preview

    before = audit_service.snapshot_task(source)
    demo_ids = [d for (d,) in db.query(DemoTask.demo_id).filter(DemoTask.task_id == source.id).all()]
    db.query(DemoTask).filter(DemoTask.task_id == source.id).delete()
    for did in demo_ids:
        exists = (
            db.query(DemoTask)
            .filter(DemoTask.demo_id == did, DemoTask.task_id == target.id)
            .first()
        )
        if exists is None:
            db.add(DemoTask(demo_id=did, task_id=target.id))
    source.status = "merged"
    source.merged_into_id = target.id
    audit_service.record(
        db,
        action="merge",
        entity_type="task",
        entity_id=source.id,
        actor_id=actor_id,
        before=before,
        after=audit_service.snapshot_task(source),
        reason=reason or f"合并入《{target.title}》（id={target.id}），迁移 {affected} 个作品",
    )
    db.commit()
    _invalidate_indexes()
    preview["merged"] = True
    return preview


def delete_task(db: Session, task: Task, actor_id: int | None = None) -> None:
    """仅允许删除零挂载的题目（有挂载走 merge / hidden）。"""
    linked = db.query(func.count(DemoTask.demo_id)).filter(DemoTask.task_id == task.id).scalar() or 0
    if linked:
        raise HTTPException(status_code=409, detail=f"该题目仍挂着 {linked} 个作品，请使用合并或下架")
    audit_service.record(
        db,
        action="delete",
        entity_type="task",
        entity_id=task.id,
        actor_id=actor_id,
        before=audit_service.snapshot_task(task),
        reason="删除零挂载题目",
    )
    db.delete(task)
    db.commit()
    _invalidate_indexes()


def task_candidates(db: Session) -> list[dict]:
    """待审题目（规则建议/用户申请产生的 candidate）+ 各自挂载数：收件箱数据源。"""
    rows = (
        db.query(Task, func.count(func.distinct(DemoTask.demo_id)))
        .outerjoin(DemoTask, DemoTask.task_id == Task.id)
        .filter(Task.status == "candidate")
        .group_by(Task.id)
        .order_by(func.count(func.distinct(DemoTask.demo_id)).desc(), Task.id.asc())
        .all()
    )
    return [
        {
            "id": t.id,
            "slug": t.slug,
            "title": t.title,
            "category": t.category,
            "status": t.status,
            "demo_count": c,
            "created_at": t.created_at,
        }
        for t, c in rows
    ]


# ---------------- 公开查询 ----------------


def prompt_excerpts(db: Session, task_ids: list[int], limit_chars: int = 160) -> dict[int, str]:
    """批量取题目"题面摘录"：该题下第一件有提示词的已上架作品。

    题目实体不存提示词（题面在它挂的作品上），而"成题"自动建的题目 description 常为空 ——
    列表页若只显示标题，读者无从判断这道题让你做什么。
    **一次查询覆盖整页**（不按任务循环），且是全站唯一定义处。
    """
    out: dict[int, str] = {}
    ids = [i for i in task_ids if i]
    if not ids:
        return out
    rows = (
        db.query(DemoTask.task_id, Demo.prompt)
        .join(Demo, Demo.id == DemoTask.demo_id)
        .filter(DemoTask.task_id.in_(ids), Demo.status == "approved", Demo.prompt != "")
        .order_by(DemoTask.task_id.asc(), Demo.id.asc())
        .all()
    )
    for tid, p in rows:
        if tid not in out and p:
            out[tid] = p.strip()[:limit_chars]
    return out


def list_tasks(
    db: Session,
    status: str | None = None,
    q: str | None = None,
    category: str | None = None,
    sort: str = "demos",
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[dict], int]:
    """公开任务列表（status 缺省 active；merged/hidden 不对外）。"""
    dc = (
        db.query(DemoTask.task_id, func.count(Demo.id).label("c"))
        .join(Demo, Demo.id == DemoTask.demo_id)
        .filter(Demo.status == "approved")
        .group_by(DemoTask.task_id)
        .subquery()
    )
    demo_count_col = func.coalesce(dc.c.c, 0)
    query = (
        db.query(Task, demo_count_col.label("demo_count"))
        .outerjoin(dc, dc.c.task_id == Task.id)
    )
    query = query.filter(Task.status == status) if status else query.filter(Task.status == "active")
    if q:
        like = f"%{q}%"
        query = query.filter(Task.title.ilike(like) | Task.description.ilike(like))
    if category:
        query = query.filter(Task.category == category)

    total = query.count()
    if sort == "newest":
        query = query.order_by(Task.created_at.desc(), Task.id.desc())
    else:  # demos
        query = query.order_by(demo_count_col.desc(), Task.id.asc())
    rows = query.offset((page - 1) * page_size).limit(page_size).all()

    # 题面摘录：规则与取数都在 prompt_excerpts() 一处（本页一次查询，不按任务循环）
    excerpts = prompt_excerpts(db, [t.id for t, _ in rows])

    items = [
        {
            "id": t.id,
            "slug": t.slug,
            "title": t.title,
            "description": t.description,
            "prompt_excerpt": excerpts.get(t.id, ""),
            "category": t.category,
            "status": t.status,
            "demo_count": c,
            "created_at": t.created_at,
        }
        for t, c in rows
    ]
    return items, total


def list_tasks_admin(
    db: Session,
    status: str | None = None,
    q: str | None = None,
    page: int = 1,
    page_size: int = 50,
) -> tuple[list[dict], int]:
    """管理端列表：任何状态都可见（含 candidate/merged/hidden），并带挂载数。"""
    dc = (
        db.query(DemoTask.task_id, func.count(Demo.id).label("c"))
        .join(Demo, Demo.id == DemoTask.demo_id)
        .subquery()
    )
    demo_count_col = func.coalesce(dc.c.c, 0)
    query = (
        db.query(Task, demo_count_col.label("demo_count"))
        .outerjoin(dc, dc.c.task_id == Task.id)
    )
    if status:
        query = query.filter(Task.status == status)
    if q:
        like = f"%{q}%"
        query = query.filter(Task.title.ilike(like) | Task.description.ilike(like))
    total = query.count()
    rows = (
        query.order_by(demo_count_col.desc(), Task.created_at.desc(), Task.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    items = [
        {
            "id": t.id,
            "slug": t.slug,
            "title": t.title,
            "description": t.description,
            "category": t.category,
            "status": t.status,
            "demo_count": c,
            "merged_into_id": t.merged_into_id,
            "created_at": t.created_at,
        }
        for t, c in rows
    ]
    return items, total


def task_compare(db: Session, task: Task) -> list[dict]:
    """按模型分组的对比行（Benchmark 视图唯一数据源）：

    每模型一行：作品数 / 平均社区分 / 平均轮数 / 平均耗时 / 最好作品。
    轮数与耗时来自 v2 B5′ 收编列（AVG 自动忽略未填的行，不给 0 冒充数据）。
    deprecated 模型不参与对比（评审与重排.md §三.1：已退役不该出现在新页面）。
    """
    rows = (
        db.query(
            Model,
            func.count(func.distinct(Demo.id)),
            func.avg(case((Demo.rating_count > 0, Demo.rating_avg), else_=None)),
            func.avg(Demo.gen_rounds),
            func.avg(Demo.gen_minutes),
        )
        .join(DemoModel, DemoModel.model_id == Model.id)
        .join(Demo, Demo.id == DemoModel.demo_id)
        .join(DemoTask, DemoTask.demo_id == Demo.id)
        .filter(DemoTask.task_id == task.id, Demo.status == "approved", Model.status != "deprecated")
        .group_by(Model.id)
        .all()
    )

    best_by_model: dict[int, Demo] = {}
    for demo in (
        db.query(Demo)
        .join(DemoTask, DemoTask.demo_id == Demo.id)
        .join(DemoModel, DemoModel.demo_id == Demo.id)
        .filter(DemoTask.task_id == task.id, Demo.status == "approved")
        .order_by(Demo.rating_avg.desc(), Demo.id.asc())
        .all()
    ):
        for m in demo.model_links:
            best_by_model.setdefault(m.model_id, demo)

    out = []
    for model, count, avg, avg_rounds, avg_minutes in rows:
        best = best_by_model.get(model.id)
        out.append(
            {
                "model": {
                    "id": model.id,
                    "slug": model.slug,
                    "name": model.name,
                    "vendor": model.vendor,
                    "status": model.status,
                },
                "demo_count": count,
                "avg_rating": round(float(avg), 2) if avg is not None else None,
                "avg_rounds": round(float(avg_rounds), 1) if avg_rounds is not None else None,
                "avg_minutes": round(float(avg_minutes), 0) if avg_minutes is not None else None,
                "best_demo": (
                    {"slug": best.slug, "title": best.title, "rating_avg": best.rating_avg}
                    if best
                    else None
                ),
            }
        )
    out.sort(key=lambda r: (-(r["avg_rating"] or 0), -r["demo_count"], r["model"]["name"]))
    return out


def task_detail(db: Session, slug: str) -> dict | None:
    task = get_by_slug(db, slug)
    if task is None or task.status not in ("active", "candidate"):
        return None
    demos_total = (
        db.query(func.count(Demo.id))
        .join(DemoTask, DemoTask.demo_id == Demo.id)
        .filter(DemoTask.task_id == task.id, Demo.status == "approved")
        .scalar()
        or 0
    )
    return {
        "id": task.id,
        "slug": task.slug,
        "title": task.title,
        "description": task.description,
        "category": task.category,
        "status": task.status,
        "demos_total": demos_total,
        "compare": task_compare(db, task),
        "created_at": task.created_at,
    }


def task_chain(db: Session, task: Task, limit: int = 100) -> dict:
    """链条视图数据（题目页第 3 期方案 A）：题面 + 每件作品的 模型 / 题面一致性 / 生成过程 / 评分。

    为什么要服务端算"题面一致性"：如果挂在同一题下的作品其实用的是不同提示词，
    那就不是 benchmark，只是"主题相近的作品列表"。**结论成立的前提必须显式化**，
    不能让读者自己去比对文本。
    """
    demos = (
        db.query(Demo)
        .join(DemoTask, DemoTask.demo_id == Demo.id)
        .filter(DemoTask.task_id == task.id, Demo.status == "approved")
        .order_by(Demo.rating_avg.desc(), Demo.rating_count.desc(), Demo.id.desc())
        .limit(limit)
        .all()
    )
    # 模型归属一次批量取（按作品循环就是 N+1，本项目反复踩过）
    ids = [d.id for d in demos]
    models_by_demo: dict[int, list[dict]] = {}
    if ids:
        for demo_id, mid, slug, name, vendor, resolution in (
            db.query(DemoModel.demo_id, Model.id, Model.slug, Model.name, Model.vendor, Model.resolution)
            .join(Model, Model.id == DemoModel.model_id)
            .filter(DemoModel.demo_id.in_(ids), Model.status != "deprecated")
            .all()
        ):
            models_by_demo.setdefault(demo_id, []).append(
                {"id": mid, "slug": slug, "name": name, "vendor": vendor, "resolution": resolution}
            )
    # 基准题面：出现次数最多的 prompt_id（并列时取更早的），无提示词则为 None
    counts: dict[int, int] = {}
    for d in demos:
        if d.prompt_id:
            counts[d.prompt_id] = counts.get(d.prompt_id, 0) + 1
    canonical_id = max(counts, key=lambda k: (counts[k], -k)) if counts else None
    canonical_text = ""
    if canonical_id:
        canonical_text = db.query(Prompt.content).filter(Prompt.id == canonical_id).scalar() or ""
    rows = []
    for d in demos:
        excerpt = (d.prompt or "").strip()
        rows.append(
            {
                "slug": d.slug,
                "title": d.title,
                "models": models_by_demo.get(d.id, []),
                "prompt_id": d.prompt_id,
                # None = 这件作品没填提示词，一致性未知（不能算"一致"也不能算"不一致"）
                "same_prompt": None if not d.prompt_id else (d.prompt_id == canonical_id),
                "prompt_excerpt": excerpt[:120],
                "rounds": d.gen_rounds,
                "minutes": d.gen_minutes,
                "rating_avg": round(float(d.rating_avg or 0), 2) if d.rating_count else None,
                "rating_count": int(d.rating_count or 0),
            }
        )
    return {
        # 作者写的题面优先；没有就用基准提示词（并标注来源，不冒充作者描述）
        "brief": (task.description or "").strip() or canonical_text,
        "brief_source": "description" if (task.description or "").strip() else ("prompt" if canonical_text else ""),
        "prompt_id": canonical_id,
        "prompt_variants": len({d.prompt_id for d in demos if d.prompt_id}),
        "no_prompt_count": sum(1 for d in demos if not (d.prompt or "").strip()),
        "rows": rows,
    }


def suggest_for_demo(db: Session, title: str, description: str, prompt: str, top_k: int = 5) -> list[dict]:
    """规则层：为 demo 文本找相似既有任务，并**组装成前端能直接显示的结果**。

    分层纪律：`matching_service.suggest_task_for` 只负责算法（返回 task_id + score，
    将来换 LLM 只替换那一处）；可读字段（slug/title/作品数）在这里补齐 ——
    否则接口给出去的是一堆数字 ID，上传页拿到也没法渲染（这正是它一直没被接线的原因）。
    """
    text = " ".join(x for x in (title, description, prompt) if x)
    hits = matching_service.suggest_task_for(db, text, version=matching_service.index_version(), top_k=top_k)
    if not hits:
        return []
    ids = [h["task_id"] for h in hits]
    rows = db.query(Task).filter(Task.id.in_(ids)).all()
    by_id = {t.id: t for t in rows}
    # 每题的已上架作品数：一次批量查询，不按命中数循环
    counts = dict(
        db.query(DemoTask.task_id, func.count(DemoTask.demo_id))
        .join(Demo, Demo.id == DemoTask.demo_id)
        .filter(DemoTask.task_id.in_(ids), Demo.status == "approved")
        .group_by(DemoTask.task_id)
        .all()
    )
    out = []
    for h in hits:
        t = by_id.get(h["task_id"])
        if t is None or t.status != "active":
            continue  # 未确认/已合并的题目不该出现在挂题建议里
        out.append(
            {
                "task_id": t.id,
                "slug": t.slug,
                "title": t.title,
                "category": t.category,
                "demo_count": int(counts.get(t.id, 0)),
                "score": h["score"],
            }
        )
    return out
