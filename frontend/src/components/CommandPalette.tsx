import { useEffect, useMemo, useState } from "react";

export interface PaletteAction {
  id: string;
  label: string;
  hint: string;
  run: () => void;
}

export default function CommandPalette({ open, onClose, actions }: {
  open: boolean;
  onClose: () => void;
  actions: PaletteAction[];
}) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);

  useEffect(() => { if (open) { setQuery(""); setIndex(0); } }, [open ]);

  const filtered = useMemo(
    () => actions.filter((a) => (a.label + " " + a.hint).toLowerCase().includes(query.toLowerCase())),
    [actions, query],
  );

  useEffect(() => { setIndex(0); }, [query]);

  if (!open) return null;
  return (
        <div className="palette-backdrop" onClick={onClose}>
          <div className="palette" onClick={(e) => e.stopPropagation()}>
            <div className="palette-search">
              <span className="palette-search-label">Search</span>
              <input
                autoFocus value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder="Type a command or search reviews…"
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") { e.preventDefault(); setIndex(Math.min(index + 1, filtered.length - 1)); }
                  if (e.key === "ArrowUp") { e.preventDefault(); setIndex(Math.max(index - 1, 0)); }
                  if (e.key === "Enter" && filtered[index]) { filtered[index].run(); onClose(); }
                  if (e.key === "Escape") onClose();
                }}
              />
              <kbd>ESC</kbd>
            </div>
            <div className="palette-list">
              {filtered.length === 0 && <div className="palette-empty">No matching commands</div>}
              {filtered.map((action, i) => (
                <button
                  key={action.id}
                  className={`palette-item ${i === index ? "active" : ""}`}
                  onMouseEnter={() => setIndex(i)}
                  onClick={() => { action.run(); onClose(); }}
                >
                  <span>{action.label}</span><span className="palette-hint">{action.hint}</span>
                </button>
              ))}
            </div>
            <div className="palette-foot"><span>↑↓ navigate</span><span>↵ select</span><span>Ctrl+Enter runs a review</span></div>
          </div>
        </div>
  );
}
