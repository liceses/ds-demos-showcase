"""从 models.dev 同步模型标签到本地（手动运行）。

用法（web/ 目录下）：
    python scripts/sync_models_from_modelsdev.py
容器内：
    docker compose exec backend python /site-repo/scripts/sync_models_from_modelsdev.py

行为：新模型写 pending 建议；已有模型更新 group（厂商）；不自动建正式 Tag。
"""

import json
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from app.database import SessionLocal  # noqa: E402
from app.models import Tag, TagValueSuggestion  # noqa: E402

URL = "https://models.dev/api.json"
LIMIT = 10 * 1024 * 1024


def main() -> None:
    print("拉取 models.dev ...")
    req = urllib.request.Request(URL, headers={"User-Agent": "ds-demos-showcase/1.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = resp.read(LIMIT + 1)
    if len(data) > LIMIT:
        raise SystemExit("数据超过大小限制")
    payload = json.loads(data)

    db = SessionLocal()
    new_pending = 0
    updated_group = 0
    total_models = 0
    providers = 0
    try:
        for provider_id, provider in payload.items():
            if not isinstance(provider, dict):
                continue
            provider_name = str(provider.get("name") or provider_id)
            models = provider.get("models") or {}
            if not isinstance(models, dict):
                continue
            providers += 1
            for model_id, meta in models.items():
                if not isinstance(meta, dict):
                    continue
                total_models += 1
                value = str(meta.get("id") or model_id)
                name = str(meta.get("name") or "")
                existing = db.query(Tag).filter(Tag.key == "model", Tag.value == value).first()
                if existing is not None:
                    if existing.group != provider_name:
                        existing.group = provider_name
                        updated_group += 1
                    continue
                pending = db.query(TagValueSuggestion).filter(
                    TagValueSuggestion.key == "model",
                    TagValueSuggestion.value == value,
                    TagValueSuggestion.status == "pending",
                ).first()
                if pending is not None:
                    if pending.group != provider_name:
                        pending.group = provider_name
                        updated_group += 1
                    continue
                db.add(TagValueSuggestion(
                    key="model",
                    value=value,
                    description=name,
                    group=provider_name,
                    status="pending",
                ))
                new_pending += 1
        db.commit()
    finally:
        db.close()

    print(f"完成：厂商 {providers} 个，模型 {total_models} 个；新增 pending {new_pending}，更新 group {updated_group}")


if __name__ == "__main__":
    main()
