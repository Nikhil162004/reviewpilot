import { useCallback, useEffect, useState } from "react";
import { CategoryBars, ScoreTrend, SeverityDonut, TopRules } from "./components/Charts";
import CodeViewer from "./components/CodeViewer";
import IssuePanel from "./components/IssuePanel";
import ScoreRing from "./components/ScoreRing";
import SyntaxEditor from "./components/SyntaxEditor";
import { api } from "./lib/api";
import { SAMPLE_CLEAN, SAMPLE_CODE, SAMPLE_DIFF, SAMPLE_JS } from "./lib/sample";
import type { DashboardStats, Issue, ReviewResult } from "./lib/types";

type View = "workspace" | "dashboard" | "history" | "how";
type InputMode = "code" | "diff" | "github";
type CenterMode = "editor" | "report";
type RightTab = "issues" | "chat" | "metrics";

interface ChatMessage { role: "user" | "assistant"; text: string }
interface PrItem { number: number; title: string; author: string; url: string; updated_at: string }

const SAMPLE_FILES = [
  { name: "app.py", label: "app.py — vulnerable service", code: SAMPLE_CODE, filename: "app.py" },
  { name: "clean_utils.py", label: "clean_utils.py — clean baseline", code: SAMPLE_CLEAN, filename: "clean_utils.py" },
  { name: "server.js", label: "server.js — express API", code: SAMPLE_JS, filename: "server.js" },
];

const SEVERITY_COLORS: Record<string, string> = {
  critical: "#f85149", high: "#fb8500", medium: "#d29922", low: "#8b949e",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " · " +
    d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}
function scoreClass(score: number): string { return score >= 75 ? "good" : score >= 50 ? "mid" : "bad"; }

