from app.services.diff_parser import parse_unified_diff

SAMPLE_DIFF = """diff --git a/app.py b/app.py
--- a/app.py
+++ b/app.py
@@ -1,3 +1,4 @@
 import os
-old_line
+api_key = "[SECURITY_DATA]"
+print(api_key)
"""


def test_parses_file_and_added_lines():
    files = parse_unified_diff(SAMPLE_DIFF)
    assert len(files) == 1
    assert files[0].path == "app.py"
    added = files[0].added_lines
    assert len(added) == 2
    # Added lines must carry new-file line numbers (GitHub inline-comment mapping)
    assert added[0].number == 2
    assert "api_key" in added[0].content


def test_removed_lines_have_no_new_line_number():
    files = parse_unified_diff(SAMPLE_DIFF)
    removed = [ln for ln in files[0].lines if ln.kind == "removed"]
    assert removed and removed[0].number == 0
