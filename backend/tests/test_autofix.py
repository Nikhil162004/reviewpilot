from app.services.autofix import apply_fixes


def test_secret_moved_to_env():
    fixed, applied = apply_fixes('api_key = "[SECURITY_DATA]"\n', "app.py")
    assert 'os.environ.get("API_KEY")' in fixed
    assert fixed.startswith("import os")
    assert applied[0].rule_id == "SEC-001"


def test_weak_hash_and_verify_fixed():
    code = "import hashlib\nrequests.get(u, verify=False)\nh = hashlib.md5(b'x')\n"
    fixed, applied = apply_fixes(code, "app.py")
    assert "verify=True" in fixed
    assert "hashlib.sha256" in fixed
    assert len(applied) == 2


def test_clean_code_unchanged():
    code = "def add(a, b):\n    return a + b\n"
    fixed, applied = apply_fixes(code, "app.py")
    assert fixed == code.rstrip("\n")
    assert applied == []
