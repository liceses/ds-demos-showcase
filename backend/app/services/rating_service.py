"""评分业务：冗余列增量更新 + 评分输出（含分布）。"""

from sqlalchemy import func
from sqlalchemy.orm import Session

from ..models import Demo, DemoRating
from ..schemas import RatingOut


def apply_rating_delta(demo: Demo, old_score: int | None, new_score: int | None) -> None:
    """增量更新 demos 冗余评分列：old_score→new_score（None 表示新增/删除）。"""
    if old_score is not None:
        demo.rating_count -= 1
        demo.rating_sum -= old_score
        if old_score == 5:
            demo.rating_god -= 1
        elif old_score == 1:
            demo.rating_ghost -= 1
    if new_score is not None:
        demo.rating_count += 1
        demo.rating_sum += new_score
        if new_score == 5:
            demo.rating_god += 1
        elif new_score == 1:
            demo.rating_ghost += 1
    demo.rating_avg = round(demo.rating_sum / demo.rating_count, 2) if demo.rating_count else 0.0


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
