import { useCallback, useEffect, useRef, useState } from "react";

// Drag-to-resize column widths for a table, persisted to localStorage.
//
// Usage:
//   const cols = [{ key: "name", px: 200 }, ...];
//   const { widths, resizeHandle } = useColumnResize("my-table", cols);
//   ...
//   <colgroup>{cols.map(c => <col key={c.key} style={{ width: widths[c.key] }} />)}</colgroup>
//   <th style={{ position: "relative" }}>Label {resizeHandle(c.key)}</th>
//
// The table itself should use `tableLayout: "fixed"` so <colgroup> widths win
// regardless of cell content. Double-clicking a handle resets that one column.
export function useColumnResize(storageKey, columns, { min = 32, dark = false } = {}) {
  const defaults = {};
  for (const c of columns) defaults[c.key] = c.px;

  const [widths, setWidths] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
      if (saved && typeof saved === "object") {
        const merged = {};
        for (const c of columns) merged[c.key] = typeof saved[c.key] === "number" ? saved[c.key] : c.px;
        return merged;
      }
    } catch { /* ignore corrupt storage */ }
    return { ...defaults };
  });

  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(widths)); } catch { /* ignore */ }
  }, [storageKey, widths]);

  const drag = useRef(null);

  const onMove = useCallback((e) => {
    const d = drag.current;
    if (!d) return;
    const next = Math.max(min, d.startW + (e.clientX - d.startX));
    setWidths((w) => (w[d.key] === next ? w : { ...w, [d.key]: next }));
  }, [min]);

  const onUp = useCallback(() => {
    drag.current = null;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, [onMove]);

  const startResize = useCallback((key) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    drag.current = { key, startX: e.clientX, startW: widths[key] };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, [widths, onMove, onUp]);

  const resetOne = useCallback((key) => {
    setWidths((w) => ({ ...w, [key]: defaults[key] }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetAll = useCallback(() => setWidths({ ...defaults }), [storageKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Render helper: a thin grip on the right edge of a <th>. The <th> must be
  // position: relative for this to anchor correctly.
  const resizeHandle = useCallback((key) => (
    <span
      onPointerDown={startResize(key)}
      onDoubleClick={(e) => { e.stopPropagation(); resetOne(key); }}
      onClick={(e) => e.stopPropagation()}
      title="Drag to resize · double-click to reset"
      className="group absolute top-0 right-0 z-10 flex h-full w-2 cursor-col-resize items-stretch justify-end"
      style={{ touchAction: "none" }}
    >
      <span
        className={`w-px transition-colors ${
          dark
            ? "bg-white/10 group-hover:bg-white/50"
            : "bg-black/10 group-hover:bg-[#12a0e1]"
        }`}
      />
    </span>
  ), [startResize, resetOne, dark]);

  return { widths, startResize, resizeHandle, resetAll };
}
