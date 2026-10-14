import React, { useMemo, useRef, useState } from "react";
import { HoverLabel } from "../shared/FloatingCard";
import { ArrowDown, ArrowUp, ChevronRight } from "lucide-react";
import { marketSummary, fileTotals, sortMarkets, changesNote } from "../../lib/orderForms/status";
import MarketFlag from "./MarketFlag";
import { formatDay, undatedNote, pillClass, STATUS_CLASS, STATUS_LABEL, URGENCY_TEXT } from "./format";

// The overview: every market in the file as one row, so a PM can see who has
// confirmed and what's due without opening a tab per country.

const FILTERS = [
  { id: "requested", label: "Request received", test: (m) => m.status === "requested", on: "bg-sky-600 text-white border-sky-600" },
  { id: "confirmed", label: "Confirmed", test: (m) => m.status === "confirmed", on: "bg-[#1cc1a5] text-white border-[#1cc1a5]" },
  { id: "pending", label: "Pending", test: (m) => m.status === "pending", on: "bg-amber-500 text-white border-amber-500" },
  { id: "unconfirmed", label: "Unconfirmed", test: (m) => m.status === "unconfirmed", on: "bg-violet-600 text-white border-violet-600" },
  { id: "due", label: "Due or overdue", test: (m) => !!m.urgency, on: "bg-rose-600 text-white border-rose-600" },
  { id: "notStarted", label: "Not started", test: (m) => m.status === "notStarted", on: "bg-slate-600 text-white border-slate-600" },
  // Tested against the file, not the summary: see `changedIn` below.
  { id: "changed", label: "Changed", test: (m, changedIn) => !!changedIn(m.name), on: "bg-indigo-600 text-white border-indigo-600" },
];

