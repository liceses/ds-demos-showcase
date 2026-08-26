"""统一业务异常：router 层捕获转 HTTP 响应 {detail, code}。"""


class AppError(Exception):
    """业务异常：status_code + code + detail。"""

    def __init__(self, status_code: int, code: str, detail: str):
        self.status_code = status_code
        self.code = code
        self.detail = detail
        super().__init__(detail)
