"""User accounts: PBKDF2 password hashing + HMAC-signed tokens (stdlib only).

Interview note: passwords are hashed with PBKDF2-HMAC-SHA256 (100k rounds,
per-user salt) — never stored or logged in plain text. Tokens are compact
JWT-shaped HMAC signatures; swapping to PyJWT later is a drop-in change.
"""

import base64
import hashlib
import hmac
import json
import os
import secrets
import sqlite3
import time
import uuid
from pathlib import Path

DB_PATH = Path(__file__).resolve().parents[2] / "data" / "reviews.db"
SECRET = os.environ.get("APP_SECRET", "dev-only-secret-change-me").encode()
TOKEN_TTL_SECONDS = 7 * 24 * 3600


def _connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS users ("
        "id TEXT PRIMARY KEY, email TEXT UNIQUE, password_hash TEXT, salt TEXT, created_at TEXT)"
    )
    return conn


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _hash_password(password: str, salt: str) -> str:
    return hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 100_000).hex()


def register(email: str, password: str) -> dict:
    email = email.strip().lower()
    if "@" not in email or len(password) < 6:
        raise ValueError("Enter a valid email and a password of at least 6 characters.")
    salt = secrets.token_hex(16)
    user_id = str(uuid.uuid4())[:12]
    try:
        with _connect() as conn:
            conn.execute(
                "INSERT INTO users (id, email, password_hash, salt, created_at) VALUES (?, ?, ?, ?, ?)",
                (user_id, email, _hash_password(password, salt), salt, str(int(time.time()))),
            )
    except sqlite3.IntegrityError as exc:
        raise ValueError("An account with that email already exists.") from exc
    return {"id": user_id, "email": email, "token": create_token(user_id, email)}


def login(email: str, password: str) -> dict:
    email = email.strip().lower()
    with _connect() as conn:
        row = conn.execute(
            "SELECT id, password_hash, salt FROM users WHERE email = ?", (email,)
        ).fetchone()
    if not row or not hmac.compare_digest(_hash_password(password, row[2]), row[1]):
        raise ValueError("Invalid email or password.")
    return {"id": row[0], "email": email, "token": create_token(row[0], email)}


def create_token(user_id: str, email: str) -> str:
    header = _b64(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    payload = _b64(json.dumps({"sub": user_id, "email": email, "exp": int(time.time()) + TOKEN_TTL_SECONDS}).encode())
    signature = _b64(hmac.new(SECRET, f"{header}.{payload}".encode(), hashlib.sha256).digest())
    return f"{header}.{payload}.{signature}"


def verify_token(token: str | None) -> dict | None:
    if not token:
        return None
    try:
        header, payload_b64, signature = token.removeprefix("Bearer ").split(".")
        expected = _b64(hmac.new(SECRET, f"{header}.{payload_b64}".encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(expected, signature):
            return None
        payload = json.loads(base64.urlsafe_b64decode(payload_b64 + "=" * (-len(payload_b64) % 4)))
        if payload.get("exp", 0) < int(time.time()):
            return None
        return {"id": payload["sub"], "email": payload["email"]}
    except Exception:
        return None


def user_count() -> int:
    with _connect() as conn:
        return conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
