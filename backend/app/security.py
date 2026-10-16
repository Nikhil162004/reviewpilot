"""HTTP hardening: per-IP rate limiting + security headers.

Rate limiting is in-memory and per-process — correct for a single-instance
deployment. If this ever runs behind multiple workers/replicas, move the
counters to Redis; the middleware interface would not change.
"""

import json
import time
from collections import defaultdict, deque

WINDOW_SECONDS = 60
LIMITS = [
    ("/api/auth/", 10),          # credential endpoints: strict
    ("/api/llm/", 20),           # paid/keys endpoints
    ("/api/github/comment", 20),
    ("/api/webhooks/", 60),
    ("/api/", 600),              # general API ceiling
]

SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "Cache-Control": "no-store",
}


class RateLimiter:
    def __init__(self) -> None:
        self.hits: dict[str, deque[float]] = defaultdict(deque)

    def allow(self, key: str, limit: int) -> bool:
        now = time.time()
        bucket = self.hits[key]
        while bucket and bucket[0] < now - WINDOW_SECONDS:
            bucket.popleft()
        if len(bucket) >= limit:
            return False
        bucket.append(now)
        return True


def _limit_for(path: str) -> int | None:
    for prefix, limit in LIMITS:
        if path.startswith(prefix):
            return limit
    return None


class SecurityMiddleware:
    """Pure ASGI middleware: rate limit first, then stamp headers."""

    def __init__(self, app) -> None:
        self.app = app
        self.limiter = RateLimiter()

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path: str = scope.get("path", "")
        client = scope.get("client")
        ip = client[0] if client else "unknown"
        limit = _limit_for(path)
        if limit is not None and not self.limiter.allow(f"{ip}:{path.split('/')[2] if len(path.split('/')) > 2 else path}", limit):
            body = json.dumps({"detail": "Too many requests — please wait a minute and try again."}).encode()
            await send({
                "type": "http.response.start", "status": 429,
                "headers": [(b"content-type", b"application/json"), (b"retry-after", b"60"),
                            *[(k.lower().encode(), v.encode()) for k, v in SECURITY_HEADERS.items()]],
            })
            await send({"type": "http.response.body", "body": body})
            return

        async def send_with_headers(message):
            if message["type"] == "http.response.start":
                headers = [(k.lower(), v) for k, v in message.get("headers", [])]
                existing = {k.decode() for k, _ in headers}
                for name, value in SECURITY_HEADERS.items():
                    if name.lower() not in existing:
                        headers.append((name.lower().encode(), value.encode()))
                message = {**message, "headers": headers}
            await send(message)

        await self.app(scope, receive, send_with_headers)
