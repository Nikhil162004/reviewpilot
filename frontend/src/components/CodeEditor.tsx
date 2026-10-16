import { useRef } from "react";

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minHeight?: number;
}

/** Editor with a synced line-number gutter — the feel of a real code tool. */
export default function CodeEditor({ value, onChange, placeholder, minHeight = 340 }: Props) {
  const gutterRef = useRef<HTMLDivElement>(null);
  const lineCount = Math.max(value.split("\n").length, 1);

  return (
    <div className="editor-shell" style={{ minHeight }}>
      <div className="editor-gutter" ref={gutterRef} aria-hidden>
        {Array.from({ length: lineCount }, (_, i) => (
          <div key={i}>{i + 1}</div>
        ))}
      </div>
      <textarea
        className="editor-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onScroll={(e) => {
          if (gutterRef.current) gutterRef.current.scrollTop = e.currentTarget.scrollTop;
        }}
        onKeyDown={(e) => {
          if (e.key === "Tab") {
            e.preventDefault();
            const el = e.currentTarget;
            const { selectionStart, selectionEnd } = el;
            const next = value.slice(0, selectionStart) + "    " + value.slice(selectionEnd);
            onChange(next);
            requestAnimationFrame(() => el.setSelectionRange(selectionStart + 4, selectionStart + 4));
          }
        }}
        placeholder={placeholder}
        spellCheck={false}
      />
    </div>
  );
}
