# Architecture & Interview Defence Notes

## Why this is not a "ChatGPT wrapper"

The finding engine (`backend/app/services/analyzer.py`) is deterministic:
19 explicit rules + Python AST analysis. Identical input always produces
identical output, each finding carries a rule ID (e.g. `SEC-003`), and each
can be explained without reference to a model. An LLM, when configured,
only rewrites the summary sentence (`llm_service.py`). This mirrors how
real tools (Semgrep, CodeQL, SonarQube) work: rules first, AI second.

**Interview line:** "AI assists the presentation; engineering produces the findings."

## Key decisions

1. **Diff parser maps to new-file line numbers** (`diff_parser.py`).
   Hunk headers (`@@ -a,b +c,d @@`) reset the counter; `+` lines increment,
   `-` lines don't. This is exactly GitHub's inline-comment coordinate
   system, so findings are postable back to a PR.

2. **AST over regex where structure matters** (`_python_ast_checks`).
   Nested loops and function length need a tree, not a pattern. Regex is
   kept for token-level smells (secrets, `eval(`, `verify=False`) where
   it is reliable and language-agnostic.

3. **Scoring is a transparent penalty model.**
   critical −15, high −10, medium −5, low −2, floored at 0. Grades:
   A ≥ 90, B ≥ 75, C ≥ 60, D ≥ 40. Simple enough to explain on a whiteboard.

4. **Pydantic schemas are the contract** (`models/schemas.py`).
   Frontend TypeScript types mirror them 1:1. Change the schema, both
   sides fail loudly instead of silently drifting.

5. **SQLite, deliberately.** The store is one small module (`store.py`).
   Swapping to PostgreSQL means rewriting that file, nothing else —
   say exactly this if asked "will it scale?"

6. **Hand-written CSS, no component library.**
   A design-token system (`frontend/src/index.css`) gives a Linear/GitHub
   class of UI without a template look, and every style decision is
   explainable.

## Known limitations (state these before the interviewer finds them)

- Regex rules can flag secrets inside comments/strings — full dataflow
  analysis (CodeQL-style) is the fix, out of scope for v1.
- Diff mode sees added lines, not the whole repo; cross-file bugs need
  repo context (roadmap: clone + full-tree pass).
- GitHub integration covers public PRs via the REST diff API; private
  repos need OAuth + webhook registration (roadmap).

## Viva quick-fire

- **How do you avoid hallucinated line numbers?** Findings come from the
  parser/AST, never from a model.
- **Complexity of the diff parser?** Single pass, O(lines).
- **How would you add a language?** Add rules with a `languages` tag +
  extension mapping; the pipeline is language-agnostic.
- **How would this run on every PR in CI?** The `/api/review/diff`
  endpoint accepts a diff — a GitHub Action can fail the build when
  score < threshold or any critical exists.
