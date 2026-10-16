from app.services.auth_service import create_token, verify_token
from app.services.llm_review import review_markdown
from app.services.testgen import generate_python_tests, generate_tests


def test_token_round_trip():
    token = create_token("u1", "a@b.com")
    user = verify_token(token)
    assert user == {"id": "u1", "email": "a@b.com"}
    assert verify_token("tampered.token.value") is None
    assert verify_token(None) is None


def test_python_test_generation():
    code = "def add(a, b):\n    return a + b\n\ndef _private():\n    pass\n"
    tests = generate_python_tests(code, "math_utils.py")
    assert "class TestAdd" in tests
    assert "_private" not in tests.split("import")[-1]
    _, name = generate_tests(code, "math_utils.py")
    assert name == "test_math_utils.py"


def test_review_markdown_contains_score_and_findings():
    review = {
        "score": 42, "grade": "F", "summary": "Found issues.",
        "stats": {"critical": 1, "high": 0, "medium": 0, "low": 0},
        "issues": [{"severity": "critical", "title": "Hardcoded secret", "file": "a.py", "line": 3,
                    "rule_id": "SEC-001", "suggestion": "Use env vars"}],
    }
    md = review_markdown(review)
    assert "42/100" in md and "SEC-001" in md
