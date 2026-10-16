from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_security_headers_present():
    resp = client.get("/api/health")
    assert resp.headers["X-Content-Type-Options"] == "nosniff"
    assert resp.headers["X-Frame-Options"] == "DENY"
    assert "Content-Security-Policy" in resp.headers


def test_admin_requires_auth():
    assert client.get("/api/admin/analytics").status_code == 401
    assert client.get("/api/admin/analytics", headers={"Authorization": "Bearer junk"}).status_code == 401


def test_docs_disabled_outside_debug():
    assert client.get("/docs").status_code == 404
    assert client.get("/openapi.json").status_code == 404


def test_title_is_sanitized():
    resp = client.post("/api/review/code", json={
        "code": "x = 1\n", "filename": "a.py", "title": "<script>alert(1)</script>",
    })
    assert resp.status_code == 200
    assert "<" not in resp.json()["title"]


def test_path_traversal_filename_rejected():
    resp = client.post("/api/review/code", json={
        "code": "x = 1\n", "filename": "../../etc/passwd", "title": "t",
    })
    assert resp.status_code == 422


def test_title_keeps_spaces_but_strips_markup():
    from app.models.schemas import CodeReviewRequest
    r = CodeReviewRequest(title="Review of my file.py", code="x = 1\n", filename="app.py")
    assert r.title == "Review of my file.py"
    r2 = CodeReviewRequest(title="Bad<script> title", code="x = 1\n", filename="app.py")
    assert "<" not in (r2.title or "") and ">" not in (r2.title or "")
