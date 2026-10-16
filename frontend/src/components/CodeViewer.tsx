import type { FileContent, Issue } from "../lib/types";

interface Props {
  file: FileContent;
  issues: Issue[];
  selectedIssueId: string | null;
  onSelectIssue: (issue: Issue) => void;
}

export default function CodeViewer({ file, issues, selectedIssueId, onSelectIssue }: Props) {
  const issueByLine = new Map<number, Issue>();
  for (const issue of issues) {
    if (issue.file === file.path && !issueByLine.has(issue.line)) {
      issueByLine.set(issue.line, issue);
    }
  }

  return (
    <div className="card" style={{ marginBottom: 16, overflow: "hidden" }}>
      <div className="file-head">
        <span className="path">{file.path}</span>
        <span className="lang">{file.language}</span>
        <span style={{ marginLeft: "auto" }} className="section-sub">
          {issues.filter((i) => i.file === file.path).length} issue(s)
        </span>
      </div>
      <div className="code-view">
        {file.lines.map((line, index) => {
          const issue = line.number ? issueByLine.get(line.number) : undefined;
          const isSelected = issue && issue.id === selectedIssueId;
          return (
            <div
              key={`${file.path}-${index}`}
              className={[
                "code-line", line.kind,
                issue ? "has-issue" : "",
                issue?.severity === "critical" ? "critical" : "",
                isSelected ? "selected" : "",
              ].join(" ")}
              onClick={() => issue && onSelectIssue(issue)}
              title={issue ? `${issue.title} — click to view` : undefined}
            >
              <span className="no">{line.number || ""}</span>
              <span className="txt">{line.content || " "}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
