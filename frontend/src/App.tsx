import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { copyText } from "./lib/clipboard";
import Editor from "@monaco-editor/react";
import { CategoryBars, ScoreTrend, SeverityDonut, TopRules, estimatedEffort, qualityGate } from "./components/Charts";
import CommandPalette, { type PaletteAction } from "./components/CommandPalette";
import CodeViewer from "./components/CodeViewer";
import IssuePanel from "./components/IssuePanel";
import ScoreRing from "./components/ScoreRing";
import Walkthrough from "./components/Walkthrough";
import SyntaxEditor from "./components/SyntaxEditor";
import { api, clearSession, getUser, setSession } from "./lib/api";
import Landing from "./components/Landing";
import { explainLine } from "./lib/explain";
import { SAMPLE_CLEAN, SAMPLE_CODE, SAMPLE_DIFF, SAMPLE_JS } from "./lib/sample";
import type { DashboardStats, Issue, ReviewResult } from "./lib/types";

type View = "landing" | "workspace" | "dashboard" | "history" | "how" | "settings" | "compare" | "notfound";
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

function monacoLanguage(filename: string): string {
  if (filename.endsWith(".py")) return "python";
  if (filename.endsWith(".ts") || filename.endsWith(".tsx")) return "typescript";
  if (filename.endsWith(".js") || filename.endsWith(".jsx")) return "javascript";
  if (filename.endsWith(".java")) return "java";
  if (filename.endsWith(".go")) return "go";
  if (filename.endsWith(".json")) return "json";
  return "plaintext";
}

