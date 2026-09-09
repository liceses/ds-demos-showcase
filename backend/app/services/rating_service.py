"""评分业务：冗余列原子增量更新 + 评分输出（含分布）。"""

from sqlalchemy import Float, case, cast, func
from sqlalchemy.orm import Session

from ..models import Demo, DemoRating
from ..schemas import RatingOut


def apply_rating_delta(db: Session, demo: Demo, old_score: int | None, new_score: int | None) -> None:
    """增量更新 demos 冗余评分列：old_score→new_score（None 表示新增/删除）。

    KB-18：改**原子 SQL**（`SET x = x + delta`）。旧实现是 ORM 读改写
    （`demo.rating_count += 1`），两个用户同时评分都读到旧值，后写的覆盖前一次累加 →
    计数与 `demo_ratings` 实际行数漂移，`rating_avg` 又用被覆盖的 sum 重算。
    """
    count_delta = (1 if new_score is not None else 0) - (1 if old_score is not None else 0)
    sum_delta = (new_score or 0) - (old_score or 0)
    god_delta = (1 if new_score == 5 else 0) - (1 if old_score == 5 else 0)
    ghost_delta = (1 if new_score == 1 else 0) - (1 if old_score == 1 else 0)
    if not any((count_delta, sum_delta, god_delta, ghost_delta)):
        return
    db.query(Demo).filter(Demo.id == demo.id).update(
        {
            Demo.rating_count: Demo.rating_count + count_delta,
            Demo.rating_sum: Demo.rating_sum + sum_delta,
            Demo.rating_god: Demo.rating_god + god_delta,
            Demo.rating_ghost: Demo.rating_ghost + ghost_delta,
        },
        synchronize_session=False,
    )
    # 均值必须用同一事务里刚更新过的列重算（同一连接内可见）
    db.query(Demo).filter(Demo.id == demo.id).update(
        {
            Demo.rating_avg: case(
                (
                    Demo.rating_count > 0,
                    func.round(cast(Demo.rating_sum, Float) / Demo.rating_count, 2),
                ),
                else_=0.0,
            )
        },
        synchronize_session=False,
    )
    db.expire(demo)  # 让后续序列化读到库里的新值


def rating_out(db: Session, demo: Demo, rater_key: str | None) -> RatingOut:
    """评分输出：我的分 + 统计 + 1~5 分布。"""
    my = None
    if rater_key:
        row = db.query(DemoRating).filter(DemoRating.demo_id == demo.id, DemoRating.rater_key == rater_key).first()
        my = row.score if row else None
    dist_rows = (
        db.query(DemoRating.score, func.count(DemoRating.id))
        .filter(DemoRating.demo_id == demo.id)
        .group_by(DemoRating.score)
        .all()
    )
    dist_map = {score: count for score, count in dist_rows}
    distribution = [{"score": s, "count": dist_map.get(s, 0)} for s in range(1, 6)]
    return RatingOut(
        my_score=my,
        avg=demo.rating_avg,
        count=demo.rating_count,
        god=demo.rating_god,
        ghost=demo.rating_ghost,
        distribution=distribution,
    )
