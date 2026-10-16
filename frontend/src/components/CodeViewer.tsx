import { Bot, Check, Copy } from "lucide-react";
import { useState } from "react";
import type { FileContent, Issue } from "../lib/types";

interface Props {
  file: FileContent;
  issues: Issue[];
  selectedIssueId: string | null;
  onSelectIssue: (issue: Issue) => void;
  resolvedIds?: Set<string>;
  onResolve?: (issue: Issue) => void;
}

export default function CodeViewer({ file, issues, selectedIssueId, onSelectIssue, resolvedIds, onResolve }: Props) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const fileIssues = issues.filter((i) => i.file === file.path);
  const issuesByLine = new Map<number, Issue[]>();
  for (const issue of fileIssues) {
    const list = issuesByLine.get(issue.line) ?? [];
    list.push(issue);
    issuesByLine.set(issue.line, list);
  }

  const copyFix = async (issue: Issue) => {
    if (!issue.suggested_fix) return;
    await navigator.clipboard.writeText(issue.suggested_fix);
    setCopiedId(issue.id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  return (
    <div className="card" style={{ marginBottom: 16, overflow: "hidden" }}>
      <div className="file-head">
        <span className="path">{file.path}</span>
        <span className="lang">{file.language}</span>
        <span style={{ marginLeft: "auto" }} className="section-sub">{fileIssues.length} issue(s)</span>
      </div>
      <div className="code-view">
        {file.lines.map((line, index) => {
          const lineIssues = line.number ? issuesByLine.get(line.number) ?? [] : [];
          const first = lineIssues[0];
          const isSelected = first && first.id === selectedIssueId;
          return (
            <div key={`${file.path}-${index}`}>
              <div
                className={[
                  "code-line", line.kind,
                  first ? "has-issue" : "",
                  first?.severity === "critical" ? "critical" : "",
                  first && resolvedIds?.has(first.id) ? "resolved-line" : "",
                  isSelected ? "selected" : "",
                ].join(" ")}
                onClick={() => first && onSelectIssue(first)}
                title={first ? `${first.title} — click to view` : undefined}
              >
                <span className="no">{line.number || ""}</span>
                <span className="txt">{line.content || " "}</span>
              </div>

              {lineIssues.map((issue) => (
                <div key={issue.id} className={`inline-thread ${resolvedIds?.has(issue.id) ? "resolved" : ""}`}>
                  <div className="thread-avatar"><Bot size={14} /></div>
                  <div className="thread-body">
                    <div className="thread-top">
                      <strong>pr-review-bot</strong>
                      <span className={`badge badge-${issue.severity}`}>{issue.severity}</span>
                      <span className="badge badge-cat mono">{issue.rule_id}</span>
                      {resolvedIds?.has(issue.id) && <span className="badge badge-resolved">resolved</span>}
                    </div>
                    <div className="thread-title">{issue.title}</div>
                    <p>{issue.message}</p>
                    {issue.suggested_fix && (
                      <>
                        <pre className="thread-fix">{issue.suggested_fix}</pre>
                        <div className="thread-actions">
                          <button className="btn btn-ghost btn-small" onClick={() => copyFix(issue)}>
                            <Copy size={12} /> {copiedId === issue.id ? "Copied" : "Copy fix"}
                          </button>
                          {onResolve && !resolvedIds?.has(issue.id) && (
                            <button className="btn btn-ghost btn-small" onClick={() => onResolve(issue)}>
                              <Check size={12} /> Resolve conversation
                            </button>
                          )}
                        </div>
                      </>
                    )}
                    {!issue.suggested_fix && onResolve && !resolvedIds?.has(issue.id) && (
                      <div className="thread-actions">
                        <button className="btn btn-ghost btn-small" onClick={() => onResolve(issue)}>
                          <Check size={12} /> Resolve conversation
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
