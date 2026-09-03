"""规则层匹配服务（v2）：字符串规范化 + 模型别名匹配 + Task 相似召回（TF-IDF）。

设计约定（docs/deepdemosv2/Ai相关.md 四层原则）：
- 本模块是「LLM 后置」的替换点：对外签名稳定，将来只换内部实现（召回仍 TF-IDF，重排换 LLM）。
- 纯 Python 实现，无第三方依赖；SQLite 站点规模（~万级文档）内存索引毫秒级。
- 所有索引失效走显式 bump/invalidate，避免写路径读旧缓存。
"""

import math
import re
import threading
import time
import unicodedata

from sqlalchemy.orm import Session

from ..models import Model, ModelAlias, Task

_WORD_RE = re.compile(r"[a-z0-9]+")
_CJK_RE = re.compile(r"[\u4e00-\u9fff]")
_SEP_RE = re.compile(r"[\s_\-./\\()（）·:：,，、]+")

# ---------------- 第一层：确定性规则（规范化） ----------------


def normalize(s: str) -> str:
    """规范化：NFKC → 小写 → 去分隔符。别名匹配的统一键（**不用于 slug**）。"""
    s = unicodedata.normalize("NFKC", s or "").strip().lower()
    return _SEP_RE.sub("", s)


def slugify(s: str) -> str:
    """对外标识：NFKC → 小写 → 分隔符归一为单个 `-`，**只留 ASCII**（URL 可读、可分享）。

    与 normalize 的分工必须守住：normalize 负责匹配（吃掉差异），
    slug 负责对外标识。中文标题走 title 字段展示，不进 URL ——
    否则 /tasks/%E4%BB%BF%E7%9C%9F%E9%A2%98-... 这种编码串会把分享链接和 SEO 全毁掉
    （仿真实测：从中文 prompt 簇「成题」时就生成了中文 slug）。
    纯中文题面会得到 `task-N` 形式的 ASCII 兜底 slug（后续可给管理端改 slug 入口）。
    """
    s = unicodedata.normalize("NFKC", s or "").strip().lower()
    s = _SEP_RE.sub("-", s)
    s = re.sub(r"[^a-z0-9-]+", "-", s)  # 非 ASCII（含中文）一律剔除，不留进 URL
    s = re.sub(r"-{2,}", "-", s).strip("-")
    return s


# ---------------- 模型匹配：精确名 → 别名 → 规范化别名 ----------------

_ALIAS_TTL = 60  # 秒
_alias_lock = threading.Lock()
_alias_cache: dict = {"ts": 0.0, "map": {}}


def invalidate_alias_cache() -> None:
    """模型/别名写路径调用：下次匹配强制重建映射。"""
    with _alias_lock:
        _alias_cache["ts"] = 0.0
        _alias_cache["map"] = {}


def _alias_map(db: Session) -> dict[str, int]:
    """normalized 别名/名称 → model_id（60s 缓存）。

    只收**未退役**的实体：合并后源实体仍占着自己的 name，若把它放进映射，
    `setdefault` 先到先得（id 小的退役源往往先入表）会让别名指回退役实体 ——
    而序列化会过滤 deprecated，结果就是作品静默"没有模型"。
    """
    now = time.monotonic()
    with _alias_lock:
        if _alias_cache["map"] and now - _alias_cache["ts"] < _ALIAS_TTL:
            return _alias_cache["map"]
    mapping: dict[str, int] = {}
    live = Model.status != "deprecated"
    for model_id, name in db.query(Model.id, Model.name).filter(live).all():
        mapping.setdefault(normalize(name), model_id)
    for alias, model_id in (
        db.query(ModelAlias.alias, ModelAlias.model_id)
        .join(Model, Model.id == ModelAlias.model_id)
        .filter(Model.status != "deprecated")
        .all()
    ):
        mapping.setdefault(normalize(alias), model_id)
    with _alias_lock:
        _alias_cache["ts"] = now
        _alias_cache["map"] = mapping
    return mapping


_MERGE_CHAIN_MAX = 10  # 链长上限：正常 1~2 层，超过说明数据被手改坏了，宁可停在原地


def resolve_merged(db: Session, model: Model | None) -> Model | None:
    """沿 `merged_into` 链走到最终归宿（有深度上限，防环）。

    合并的语义是"这个名字不再独立存在"，所以任何按名字匹配的路径都必须跟着链走，
    否则历史标签值会把作品挂回退役实体（退役实体在序列化里被过滤 → 作品看起来没模型）。
    """
    cur = model
    for _ in range(_MERGE_CHAIN_MAX):
        if cur is None or cur.status != "deprecated" or not cur.merged_into_id:
            break
        nxt = db.get(Model, cur.merged_into_id)
        if nxt is None or nxt.id == cur.id:
            break
        cur = nxt
    return cur


def match_model(db: Session, name: str) -> Model | None:
    """模型名/别名 → Model（精确 → 规范化 → 跟随合并链）。找不到返回 None，由调用方决定是否建 candidate。"""
    raw = (name or "").strip()
    if not raw:
        return None
    hit = db.query(Model).filter(Model.name == raw).first()
    if hit is None:
        model_id = _alias_map(db).get(normalize(raw))
        hit = db.get(Model, model_id) if model_id else None
    return resolve_merged(db, hit)


# ---------------- Task 相似召回：字符 n-gram TF-IDF + 余弦（第二层算法） ----------------

_INDEX_TTL = 300  # 秒兜底重建（正常由写路径 bump 主动失效）
_idx_lock = threading.Lock()
_idx: dict = {"version": 0, "built_at": 0.0, "task_ids": [], "vectors": [], "idf": {}}


_data_gen = 0  # 数据代数：每次写路径 +1（与"索引构建于哪一代"分开记）


