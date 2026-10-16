"""SQLite-backed review history. Stdlib only — no ORM for a store this small."""

import json
import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).resolve().parents[2] / "data" / "reviews.db"


def _connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS reviews ("
        "id TEXT PRIMARY KEY, created_at TEXT, title TEXT, payload TEXT)"
    )
    return conn


def save_review(payload: dict) -> None:
    with _connect() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO reviews (id, created_at, title, payload) VALUES (?, ?, ?, ?)",
            (payload["id"], payload["created_at"], payload["title"], json.dumps(payload)),
        )


def list_reviews(limit: int = 50) -> list[dict]:
    with _connect() as conn:
        rows = conn.execute(
            "SELECT payload FROM reviews ORDER BY created_at DESC LIMIT ?", (limit,)
        ).fetchall()
    return [json.loads(row[0]) for row in rows]


def get_review(review_id: str) -> dict | None:
    with _connect() as conn:
        row = conn.execute("SELECT payload FROM reviews WHERE id = ?", (review_id,)).fetchone()
    return json.loads(row[0]) if row else None


def dashboard_stats() -> dict:
    reviews = list_reviews(limit=200)
    if not reviews:
        return {"total_reviews": 0, "average_score": 0, "critical_issues": 0, "files_analyzed": 0}
    return {
        "total_reviews": len(reviews),
        "average_score": round(sum(r["score"] for r in reviews) / len(reviews)),
        "critical_issues": sum(r["stats"].get("critical", 0) for r in reviews),
        "files_analyzed": sum(r["stats"].get("files_changed", 0) for r in reviews),
    }


def admin_analytics() -> dict:
    reviews = list_reviews(limit=500)
    from app.services.auth_service import user_count

    rule_counts: dict[str, int] = {}
    category_counts: dict[str, int] = {}
    for review in reviews:
        for issue in review.get("issues", []):
            rule_counts[issue["rule_id"]] = rule_counts.get(issue["rule_id"], 0) + 1
            category_counts[issue["category"]] = category_counts.get(issue["category"], 0) + 1
    top_rules = sorted(rule_counts.items(), key=lambda kv: -kv[1])[:8]
    return {
        "total_users": user_count(),
        "total_reviews": len(reviews),
        "average_score": round(sum(r["score"] for r in reviews) / len(reviews)) if reviews else 0,
        "total_issues": sum(r["stats"].get("total_issues", 0) for r in reviews),
        "critical_issues": sum(r["stats"].get("critical", 0) for r in reviews),
        "top_rules": [{"rule_id": k, "count": v} for k, v in top_rules],
        "issues_by_category": category_counts,
    }
