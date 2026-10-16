import { useCallback, useEffect, useMemo, useState } from "react";
import { CategoryBars, ScoreTrend, SeverityDonut, TopRules } from "./components/Charts";
import CodeEditor from "./components/CodeEditor";
import CodeViewer from "./components/CodeViewer";
import IssuePanel from "./components/IssuePanel";
import ScoreRing from "./components/ScoreRing";
import { api } from "./lib/api";
import { SAMPLE_CODE, SAMPLE_DIFF } from "./lib/sample";
import type { DashboardStats, Issue, ReviewResult } from "./lib/types";

type View = "dashboard" | "new" | "history" | "detail" | "how";
type InputMode = "code" | "diff" | "github";

const SEVERITY_COLORS: Record<string, string> = {
  critical: "#c81e1e", high: "#c2410c", medium: "#b45309", low: "#64748b",
};

function formatDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
    " · " + date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function scoreClass(score: number): string {
  return score >= 75 ? "good" : score >= 50 ? "mid" : "bad";
}

function exportReport(review: ReviewResult) {
  const lines = [
    `# Code Review — ${review.title}`, "",
    `Score: ${review.score}/100 (Grade ${review.grade})`, "",
    review.summary, "", "## Issues", "",
    ...review.issues.map((i) =>
      `- **[${i.severity.toUpperCase()}] ${i.title}** (${i.rule_id}) — \`${i.file}:${i.line}\`\n  ${i.message}\n  Fix: ${i.suggestion}`),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
  const anchor = document.createElement("a");
  anchor.href = URL.createObjectURL(blob);
  anchor.download = `review-${review.id}.md`;
  anchor.click();
  URL.revokeObjectURL(anchor.href);
}

export default function App() {
  const [view, setView] = useState<View>("dashboard");
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [history, setHistory] = useState<ReviewResult[]>([]);
  const [current, setCurrent] = useState<ReviewResult | null>(null);
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);

  const [mode, setMode] = useState<InputMode>("code");
  const [code, setCode] = useState("");
  const [filename, setFilename] = useState("app.py");
  const [diff, setDiff] = useState("");
  const [prUrl, setPrUrl] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [s, h] = await Promise.all([api.getStats(), api.listReviews()]);
      setStats(s);
      setHistory(h);
    } catch {
      /* backend not up yet — dashboard renders zeros */
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const openReview = (review: ReviewResult) => {
    setCurrent(review);
    setSelectedIssue(review.issues[0] ?? null);
    setView("detail");
  };

  const runReview = async () => {
    setError(null);
    setRunning(true);
    try {
      let result: ReviewResult;
      if (mode === "code") {
        if (!code.trim()) throw new Error("Paste some code first, or load the sample code.");
        result = await api.reviewCode(code, filename || "main.py", `Review of ${filename || "pasted code"}`);
      } else if (mode === "diff") {
        if (!diff.trim()) throw new Error("Paste a git diff first, or load the sample diff.");
        result = await api.reviewDiff(diff, "Pull request diff review");
      } else {
        if (!prUrl.trim()) throw new Error("Paste a public GitHub pull request URL.");
        result = await api.reviewGitHubPR(prUrl.trim());
      }
      openReview(result);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Review failed. Is the backend running on port 8000?");
    } finally {
      setRunning(false);
    }
  };

  const severityTotal = useMemo(() => {
    if (!current) return 0;
    return current.issues.length || 1;
  }, [current]);

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <div className="brand-logo">{"</>"}</div>
            <div>
              <div className="brand-name">PR Review Assistant</div>
              <div className="brand-sub">Automated code review</div>
            </div>
          </div>
        </div>
        <nav className="nav">
          <div className="nav-label">Workspace</div>
          <button className={`nav-item ${view === "dashboard" ? "active" : ""}`} onClick={() => setView("dashboard")}><span className="nav-icon">▦</span>Dashboard</button>
          <button className={`nav-item ${view === "new" ? "active" : ""}`} onClick={() => setView("new")}><span className="nav-icon">+</span>New review</button>
          <button className={`nav-item ${view === "history" ? "active" : ""}`} onClick={() => setView("history")}><span className="nav-icon">≡</span>Review history</button>
          <div className="nav-label">Product</div>
          <button className={`nav-item ${view === "how" ? "active" : ""}`} onClick={() => setView("how")}><span className="nav-icon">?</span>How it works</button>
        </nav>
        <div className="sidebar-foot">
          <strong>Analysis engine v1.0</strong>
          19 deterministic rules · Python AST checks · GitHub diff mapping
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <span className="crumb">Workspace</span>
          <span className="crumb">/</span>
          <h1>{view === "dashboard" ? "Dashboard" : view === "new" ? "New review" : view === "history" ? "Review history" : view === "detail" ? "Review report" : "How it works"}</h1>
          <span className="status-dot">Engine operational</span>
        </header>

        <div className="content">
          {view === "dashboard" && (
            <>
              <div className="page-head">
                <div>
                  <h2>Code review overview</h2>
                  <p>Every review runs a deterministic analysis engine — security, bug, performance and style rules plus Python AST checks. Results are reproducible and explainable.</p>
                </div>
                <div className="spacer" />
                <button className="btn btn-primary" onClick={() => setView("new")}>+ New review</button>
              </div>

              <div className="stats-grid">
                <div className="card stat-card"><div className="stat-label">Total reviews</div><div className="stat-value">{stats?.total_reviews ?? 0}</div><div className="stat-hint">Stored in local history</div></div>
                <div className="card stat-card"><div className="stat-label">Average score</div><div className="stat-value">{stats?.average_score ?? "—"}</div><div className="stat-hint">Out of 100, across reviews</div></div>
                <div className="card stat-card"><div className="stat-label">Critical issues found</div><div className="stat-value" style={{ color: stats?.critical_issues ? "#c81e1e" : undefined }}>{stats?.critical_issues ?? 0}</div><div className="stat-hint">Secrets, injection, unsafe code</div></div>
                <div className="card stat-card"><div className="stat-label">Files analyzed</div><div className="stat-value">{stats?.files_analyzed ?? 0}</div><div className="stat-hint">Across all reviews</div></div>
              </div>

              <div className="analytics-grid">
                <div className="card card-pad"><div className="section-title">Issue severity mix</div><div className="section-sub" style={{ marginBottom: 12 }}>Across all stored reviews</div><SeverityDonut reviews={history} /></div>
                <div className="card card-pad"><div className="section-title">Score trend</div><div className="section-sub" style={{ marginBottom: 12 }}>Latest review scores</div><ScoreTrend reviews={history} /></div>
                <div className="card card-pad"><div className="section-title">Most triggered rules</div><div className="section-sub" style={{ marginBottom: 12 }}>Where your code fails most</div><TopRules reviews={history} /></div>
              </div>

              <div className="card">
                <div className="card-pad" style={{ paddingBottom: 8 }}>
                  <div className="section-title">Recent reviews</div>
                  <div className="section-sub">Select a review to open its full report.</div>
                </div>
                {history.length === 0 ? (
                  <div className="empty"><strong>No reviews yet</strong>Run your first review — the sample code takes about two seconds.<br /><br /><button className="btn btn-primary" onClick={() => setView("new")}>Start a review</button></div>
                ) : (
                  <table className="table">
                    <thead><tr><th>Review</th><th>Source</th><th>Issues</th><th>Score</th><th>Date</th></tr></thead>
                    <tbody>
                      {history.slice(0, 8).map((r) => (
                        <tr key={r.id} onClick={() => openReview(r)}>
                          <td style={{ fontWeight: 550 }}>{r.title}</td>
                          <td style={{ textTransform: "capitalize", color: "#5b6472" }}>{r.source}</td>
                          <td>{r.stats.total_issues} ({r.stats.critical ?? 0} critical)</td>
                          <td><span className={`score-chip ${scoreClass(r.score)}`}>{r.score}</span></td>
                          <td style={{ color: "#5b6472" }}>{formatDate(r.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}

          {view === "new" && (
            <>
              <div className="page-head">
                <div>
                  <h2>Run a new review</h2>
                  <p>Paste code, paste a git diff, or link a public GitHub pull request. Only changed lines are flagged in diff mode — the same way a human reviewer works.</p>
                </div>
              </div>
              {error && <div className="error-box">{error}</div>}
              <div className="tabs">
                <button className={`tab ${mode === "code" ? "active" : ""}`} onClick={() => setMode("code")}>Paste code</button>
                <button className={`tab ${mode === "diff" ? "active" : ""}`} onClick={() => setMode("diff")}>Git diff</button>
                <button className={`tab ${mode === "github" ? "active" : ""}`} onClick={() => setMode("github")}>GitHub PR</button>
              </div>

              <div className="card card-pad">
                {mode === "code" && (
                  <>
                    <div className="form-row">
                      <div className="field"><label>Filename (sets language rules)</label><input type="text" value={filename} onChange={(e) => setFilename(e.target.value)} placeholder="app.py" /></div>
                      <div className="field"><label>Try it instantly</label><button className="btn btn-ghost" onClick={() => { setCode(SAMPLE_CODE); setFilename("app.py"); }}>Load sample vulnerable code</button></div>
                    </div>
                    <CodeEditor value={code} onChange={setCode} placeholder={"Paste Python, JavaScript, TypeScript, Java, Go, Ruby or PHP code here…"} />
                  </>
                )}
                {mode === "diff" && (
                  <>
                    <div className="field"><label>Unified git diff</label><button className="btn btn-ghost btn-small" onClick={() => setDiff(SAMPLE_DIFF)}>Load sample diff</button></div>
                    <textarea className="code-input" value={diff} onChange={(e) => setDiff(e.target.value)} placeholder={"diff --git a/app.py b/app.py\n--- a/app.py\n+++ b/app.py\n@@ -1,3 +1,4 @@\n+new_code_here()"} spellCheck={false} />
                  </>
                )}
                {mode === "github" && (
                  <div className="field">
                    <label>Public GitHub pull request URL</label>
                    <input type="text" value={prUrl} onChange={(e) => setPrUrl(e.target.value)} placeholder="https://github.com/owner/repo/pull/123" />
                    <div className="section-sub" style={{ marginTop: 8 }}>Public repos work without a token. Private repo support (OAuth + webhooks) is on the roadmap in the README.</div>
                  </div>
                )}
                <div className="toolbar">
                  <button className="btn btn-primary" onClick={runReview} disabled={running}>{running ? "Analyzing…" : "Run review"}</button>
                  <span className="section-sub">Deterministic engine · no code leaves your machine in paste/diff mode</span>
                </div>
              </div>
            </>
          )}

          {view === "history" && (
            <>
              <div className="page-head"><div><h2>Review history</h2><p>All reviews stored locally in SQLite.</p></div></div>
              <div className="card">
                {history.length === 0 ? (
                  <div className="empty"><strong>No reviews yet</strong>Your completed reviews will appear here.</div>
                ) : (
                  <table className="table">
                    <thead><tr><th>Review</th><th>Source</th><th>Files</th><th>Issues</th><th>Score</th><th>Date</th></tr></thead>
                    <tbody>
                      {history.map((r) => (
                        <tr key={r.id} onClick={() => openReview(r)}>
                          <td style={{ fontWeight: 550 }}>{r.title}</td>
                          <td style={{ textTransform: "capitalize", color: "#5b6472" }}>{r.source}</td>
                          <td>{r.stats.files_changed}</td>
                          <td>{r.stats.total_issues}</td>
                          <td><span className={`score-chip ${scoreClass(r.score)}`}>{r.score}</span></td>
                          <td style={{ color: "#5b6472" }}>{formatDate(r.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}

          {view === "detail" && current && (
            <>
              <div className="card review-head">
                <ScoreRing score={current.score} grade={current.grade} />
                <div>
                  <h2>{current.title}</h2>
                  <div className="review-meta">{formatDate(current.created_at)} · {current.stats.files_changed} file(s) · {current.stats.lines_added} line(s) added · Source: {current.source}</div>
                  <p className="review-summary">{current.summary}</p>
                  <div className="sev-bar">
                    {(["critical", "high", "medium", "low"] as const).map((sev) => (
                      <span key={sev} style={{ width: `${((current.stats[sev] ?? 0) / severityTotal) * 100}%`, background: SEVERITY_COLORS[sev] }} />
                    ))}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <button className="btn btn-ghost" onClick={() => exportReport(current)}>Export report (.md)</button>
                  <button className="btn btn-primary" onClick={() => setView("new")}>New review</button>
                </div>
              </div>

              {current.metrics && (
                <div className="metrics-strip">
                  <div className="card metric-card"><div className="metric-label">Lines analyzed</div><div className="metric-value">{current.metrics.total_lines ?? "—"}</div></div>
                  <div className="card metric-card"><div className="metric-label">Functions</div><div className="metric-value">{current.metrics.function_count ?? "—"}</div></div>
                  <div className="card metric-card"><div className="metric-label">Cyclomatic complexity</div><div className="metric-value">{current.metrics.cyclomatic_complexity ?? "—"}</div></div>
                  <div className="card metric-card"><div className="metric-label">Comment ratio</div><div className="metric-value">{current.metrics.comment_ratio ?? 0}%</div></div>
                  <div className="card metric-card"><div className="metric-label">Issues / 100 lines</div><div className="metric-value">{current.metrics.total_lines ? ((current.issues.length / current.metrics.total_lines) * 100).toFixed(1) : "0"}</div></div>
                </div>
              )}

              <div className="detail-grid-3">
                <div>
                  <div className="card file-tree" style={{ marginBottom: 16 }}>
                    <div className="section-title" style={{ padding: "6px 10px" }}>Files changed</div>
                    {current.files.map((f) => (
                      <button key={f.path} className="file-tree-item" onClick={() => document.getElementById(`file-${f.path}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.path.split("/").pop()}</span>
                        <span className={`file-count ${f.issue_count === 0 ? "clean" : ""}`}>{f.issue_count}</span>
                      </button>
                    ))}
                  </div>
                  {current.category_scores && (
                    <div className="card card-pad">
                      <div className="section-title" style={{ marginBottom: 14 }}>Category scores</div>
                      <CategoryBars scores={current.category_scores} />
                    </div>
                  )}
                </div>
                <div>
                  {current.file_contents.map((file) => (
                    <div key={file.path} id={`file-${file.path}`}>
                      <CodeViewer file={file} issues={current.issues}
                        selectedIssueId={selectedIssue?.id ?? null} onSelectIssue={setSelectedIssue} />
                    </div>
                  ))}
                </div>
                <IssuePanel issues={current.issues} selectedIssueId={selectedIssue?.id ?? null} onSelectIssue={setSelectedIssue} />
              </div>
            </>
          )}

          {view === "how" && (
            <>
              <div className="page-head"><div><h2>How it works</h2><p>Built to be explainable in an interview — no black box.</p></div></div>
              <div className="how-grid">
                <div className="card how-card"><div className="how-num">01 — INGEST</div><h3>Three input modes</h3><p>Pasted code is analyzed in full. Diffs and GitHub PRs are parsed with a unified-diff parser that maps every added line to its new-file line number — exactly how GitHub places inline comments.</p></div>
                <div className="card how-card"><div className="how-num">02 — ANALYZE</div><h3>Rules + AST, not vibes</h3><p>19 deterministic rules cover hardcoded secrets, SQL injection, unsafe deserialization, N+1 patterns and more. Python files also get AST checks for syntax errors, over-long functions and nested loops. Same input, same output — every time.</p></div>
                <div className="card how-card"><div className="how-num">03 — REPORT</div><h3>Scored, ranked, fixable</h3><p>Findings are ranked critical → low and scored out of 100. Each issue carries a rule ID, an explanation, and where possible a copy-paste fix. An optional LLM layer can polish the summary — it never invents findings.</p></div>
              </div>
              <div className="card card-pad" style={{ marginTop: 16 }}>
                <div className="section-title">Design decisions you can defend</div>
                <p className="section-sub" style={{ marginTop: 8, lineHeight: 1.8 }}>
                  · Why not just call ChatGPT? — LLM-only reviews hallucinate line numbers and miss deterministic patterns; grounding findings in rules/AST keeps them reproducible.<br />
                  · Why FastAPI + React? — Python owns the analysis ecosystem; React owns the review UI; the API contract (Pydantic schemas) keeps them decoupled.<br />
                  · Why SQLite? — Zero-config persistence sized for the problem; the store layer is isolated so swapping to PostgreSQL is a one-file change.<br />
                  · Known limits — regex rules can false-positive on comments/strings; full-repo context and GitHub OAuth for private repos are roadmap items (see README).
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