def bump_task_index() -> None:
    """task/prompt 写路径调用：使相似召回索引失效。

    **必须把 built_at 清零**。原实现只 `_idx["version"] += 1`，而调用方传给
    `_ensure_index` 的正是同一个 `_idx["version"]`（`index_version()` 读它）——
    两边永远相等 ⇒ `fresh` 恒真 ⇒ 写路径失效从未生效，新题最长要等 300s TTL 才搜得到。
    """
    global _data_gen
    with _idx_lock:
        _data_gen += 1
        _idx["built_at"] = 0.0


def index_version() -> int:
    """当前数据代数（调用方在 suggest 前读取，用于判断索引是否已过期）。"""
    with _idx_lock:
        return _data_gen


def index_built_gen() -> int:
    """索引构建于哪一代（诊断/测试用）。"""
    with _idx_lock:
        return int(_idx["version"])


def _tokenize(text: str) -> list[str]:
    """英文按词、中文按二元组——无 jieba 依赖的廉价分词，站内规模足够。"""
    text = unicodedata.normalize("NFKC", (text or "")).lower()
    tokens = _WORD_RE.findall(text)
    cjk = "".join(_CJK_RE.findall(text))
    tokens.extend(cjk[i : i + 2] for i in range(len(cjk) - 1))
    return tokens


def _vectorize(tokens: list[str], idf: dict[str, float]) -> dict[str, float]:
    tf: dict[str, int] = {}
    for t in tokens:
        tf[t] = tf.get(t, 0) + 1
    vec = {t: (1 + math.log(c)) * idf.get(t, 1.0) for t, c in tf.items()}
    norm = math.sqrt(sum(v * v for v in vec.values())) or 1.0
    return {t: v / norm for t, v in vec.items()}


def _build_index(db: Session) -> None:
    """对 active/candidate 任务建 TF-IDF 倒排（584 篇 <50ms；锁外查库，锁内换快照）。"""
    rows = (
        db.query(Task.id, Task.title, Task.description, Task.category)
        .filter(Task.status.in_(("active", "candidate")))
        .all()
    )
    docs = []
    for tid, title, desc, cat in rows:
        docs.append((tid, _tokenize(f"{title} {desc or ''} {cat or ''}")))

    df: dict[str, int] = {}
    for _, tokens in docs:
        for t in set(tokens):
            df[t] = df.get(t, 0) + 1
    n = max(1, len(docs))
    idf = {t: math.log((n + 1) / (c + 1)) + 1.0 for t, c in df.items()}

    task_ids = [tid for tid, _ in docs]
    vectors = [_vectorize(tokens, idf) for _, tokens in docs]

    with _idx_lock:
        _idx["task_ids"] = task_ids
        _idx["vectors"] = vectors
        _idx["idf"] = idf
        _idx["built_at"] = time.monotonic()


def _ensure_index(db: Session, version: int) -> None:
    with _idx_lock:
        fresh = _idx["built_at"] > 0 and time.monotonic() - _idx["built_at"] < _INDEX_TTL and _idx["version"] == version
    if not fresh:
        _build_index(db)
        with _idx_lock:
            _idx["version"] = version


def suggest_task_for(db: Session, text: str, version: int = 0, top_k: int = 5) -> list[dict]:
    """输入（标题/提示词/描述拼接文本）→ 最相似的既有任务。

    返回 [{task_id, score}]，score 为余弦相似度 0~1；无任务或无重合时返回 []。
    version 由调用方传入 task_service.index_version()，保证写后失效。
    """
    tokens = _tokenize(text)
    if not tokens:
        return []
    _ensure_index(db, version)
    with _idx_lock:
        task_ids = list(_idx["task_ids"])
        idf = dict(_idx["idf"])
    if not task_ids:
        return []

    qv = _vectorize(tokens, idf)
    scored: list[dict] = []
    with _idx_lock:
        vectors = list(_idx["vectors"])
    for tid, vec in zip(task_ids, vectors):
        # 稀疏向量点积（已 L2 归一化）
        score = sum(w * vec.get(t, 0.0) for t, w in qv.items())
        if score > 0.05:  # 过滤噪声级重合
            scored.append({"task_id": tid, "score": round(min(1.0, score), 4)})
    scored.sort(key=lambda x: -x["score"])
    return scored[:top_k]


# ---------------- 语料级原语（v2 B3′ 聚类复用；表示单点，LLM 后置时只换这里） ----------------


def tokenize(text: str) -> list[str]:
    """公开包装：分词口径必须与站内召回一致（英文按词、中文按二元组）。"""
    return _tokenize(text)


def vectorize_corpus(texts: list[str]) -> list[dict[str, float]]:
    """对一批文本建 TF-IDF 向量（L2 归一化，共享同一 IDF）。

    聚类规模：线上有提示词的作品 ~240 篇，两两余弦 5~6 万点积，毫秒级完成；
    超过万级需换倒排剪枝（评审与重排.md：阈值与实现都要在真实语料上调）。
    """
    docs = [_tokenize(t) for t in texts]
    df: dict[str, int] = {}
    for tokens in docs:
        for t in set(tokens):
            df[t] = df.get(t, 0) + 1
    n = max(1, len(docs))
    idf = {t: math.log((n + 1) / (c + 1)) + 1.0 for t, c in df.items()}
    return [_vectorize(tokens, idf) for tokens in docs]


def cosine(a: dict[str, float], b: dict[str, float]) -> float:
    """已归一化稀疏向量的余弦（= 点积），遍历小向量。"""
    small, big = (a, b) if len(a) <= len(b) else (b, a)
    return sum(w * big.get(t, 0.0) for t, w in small.items())
