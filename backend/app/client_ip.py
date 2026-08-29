"""统一解析访客真实 IP。

线上链路：浏览器 → Cloudflare（HTTPS 边缘）→ nginx → uvicorn。
- CF-Connecting-IP：Cloudflare 在边缘强制覆写为真实连接 IP，经 CF 的请求无法伪造（首选）；
- X-Real-IP：nginx 层写入（自建 TLS / 无 CF 部署时的可信来源）；
- request.client.host：TCP 对端兜底（本地开发 / pytest）。

不再使用 X-Forwarded-For：其首段在 CF 链路下可被客户端伪造（CF 把真实 IP 追加在
客户端自带值之后），限流与匿名评分指纹都曾被它绕过。详见 docs/运维经验与排坑记录.md §10。
"""

import ipaddress

from fastapi import Request


def _valid_ip(value: str | None) -> str | None:
    value = (value or "").strip()
    if not value:
        return None
    try:
        ipaddress.ip_address(value)
    except ValueError:
        return None
    return value


def get_client_ip(request: Request) -> str | None:
    """返回访客真实 IP；无任何可用来源时返回 None（调用方自行兜底，如 "unknown"）。"""
    for header in ("cf-connecting-ip", "x-real-ip"):
        ip = _valid_ip(request.headers.get(header))
        if ip:
            return ip
    return request.client.host if request.client else None
