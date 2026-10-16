import { useMemo, useRef } from "react";

const KEYWORDS = new Set([
  "import", "from", "def", "class", "return", "if", "elif", "else", "for", "while", "try", "except", "finally",
  "with", "as", "pass", "raise", "in", "is", "not", "and", "or", "None", "True", "False", "async", "await",
  "const", "let", "var", "function", "new", "export", "default",
]);

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Small regex tokenizer — keywords, strings, comments, numbers, decorators. */
export function highlight(code: string): string {
  const pattern = /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|#[^\n]*|\/\/[^\n]*|\b\d+(?:\.\d+)?\b|@[A-Za-z_]\w*|\b[A-Za-z_]\w*(?=\()|\b[A-Za-z_]\w*)/g;
  let out = "";
  let last = 0;
  for (const match of code.matchAll(pattern)) {
    const token = match[0];
    const index = match.index ?? 0;
    out += escapeHtml(code.slice(last, index));
    let cls = "";
    if (token.startsWith("#") || token.startsWith("//")) cls = "tok-comment";
    else if (token.startsWith('"') || token.startsWith("'")) cls = "tok-string";
    else if (/^\d/.test(token)) cls = "tok-number";
    else if (token.startsWith("@")) cls = "tok-decorator";
    else if (KEYWORDS.has(token)) cls = "tok-keyword";
    else if (/^[A-Za-z_]\w*$/.test(token) && code[index + token.length] === "(") cls = "tok-function";
    out += cls ? `<span class="${cls}">${escapeHtml(token)}</span>` : escapeHtml(token);
    last = index + token.length;
  }
  out += escapeHtml(code.slice(last));
  return out + "\n";
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  readOnly?: boolean;
}

export default function SyntaxEditor({ value, onChange, placeholder, readOnly = false }: Props) {
  const gutterRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HTMLPreElement>(null);
  const html = useMemo(() => highlight(value), [value]);
  const lineCount = Math.max(value.split("\n").length, 1);

  const syncScroll = (el: HTMLTextAreaElement) => {
    if (gutterRef.current) gutterRef.current.scrollTop = el.scrollTop;
    if (highlightRef.current) {
      highlightRef.current.scrollTop = el.scrollTop;
      highlightRef.current.scrollLeft = el.scrollLeft;
    }
  };

  return (
    <div className="syntax-shell">
      <div className="editor-gutter" ref={gutterRef} aria-hidden>
        {Array.from({ length: lineCount }, (_, i) => <div key={i}>{i + 1}</div>)}
      </div>
      <div className="syntax-stack">
        <pre className="syntax-highlight" ref={highlightRef} aria-hidden dangerouslySetInnerHTML={{ __html: html }} />
        <textarea
          className="syntax-input"
          value={value}
          readOnly={readOnly}
          onChange={(e) => onChange(e.target.value)}
          onScroll={(e) => syncScroll(e.currentTarget)}
          onKeyDown={(e) => {
            if (e.key === "Tab" && !readOnly) {
              e.preventDefault();
              const el = e.currentTarget;
              const { selectionStart, selectionEnd } = el;
              onChange(value.slice(0, selectionStart) + "    " + value.slice(selectionEnd));
              requestAnimationFrame(() => el.setSelectionRange(selectionStart + 4, selectionStart + 4));
            }
          }}
          placeholder={placeholder}
          spellCheck={false}
        />
      </div>
    </div>
  );
}