const STATUS_ORDER = { requested: 0, pending: 1, unconfirmed: 2, confirmed: 3, notStarted: 4, unreadable: 5 };
const COMPARE = {
  name: (a, b) => a.name.localeCompare(b.name),
  status: (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.name.localeCompare(b.name),
  // Markets with no deadline go last whichever way the column is sorted.
  deadline: (a, b) => (a.nextDeadline || "9999").localeCompare(b.nextDeadline || "9999"),
};

const GRID = "grid grid-cols-[minmax(0,1.4fr)_120px_minmax(0,1fr)_120px_90px_90px_20px] gap-4 items-center px-5";

// `changed` is what the last Refresh found different in this market and nobody
// has looked at yet, as a line ("2 new · 1 confirmed").
function MarketName({ name, undated = 0, changed = "" }) {
  return (
    <span className="flex items-center gap-2.5 min-w-0">
      <MarketFlag name={name} />
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 font-bold text-[#122027]">
          <span className="truncate">{name}</span>
          {changed && <span className="w-2 h-2 rounded-full bg-indigo-600 shrink-0" aria-hidden />}
        </span>
        {changed && <span className="block text-[11px] font-bold text-indigo-600 truncate">{changed}</span>}
        {undated > 0 && <span className="block text-[11px] text-[#768994] truncate">{undatedNote(undated)}</span>}
      </span>
    </span>
  );
}

function SortHeader({ id, sort, onSort, children }) {
  const active = sort?.by === id;
  const Arrow = active && sort.desc ? ArrowDown : ArrowUp;
  return (
    <button onClick={() => onSort(id)} className={`flex items-center gap-1 text-left font-black uppercase tracking-widest hover:text-[#122027] ${active ? "text-[#122027]" : ""}`}>
      {children}
      {active && <Arrow className="w-3 h-3" />}
    </button>
  );
}

// `actions` sits at the right of the filter bar and `panel` opens under it,
// for what acts on the whole film (editing its sheets).
// `arriving` is a film still loading: rows ease in as each market is read,
// their bars fill, and they don't open yet. A finished list is shown still,
// since it is returned to from every market and shouldn't replay each time:
// it only fades in, as a whole, when it is come back to or the film changes.
// `still` is the list a load ends on, which the arriving one already showed.
export default function MarketList({ file, today, matcher, onOpen, arriving = false, still = false, actions, panel }) {
  const skipFade = useRef(still ? file.id : null);
  if (skipFade.current !== file.id) skipFade.current = null;
  const [filter, setFilter] = useState(null);
  // null = the default order (what needs attention first).
  const [sort, setSort] = useState(null);

  const totals = useMemo(() => fileTotals(file, today), [file, today]);
  const summaries = useMemo(() => sortMarkets(file.markets.map((m) => marketSummary(m, today))), [file, today]);

  // How many of each market's orders are already tasks in Wrike.
  const inWrike = useMemo(
    () => new Map(file.markets.map((m) => [
      m.name,
      matcher ? matcher.match(m.orders, file.links?.[m.name], file.briefed?.[m.name], m.kind || file.kind).filter(Boolean).length : 0,
    ])),
    [file, matcher]
  );

  // What the last Refresh changed in a market and hasn't been looked at.
  const changedIn = useMemo(() => {
    const changes = file.changes || {};
    return (name) => changesNote(changes[name]);
  }, [file]);

  const rows = useMemo(() => {
    const test = FILTERS.find((f) => f.id === filter)?.test;
    const shown = test ? summaries.filter((m) => test(m, changedIn)) : summaries;
    if (!sort) return shown;
    const sorted = [...shown].sort(COMPARE[sort.by]);
    return sort.desc ? sorted.reverse() : sorted;
  }, [summaries, filter, sort, changedIn]);

  // Third click on a column returns to the default order.
  const onSort = (by) =>
    setSort((s) => (s?.by !== by ? { by, desc: false } : s.desc ? null : { by, desc: true }));

  // Markets with no orders yet get a list of their own under the table, so
  // they don't sit between the ones a PM has something to read in.
  const active = rows.filter((m) => m.status !== "notStarted");
  const idle = rows.filter((m) => m.status === "notStarted");

  const counts = { changed: Object.keys(file.changes || {}).length, requested: totals.requested, confirmed: totals.confirmed, pending: totals.pending, unconfirmed: totals.unconfirmed, due: totals.due, notStarted: totals.notStarted };

  return (
    // Keyed by film so the fade plays again when another one is picked.
    <div key={file.id} className={`space-y-4 ${arriving || skipFade.current ? "" : "view-fade"}`}>
      <div className="bg-white border border-[#dce4ec] rounded-2xl shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 px-5 py-4 border-b border-[#dce4ec]">
          {/* A status nobody is in isn't worth a button. */}
          {FILTERS.filter((f) => counts[f.id] > 0 || filter === f.id).map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(filter === f.id ? null : f.id)}
              aria-pressed={filter === f.id}
              className={`flex items-center gap-2 pl-3 pr-2 py-1.5 rounded-xl border text-sm font-bold transition-colors ${
                filter === f.id ? `key-down ${f.on}` : "key bg-white border-[#dce4ec] text-[#122027] hover:border-[#9aabb5]"
              }`}
            >
              {f.label}
              <span className={`min-w-[1.5rem] px-1.5 py-0.5 rounded-md text-center text-xs tabular-nums ${filter === f.id ? "bg-black/15 text-white" : "bg-slate-100 text-[#768994]"}`}>{counts[f.id]}</span>
            </button>
          ))}
          <p className="ml-auto text-sm text-[#768994]">
            {totals.markets} markets · {totals.orders} orders
          </p>
          {actions}
        </div>
        {panel}

        {active.length > 0 && <div className={`${GRID} py-2.5 border-b border-[#dce4ec] bg-slate-50/60 tray text-[10px] font-black uppercase tracking-widest text-[#768994]`}>
          <SortHeader id="name" sort={sort} onSort={onSort}>Market</SortHeader>
          <SortHeader id="status" sort={sort} onSort={onSort}>Status</SortHeader>
          <span>Orders confirmed</span>
          <SortHeader id="deadline" sort={sort} onSort={onSort}>Next deadline</SortHeader>
          <span>Media ok</span>
          <HoverLabel label="Orders matched to a Wrike task TimeHub has loaded: by name, by a close name, or chosen by hand. A task it hasn't loaded doesn't show."><span>In Wrike</span></HoverLabel>
          <span />
        </div>}

        {rows.length === 0 && (
          <p className="px-5 py-10 text-center text-sm text-[#768994]">No markets match this filter.</p>
        )}

        {active.map((m) => {
          if (m.status === "unreadable") {
            return (
              <div key={m.name} className={`${GRID} py-3 border-b border-slate-100 last:border-b-0 text-sm ${arriving ? "list-row-in" : ""}`}>
                <MarketName name={m.name} />
                <span><span className={`${pillClass} ${STATUS_CLASS.unreadable}`}>{STATUS_LABEL.unreadable}</span></span>
                <span className="col-span-5 text-[#768994] truncate">{m.unreadable}</span>
              </div>
            );
          }
          const pct = m.total ? Math.round((m.confirmed / m.total) * 100) : 0;
          return (
            <button
              key={m.name}
              onClick={() => onOpen?.(m.name)}
              disabled={arriving}
              className={`${arriving ? "list-row-in " : ""}${GRID} row-lift w-full py-3 border-b border-slate-100 last:border-b-0 text-sm text-left hover:bg-slate-50 focus:outline-none focus-visible:bg-slate-50 transition-colors group`}
            >
              <MarketName name={m.name} undated={m.undated} changed={changedIn(m.name)} />
              <span><span className={`${pillClass} ${STATUS_CLASS[m.status]}`}>{STATUS_LABEL[m.status]}</span></span>
              <span className="flex items-center gap-3 min-w-0">
                <span className="groove flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                  <span className={`groove-fill block h-full rounded-full bg-[#1cc1a5] ${arriving ? "bar-fill" : ""}`} style={{ width: `${pct}%` }} />
                </span>
                <span className="text-xs text-[#768994] tabular-nums shrink-0 w-14 text-right">{m.confirmed} of {m.total}</span>
              </span>
              <span className={`tabular-nums ${m.urgency ? `font-bold ${URGENCY_TEXT[m.urgency]}` : m.nextDeadline ? "text-[#122027]" : "text-[#b6c3cc]"}`}>
                {m.nextDeadline ? formatDay(m.nextDeadline, today) : "—"}
                {m.urgency === "overdue" && <span className="block text-[10px] font-black uppercase tracking-wider">Overdue</span>}
              </span>
              <span className={`tabular-nums ${m.total ? "text-[#122027]" : "text-[#b6c3cc]"}`}>
                {m.total ? `${m.mediaApproved} of ${m.total}` : "—"}
              </span>
              <span className={`tabular-nums ${inWrike.get(m.name) ? "text-[#122027]" : "text-[#b6c3cc]"}`}>
                {inWrike.get(m.name) ? `${inWrike.get(m.name)} of ${m.total}` : "—"}
              </span>
              <ChevronRight className="w-4 h-4 text-[#b6c3cc] group-hover:text-[#122027] group-hover:translate-x-0.5 transition-[color,transform]" />
            </button>
          );
        })}
      </div>

      {idle.length > 0 && (
        <div className="bg-white border border-[#dce4ec] rounded-2xl shadow-sm overflow-hidden">
          <div className="flex items-baseline gap-2 px-5 py-3 border-b border-[#dce4ec] bg-slate-50/60 tray">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-[#768994]">Not started</h3>
            <p className="text-xs text-[#768994]">{idle.length} {idle.length === 1 ? "market" : "markets"} with no orders yet</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {idle.map((m) => (
              <button
                key={m.name}
                onClick={() => onOpen?.(m.name)}
                disabled={arriving}
                className={`${arriving ? "list-row-in " : ""}flex items-center px-5 py-2.5 border-b border-slate-100 text-sm text-left hover:bg-slate-50 focus:outline-none focus-visible:bg-slate-50 transition-colors`}
              >
                <MarketName name={m.name} undated={m.undated} changed={changedIn(m.name)} />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
