// Choosing a film in Jobs setup: one list to scan rather than a column per
// studio. Studios are a row of filters above it, the films worked on lately
// lead, and typing narrows across all of them.
//
// Part of Administration.
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Film, Search } from "lucide-react";
import { tokenMatch } from "../../utils/search";

const RECENT = 6;

// `films` is [{ title, studio, lastTouched }]. The newest lastTouched (a film's
// most recently changed job) decides which are "recent"; a film with no jobs
// has none and isn't.
export function FilmPicker({ value, onChange, films, loading, studioOrder = [], onOpenFilms }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [studio, setStudio] = useState("");
  const [active, setActive] = useState(0);
  const wrapRef = useRef(null);
  const listRef = useRef(null);

  const studios = useMemo(() => {
    const counts = new Map();
    films.forEach((f) => counts.set(f.studio || "Other", (counts.get(f.studio || "Other") || 0) + 1));
    const rank = (s) => { const i = studioOrder.indexOf(s); return i === -1 ? studioOrder.length : i; };
    return [...counts.entries()].sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0]));
  }, [films, studioOrder]);

  // Sections of rows. Browsing everything opens on what was worked on lately,
  // then the whole list A to Z; a search or a studio filter is one plain list.
  const sections = useMemo(() => {
    const byTitle = (a, b) => a.title.localeCompare(b.title);
    const narrowed = films.filter((f) => (!studio || (f.studio || "Other") === studio) && tokenMatch(query, f.title, f.studio));
    if (query.trim() || studio) return [{ name: null, rows: [...narrowed].sort(byTitle) }];
    const recent = films.filter((f) => f.lastTouched).sort((a, b) => b.lastTouched - a.lastTouched).slice(0, RECENT);
    return [
      ...(recent.length ? [{ name: "Worked on lately", rows: recent }] : []),
      { name: recent.length ? "All films" : null, rows: [...films].sort(byTitle) },
    ];
  }, [films, studio, query]);
  const flat = useMemo(() => sections.flatMap((s) => s.rows), [sections]);

  useEffect(() => { setActive(0); }, [query, studio, open]);

  useEffect(() => {
    if (!open) return;
    const away = (e) => { if (!wrapRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);

  const pick = (title) => { onChange(title); setOpen(false); setQuery(""); };
  const onKey = (e) => {
    if (e.key === "Escape") { setOpen(false); return; }
    if (e.key === "Enter") { e.preventDefault(); if (flat[active]) pick(flat[active].title); return; }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const next = Math.max(0, Math.min(flat.length - 1, active + (e.key === "ArrowDown" ? 1 : -1)));
    setActive(next);
    listRef.current?.querySelector(`[data-row="${next}"]`)?.scrollIntoView({ block: "nearest" });
  };

  const current = films.find((f) => f.title === value);
  let row = -1;

  return (
    <div ref={wrapRef} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open}
        className={`press w-full flex items-center gap-3 px-4 py-2.5 bg-white border rounded-2xl text-left outline-none focus-visible:ring-2 focus-visible:ring-[#1cc1a5]/40 ${
          open ? "border-[#1cc1a5]" : "border-[#dce4ec] hover:border-slate-300"
        }`}>
        <Film className="w-4 h-4 text-[#1cc1a5] shrink-0" />
        <span className="flex-1 min-w-0">
          {value ? (
            <>
              <span className="block text-sm font-bold text-[#122027] truncate">{value}</span>
              {current?.studio && <span className="block text-[11px] text-[#768994]">{current.studio}</span>}
            </>
          ) : (
            <span className="text-sm text-[#768994]">{loading ? "Loading films…" : "Choose a film…"}</span>
          )}
        </span>
        <ChevronDown className={`w-4 h-4 text-[#768994] shrink-0 transition-transform duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="pop-in absolute left-0 right-0 top-full mt-1.5 z-dropdown bg-white border border-[#dce4ec] rounded-2xl shadow-xl overflow-hidden"
          style={{ "--pop-origin": "top center" }}>
          <div className="relative border-b border-[#f0f4f8]">
            <Search className="w-4 h-4 text-[#768994] absolute left-4 top-1/2 -translate-y-1/2" />
            <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onKey}
              placeholder="Type a film's name…" aria-label="Find a film"
              className="w-full pl-11 pr-4 py-3 text-sm text-[#122027] outline-none placeholder-[#768994]" />
          </div>

          {studios.length > 1 && (
            <div className="flex flex-wrap gap-1.5 px-3 py-2.5 border-b border-[#f0f4f8]">
              {[["", films.length], ...studios].map(([name, count]) => {
                const on = studio === name;
                return (
                  <button key={name || "all"} type="button" onClick={() => setStudio(name)} aria-pressed={on}
                    className={`press px-2.5 py-1 rounded-lg border text-[11px] font-bold ${
                      on ? "bg-[#122027] border-[#122027] text-white" : "bg-white border-[#dce4ec] text-[#768994] hover:text-[#122027] hover:border-slate-300"
                    }`}>
                    {name || "All"} <span className={on ? "text-white/60" : "text-slate-400"}>{count}</span>
                  </button>
                );
              })}
            </div>
          )}

          <div ref={listRef} role="listbox" className="max-h-[320px] overflow-y-auto py-1">
            {flat.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-[#768994]">
                No film {query.trim() ? <>called &ldquo;{query.trim()}&rdquo;</> : "here"}{studio ? ` in ${studio}` : ""}.
              </p>
            ) : sections.map((s) => (
              <div key={s.name || "list"}>
                {s.name && <p className="px-4 pt-2.5 pb-1 text-[10px] font-black uppercase tracking-widest text-[#768994]">{s.name}</p>}
                {s.rows.map((f) => {
                  row += 1;
                  const i = row;
                  const on = i === active;
                  return (
                    <button key={`${s.name}-${f.title}`} type="button" role="option" aria-selected={f.title === value}
                      data-row={i} onClick={() => pick(f.title)} onMouseMove={() => setActive(i)}
                      className={`w-full flex items-center gap-3 px-4 py-2 text-left transition-colors duration-100 ease-[cubic-bezier(0.22,1,0.36,1)] ${on ? "bg-[#1cc1a5]/[0.08]" : ""}`}>
                      <span className="flex-1 min-w-0 truncate text-sm font-semibold text-[#122027]">{f.title}</span>
                      <span className="text-[11px] text-[#768994] shrink-0">{f.studio || "No studio"}</span>
                      <Check className={`w-3.5 h-3.5 shrink-0 text-[#1cc1a5] ${f.title === value ? "" : "invisible"}`} />
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          {onOpenFilms && (
            <div className="px-4 py-2.5 border-t border-[#f0f4f8] text-[11px] text-[#768994]">
              Not in the list?{" "}
              <button type="button" onClick={onOpenFilms} className="font-bold text-[#0f766e] hover:underline">Open the Films page</button> to add it.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