function exportReport(review: ReviewResult) {
  const lines = [
    `# Code Review — ${review.title}`, "",
    `Score: ${review.score}/100 (Grade ${review.grade})`, "", review.summary, "", "## Issues", "",
    ...review.issues.map((i) => `- **[${i.severity.toUpperCase()}] ${i.title}** (${i.rule_id}) — \`${i.file}:${i.line}\`\n  ${i.message}\n  Fix: ${i.suggestion}`),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `review-${review.id}.md`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function App() {
  const [view, setView] = useState<View>("workspace");
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [history, setHistory] = useState<ReviewResult[]>([]);
  const [current, setCurrent] = useState<ReviewResult | null>(null);
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);

  const [mode, setMode] = useState<InputMode>("code");
  const [centerMode, setCenterMode] = useState<CenterMode>("editor");
  const [rightTab, setRightTab] = useState<RightTab>("issues");
  const [code, setCode] = useState(SAMPLE_CODE);
  const [filename, setFilename] = useState("app.py");
  const [activeSample, setActiveSample] = useState("app.py");
  const [diff, setDiff] = useState("");
  const [prUrl, setPrUrl] = useState("");
  const [repo, setRepo] = useState("");
  const [prs, setPrs] = useState<PrItem[]>([]);
  const [loadingPrs, setLoadingPrs] = useState(false);
  const [running, setRunning] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>(["[engine] PR Review Assistant ready — 19 rules loaded, AST checks enabled"]);
  const [fixNotice, setFixNotice] = useState<string | null>(null);
  const [chat, setChat] = useState<ChatMessage[]>([
    { role: "assistant", text: "I am your review assistant. Run a review, then ask me to explain any finding, suggest a fix, or judge whether this code is safe to merge." },
  ]);
  const [chatInput, setChatInput] = useState("");

  const refresh = useCallback(async () => {
    try {
      const [s, h] = await Promise.all([api.getStats(), api.listReviews()]);
      setStats(s); setHistory(h);
    } catch { /* backend warming up */ }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const pushLog = (line: string) =>
    setLogs((prev) => [...prev.slice(-40), `[${new Date().toLocaleTimeString()}] ${line}`]);

  const openReview = (review: ReviewResult) => {
    setCurrent(review);
    setSelectedIssue(review.issues[0] ?? null);
    setCenterMode("report");
    setRightTab("issues");
    setView("workspace");
  };

  const runReview = async (codeOverride?: string) => {
    setError(null); setFixNotice(null); setRunning(true);
    pushLog(`review started (${mode} mode)`);
    try {
      let result: ReviewResult;
      if (mode === "code") {
        const source = codeOverride ?? code;
        if (!source.trim()) throw new Error("Paste some code first, or pick a workspace file on the left.");
        pushLog("parsing source · running 19 rules + AST checks");
        result = await api.reviewCode(source, filename || "main.py", `Review of ${filename || "pasted code"}`);
      } else if (mode === "diff") {
        if (!diff.trim()) throw new Error("Paste a git diff first, or load the sample diff.");
        pushLog("parsing unified diff · mapping added lines to new-file numbers");
        result = await api.reviewDiff(diff, "Pull request diff review");
      } else {
        if (!prUrl.trim()) throw new Error("Paste a public GitHub PR URL, or browse a repo below.");
        pushLog("fetching PR diff from GitHub API");
        result = await api.reviewGitHubPR(prUrl.trim());
      }
      pushLog(`review complete — score ${result.score}/100 · ${result.issues.length} issue(s)`);
      openReview(result);
      refresh();
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Review failed. Is the backend running on port 8000?";
      setError(msg); pushLog(`error — ${msg}`);
      return null;
    } finally { setRunning(false); }
  };

  const applyAutoFix = async () => {
    if (mode !== "code") { setError("Auto-fix works in Paste code mode. Switch to a workspace file first."); return; }
    setFixing(true); setError(null);
    try {
      const before = current && centerMode === "report" ? current.score : null;
      const result = await api.applyFixes(code, filename);
      if (!result.applied.length) {
        setFixNotice("No safe automatic fixes for this code — the remaining issues need a human decision. See the issue list for guidance.");
        pushLog("auto-fix — no conservative fixes matched");
        return;
      }
      setCode(result.fixed_code);
      setCenterMode("editor");
      pushLog(`auto-fix applied ${result.applied.length} fix(es): ${result.applied.map((f) => f.rule_id).join(", ")}`);
      const after = await runReview(result.fixed_code);
      setFixNotice(
        `Applied ${result.applied.length} fix(es): ${result.applied.map((f) => f.description).join(" · ")}` +
        (before !== null && after ? `  Score ${before} → ${after.score}.` : ""),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Auto-fix failed.");
    } finally { setFixing(false); }
  };

  const loadPrs = async () => {
    setLoadingPrs(true); setError(null);
    try {
      const items = await api.listGitHubPRs(repo);
      setPrs(items);
      pushLog(`GitHub — loaded ${items.length} open PR(s) from ${repo}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load PRs.");
    } finally { setLoadingPrs(false); }
  };

  const answerChat = (question: string): string => {
    const q = question.toLowerCase();
    if (!current) return "Run a review first (green button, top right) — then I can explain its findings, fixes and merge-readiness from real data.";
    const worst = current.issues[0];
    if (q.includes("worst") || q.includes("critical") || q.includes("danger"))
      return worst
        ? `The most serious finding is [${worst.severity.toUpperCase()}] ${worst.title} at ${worst.file}:${worst.line} (${worst.rule_id}). ${worst.message} Fix: ${worst.suggestion}`
        : "No serious findings — the engine found nothing critical or high in this review.";
    if (q.includes("security")) {
      const sec = current.issues.filter((i) => i.category === "security");
      return sec.length
        ? `Found ${sec.length} security issue(s): ${sec.map((i) => `${i.title} (${i.file}:${i.line})`).join("; ")}. Start with the critical ones — secrets and injection flaws are exploitable today, not theoretical.`
        : "No security issues found by the rule engine. Still get a human to check auth logic — rules cannot judge business-logic access control.";
    }
    if (q.includes("fix"))
      return worst?.suggested_fix
        ? `For the top issue (${worst.title}), the suggested fix is:\n\n${worst.suggested_fix}\n\nOr press 'Auto-fix' in the toolbar — I can apply the safe, mechanical fixes automatically and re-score the code.`
        : "Use Auto-fix in the toolbar for mechanical fixes (secrets, weak hashes, TLS, bare except). Logic issues list a recommendation in each issue card.";
    if (q.includes("merge") || q.includes("pass") || q.includes("safe"))
      return current.score >= 75 && !current.issues.some((i) => i.severity === "critical")
        ? `Score ${current.score}/100 (grade ${current.grade}) with no critical findings — this looks mergeable after a human skim of the medium/low items.`
        : `Not yet. Score is ${current.score}/100 with ${current.stats.critical ?? 0} critical and ${current.stats.high ?? 0} high-severity finding(s). Fix those first — the score widget turns green at 75+.`;
    if (q.includes("score") || q.includes("grade"))
      return `Score ${current.score}/100, grade ${current.grade}. Scoring is a transparent penalty model: critical −15, high −10, medium −5, low −2. Category scores are on the Metrics tab.`;
    if (q.includes("summar"))
      return current.summary;
    return `This review has ${current.issues.length} issue(s) across ${current.stats.files_changed} file(s), score ${current.score}/100. Ask me about the worst issue, security, fixes, or whether it is safe to merge — or click any issue and ask about it.`;
  };

  const sendChat = (text?: string) => {
    const message = (text ?? chatInput).trim();
    if (!message) return;
    setChat((prev) => [...prev, { role: "user", text: message }, { role: "assistant", text: answerChat(message) }]);
    setChatInput("");
  };

  const severityTotal = current?.issues.length || 1;

  const navItem = (v: View, icon: string, label: string) => (
    <button className={`activity-btn ${view === v ? "active" : ""}`} onClick={() => setView(v)} title={label}>
      <span className="activity-icon">{icon}</span><span className="activity-label">{label}</span>
    </button>
  );

  return (
    <div className="shell">
      {/* Activity bar */}
      <aside className="activity">
        <div className="activity-logo">{"</>"}</div>
        {navItem("workspace", "◈", "Review")}
        {navItem("dashboard", "▦", "Dash")}
        {navItem("history", "≡", "History")}
        {navItem("how", "?", "Guide")}
        <div className="activity-bottom"><div className="avatar">AK</div></div>
      </aside>

      {/* Explorer */}
      {view === "workspace" && (
        <aside className="explorer">
          <div className="explorer-head">EXPLORER</div>
          <div className="explorer-section">Workspace files</div>
          {SAMPLE_FILES.map((f) => (
            <button key={f.name} className={`explorer-file ${activeSample === f.name && mode === "code" ? "active" : ""}`}
              onClick={() => { setCode(f.code); setFilename(f.filename); setActiveSample(f.name); setMode("code"); setCenterMode("editor"); }}>
              <span className="file-dot" data-lang={f.filename.endsWith(".js") ? "js" : "py"}>{f.filename.endsWith(".js") ? "JS" : "Py"}</span>
              <span className="explorer-file-name">{f.label}</span>
            </button>
          ))}
          <div className="explorer-section">Recent reviews</div>
          {history.length === 0 && <div className="explorer-empty">No reviews yet — run one.</div>}
          {history.slice(0, 6).map((r) => (
            <button key={r.id} className="explorer-file" onClick={() => openReview(r)}>
              <span className={`score-mini ${scoreClass(r.score)}`}>{r.score}</span>
              <span className="explorer-file-name">{r.title}</span>
            </button>
          ))}
          <div className="explorer-section">Engine</div>
          <div className="explorer-meta">
            19 rules · AST checks<br />Auto-fix · GitHub API<br />Deterministic scoring
          </div>
        </aside>
      )}

      {/* Main column */}
      <div className="maincol">
        <header className="topbar2">
          <div className="crumbs">
            <strong>PR Review Assistant</strong>
            <span>/</span><span>{view === "workspace" ? (centerMode === "report" && current ? current.title : filename) : view}</span>
          </div>
          <div className="topbar-actions">
            {current && <span className={`score-chip ${scoreClass(current.score)}`}>Score {current.score}</span>}
            <span className="status-dot">Engine operational</span>
            {view === "workspace" && (
              <>
                <button className="btn btn-ghost" onClick={applyAutoFix} disabled={fixing || running}>⚡ {fixing ? "Fixing…" : "Auto-fix"}</button>
                <button className="btn btn-accent" onClick={() => runReview()} disabled={running}>{running ? "Analyzing…" : "Run review"}</button>
              </>
            )}
          </div>
        </header>

        {view === "workspace" && (
          <>
            <div className="modebar">
              <div className="tabs">
                <button className={`tab ${mode === "code" ? "active" : ""}`} onClick={() => setMode("code")}>Code</button>
                <button className={`tab ${mode === "diff" ? "active" : ""}`} onClick={() => setMode("diff")}>Git diff</button>
                <button className={`tab ${mode === "github" ? "active" : ""}`} onClick={() => setMode("github")}>GitHub PR</button>
              </div>
              <div className="tabs">
                <button className={`tab ${centerMode === "editor" ? "active" : ""}`} onClick={() => setCenterMode("editor")}>Editor</button>
                <button className={`tab ${centerMode === "report" ? "active" : ""}`} onClick={() => current && setCenterMode("report")} disabled={!current}>Report{current ? ` (${current.issues.length})` : ""}</button>
              </div>
              <input className="filename-input mono" value={filename} onChange={(e) => setFilename(e.target.value)} aria-label="Filename" />
            </div>

            {error && <div className="error-box" style={{ margin: "14px 18px 0" }}>{error}</div>}
            {fixNotice && <div className="notice-box" style={{ margin: "14px 18px 0" }}>⚡ {fixNotice}</div>}

            <div className="workspace-grid">
              <section className="centerpane">
                {centerMode === "editor" ? (
                  mode === "github" ? (
                    <div className="card card-pad github-panel">
                      <div className="section-title">Review a real GitHub pull request</div>
                      <p className="section-sub" style={{ marginBottom: 16 }}>Public repos need no token. Paste a PR link, or browse open PRs of any public repo.</p>
                      <div className="field"><label>Pull request URL</label>
                        <input type="text" value={prUrl} onChange={(e) => setPrUrl(e.target.value)} placeholder="https://github.com/owner/repo/pull/123" /></div>
                      <div className="gh-row">
                        <div className="field" style={{ flex: 1, marginBottom: 0 }}><label>Browse a repo</label>
                          <input type="text" value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="facebook/react or https://github.com/facebook/react" /></div>
                        <button className="btn btn-ghost" onClick={loadPrs} disabled={loadingPrs || !repo.trim()}>{loadingPrs ? "Loading…" : "List open PRs"}</button>
                      </div>
                      {prs.map((pr) => (
                        <button key={pr.number} className="pr-row" onClick={() => { setPrUrl(pr.url); pushLog(`selected PR #${pr.number} — press Run review`); }}>
                          <span className="mono" style={{ color: "#3fb950", fontWeight: 700 }}>#{pr.number}</span>
                          <span style={{ flex: 1, textAlign: "left" }}>{pr.title}</span>
                          <span className="section-sub">@{pr.author}</span>
                        </button>
                      ))}
                      {prs.length > 0 && <p className="section-sub" style={{ marginTop: 10 }}>Select a PR, then press <strong>Run review</strong> (top right).</p>}
                    </div>
                  ) : mode === "diff" ? (
                    <div style={{ padding: 18 }}>
                      <div className="toolbar" style={{ margin: "0 0 12px" }}>
                        <button className="btn btn-ghost btn-small" onClick={() => setDiff(SAMPLE_DIFF)}>Load sample diff</button>
                        <span className="section-sub">Only added lines are flagged — like a human reviewer.</span>
                      </div>
                      <SyntaxEditor value={diff} onChange={setDiff} placeholder={"diff --git a/app.py b/app.py\n--- a/app.py\n+++ b/app.py\n@@ -1,3 +1,4 @@\n+new_code_here()"} />
                    </div>
                  ) : (
                    <SyntaxEditor value={code} onChange={setCode} placeholder="Paste code here, or pick a workspace file on the left…" />
                  )
                ) : current ? (
                  <div style={{ padding: 18, overflowY: "auto" }}>
                    <div className="card review-head">
                      <ScoreRing score={current.score} grade={current.grade} />
                      <div>
                        <h2>{current.title}</h2>
                        <div className="review-meta">{formatDate(current.created_at)} · {current.stats.files_changed} file(s) · {current.stats.lines_added} line(s) · {current.source}</div>
                        <p className="review-summary">{current.summary}</p>
                        <div className="sev-bar">
                          {(["critical", "high", "medium", "low"] as const).map((sev) => (
                            <span key={sev} style={{ width: `${((current.stats[sev] ?? 0) / severityTotal) * 100}%`, background: SEVERITY_COLORS[sev] }} />
                          ))}
                        </div>
                      </div>
                      <button className="btn btn-ghost" onClick={() => exportReport(current)}>Export .md</button>
                    </div>
                    {current.file_contents.map((file) => (
                      <div key={file.path} id={`file-${file.path}`}>
                        <CodeViewer file={file} issues={current.issues} selectedIssueId={selectedIssue?.id ?? null} onSelectIssue={setSelectedIssue} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="empty"><strong>No report yet</strong>Run a review to generate the scored report.</div>
                )}

                {/* Terminal */}
                <div className="terminal">
                  <div className="terminal-head"><span>REVIEW TERMINAL</span><button className="terminal-clear" onClick={() => setLogs([])}>clear</button></div>
                  <div className="terminal-body">
                    {logs.map((line, i) => <div key={i} className="terminal-line">{line}</div>)}
                  </div>
                </div>
              </section>

              {/* Right panel */}
              <aside className="rightpane">
                <div className="righttabs">
                  <button className={rightTab === "issues" ? "active" : ""} onClick={() => setRightTab("issues")}>Issues{current ? ` (${current.issues.length})` : ""}</button>
                  <button className={rightTab === "chat" ? "active" : ""} onClick={() => setRightTab("chat")}>AI Assistant</button>
                  <button className={rightTab === "metrics" ? "active" : ""} onClick={() => setRightTab("metrics")}>Metrics</button>
                </div>
                {rightTab === "issues" && (
                  current
                    ? <IssuePanel issues={current.issues} selectedIssueId={selectedIssue?.id ?? null} onSelectIssue={setSelectedIssue} />
                    : <div className="empty"><strong>No issues yet</strong>Run a review — findings appear here, ranked critical → low.</div>
                )}
                {rightTab === "chat" && (
                  <div className="chat">
                    <div className="chat-messages">
                      {chat.map((m, i) => (
                        <div key={i} className={`chat-msg ${m.role}`}>{m.text}</div>
                      ))}
                    </div>
                    <div className="chat-chips">
                      {["Explain the worst issue", "Any security problems?", "How do I fix this?", "Is it safe to merge?"].map((chip) => (
                        <button key={chip} onClick={() => sendChat(chip)}>{chip}</button>
                      ))}
                    </div>
                    <div className="chat-input-row">
                      <input value={chatInput} onChange={(e) => setChatInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && sendChat()} placeholder="Ask about this review…" />
                      <button className="btn btn-accent btn-small" onClick={() => sendChat()}>Send</button>
                    </div>
                  </div>
                )}
                {rightTab === "metrics" && (
                  current?.metrics ? (
                    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
                      <div className="metrics-strip" style={{ gridTemplateColumns: "1fr 1fr", margin: 0 }}>
                        <div className="card metric-card"><div className="metric-label">Lines</div><div className="metric-value">{current.metrics.total_lines}</div></div>
                        <div className="card metric-card"><div className="metric-label">Complexity</div><div className="metric-value">{current.metrics.cyclomatic_complexity}</div></div>
                        <div className="card metric-card"><div className="metric-label">Functions</div><div className="metric-value">{current.metrics.function_count}</div></div>
                        <div className="card metric-card"><div className="metric-label">Comments</div><div className="metric-value">{current.metrics.comment_ratio}%</div></div>
                      </div>
                      {current.category_scores && (
                        <div className="card card-pad"><div className="section-title" style={{ marginBottom: 14 }}>Category scores</div><CategoryBars scores={current.category_scores} /></div>
                      )}
                      {current.files.length > 1 && (
                        <div className="card card-pad"><div className="section-title" style={{ marginBottom: 10 }}>Files</div>
                          {current.files.map((f) => (
                            <button key={f.path} className="file-tree-item" onClick={() => { setCenterMode("report"); setTimeout(() => document.getElementById(`file-${f.path}`)?.scrollIntoView({ behavior: "smooth" }), 60); }}>
                              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.path}</span>
                              <span className={`file-count ${f.issue_count === 0 ? "clean" : ""}`}>{f.issue_count}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : <div className="empty"><strong>No metrics yet</strong>Metrics are computed per review.</div>
                )}
              </aside>
            </div>

            <footer className="statusbar">
              <span>⎇ main</span>
              <span>{current ? `${current.issues.length} issues · ${current.stats.critical ?? 0} critical` : "no review yet"}</span>
              <span style={{ marginLeft: "auto" }}>{filename} · deterministic engine v2</span>
              <span>{current ? `Score ${current.score}` : ""}</span>
            </footer>
          </>
        )}

        {view === "dashboard" && (
          <div className="content">
            <div className="page-head">
              <div><h2>Code review overview</h2><p>Deterministic analysis — reproducible, explainable, and scored. No black box.</p></div>
              <div className="spacer" />
              <button className="btn btn-accent" onClick={() => setView("workspace")}>Open review workspace</button>
            </div>
            <div className="stats-grid">
              <div className="card stat-card"><div className="stat-label">Total reviews</div><div className="stat-value">{stats?.total_reviews ?? 0}</div><div className="stat-hint">Stored in local history</div></div>
              <div className="card stat-card"><div className="stat-label">Average score</div><div className="stat-value">{stats?.average_score ?? "—"}</div><div className="stat-hint">Out of 100</div></div>
              <div className="card stat-card"><div className="stat-label">Critical issues found</div><div className="stat-value" style={{ color: stats?.critical_issues ? "#f85149" : undefined }}>{stats?.critical_issues ?? 0}</div><div className="stat-hint">Secrets, injection, unsafe code</div></div>
              <div className="card stat-card"><div className="stat-label">Files analyzed</div><div className="stat-value">{stats?.files_analyzed ?? 0}</div><div className="stat-hint">Across all reviews</div></div>
            </div>
            <div className="analytics-grid">
              <div className="card card-pad"><div className="section-title">Issue severity mix</div><div className="section-sub" style={{ marginBottom: 12 }}>Across all stored reviews</div><SeverityDonut reviews={history} /></div>
              <div className="card card-pad"><div className="section-title">Score trend</div><div className="section-sub" style={{ marginBottom: 12 }}>Latest review scores</div><ScoreTrend reviews={history} /></div>
              <div className="card card-pad"><div className="section-title">Most triggered rules</div><div className="section-sub" style={{ marginBottom: 12 }}>Where code fails most</div><TopRules reviews={history} /></div>
            </div>
            <div className="card">
              <div className="card-pad" style={{ paddingBottom: 8 }}><div className="section-title">Recent reviews</div><div className="section-sub">Select a review to open its report.</div></div>
              {history.length === 0 ? (
                <div className="empty"><strong>No reviews yet</strong>Run your first review from the workspace.</div>
              ) : (
                <table className="table"><thead><tr><th>Review</th><th>Source</th><th>Issues</th><th>Score</th><th>Date</th></tr></thead>
                  <tbody>{history.slice(0, 8).map((r) => (
                    <tr key={r.id} onClick={() => openReview(r)}><td style={{ fontWeight: 550 }}>{r.title}</td><td style={{ textTransform: "capitalize" }}>{r.source}</td><td>{r.stats.total_issues} ({r.stats.critical ?? 0} critical)</td><td><span className={`score-chip ${scoreClass(r.score)}`}>{r.score}</span></td><td>{formatDate(r.created_at)}</td></tr>
                  ))}</tbody></table>
              )}
            </div>
          </div>
        )}

        {view === "history" && (
          <div className="content">
            <div className="page-head"><div><h2>Review history</h2><p>All reviews stored locally in SQLite.</p></div></div>
            <div className="card">
              {history.length === 0 ? <div className="empty"><strong>No reviews yet</strong>Completed reviews appear here.</div> : (
                <table className="table"><thead><tr><th>Review</th><th>Source</th><th>Files</th><th>Issues</th><th>Score</th><th>Date</th></tr></thead>
                  <tbody>{history.map((r) => (
                    <tr key={r.id} onClick={() => openReview(r)}><td style={{ fontWeight: 550 }}>{r.title}</td><td style={{ textTransform: "capitalize" }}>{r.source}</td><td>{r.stats.files_changed}</td><td>{r.stats.total_issues}</td><td><span className={`score-chip ${scoreClass(r.score)}`}>{r.score}</span></td><td>{formatDate(r.created_at)}</td></tr>
                  ))}</tbody></table>
              )}
            </div>
          </div>
        )}

        {view === "how" && (
          <div className="content">
            <div className="page-head"><div><h2>How it works</h2><p>Built to be explainable in an interview — no black box.</p></div></div>
            <div className="how-grid">
              <div className="card how-card"><div className="how-num">01 — INGEST</div><h3>Code, diff, or real GitHub PR</h3><p>Pasted code is analyzed in full. Diffs are parsed with a unified-diff parser that maps added lines to new-file line numbers — exactly how GitHub places inline comments. Or browse open PRs of any public repo and review them for real.</p></div>
              <div className="card how-card"><div className="how-num">02 — ANALYZE + FIX</div><h3>Rules + AST, then auto-fix</h3><p>19 deterministic rules plus Python AST checks find secrets, injection, unsafe patterns and complexity smells. Auto-fix then rewrites the safe, mechanical ones — env vars for secrets, SHA-256 for weak hashes, TLS back on — and re-scores the result.</p></div>
              <div className="card how-card"><div className="how-num">03 — UNDERSTAND</div><h3>Chat with the review</h3><p>Every review is scored out of 100 with per-category breakdowns. The AI Assistant panel answers questions — worst issue, security, merge-readiness — from the actual findings, never invented ones.</p></div>
            </div>
            <div className="card card-pad" style={{ marginTop: 16 }}>
              <div className="section-title">Design decisions you can defend</div>
              <p className="section-sub" style={{ marginTop: 8, lineHeight: 1.9 }}>
                · Why not just call ChatGPT? — LLM-only reviews hallucinate line numbers; grounding findings in rules/AST keeps them reproducible.<br />
                · Why a custom syntax editor? — Transparent-textarea-over-highlight rendering: full editing with token colours, zero heavy dependencies.<br />
                · Why FastAPI + React? — Python owns the analysis ecosystem; the Pydantic schema is the contract both sides share.<br />
                · Known limits — regex rules can false-positive on comments; private repos need OAuth (roadmap in README).
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
