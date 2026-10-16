import { useMemo, useState } from "react";
import type { Issue, Severity } from "../lib/types";

const FILTERS: Array<"all" | Severity> = ["all", "critical", "high", "medium", "low"];

interface Props {
  issues: Issue[];
  selectedIssueId: string | null;
  onSelectIssue: (issue: Issue) => void;
}

export default function IssuePanel({ issues, selectedIssueId, onSelectIssue }: Props) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const visible = useMemo(
    () => (filter === "all" ? issues : issues.filter((i) => i.severity === filter)),
    [issues, filter],
  );

  const copyFix = async (issue: Issue) => {
    if (!issue.suggested_fix) return;
    await navigator.clipboard.writeText(issue.suggested_fix);
    setCopiedId(issue.id);
    setTimeout(() => setCopiedId(null), 1600);
  };

  return (
    <div className="card" style={{ overflow: "hidden" }}>
      <div className="filters">
        {FILTERS.map((f) => (
          <button key={f} className={`filter-chip ${filter === f ? "active" : ""}`} onClick={() => setFilter(f)}>
            {f} {f !== "all" && `(${issues.filter((i) => i.severity === f).length})`}
          </button>
        ))}
      </div>
      <div className="issue-list">
        {visible.length === 0 && <div className="empty"><strong>No issues at this severity</strong>Try another filter.</div>}
        {visible.map((issue, idx) => (
          <article
            key={issue.id}
            className={`issue ${issue.id === selectedIssueId ? "selected" : ""}`} style={{ animationDelay: `${Math.min(idx * 45, 400)}ms` }}
            onClick={() => onSelectIssue(issue)}
          >
            <div className="issue-top">
              <span className={`badge badge-${issue.severity}`}>{issue.severity}</span>
              <span className="badge badge-cat">{issue.category}</span>
              <span className="badge badge-cat mono">{issue.rule_id}</span>
            </div>
            <div className="issue-title">{issue.title}</div>
            <div className="issue-loc">{issue.file}:{issue.line}</div>
            <p className="issue-msg">{issue.message}</p>
            <p className="issue-msg"><strong style={{ color: "#131722" }}>Recommendation:</strong> {issue.suggestion}</p>
            {issue.suggested_fix && (
              <details className="issue-fix" onClick={(e) => e.stopPropagation()}>
                <summary>
                  Suggested fix
                  <button className="btn btn-ghost btn-small copy-btn" onClick={() => copyFix(issue)}>
                    {copiedId === issue.id ? "Copied" : "Copy"}
                  </button>
                </summary>
                <pre>{issue.suggested_fix}</pre>
              </details>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
