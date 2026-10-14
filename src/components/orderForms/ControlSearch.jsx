import React, { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronRight, Search, X } from "lucide-react";
import MarketFlag from "./MarketFlag";
import { formatDay, pillClass, MEDIUM_CLASS, MEDIUM_LABEL, STATUS_CLASS, STATUS_LABEL, URGENCY_TEXT } from "./format";
import { styleFor } from "../../lib/orderForms/wrikeStatus";

// The Control Centre's search bar, and what it finds. ⌘K or "/" from
// anywhere on the page puts the cursor in it; Escape clears it.

const filmTitle = (name) => String(name || "").replace(/\.xlsx$/i, "");

export function SearchBar({ value, onChange }) {
  const input = useRef(null);
  useEffect(() => {
    const onKey = (e) => {
      const typing = /^(input|textarea|select)$/i.test(e.target?.tagName || "") || e.target?.isContentEditable;
      if (((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") || (e.key === "/" && !typing)) {
        e.preventDefault();
        input.current?.focus();
        input.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <label className="group relative flex-1 min-w-0 flex items-center gap-2.5 px-4 py-2.5 rounded-2xl border border-[#dce4ec] bg-white shadow-sm transition-[border-color,box-shadow] focus-within:border-[#12a0e1] focus-within:shadow-md focus-within:shadow-[#12a0e1]/10">
      <Search className="w-4 h-4 shrink-0 text-[#768994] transition-colors group-focus-within:text-[#12a0e1]" />
      <input
        ref={input}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Escape") { onChange(""); e.currentTarget.blur(); } }}
        placeholder='Search every order: a film, market, size, site, Wrike status… or "overdue", "to brief", "row 14"'
        aria-label="Search every order"
        className="flex-1 min-w-0 bg-transparent text-sm text-[#122027] placeholder:text-[#9aabb5] focus:outline-none"
      />
      {value ? (
        <button onClick={() => onChange("")} aria-label="Clear the search" className="p-0.5 rounded-md text-[#768994] hover:text-[#122027] hover:bg-slate-100">
          <X className="w-4 h-4" />
        </button>
      ) : (
        <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded-md border border-[#dce4ec] text-[10px] font-bold text-[#9aabb5]">⌘K</kbd>
      )}
    </label>
  );
}

// The query's words picked out in a name.
function Marked({ text, words }) {
  if (!words.length || !text) return text || null;
  const re = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "ig");
  return String(text).split(re).map((part, i) =>
    i % 2 ? <mark key={i} className="bg-[#12a0e1]/15 text-inherit rounded-sm">{part}</mark> : <React.Fragment key={i}>{part}</React.Fragment>);
}

// `compact` is the header's narrower panel: the task name gets the room the
// site and sheet status columns would take, and the panel itself is the card.
export function SearchResults({ query, result, groups, films, today, linkTo, compact = false }) {
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
  const card = compact ? "bg-white" : "bg-white border border-[#dce4ec] rounded-2xl shadow-sm overflow-hidden";
  if (!result.total) {
    return (
      <motion.p initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={`${card} px-6 py-10 text-center text-sm text-[#768994]`}>
        No match in the {films} {films === 1 ? "film" : "films"} loaded. A film nobody has loaded in Client Orders can't be searched.
      </motion.p>
    );
  }
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className={card}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 px-5 py-3 border-b border-[#dce4ec] bg-slate-50/60">
        <h3 className="text-[10px] font-black uppercase tracking-widest text-[#122027]">
          {result.total} {result.total === 1 ? "order" : "orders"} in {groups.length} {groups.length === 1 ? "market" : "markets"}
        </h3>
        {result.shortcuts.map((s) => (
          <span key={s} className="px-1.5 py-0.5 rounded-md bg-[#12a0e1]/10 text-[10px] font-bold text-[#12a0e1]">{s}</span>
        ))}
        {result.total > result.hits.length && <span className="text-xs text-[#768994]">showing the first {result.hits.length}; add a word to narrow it</span>}
      </div>
      <AnimatePresence initial={false}>
        {groups.map((g, gi) => (
          <motion.div
            key={`${g.fileId}|${g.market}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { delay: Math.min(gi, 10) * 0.02 } }}
            exit={{ opacity: 0 }}
            className="border-b border-slate-100 last:border-b-0"
          >
            <a href={linkTo(g.fileId, g.market)} className="group flex items-center gap-2.5 px-5 pt-3 pb-1.5 hover:bg-slate-50">
              <MarketFlag name={g.market} className="w-6 h-4" />
              <span className="font-display text-sm font-bold tracking-tight text-[#122027]"><Marked text={g.market} words={words} /></span>
              <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${MEDIUM_CLASS[g.kind] || MEDIUM_CLASS.motion}`}>{MEDIUM_LABEL[g.kind] || "Motion"}</span>
              <span className="text-xs text-[#768994] truncate"><Marked text={filmTitle(g.film)} words={words} /></span>
              <ChevronRight className="ml-auto w-4 h-4 shrink-0 text-[#b6c3cc] group-hover:text-[#122027] group-hover:translate-x-0.5 transition-[color,transform]" />
            </a>
            {g.hits.map((h) => {
              const o = h.order;
              return (
                <a
                  key={`${o.tab}|${o.row}`}
                  href={linkTo(h.fileId, h.market, `row-${o.row}`)}
                  className="group flex items-center gap-3 pl-[3.25rem] pr-5 py-1.5 text-sm hover:bg-[#12a0e1]/5 transition-colors"
                >
                  <span className="w-12 shrink-0 text-xs tabular-nums text-[#768994]">row {o.row}</span>
                  <span className="flex-1 min-w-0 truncate font-mono text-xs text-[#122027]" title={o.xyi?.title || o.deliveryName}>
                    <Marked text={o.xyi?.title || o.deliveryName || [o.placement, o.siteName].filter(Boolean).join(" · ") || `Row ${o.row}`} words={words} />
                  </span>
                  {o.siteName && !compact && <span className="hidden lg:block w-36 shrink-0 truncate text-xs text-[#768994]"><Marked text={o.siteName} words={words} /></span>}
                  <span className={`w-16 shrink-0 text-right text-xs tabular-nums ${h.urgency ? `font-bold ${URGENCY_TEXT[h.urgency]}` : "text-[#768994]"}`}>
                    {formatDay(o.deliveryDeadline, today)}
                  </span>
                  {!compact && <span className="hidden sm:block w-24 shrink-0"><span className={`${pillClass} ${STATUS_CLASS[o.status] || ""}`}>{STATUS_LABEL[o.status] || o.status}</span></span>}
                  <span className="w-28 shrink-0 text-right">
                    {h.task ? (
                      <span className={`${pillClass} max-w-full gap-1 ${styleFor(h.wrikeStatus, "").pill}`}>
                        <span className="truncate"><Marked text={h.wrikeStatus || "In Wrike"} words={words} /></span>
                      </span>
                    ) : <span className="text-[11px] text-[#9aabb5]">Not in Wrike</span>}
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 shrink-0 text-[#b6c3cc] opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-[opacity,transform]" />
                </a>
              );
            })}
            <div className="h-1.5" />
          </motion.div>
        ))}
      </AnimatePresence>
    </motion.div>
  );
}
