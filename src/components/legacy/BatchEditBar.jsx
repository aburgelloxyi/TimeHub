import { useEffect, useRef, useState } from "react";
import { ChevronDown, Copy, Merge, Search, Tag, X } from "lucide-react";
import { HoverLabel } from "../shared/FloatingCard";
import { CATEGORIES } from "../../constants.js";

// The category picker in the batch-edit bar. Its own compact list rather than
// TableSearchableSelect: that component's menu is built for a table cell and
// anchored to it, and this one has to open UPWARD out of a floating bar sitting
// at the foot of the table.
function BatchCategoryPicker({ onPick, pinned = [] }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) { setSearch(""); return; }
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const filtered = search
    ? CATEGORIES.filter((c) => c.toLowerCase().includes(search.toLowerCase()))
    : CATEGORIES;

  return (
    <div className="relative" ref={wrapRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-white/10 hover:bg-white/20 transition-colors"
      >
        <Tag className="w-3.5 h-3.5" />
        Set category
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-[300px]">
          <div className="w-full bg-white text-[#122027] border border-[#dce4ec] rounded-2xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200">
            <div className="p-2.5 pb-2">
              <div className="flex items-center gap-2 bg-slate-50 border border-[#dce4ec] rounded-xl px-2.5 py-1.5">
                <Search className="w-3.5 h-3.5 text-[#768994] shrink-0" />
                <input
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search categories…"
                  className="w-full bg-transparent text-xs outline-none placeholder:text-[#768994]"
                />
              </div>
            </div>
            <div className="max-h-56 overflow-y-auto overscroll-contain px-2 pb-2">
              {/* Same shortlist as the row dropdown, and only while unfiltered
                  — once you are searching, a shortlist above the matches is
                  just a duplicate of some of them. */}
              {!search && pinned.length > 0 && (
                <>
                  <p className="px-2.5 pt-1 pb-1 text-[9px] font-black uppercase tracking-widest text-[#12a0e1]">
                    Most used
                  </p>
                  {pinned.map((c) => (
                    <button
                      key={`pinned-${c}`}
                      onClick={() => { onPick(c); setOpen(false); }}
                      className="w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] font-bold hover:bg-slate-50 transition-colors truncate"
                    >
                      {c}
                    </button>
                  ))}
                  <div className="my-1 border-t border-slate-100" />
                </>
              )}
              {filtered.map((c) => (
                <button
                  key={c}
                  onClick={() => { onPick(c); setOpen(false); }}
                  className="w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] hover:bg-slate-50 transition-colors truncate"
                >
                  {c}
                </button>
              ))}
              {filtered.length === 0 && (
                <p className="px-2.5 py-3 text-[11px] text-[#768994] text-center">
                  No category matches “{search}”.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// The bar that appears over the action bar while rows are ticked: set a
// category on them, duplicate, merge, or clear the ticks. Handlers are the
// timesheet's own (LegacyTimesheets.js), passed in.
export default function BatchEditBar({
  activeDay, applyToSelected, clearSelection, duplicateSelected, isMerging, mergeSelected,
  mergeState, rowsAreEditable, selectedCount, topCategories,
}) {
  return (
    <div className="relative z-20 -mb-4 flex justify-center pointer-events-none">
      <div className="pointer-events-auto flex flex-wrap justify-center items-center gap-2 max-w-full glass-bar text-white rounded-3xl sm:rounded-full shadow-lg px-2 py-1.5 animate-in fade-in slide-in-from-bottom-2 duration-200">
        <span className="text-[11px] font-black uppercase tracking-widest pl-2">
          {selectedCount} selected
        </span>
        <span className="w-px h-4 bg-white/20 shrink-0" />
        <BatchCategoryPicker
          pinned={topCategories}
          onPick={(val) => applyToSelected("category", val)}
        />
        {/* The locked reason stays a title: a disabled button sends no
            hover events for the card to open on. */}
        <HoverLabel label="Copy the ticked row(s), hours left blank">
          <button
            onClick={duplicateSelected}
            disabled={!rowsAreEditable}
            title={rowsAreEditable ? undefined : `${activeDay} is locked`}
            className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold text-white/80 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed"
          >
            <Copy className="w-3.5 h-3.5" />
            Duplicate
          </button>
        </HoverLabel>
        {/* Stays hoverable when it can't merge, so the reason shows. */}
        <HoverLabel
          label={
            !rowsAreEditable
              ? `${activeDay} is locked`
              : mergeState.ok
              ? "Merge into one entry: times added up, markets combined"
              : mergeState.reason
          }
        >
          <button
            onClick={mergeSelected}
            aria-disabled={!rowsAreEditable || !mergeState.ok || isMerging}
            aria-label="Merge the ticked rows into one entry"
            className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold transition-colors ${
              !rowsAreEditable || !mergeState.ok || isMerging
                ? "text-white/80 opacity-40 cursor-not-allowed"
                : "text-white/80 hover:text-white hover:bg-white/10"
            }`}
          >
            <Merge className="w-3.5 h-3.5" />
            {isMerging ? "Merging…" : "Merge"}
          </button>
        </HoverLabel>
        <span className="w-px h-4 bg-white/20 shrink-0" />
        <button
          onClick={clearSelection}
          className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold text-white/60 hover:text-white transition-colors"
        >
          <X className="w-3.5 h-3.5" />
          Clear
        </button>
      </div>
    </div>
  );
}
