import React, { useEffect, useMemo, useState } from "react";
import { ChevronRight, ClipboardList } from "lucide-react";
import { listFiles } from "../../lib/orderForms/store";
import { ordersNeedingAttention } from "../../lib/orderForms/status";
import { isoToday } from "../../utils/dates";
import MarketFlag from "./MarketFlag";
import { formatDay, MEDIUM_CLASS, MEDIUM_LABEL } from "./format";

// The profile's Orders Today: what needs a PM across every film they have
// loaded in Client Orders, without opening each one. A trial. It reads the
// films kept in this browser, so it is as fresh as their last Refresh, and it
// says when that was.

const GROUPS = [
  { id: "overdue", label: "Overdue", note: "Past the delivery deadline and not confirmed", tone: "text-rose-600", dot: "bg-rose-500" },
  { id: "dueSoon", label: "Due this week", note: "Deadline within seven days and not confirmed", tone: "text-amber-700", dot: "bg-amber-500" },
  { id: "requested", label: "Requests to pick up", note: "In the sheet, not yet ticked as received", tone: "text-sky-600", dot: "bg-sky-500" },
  { id: "pending", label: "Pending with the market", note: "The market has marked these as not ready", tone: "text-[#768994]", dot: "bg-slate-400" },
];

const SHOWN = 8;
const linkTo = (fileId, market) => `#orderforms/${fileId}${market ? `/${encodeURIComponent(market)}` : ""}`;
const readAt = (iso) => new Date(iso).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" });
const sizeOf = (o) => (o.width && o.height ? `${o.width} × ${o.height}${o.unit ? ` ${o.unit}` : ""}` : "");

export default function OrdersToday() {
  const [files, setFiles] = useState(null);
  const [expanded, setExpanded] = useState({});
  const today = isoToday();

  useEffect(() => {
    listFiles().then(setFiles);
  }, []);

  const found = useMemo(() => ordersNeedingAttention(files, today), [files, today]);

  if (files === null) return <div className="h-48 rounded-2xl bg-white/60 border border-[#dce4ec] animate-pulse" />;

  if (files.length === 0) {
    return (
      <div className="bg-white border border-[#dce4ec] rounded-2xl shadow-sm px-6 py-14 text-center">
        <ClipboardList className="w-8 h-8 mx-auto text-[#768994] mb-3" strokeWidth={1.5} />
        <p className="font-display text-xl font-bold tracking-tight text-[#122027]">No films loaded in this browser</p>
        <p className="text-sm text-[#768994] mt-1.5 mb-5">Load one in Client Orders and what needs you will be listed here.</p>
        <a href="#orderforms" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#122027] hover:bg-[#25373c] text-white text-sm font-bold transition-colors">
          Open Client Orders
          <ChevronRight className="w-4 h-4" />
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {GROUPS.map((g) => (
          <a key={g.id} href={`#orders-${g.id}`} className="bg-white border border-[#dce4ec] rounded-2xl shadow-sm px-5 py-4 hover:border-[#12a0e1] transition-colors">
            <p className={`font-display text-3xl font-bold tracking-tight tabular-nums ${found[g.id].length ? g.tone : "text-[#b6c3cc]"}`}>{found[g.id].length}</p>
            <p className="text-xs font-bold text-[#122027] mt-0.5">{g.label}</p>
          </a>
        ))}
      </div>

      {GROUPS.filter((g) => found[g.id].length > 0).map((g) => {
        const all = found[g.id];
        const rows = expanded[g.id] ? all : all.slice(0, SHOWN);
        return (
          <div key={g.id} id={`orders-${g.id}`} className="bg-white border border-[#dce4ec] rounded-2xl shadow-sm overflow-hidden">
            <div className="flex items-baseline gap-2 px-5 py-3 border-b border-[#dce4ec] bg-slate-50/60">
              <span className={`w-2 h-2 rounded-full self-center ${g.dot}`} />
              <h3 className="text-[10px] font-black uppercase tracking-widest text-[#122027]">{g.label}</h3>
              <p className="text-xs text-[#768994] truncate">{all.length} · {g.note}</p>
            </div>
            {rows.map((e) => (
              <a
                key={`${e.fileId}|${e.market}|${e.order.tab}|${e.order.row}`}
                href={linkTo(e.fileId, e.market)}
                className="group flex items-center gap-3 px-5 py-2.5 border-b border-slate-100 last:border-b-0 text-sm hover:bg-slate-50 transition-colors"
              >
                <span className={`w-20 shrink-0 tabular-nums font-bold ${g.tone}`}>{formatDay(e.order.deliveryDeadline, today)}</span>
                <span className="flex items-center gap-2 w-44 shrink-0 min-w-0">
                  <MarketFlag name={e.market} />
                  <span className="font-bold text-[#122027] truncate">{e.market}</span>
                </span>
                <span className="flex-1 min-w-0 truncate text-[#122027]">
                  {[e.order.placement, e.order.siteName, sizeOf(e.order)].filter(Boolean).join(" · ") || `Row ${e.order.row}`}
                </span>
                <span className="hidden md:block w-56 shrink-0 truncate text-xs text-[#768994] text-right">{e.film}</span>
                <ChevronRight className="w-4 h-4 text-[#b6c3cc] group-hover:text-[#122027] group-hover:translate-x-0.5 transition-[color,transform] shrink-0" />
              </a>
            ))}
            {all.length > SHOWN && (
              <button
                onClick={() => setExpanded((prev) => ({ ...prev, [g.id]: !prev[g.id] }))}
                className="w-full px-5 py-2.5 text-xs font-bold text-[#768994] hover:text-[#122027] hover:bg-slate-50 transition-colors text-left"
              >
                {expanded[g.id] ? "Show fewer" : `Show all ${all.length}`}
              </button>
            )}
          </div>
        );
      })}

      {GROUPS.every((g) => found[g.id].length === 0) && (
        <p className="bg-white border border-[#dce4ec] rounded-2xl shadow-sm px-6 py-10 text-center text-sm text-[#768994]">
          Nothing is late, due this week, waiting to be picked up or pending in the films you have loaded.
        </p>
      )}

      <div className="bg-white border border-[#dce4ec] rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-[#dce4ec] bg-slate-50/60">
          <h3 className="text-[10px] font-black uppercase tracking-widest text-[#122027]">Films this is read from</h3>
        </div>
        {found.films.map((f) => (
          <a key={f.fileId} href={linkTo(f.fileId)} className="group flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2.5 border-b border-slate-100 last:border-b-0 text-sm hover:bg-slate-50 transition-colors">
            <span className="font-bold text-[#122027] truncate">{f.film.replace(/\.xlsx$/i, "")}</span>
            <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${MEDIUM_CLASS[f.kind] || MEDIUM_CLASS.motion}`}>{MEDIUM_LABEL[f.kind] || "Motion"}</span>
            <span className="text-xs text-[#768994] tabular-nums">{f.orders} orders</span>
            {/* As fresh as the last read: this page doesn't go to Google itself. */}
            <span className="ml-auto text-xs text-[#768994]">read {readAt(f.loadedAt)}</span>
            <ChevronRight className="w-4 h-4 text-[#b6c3cc] group-hover:text-[#122027] shrink-0" />
          </a>
        ))}
      </div>
    </div>
  );
}
