from app.services.analyzer import analyze_code


def _rule_ids(code: str, filename: str = "app.py") -> set[str]:
    return {issue.rule_id for issue in analyze_code(code, filename, "test").issues}


def test_detects_hardcoded_secret():
    assert "SEC-001" in _rule_ids('api_key = "[SECURITY_DATA]"')


def test_detects_sql_injection_pattern():
    code = "cursor.execute(f\"SELECT * FROM users WHERE id = {user_id}\")"
    assert "SEC-003" in _rule_ids(code)


def test_detects_eval_and_mutable_default():
    ids = _rule_ids("def f(items=[]):\n    return eval(items)")
    assert "SEC-004" in ids
    assert "BUG-002" in ids


def test_clean_code_scores_high():
    code = "def add(a: int, b: int) -> int:\n    return a + b\n"
    result = analyze_code(code, "math_utils.py", "clean")
    assert result.score >= 90
    assert result.grade in ("A", "B")


def test_syntax_error_is_reported():
    assert "BUG-000" in _rule_ids("def broken(:\n    pass")


def test_score_never_negative():
    code = "\n".join('password = "[SECURITY_DATA]"' for _ in range(30))
    assert analyze_code(code, "bad.py", "bad").score == 0
