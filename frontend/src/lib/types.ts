export type Severity = "critical" | "high" | "medium" | "low";
export type Category = "security" | "bug" | "performance" | "style";

export interface Issue {
  id: string;
  rule_id: string;
  file: string;
  line: number;
  severity: Severity;
  category: Category;
  title: string;
  message: string;
  code_snippet: string;
  suggestion: string;
  suggested_fix: string | null;
}

export interface CodeLine {
  number: number;
  content: string;
  kind: "context" | "added" | "removed";
}

export interface FileContent {
  path: string;
  language: string;
  lines: CodeLine[];
}

export interface FileSummary {
  path: string;
  language: string;
  lines_added: number;
  lines_removed: number;
  issue_count: number;
}

export interface ReviewResult {
  id: string;
  title: string;
  source: string;
  created_at: string;
  score: number;
  grade: string;
  summary: string;
  files: FileSummary[];
  file_contents: FileContent[];
  issues: Issue[];
  stats: Record<string, number>;
}

export interface DashboardStats {
  total_reviews: number;
  average_score: number;
  critical_issues: number;
  files_analyzed: number;
}
