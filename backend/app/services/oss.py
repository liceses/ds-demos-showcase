"""阿里云 OSS 上传/删除帮助（服务端仍用私钥签名写，公网读走公有读 URL）。"""

import os
from typing import BinaryIO

import oss2

from ..config import settings


def _auth() -> oss2.Auth:
    return oss2.Auth(settings.oss_access_key_id, settings.oss_access_key_secret)


def _bucket() -> oss2.Bucket:
    return oss2.Bucket(_auth(), f"https://{settings.oss_endpoint}", settings.oss_bucket)


def enabled() -> bool:
    return settings.oss_enabled


def public_url(key: str) -> str:
    """返回公有读 URL（需 bucket 为公有读，或对象有公共读 ACL）。"""
    return f"{settings.oss_public_base}/{key}"


def put_bytes(key: str, data: bytes, content_type: str | None = None, extra_headers: dict[str, str] | None = None) -> None:
    if not enabled():
        return
    headers: dict[str, str] = dict(extra_headers or {})
    if content_type:
        headers["Content-Type"] = content_type
    _bucket().put_object(key, data, headers=headers)


def put_file(
    key: str,
    local_path: os.PathLike | str,
    content_type: str | None = None,
    extra_headers: dict[str, str] | None = None,
) -> None:
    if not enabled():
        return
    headers: dict[str, str] = dict(extra_headers or {})
    if content_type:
        headers["Content-Type"] = content_type
    with open(local_path, "rb") as f:
        _bucket().put_object(key, f, headers=headers)


def get_bytes(key: str) -> bytes | None:
    if not enabled():
        return None
    try:
        result = _bucket().get_object(key)
        return result.read()
    except oss2.exceptions.NoSuchKey:
        return None


def object_exists(key: str) -> bool:
    if not enabled():
        return False
    try:
        return _bucket().object_exists(key)
    except oss2.exceptions.OssError:
        return False


def delete_object(key: str) -> None:
    if not enabled():
        return
    try:
        _bucket().delete_object(key)
    except oss2.exceptions.OssError:
        pass


def list_prefix(prefix: str) -> list[dict]:
    """列出某前缀下的对象信息（key / size / last_modified）。"""
    if not enabled():
        return []
    bucket = _bucket()
    out = []
    for obj in oss2.ObjectIterator(bucket, prefix=prefix):
        out.append({
            "key": obj.key,
            "size": obj.size,
            "last_modified": obj.last_modified,
        })
    return out


def delete_prefix(prefix: str) -> None:
    """删除某前缀下的所有对象（演示用，默认每次最多 1000 个）。"""
    if not enabled():
        return
    bucket = _bucket()
    for obj in oss2.ObjectIterator(bucket, prefix=prefix):
        bucket.delete_object(obj.key)