/** Counts up whenever the value changes — small detail, big product feel. */
function AnimatedNumber({ value }: { value: number | string }) {
  const [display, setDisplay] = useState(0);
  const target = typeof value === "number" ? value : Number(value) || 0;
  const suffix = typeof value === "string" && value !== String(target) ? value.replace(String(target), "") : "";
  useEffect(() => {
    const start = performance.now();
    const from = 0;
    let frame = 0;
    const tick = (now: number) => {
      const p = Math.min((now - start) / 650, 1);
      setDisplay(Math.round(from + (target - from) * (1 - Math.pow(1 - p, 3))));
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target]);
  if (typeof value === "string" && Number.isNaN(Number(value))) return <>{value}</>;
  return <>{display}{suffix}</>;
}

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
  const [view, setView] = useState<View>(() => {
    if (window.location.pathname !== "/" && !window.location.pathname.startsWith("/assets")) return "notfound";
    return localStorage.getItem("rp_visited") ? "workspace" : "landing";
  });
  const [mobileNav, setMobileNav] = useState(false);
  const [user, setUser] = useState(getUser());
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [theme, setTheme] = useState(localStorage.getItem("rp_theme") || "dark");
  const [accent, setAccent] = useState(localStorage.getItem("rp_accent") || "#2dd4bf");
  const [llmKey, setLlmKey] = useState(localStorage.getItem("rp_llm_key") || "");
  const [llmProvider, setLlmProvider] = useState(localStorage.getItem("rp_llm_provider") || "groq");
  const [deepReview, setDeepReview] = useState<string | null>(null);
  const [deepLoading, setDeepLoading] = useState(false);
  const [generatedTests, setGeneratedTests] = useState<{ code: string; name: string } | null>(null);
  const [ghToken, setGhToken] = useState("");
  const [ghPostOpen, setGhPostOpen] = useState(false);
  const [ghPosting, setGhPosting] = useState(false);
  const [historyQuery, setHistoryQuery] = useState("");
  const [historyFilter, setHistoryFilter] = useState("all");
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [explained, setExplained] = useState<{ line: number; text: string } | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [history, setHistory] = useState<ReviewResult[]>([]);
  const [current, setCurrent] = useState<ReviewResult | null>(null);
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set());

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
  const [logs, setLogs] = useState<string[]>(["[engine] ReviewPilot ready — 19 rules loaded, AST checks enabled"]);
  const [fixNotice, setFixNotice] = useState<string | null>(null);
  const [chat, setChat] = useState<ChatMessage[]>([
    { role: "assistant", text: "I am your review assistant. Run a review, then ask me to explain any finding, suggest a fix, or judge whether this code is safe to merge." },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [fixDelta, setFixDelta] = useState<{ before: number; after: number; count: number } | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const runReviewRef = useRef<() => Promise<ReviewResult | null>>(async () => null);
  const autoRanRef = useRef(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editorRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const monacoRef = useRef<any>(null);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3400);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [s, h] = await Promise.all([api.getStats(), api.listReviews()]);
      setStats(s); setHistory(h);
    } catch { /* backend warming up */ }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    const titles: Record<string, string> = {
      landing: "ReviewPilot: Automated Code Review",
      workspace: "Review workspace · ReviewPilot",
      dashboard: "Dashboard · ReviewPilot",
      history: "Review history · ReviewPilot",
      how: "How it works · ReviewPilot",
      settings: "Settings · ReviewPilot",
      admin: "Admin analytics · ReviewPilot",
      compare: "Compare reviews · ReviewPilot",
      notfound: "Page not found · ReviewPilot",
    };
    document.title = titles[view] ?? "ReviewPilot";
  }, [view]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.setProperty("--accent", accent);
    localStorage.setItem("rp_theme", theme);
    localStorage.setItem("rp_accent", accent);
  }, [theme, accent]);

  // Public share links: /?share=<reviewId> opens that report read-only style.
  useEffect(() => {
    const shareId = new URLSearchParams(window.location.search).get("share");
    if (shareId) {
      api.getReview(shareId).then((r) => { openReview(r); showToast("Opened shared review"); }).catch(() => showToast("That shared review no longer exists"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Open alive, not empty: when the workspace is first entered, show the
  // latest stored review if one exists instead of creating a new one per load.
  useEffect(() => {
    if (view !== "workspace" || autoRanRef.current) return;
    autoRanRef.current = true;
    (async () => {
      try {
        const existing = await api.listReviews();
        if (existing.length) { openReview(existing[0]); return; }
      } catch { /* fall through to a fresh review */ }
      await runReviewRef.current();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  // Paint VS Code-style problem markers into Monaco from the latest review.
  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco || !current) return;
    const model = editor.getModel();
    if (!model) return;
    const markers = current.issues
      .filter((i) => i.file === filename)
      .map((i) => ({
        severity: i.severity === "critical" || i.severity === "high"
          ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning,
        message: `${i.rule_id} ${i.title} — ${i.message}`,
        startLineNumber: Math.min(Math.max(i.line, 1), model.getLineCount()),
        startColumn: 1,
        endLineNumber: Math.min(Math.max(i.line, 1), model.getLineCount()),
        endColumn: model.getLineMaxColumn(Math.min(Math.max(i.line, 1), model.getLineCount())),
      }));
    monaco.editor.setModelMarkers(model, "pr-review", markers);
  }, [current, filename, centerMode]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPaletteOpen((v) => !v); }
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && view === "workspace") { e.preventDefault(); void runReviewRef.current(); }
      if (e.key === "Escape") { setPaletteOpen(false); setGeneratedTests(null); setGhPostOpen(false); setAuthOpen(false); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  const pushLog = (line: string) =>
    setLogs((prev) => [...prev.slice(-40), `[${new Date().toLocaleTimeString()}] ${line}`]);

  const openReview = (review: ReviewResult) => {
    setCurrent(review);
    setResolvedIds(new Set());
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

  runReviewRef.current = () => runReview();

  const applyAutoFix = async () => {
    if (mode !== "code") { setError("Auto-fix works in Paste code mode. Switch to a workspace file first."); return; }
    setFixing(true); setError(null);
    try {
      const before = current ? current.score : null;
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
      if (before !== null && after) setFixDelta({ before, after: after.score, count: result.applied.length });
      if (after) showToast(`Auto-fix complete — score ${before ?? "—"} → ${after.score}`);
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
    const fixMatch = message.toLowerCase().match(/fix issue\s*(\d+)/);
    if (fixMatch && current) {
      const target = current.issues[Number(fixMatch[1]) - 1];
      setChat((prev) => [...prev,
        { role: "user", text: message },
        { role: "assistant", text: target ? `Applying the safe auto-fixes for issue ${fixMatch[1]} (${target.title}, ${target.rule_id}). Watch the editor and score...` : "I could not find that issue number in the current review." },
      ]);
      setChatInput("");
      if (target) void applyAutoFix();
      return;
    }
    setChat((prev) => [...prev, { role: "user", text: message }, { role: "assistant", text: answerChat(message) }]);
    setChatInput("");
  };


  const doAuth = async () => {
    setAuthError(null);
    try {
      const result = authMode === "login"
        ? await api.login(authEmail, authPassword)
        : await api.register(authEmail, authPassword);
      setSession(result.token, { id: result.id, email: result.email });
      setUser({ id: result.id, email: result.email });
      setAuthOpen(false);
      showToast(`Signed in as ${result.email}`);
      refresh();
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Authentication failed");
    }
  };

  const signOut = () => { clearSession(); setUser(null); showToast("Signed out"); refresh(); };

  const runDeepReview = async () => {
    if (!llmKey.trim()) { setView("settings"); showToast("Add your free Groq/Gemini key in Settings first"); return; }
    setDeepLoading(true); setDeepReview(null);
    try {
      const source = mode === "code" ? code : (current?.file_contents.map((f) => f.lines.map((l) => l.content).join("\n")).join("\n") ?? code);
      const result = await api.llmReview(source, filename, llmKey.trim(), llmProvider);
      setDeepReview(result.review);
      setRightTab("chat");
      showToast(`Deep AI review complete (${result.provider})`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Deep review failed");
    } finally { setDeepLoading(false); }
  };

  const runGenerateTests = async () => {
    try {
      const result = await api.generateTests(code, filename);
      setGeneratedTests({ code: result.test_code, name: result.test_filename });
      showToast(`Generated ${result.test_filename}`);
    } catch { showToast("Could not generate tests for this file"); }
  };

  const postToGitHub = async () => {
    if (!current) return;
    const url = prUrl.trim() || promptForPr();
    if (!url) return;
    setGhPosting(true);
    try {
      const result = await api.postGitHubComment(ghToken.trim(), url, current.id);
      showToast("Posted to GitHub");
      window.open(result.comment_url, "_blank");
      setGhPostOpen(false);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "GitHub posting failed");
    } finally { setGhPosting(false); }
  };
  const promptForPr = (): string | null => prUrl.trim() ? prUrl.trim() : null;

  const copyShareLink = async () => {
    if (!current) return;
    const link = `${window.location.origin}${window.location.pathname}?share=${current.id}`;
    const copied = await copyText(link);
    showToast(copied ? "Share link copied to clipboard" : `Share link: ${link}`);
    showToast("Share link copied — anyone with it can view this report");
  };

  const explainCurrentLine = () => {
    const editor = editorRef.current;
    const lineNo: number = editor?.getPosition?.()?.lineNumber ?? 1;
    const content = (code.split("\n")[lineNo - 1] ?? "").toString();
    setExplained({ line: lineNo, text: explainLine(content, monacoLanguage(filename)) });
    setRightTab("chat");
  };

  const generateProjectReport = () => {
    const md = [
      "# Automated Code Review Assistant — Project Report", "",
      "## Abstract", "This project implements an automated code review system that analyzes source code, git diffs and GitHub pull requests using a deterministic rule engine combined with Python AST analysis. It produces scored, severity-ranked reports with auto-fix and optional LLM deep review.", "",
      "## 1. Introduction", "Manual code review is slow and inconsistent. This system automates first-pass review so human reviewers focus on design and logic.", "",
      "## 2. Objectives", "- Detect security, bug, performance and style issues automatically", "- Score code health 0-100 with a quality gate", "- Suggest and apply safe automatic fixes", "- Integrate with real GitHub pull requests", "",
      "## 3. System Architecture", "React + TypeScript frontend (Monaco editor) -> FastAPI backend -> deterministic analyzer (19 rules + AST) -> SQLite. Optional LLM layer (Groq/Gemini with user key) performs deep review only.", "",
      "## 4. Implementation", "- Unified diff parser mapping findings to new-file line numbers", "- Per-category scores and cyclomatic complexity metrics", "- JWT auth with PBKDF2 password hashing", "- GitHub REST integration: PR fetch, PR browser, bot comments, webhooks", "",
      "## 5. Results", `Reviews stored: ${stats?.total_reviews ?? 0}. Average score: ${stats?.average_score ?? "-"}/100. Critical issues detected: ${stats?.critical_issues ?? 0}.`, current ? `Latest review: ${current.title} scored ${current.score}/100 with ${current.issues.length} findings.` : "No review selected.", "",
      "## 6. Conclusion", "The system demonstrates a production-shaped review pipeline that is explainable in viva: findings come from rules/AST, AI only enriches.", "",
      "## 7. Future Scope", "- GitHub App installation for org-wide auto-review", "- Dataflow analysis (CodeQL-style) to reduce false positives", "- Inline GitHub review comments per line", "",
    ].join("\n");
    const blob = new Blob([md], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "project-report.md"; a.click();
    URL.revokeObjectURL(a.href);
    showToast("Project report downloaded (Markdown — paste into Word/IEEE template)");
  };


  const paletteActions: PaletteAction[] = [
    { id: "run", label: "Run review", hint: "Ctrl+Enter", run: () => { setView("workspace"); void runReview(); } },
    { id: "fix", label: "Auto-fix current code", hint: "Engine", run: () => { setView("workspace"); void applyAutoFix(); } },
    { id: "dash", label: "Go to dashboard", hint: "View", run: () => setView("dashboard") },
    { id: "workspace", label: "Go to review workspace", hint: "View", run: () => setView("workspace") },
    { id: "history", label: "Go to review history", hint: "View", run: () => setView("history") },
    ...SAMPLE_FILES.map((f) => ({
      id: `file-${f.name}`, label: `Open ${f.label}`, hint: "Workspace file",
      run: () => { setView("workspace"); setCode(f.code); setFilename(f.filename); setActiveSample(f.name); setMode("code"); setCenterMode("editor"); },
    })),
    ...history.slice(0, 8).map((r) => ({
      id: `review-${r.id}`, label: `Open review — ${r.title}`, hint: `Score ${r.score}`,
      run: () => openReview(r),
    })),
  ];

  const handleSelectIssue = (issue: Issue) => {
    setSelectedIssue(issue);
    if (issue.file === filename) {
      setCenterMode("editor");
      requestAnimationFrame(() => {
        const editor = editorRef.current;
        if (editor) {
          editor.revealLineInCenter(issue.line);
          editor.setPosition({ lineNumber: issue.line, column: 1 });
          editor.focus();
        }
      });
    }
  };

  const severityTotal = current?.issues.length || 1;

  const navItem = (v: View, icon: ReactNode, label: string) => (
    <button className={`activity-btn ${view === v ? "active" : ""}`} onClick={() => setView(v)} title={label}>
      <span className="activity-icon">{icon}</span><span className="activity-label">{label}</span>
    </button>
  );

  if (view === "notfound") {
    return (
      <main className="notfound">
        <p className="notfound-code">404</p>
        <h1>That page does not exist.</h1>
        <p>The address may be mistyped, or the page may have moved.</p>
        <button className="btn btn-primary btn-large" onClick={() => { window.history.replaceState(null, "", "/"); setView("landing"); }}>Go to the home page</button>
      </main>
    );
  }

  if (view === "landing") {
    return <Landing onEnter={() => { localStorage.setItem("rp_visited", "1"); setView("workspace"); }} onGuide={() => { localStorage.setItem("rp_visited", "1"); setView("how"); }} onDashboard={() => { localStorage.setItem("rp_visited", "1"); setView("dashboard"); }} />;
  }

  return (
    <div className="shell">
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} actions={paletteActions} />
      {authOpen && (
        <div className="modal-backdrop" onClick={() => setAuthOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{authMode === "login" ? "Welcome back" : "Create your account"}</h3>
            <p className="section-sub" style={{ marginBottom: 14 }}>Accounts keep your reviews tied to you. Guest mode keeps working without one.</p>
            <div className="field"><label>Email</label><input type="text" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} placeholder="you@example.com" /></div>
            <div className="field"><label>Password</label><input type="password" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} placeholder="At least 6 characters" onKeyDown={(e) => e.key === "Enter" && doAuth()} /></div>
            {authError && <div className="error-box" style={{ marginBottom: 12 }}>{authError}</div>}
            <button className="btn btn-accent" style={{ width: "100%", justifyContent: "center" }} onClick={doAuth}>{authMode === "login" ? "Sign in" : "Create account"}</button>
            <button className="btn btn-ghost" style={{ width: "100%", justifyContent: "center", marginTop: 8 }} onClick={() => setAuthMode(authMode === "login" ? "register" : "login")}>
              {authMode === "login" ? "New here? Create an account" : "Already have an account? Sign in"}
            </button>
          </div>
        </div>
      )}
      {generatedTests && (
        <div className="modal-backdrop" onClick={() => setGeneratedTests(null)}>
          <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
            <h3>{generatedTests.name}</h3>
            <p className="section-sub" style={{ marginBottom: 12 }}>Starter tests generated from your code structure. Fill in real inputs before trusting them.</p>
            <pre className="modal-code">{generatedTests.code}</pre>
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button className="btn btn-accent" onClick={async () => showToast((await copyText(generatedTests.code)) ? "Tests copied to clipboard" : "Copy failed — select the code manually")}>Copy tests</button>
              <button className="btn btn-ghost" onClick={() => setGeneratedTests(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
      {ghPostOpen && (
        <div className="modal-backdrop" onClick={() => setGhPostOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Post review to GitHub</h3>
            <p className="section-sub" style={{ marginBottom: 14 }}>Uses your personal access token once to post the bot comment. It is never stored on the server. Needs a fine-grained token with Pull Requests: write on the repo.</p>
            <div className="field"><label>GitHub token</label><input type="password" value={ghToken} onChange={(e) => setGhToken(e.target.value)} placeholder="github_pat_..." /></div>
            <div className="field"><label>Pull request URL</label><input type="text" value={prUrl} onChange={(e) => setPrUrl(e.target.value)} placeholder="https://github.com/owner/repo/pull/123" /></div>
            <button className="btn btn-accent" style={{ width: "100%", justifyContent: "center" }} disabled={ghPosting || !ghToken || !prUrl} onClick={postToGitHub}>{ghPosting ? "Posting..." : "Post comment"}</button>
          </div>
        </div>
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
      {/* Activity bar */}
      <aside className="activity">
        <div className="activity-logo">RP</div>
        {navItem("workspace", "RV", "Review")}
        {navItem("dashboard", "DB", "Dash")}
        {navItem("history", "HS", "History")}
        {navItem("how", "GD", "Guide")}
        {navItem("settings", "ST", "Settings")}
        <button className="activity-btn" onClick={() => setPaletteOpen(true)} title="Command palette (Ctrl+K)">
          <span className="activity-icon"></span><span className="activity-label">Search</span>
        </button>
        <div className="activity-bottom">
          {user ? (
            <button className="activity-btn" onClick={signOut} title={`Signed in as ${user.email} — click to sign out`}>
              <span className="activity-icon"></span><span className="activity-label">Sign out</span>
            </button>
          ) : (
            <button className="activity-btn" onClick={() => setAuthOpen(true)} title="Sign in">
              <span className="activity-icon"></span><span className="activity-label">Sign in</span>
            </button>
          )}
          <div className="avatar">{user ? user.email.slice(0, 2).toUpperCase() : "GU"}</div>
        </div>
      </aside>

      {/* Explorer */}
      {view === "workspace" && (
        <aside className={`explorer ${mobileNav ? "mobile-open" : ""}`}>
          <div className="explorer-head">EXPLORER</div>
          <div className="explorer-section">Workspace files</div>
          {SAMPLE_FILES.map((f) => (
            <button key={f.name} className={`explorer-file ${activeSample === f.name && mode === "code" ? "active" : ""}`}
              onClick={() => { setCode(f.code); setFilename(f.filename); setActiveSample(f.name); setMode("code"); setCenterMode("editor"); }}>
              <span className="file-dot" data-lang={f.filename.endsWith(".js") ? "js" : "py"}></span>
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
          <button className="mobile-menu-btn" onClick={() => setMobileNav((v) => !v)} aria-label="Toggle navigation menu">Menu</button>
          <div className="crumbs">
            <strong>ReviewPilot</strong>
            <span>/</span><span>{view === "workspace" ? (centerMode === "report" && current ? current.title : filename) : view}</span>
          </div>
          <div className="topbar-actions">
            {current && <span className={`score-chip ${scoreClass(current.score)}`}>Score {current.score}</span>}
            <span className="status-dot">Engine operational</span>
            <button
              className="btn btn-ghost"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
              aria-label="Toggle colour theme"
            >
              {theme === "dark" ? "Light" : "Dark"}
            </button>
            {view === "workspace" && (
              <>
                <button className="btn btn-ghost" onClick={() => setPaletteOpen(true)}> <span className="kbd-hint">Ctrl K</span></button>
                <button className="btn btn-ghost" onClick={applyAutoFix} disabled={fixing || running}> {fixing ? "Fixing…" : "Auto-fix"}</button>
                <button className="btn btn-accent" onClick={() => runReview()} disabled={running}> {running ? "Analyzing…" : "Run review"}</button>
              </>
            )}
          </div>
        </header>

        {view === "workspace" && (
          <>
            <div className="modebar">
              <div className="tabs">
                <button className={`tab ${mode === "code" ? "active" : ""}`} onClick={() => { setMode("code"); setCenterMode("editor"); }}>Code</button>
                <button className={`tab ${mode === "diff" ? "active" : ""}`} onClick={() => { setMode("diff"); setCenterMode("editor"); }}>Git diff</button>
                <button className={`tab ${mode === "github" ? "active" : ""}`} onClick={() => { setMode("github"); setCenterMode("editor"); }}> GitHub PR</button>
              </div>
              <div className="tabs">
                <button className={`tab ${centerMode === "editor" ? "active" : ""}`} onClick={() => setCenterMode("editor")}>Editor</button>
                <button className={`tab ${centerMode === "report" ? "active" : ""}`} onClick={() => current && setCenterMode("report")} disabled={!current}>Report{current ? ` (${current.issues.length})` : ""}</button>
              </div>
              <button className="btn btn-ghost btn-small" onClick={explainCurrentLine} title="Explain the line your cursor is on">Explain line</button>
              <input className="filename-input mono" value={filename} onChange={(e) => setFilename(e.target.value)} aria-label="Filename" />
            </div>

            {current && centerMode === "editor" && (
              <div className="kpi-strip">
                <div className="kpi-card"><span className="kpi-label">Health score</span><strong className={current.score >= 75 ? "kpi-good" : current.score >= 50 ? "kpi-mid" : "kpi-bad"}>{current.score}<small>/100 · {current.grade}</small></strong></div>
                <div className="kpi-card"><span className="kpi-label">Open issues</span><strong>{current.issues.length}<small>{current.stats.critical ?? 0} critical</small></strong></div>
                <div className="kpi-card"><span className="kpi-label">Quality gate</span><strong className={qualityGate(current).passed ? "kpi-good" : "kpi-bad"}>{qualityGate(current).passed ? "PASSED" : "FAILED"}<small>{estimatedEffort(current)} to fix</small></strong></div>
                <div className="kpi-card"><span className="kpi-label">Complexity</span><strong>{current.metrics?.cyclomatic_complexity ?? "—"}<small>{current.metrics?.total_lines ?? 0} lines · {current.metrics?.function_count ?? 0} functions</small></strong></div>
              </div>
            )}

            {error && <div className="error-box" style={{ margin: "14px 18px 0" }}>{error}</div>}
            {fixNotice && <div className="notice-box" style={{ margin: "14px 18px 0" }}><strong>Auto-fix:</strong> {fixNotice}</div>}

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
                    <div className="monaco-wrap">
                      <Editor
                        value={code}
                        language={monacoLanguage(filename)}
                        theme={theme === "light" ? "light" : "vs-dark"}
                        onMount={(editor, monaco) => { editorRef.current = editor; monacoRef.current = monaco; }}
                        onChange={(v) => setCode(v ?? "")}
                        options={{
                          minimap: { enabled: false },
                          scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10, useShadows: false },
                          fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                          fontSize: 13, lineHeight: 1.7, padding: { top: 12 },
                          scrollBeyondLastLine: false, automaticLayout: true,
                          renderLineHighlight: "all", smoothScrolling: true,
                          cursorBlinking: "smooth", wordWrap: "on",
                        }}
                        loading={<div className="empty">Loading editor…</div>}
                      />
                    </div>
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
                        {(() => {
                          const gate = qualityGate(current);
                          return (
                            <div className={`gate ${gate.passed ? "passed" : "failed"}`}>
                              <strong>{gate.passed ? "Quality gate: PASSED" : "Quality gate: FAILED"}</strong>
                              <span>{gate.passed ? "Meets merge thresholds (score ≥ 75, no criticals)" : gate.reasons.join(" · ")}</span>
                              <span className="gate-effort">Est. fix effort: {estimatedEffort(current)}</span>
                            </div>
                          );
                        })()}
                        {fixDelta && (
                          <div className="delta-card">
                            <span>Auto-fix impact</span>
                            <strong>{fixDelta.before} → {fixDelta.after}</strong>
                            <span className="delta-up">▲ {fixDelta.after - fixDelta.before} points · {fixDelta.count} fix(es) applied</span>
                          </div>
                        )}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <button className="btn btn-ghost" onClick={() => exportReport(current)}>Export .md</button>
                        <button className="btn btn-ghost" onClick={() => window.print()}> PDF</button>
                        <button className="btn btn-ghost" onClick={copyShareLink}> Share link</button>
                        <button className="btn btn-ghost" onClick={() => setGhPostOpen(true)}> Post to GitHub</button>
                        <button className="btn btn-ghost" onClick={runDeepReview} disabled={deepLoading}>{deepLoading ? "AI reviewing..." : "Deep AI review"}</button>
                        <button className="btn btn-ghost" onClick={runGenerateTests}>Generate tests</button>
                      </div>
                    </div>
                    <Walkthrough review={current} />
                    <div className="report-charts">
                      <div className="card card-pad"><div className="section-title">Severity mix</div><SeverityDonut reviews={[current]} /></div>
                      <div className="card card-pad"><div className="section-title">Category scores</div>{current.category_scores && <CategoryBars scores={current.category_scores} />}</div>
                      {deepReview && <div className="card card-pad deep-card"><div className="section-title">Deep AI review ({llmProvider})</div><pre className="deep-text">{deepReview}</pre></div>}
                    </div>
                    {current.file_contents.map((file) => (
                      <div key={file.path} id={`file-${file.path}`}>
                        <CodeViewer
                          file={file} issues={current.issues} selectedIssueId={selectedIssue?.id ?? null}
                          onSelectIssue={setSelectedIssue} resolvedIds={resolvedIds}
                          onResolve={(issue) => { setResolvedIds((prev) => new Set(prev).add(issue.id)); showToast(`Resolved ${issue.rule_id} — ${issue.title}`); }}
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="empty"><strong>No report yet</strong>Run a review to generate the scored report.</div>
                )}

                {running && (
                  <div className="skeleton-wrap" aria-label="Analyzing">
                    <div className="skeleton" style={{ width: "62%" }} />
                    <div className="skeleton" style={{ width: "88%" }} />
                    <div className="skeleton" style={{ width: "74%" }} />
                    <div className="skeleton" style={{ width: "45%" }} />
                  </div>
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
                  <button className={rightTab === "issues" ? "active" : ""} onClick={() => setRightTab("issues")}> Issues{current ? ` (${current.issues.length})` : ""}</button>
                  <button className={rightTab === "chat" ? "active" : ""} onClick={() => setRightTab("chat")}> AI Assistant</button>
                  <button className={rightTab === "metrics" ? "active" : ""} onClick={() => setRightTab("metrics")}> Metrics</button>
                </div>
                {rightTab === "issues" && (
                  current
                    ? <IssuePanel issues={current.issues} selectedIssueId={selectedIssue?.id ?? null} onSelectIssue={handleSelectIssue} />
                    : <div className="empty"><strong>No issues yet</strong>Run a review — findings appear here, ranked critical → low.</div>
                )}
                {rightTab === "chat" && (
                  <div className="chat">
                    {explained && (
                      <div className="explained-card"><strong>Line {explained.line}</strong><span>{explained.text}</span></div>
                    )}
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
              <div className="card stat-card"><div className="stat-label">Total reviews</div><div className="stat-value"><AnimatedNumber value={stats?.total_reviews ?? 0} /></div><div className="stat-hint">Stored in local history</div></div>
              <div className="card stat-card"><div className="stat-label">Average score</div><div className="stat-value"><AnimatedNumber value={stats?.average_score ?? 0} /></div><div className="stat-hint">Out of 100</div></div>
              <div className="card stat-card"><div className="stat-label">Critical issues found</div><div className="stat-value" style={{ color: stats?.critical_issues ? "#f85149" : undefined }}><AnimatedNumber value={stats?.critical_issues ?? 0} /></div><div className="stat-hint">Secrets, injection, unsafe code</div></div>
              <div className="card stat-card"><div className="stat-label">Files analyzed</div><div className="stat-value"><AnimatedNumber value={stats?.files_analyzed ?? 0} /></div><div className="stat-hint">Across all reviews</div></div>
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
            <div className="page-head"><div><h2>Review history</h2><p>Search, filter and compare reviews stored in SQLite.</p></div>
              <div className="spacer" />
              <button className="btn btn-accent" disabled={compareIds.length !== 2} onClick={() => setView("compare")}>Compare selected ({compareIds.length}/2)</button>
            </div>
            <div className="history-controls">
              <input className="team-input" style={{ flex: 1 }} value={historyQuery} onChange={(e) => setHistoryQuery(e.target.value)} placeholder="Search by title, file or source..." />
              <select className="team-input" value={historyFilter} onChange={(e) => setHistoryFilter(e.target.value)}>
                <option value="all">All reviews</option>
                <option value="critical">Has critical issues</option>
                <option value="passing">Passing (score 75+)</option>
                <option value="failing">Needs work (score &lt; 75)</option>
                <option value="github">GitHub / diff</option>
              </select>
            </div>
            <div className="card">
              {history.length === 0 ? <div className="empty"><strong>No reviews yet</strong>Completed reviews appear here.</div> : (
                <table className="table"><thead><tr><th></th><th>Review</th><th>Source</th><th>Files</th><th>Issues</th><th>Score</th><th>Date</th></tr></thead>
                  <tbody>{history
                    .filter((r) => {
                      const q = historyQuery.toLowerCase();
                      const matchesQ = !q || r.title.toLowerCase().includes(q) || r.source.includes(q) || r.files.some((f) => f.path.toLowerCase().includes(q));
                      const matchesF = historyFilter === "all" ? true
                        : historyFilter === "critical" ? (r.stats.critical ?? 0) > 0
                        : historyFilter === "passing" ? r.score >= 75
                        : historyFilter === "failing" ? r.score < 75
                        : r.source !== "paste";
                      return matchesQ && matchesF;
                    })
                    .map((r) => (
                    <tr key={r.id} onClick={() => openReview(r)}>
                      <td onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={compareIds.includes(r.id)} onChange={(e) => {
                          setCompareIds((prev) => e.target.checked ? [...prev.slice(-1), r.id] : prev.filter((id) => id !== r.id));
                        }} />
                      </td>
                      <td style={{ fontWeight: 550 }}>{r.title}</td><td style={{ textTransform: "capitalize" }}>{r.source}</td><td>{r.stats.files_changed}</td><td>{r.stats.total_issues}</td><td><span className={`score-chip ${scoreClass(r.score)}`}>{r.score}</span></td><td>{formatDate(r.created_at)}</td></tr>
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

        {view === "settings" && (
          <div className="content">
            <div className="page-head"><div><h2>Settings</h2><p>Appearance, AI provider, and project tools.</p></div></div>
            <div className="settings-grid">
              <div className="card card-pad">
                <div className="section-title">Theme</div>
                <p className="section-sub" style={{ marginBottom: 12 }}>Light or dark workspace.</p>
                <div className="tabs">
                  <button className={`tab ${theme === "dark" ? "active" : ""}`} onClick={() => setTheme("dark")}>Dark</button>
                  <button className={`tab ${theme === "light" ? "active" : ""}`} onClick={() => setTheme("light")}>Light</button>
                </div>
                <div className="section-title" style={{ marginTop: 18 }}>Accent colour</div>
                <div className="accent-row">
                  {["#2dd4bf", "#38bdf8", "#a78bfa", "#f472b6", "#fbbf24", "#4ade80"].map((c) => (
                    <button key={c} className={`accent-swatch ${accent === c ? "active" : ""}`} style={{ background: c }} onClick={() => setAccent(c)} aria-label={c} />
                  ))}
                </div>
              </div>
              <div className="card card-pad">
                <div className="section-title">Deep AI review (optional)</div>
                <p className="section-sub" style={{ marginBottom: 12 }}>Your key is kept only in this browser and sent per-request. It is never stored on the server. Groq and Gemini both have free tiers.</p>
                <div className="field"><label>Provider</label>
                  <select className="team-input" style={{ width: "100%" }} value={llmProvider} onChange={(e) => { setLlmProvider(e.target.value); localStorage.setItem("rp_llm_provider", e.target.value); }}>
                    <option value="groq">Groq (Llama 3.3 70B)</option>
                    <option value="gemini">Google Gemini 2.0 Flash</option>
                  </select>
                </div>
                <div className="field"><label>API key</label><input type="password" value={llmKey} onChange={(e) => { setLlmKey(e.target.value); localStorage.setItem("rp_llm_key", e.target.value); }} placeholder="Paste your free API key" /></div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button className="btn btn-ghost" onClick={() => showToast("Settings saved in this browser")}>Save settings</button>
                  <button className="btn btn-accent" onClick={runDeepReview} disabled={deepLoading}>{deepLoading ? "Reviewing..." : "Run deep AI review on current code"}</button>
                </div>
                {deepReview && <pre className="deep-text" style={{ marginTop: 14 }}>{deepReview}</pre>}
              </div>
              <div className="card card-pad">
                <div className="section-title">GitHub automation</div>
                <p className="section-sub" style={{ lineHeight: 1.8 }}>
                  Webhook endpoint for zero-click reviews:<br />
                  <span className="mono" style={{ color: "var(--accent)" }}>/api/webhooks/github</span><br />
                  In your repo: Settings → Webhooks → Add webhook → this URL (through your tunnel/host), content type JSON, event: Pull requests. New PRs are then reviewed automatically into History.
                </p>
              </div>
              <div className="card card-pad">
                <div className="section-title">College submission tools</div>
                <p className="section-sub" style={{ marginBottom: 12 }}>Generate an IEEE-structured project report filled with your real project data, and export any report as PDF from the Report view.</p>
                <button className="btn btn-accent" onClick={generateProjectReport}>Generate project report (.md)</button>
              </div>
            </div>
          </div>
        )}

        {view === "compare" && (
          <div className="content">
            <div className="page-head"><div><h2>Compare reviews</h2><p>Side-by-side diff of two reviews — perfect for before/after a fix.</p></div></div>
            {(() => {
              const [a, b] = compareIds.map((id) => history.find((r) => r.id === id)).filter(Boolean) as ReviewResult[];
              if (!a || !b) return <div className="card empty"><strong>Select two reviews</strong>Go to History, tick two reviews, then open Compare.</div>;
              const rows: Array<[string, number | string, number | string]> = [
                ["Score", a.score, b.score], ["Critical", a.stats.critical ?? 0, b.stats.critical ?? 0],
                ["High", a.stats.high ?? 0, b.stats.high ?? 0], ["Total issues", a.stats.total_issues, b.stats.total_issues],
                ["Files", a.stats.files_changed, b.stats.files_changed],
              ];
              return (
                <div className="card card-pad">
                  <div className="compare-head"><div><strong>{a.title}</strong><div className="section-sub">{formatDate(a.created_at)}</div></div><span className="compare-vs">vs</span><div><strong>{b.title}</strong><div className="section-sub">{formatDate(b.created_at)}</div></div></div>
                  <table className="table"><thead><tr><th>Metric</th><th>First</th><th>Second</th><th>Delta</th></tr></thead>
                    <tbody>{rows.map(([label, av, bv]) => { const d = Number(bv) - Number(av); return (
                      <tr key={label}><td style={{ fontWeight: 600 }}>{label}</td><td>{av}</td><td>{bv}</td>
                      <td style={{ color: label === "Score" ? (d >= 0 ? "#3fb950" : "#f85149") : d <= 0 ? "#3fb950" : "#f85149", fontWeight: 700 }}>{d > 0 ? `+${d}` : d}</td></tr>); })}
                    </tbody></table>
                  <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                    <button className="btn btn-ghost" onClick={() => openReview(a)}>Open first</button>
                    <button className="btn btn-ghost" onClick={() => openReview(b)}>Open second</button>
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}
