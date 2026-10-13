import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import { ChevronRight, ClipboardList, ExternalLink, EyeOff, Loader2, RefreshCw, Send } from "lucide-react";
import { listFiles, saveDecisions, saveFile } from "../../lib/orderForms/store";
import { ordersByMarket, changesNote, marketChanges, mergeChanges, LONG_OVERDUE_DAYS } from "../../lib/orderForms/status";
import { makeMatcher, orderKey } from "../../lib/orderForms/wrikeMatch";
import { loadMarketOf } from "../../lib/orderForms/loadFilm";
import { connectGoogle, googleConnected } from "../../lib/orderForms/googleApi";
import { confirmAction } from "../../lib/confirm";
import { notify } from "../../lib/toast";
import { isoToday } from "../../utils/dates";
import MarketFlag from "./MarketFlag";
import { googleMessage } from "./GoogleSource";
import { formatDay, MEDIUM_CLASS, MEDIUM_LABEL } from "./format";
import Sweep, { sweepClass } from "./Sweep";

// The PMs' Control Centre, a section of the profile: what needs a PM across every film the team has
// loaded in Client Orders, without opening each one. A trial.
//
// It is organised by market, because that is the unit a PM works in: a market
// is chased, or its orders are briefed as a batch. Each line can be acted on
// from here (brief, refresh, open the sheet, set aside), and what isn't really
// outstanding is left out (see ordersByMarket). It reads the shared films as
// they were last read from Google, and says when that was.

// The last one isn't orders but markets: what a Refresh changed that this
// person hasn't looked at yet (see status.js, "What changed between reads").
const GROUPS = [
  { id: "overdue", label: "Overdue", note: `Past the deadline in the last ${LONG_OVERDUE_DAYS} days, not confirmed`, tone: "text-rose-600" },
  { id: "dueSoon", label: "Due this week", note: "Deadline within seven days, not confirmed", tone: "text-amber-700" },
  { id: "requested", label: "To pick up", note: "In the sheet, not yet in Wrike or ticked as received", tone: "text-sky-600" },
  { id: "pending", label: "Pending with the market", note: "The market has marked these as not ready", tone: "text-[#768994]" },
  { id: "changed", label: "Changed since you looked", note: "Markets a Refresh found different", tone: "text-indigo-600" },
];

const linkTo = (fileId, market, action) =>
  `#orderforms/${encodeURIComponent(fileId)}${market ? `/${encodeURIComponent(market)}` : ""}${action ? `/${action}` : ""}`;
const readAt = (iso) => new Date(iso).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" });
const sizeOf = (o) => (o.width && o.height ? `${o.width} × ${o.height}${o.unit ? ` ${o.unit}` : ""}` : "");
const filmTitle = (name) => String(name || "").replace(/\.xlsx$/i, "");
const count = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Rows rise in one after another the first time each appears, the way the
// profile's other sections do. A ref per row, remembered by id, so a re-render
// doesn't replay it on rows that were already there.
function useCascade() {
  const seen = useRef(new Map());
  return useCallback((id, index) => {
    if (seen.current.has(id)) return seen.current.get(id);
    const ref = (node) => {
      if (!node || reducedMotion()) return;
      gsap.fromTo(node, { y: 10, opacity: 0 }, { y: 0, opacity: 1, duration: 0.28, ease: "power2.out", delay: Math.min(index, 14) * 0.025, clearProps: "transform" });
    };
    seen.current.set(id, ref);
    return ref;
  }, []);
}

// A figure that counts up to its value, and on from there when it changes.
function Counted({ value, className }) {
  const ref = useRef(null);
  const shown = useRef(0);
  useEffect(() => {
    if (!ref.current) return;
    if (reducedMotion()) { ref.current.textContent = value; shown.current = value; return; }
    const at = { n: shown.current };
    const tween = gsap.to(at, { n: value, duration: 0.6, ease: "power2.out", onUpdate: () => { if (ref.current) ref.current.textContent = Math.round(at.n); } });
    shown.current = value;
    return () => tween.kill();
  }, [value]);
  return <span ref={ref} className={className}>{value}</span>;
}

// A line's actions. Each lifts a little under the pointer and its icon does
// the thing the button does: the refresh turns, an outward link leaves, the
// way in steps forward.
const actionClass =
  `${sweepClass} group/a flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[#dce4ec] bg-white text-xs font-bold text-[#122027] transition-[border-color,box-shadow,transform,color] duration-200 ease-out active:scale-[0.97] hover:border-[#12a0e1] hover:-translate-y-px hover:shadow-md hover:shadow-[#12a0e1]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#12a0e1]/40 disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-none`;
const iconMove = "w-3 h-3 transition-transform duration-300 ease-out";

export default function ControlCentre({ wrikeData }) {
  const [files, setFiles] = useState(null);
  const [only, setOnly] = useState(null); // a count at the top, clicked, narrows the page to that list
  const [open, setOpen] = useState({}); // market lines opened out to their orders
  const [showOld, setShowOld] = useState(false);
  const [busy, setBusy] = useState(""); // the line being refreshed
  const today = isoToday();
  const cascade = useCascade();
  const matcher = useMemo(() => makeMatcher(wrikeData), [wrikeData]);

  useEffect(() => {
    listFiles().then(setFiles);
  }, []);

  const found = useMemo(() => {
    const lists = ordersByMarket(files, today, (file, market) => matcher.match(market.orders, file.links?.[market.name], file.briefed?.[market.name]));
    const changed = (files || []).filter((f) => !f.wrapped).flatMap((f) =>
      Object.entries(f.changes || {}).map(([market, c]) => ({ fileId: f.id, film: f.name, kind: f.kind, market, note: changesNote(c) })));
    return { ...lists, changed };
  }, [files, today, matcher]);

  const put = (updated) => setFiles((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));

  // Reads one market's sheet again, the same way Client Orders' own Refresh does.
  const refresh = async (group) => {
    const file = files.find((f) => f.id === group.fileId);
    const key = `${group.fileId}|${group.market}`;
    setBusy(key);
    try {
      if (!googleConnected()) await connectGoogle();
      const fresh = await loadMarketOf(file.source, group.market);
      if (!fresh) return notify(`${group.market}'s folder no longer holds a sheet for this film.`);
      const was = file.markets.find((m) => m.name === group.market);
      const changed = fresh.unreadable ? file.changes?.[group.market] : mergeChanges(file.changes?.[group.market], marketChanges(was, fresh));
      const { [group.market]: _gone, ...others } = file.changes || {};
      const updated = { ...file, markets: file.markets.map((m) => (m.name === group.market ? fresh : m)), changes: changed ? { ...others, [group.market]: changed } : others };
      await saveFile(updated);
      put(updated);
      notify(fresh.unreadable ? `${group.market}: ${fresh.unreadable}` : `${group.market} read again${changed ? `: ${changesNote(changed)}` : ", nothing new"}.`, fresh.unreadable ? "error" : "success");
    } catch (err) {
      notify(googleMessage(err));
    } finally {
      setBusy("");
    }
  };

  // Takes a line's orders off every list. The sheet is untouched, and they
  // can be brought back from the market's page.
  const setAside = async (group) => {
    const ok = await confirmAction({
      title: `Set ${count(group.orders.length, "order")} aside?`,
      message: `${group.market}'s ${count(group.orders.length, "order")} here will stop counting, for everyone. The sheet isn't changed, and they can be brought back from the market's page.`,
      confirmLabel: "Set aside",
    });
    if (!ok) return;
    const file = files.find((f) => f.id === group.fileId);
    const keys = new Set([...(file.ignored?.[group.market] || []), ...group.orders.map(orderKey)]);
    const updated = { ...file, ignored: { ...file.ignored, [group.market]: [...keys] } };
    saveDecisions(updated);
    put(updated);
  };

  // A film that is wrapping up stops being counted here, for everyone. Its
  // orders, its sheets and the film itself in Client Orders are all left as
  // they are, and it can be counted again from the Films list.
  const setWrapped = (fileId, wrapped) => {
    const film = files.find((f) => f.id === fileId);
    const updated = { ...film, wrapped };
    saveDecisions(updated);
    put(updated);
    if (wrapped) {
      notify(`${filmTitle(film.name)} is no longer counted here.`, "success", { action: { label: "Undo", onClick: () => setWrapped(fileId, false) } });
    }
  };

  if (files === null) return <div className="h-48 rounded-2xl bg-white/60 border border-[#dce4ec] animate-pulse" />;

  if (files.length === 0) {
    return (
      <div className="bg-white border border-[#dce4ec] rounded-2xl shadow-sm px-6 py-14 text-center">
        <ClipboardList className="w-8 h-8 mx-auto text-[#768994] mb-3" strokeWidth={1.5} />
        <p className="font-display text-xl font-bold tracking-tight text-[#122027]">No films loaded yet</p>
        <p className="text-sm text-[#768994] mt-1.5 mb-5">Load one in Client Orders and what needs you will be listed here.</p>
        <a href="#orderforms" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#122027] hover:bg-[#25373c] text-white text-sm font-bold transition-colors">
          Open Client Orders
          <ChevronRight className="w-4 h-4" />
        </a>
      </div>
    );
  }

  const ordersIn = (list) => list.reduce((n, g) => n + (g.orders ? g.orders.length : 1), 0);
  const older = ordersIn(found.longOverdue);

  // One market's line: what and how much, then what can be done about it. It
  // opens out to the orders themselves.
  const line = (g, tone, index, old = false) => {
    const key = `${g.fileId}|${g.market}`;
    const isOpen = !!open[key];
    return (
      <div key={key} ref={cascade(key, index)} className="border-b border-slate-100 last:border-b-0">
        <div className="group flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3 hover:bg-slate-50 transition-colors">
          <button
            onClick={() => setOpen((prev) => ({ ...prev, [key]: !isOpen }))}
            aria-expanded={isOpen}
            className="flex items-center gap-3 min-w-0 flex-1 text-left"
          >
            <ChevronRight className={`w-4 h-4 shrink-0 text-[#768994] transition-transform duration-200 ${isOpen ? "rotate-90" : ""}`} />
            <MarketFlag name={g.market} className="w-7 h-5" />
            <span className="min-w-0">
              <span className="flex items-center gap-2">
                <span className="font-display text-base font-bold tracking-tight text-[#122027] truncate">{g.market}</span>
                <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider shrink-0 ${MEDIUM_CLASS[g.kind] || MEDIUM_CLASS.motion}`}>{MEDIUM_LABEL[g.kind] || "Motion"}</span>
              </span>
              <span className="block text-xs text-[#768994] truncate">{filmTitle(g.film).split(" · ").slice(0, -1).join(" · ") || filmTitle(g.film)}</span>
            </span>
          </button>
          <span className="text-right shrink-0">
            <span className={`block font-display text-xl font-bold tracking-tight tabular-nums leading-none ${tone}`}>{g.orders.length}</span>
            <span className="block text-[11px] text-[#768994] mt-0.5">{g.oldest ? `from ${formatDay(g.oldest, today)}` : "no date"}</span>
          </span>
          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
            {g.canBrief && g.toBrief > 0 && (
              <a href={linkTo(g.fileId, g.market, "brief")} className="group/b relative overflow-hidden flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-gradient-to-r from-[#12a0e1] to-[#1cc1a5] text-white text-xs font-bold shadow-sm transition-[box-shadow,transform] duration-200 ease-out active:scale-[0.97] hover:-translate-y-px hover:shadow-md hover:shadow-[#12a0e1]/30">
                {/* A sheen crosses the one filled button on the line. */}
                <span aria-hidden className="absolute inset-y-0 -left-1/2 w-1/2 -skew-x-12 bg-white/25 -translate-x-full transition-transform duration-500 ease-out group-hover/b:translate-x-[400%]" />
                <Send className={`${iconMove} relative group-hover/b:translate-x-0.5 group-hover/b:-translate-y-0.5`} />
                Brief {g.toBrief}
              </a>
            )}
            {g.canBrief && (
              <button onClick={() => refresh(g)} disabled={!!busy} title="Read this market's sheet again" className={actionClass}>
                <Sweep />
                {busy === key ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className={`${iconMove} duration-500 group-hover/a:rotate-180`} />}
                Refresh
              </button>
            )}
            {g.sheetUrl && (
              <a href={g.sheetUrl} target="_blank" rel="noreferrer" className={actionClass}>
                <Sweep />
                <ExternalLink className={`${iconMove} group-hover/a:translate-x-0.5 group-hover/a:-translate-y-0.5`} />
                Sheet
              </a>
            )}
            <button onClick={() => setAside(g)} title="Stop counting these orders. The sheet isn't changed." className={actionClass}>
              <Sweep />
              <EyeOff className={`${iconMove} group-hover/a:scale-110 group-hover/a:-rotate-6`} />
              Set aside
            </button>
            {/* Orders this old usually mean the film has finished. One click
                says so, for the whole film, without touching its orders. */}
            {old && (
              <button
                onClick={() => setWrapped(g.fileId, true)}
                title="Stops counting this whole film here, for everyone. Nothing is set aside or deleted, and it can be counted again from Films below."
                className={actionClass}
              >
                <Sweep />
                Film's finished
              </button>
            )}
            <a href={linkTo(g.fileId, g.market)} className={`${actionClass} !border-transparent`} aria-label={`Open ${g.market}`}>
              <Sweep />
              Open
              <ChevronRight className={`${iconMove} group-hover/a:translate-x-1`} />
            </a>
          </div>
        </div>
        {isOpen && (
          <div className="bg-slate-50 px-5 py-2 animate-in fade-in slide-in-from-top-1 duration-200">
            {g.orders.map((o) => (
              <div key={`${o.tab}|${o.row}`} className="flex items-center gap-3 py-1.5 text-sm">
                <span className={`w-20 shrink-0 tabular-nums font-bold ${tone}`}>{formatDay(o.deliveryDeadline, today)}</span>
                <span className="flex-1 min-w-0 truncate text-[#122027]">
                  {[o.placement, o.siteName, sizeOf(o)].filter(Boolean).join(" · ") || `Row ${o.row}`}
                </span>
                <span className="text-xs text-[#768994] shrink-0 tabular-nums">row {o.row}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const card = "bg-white border border-[#dce4ec] rounded-2xl shadow-sm overflow-hidden";
  const heading = (label, note) => (
    <div className="flex items-baseline gap-2 px-5 py-3 border-b border-[#dce4ec] bg-slate-50/60">
      <h3 className="text-[10px] font-black uppercase tracking-widest text-[#122027]">{label}</h3>
      <p className="text-xs text-[#768994] truncate">{note}</p>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {GROUPS.map((g, i) => {
          const n = ordersIn(found[g.id]);
          const on = only === g.id;
          return (
            <button
              key={g.id}
              ref={cascade(`card-${g.id}`, i)}
              onClick={() => setOnly(on ? null : g.id)}
              disabled={!n}
              aria-pressed={on}
              title={n ? (on ? "Show everything again" : `Show only ${g.label.toLowerCase()}`) : undefined}
              className={`press text-left rounded-2xl border shadow-sm px-5 py-4 transition-colors disabled:cursor-default ${
                on ? "bg-[#122027] border-[#122027]" : "bg-white border-[#dce4ec] enabled:hover:border-[#12a0e1]"
              }`}
            >
              <Counted value={n} className={`block font-display text-3xl font-bold tracking-tight tabular-nums ${on ? "text-white" : n ? g.tone : "text-[#b6c3cc]"}`} />
              <p className={`text-xs font-bold mt-0.5 ${on ? "text-white" : "text-[#122027]"}`}>{g.label}</p>
              <p className={`text-[11px] mt-0.5 ${on ? "text-white/70" : "text-[#768994]"}`}>
                {g.id === "changed" ? count(found.changed.length, "market") : n ? `in ${count(found[g.id].length, "market")}` : "nothing"}
                {g.id === "overdue" && older > 0 && ` · ${older} older`}
              </p>
            </button>
          );
        })}
      </div>

      {GROUPS.filter((g) => found[g.id].length > 0 && (!only || only === g.id)).map((g) => (
        <div key={g.id} className={card}>
          {heading(g.label, `${g.id === "changed" ? count(found.changed.length, "market") : `${count(ordersIn(found[g.id]), "order")} in ${count(found[g.id].length, "market")}`} · ${g.note}`)}
          {g.id === "changed"
            ? found.changed.map((e, i) => (
              <a
                key={`${e.fileId}|${e.market}`}
                ref={cascade(`changed-${e.fileId}|${e.market}`, i)}
                href={linkTo(e.fileId, e.market)}
                className="group flex items-center gap-3 px-5 py-3 border-b border-slate-100 last:border-b-0 text-sm hover:bg-slate-50 transition-colors"
              >
                <MarketFlag name={e.market} className="w-7 h-5" />
                <span className="font-display text-base font-bold tracking-tight text-[#122027] w-48 shrink-0 truncate">{e.market}</span>
                <span className="flex-1 min-w-0 truncate font-bold text-indigo-600">{e.note}</span>
                <span className="hidden md:block w-56 shrink-0 truncate text-xs text-[#768994] text-right">{filmTitle(e.film)}</span>
                <ChevronRight className="w-4 h-4 text-[#b6c3cc] group-hover:text-[#122027] group-hover:translate-x-0.5 transition-[color,transform] shrink-0" />
              </a>
            ))
            : found[g.id].map((group, i) => line(group, g.tone, i))}
        </div>
      ))}

      {GROUPS.every((g) => found[g.id].length === 0) && (
        <p className={`${card} px-6 py-10 text-center text-sm text-[#768994]`}>
          Nothing is late, due this week, waiting to be picked up, pending or changed in the films loaded.
        </p>
      )}

      {/* Long past their deadline: by now a question about the film, not a job
          for today. Kept folded away, with the way to answer it beside each. */}
      {!only && found.longOverdue.length > 0 && (
        <div className={card}>
          <button onClick={() => setShowOld((v) => !v)} aria-expanded={showOld} className="w-full flex items-center gap-2 px-5 py-3 text-left hover:bg-slate-50 transition-colors">
            <ChevronRight className={`w-4 h-4 text-[#768994] transition-transform duration-200 ${showOld ? "rotate-90" : ""}`} />
            <span className="text-[10px] font-black uppercase tracking-widest text-[#122027]">Long overdue</span>
            <span className="text-xs text-[#768994] truncate">
              {count(older, "order")} in {count(found.longOverdue.length, "market")}, more than {LONG_OVERDUE_DAYS} days past the deadline. Usually the film has finished: say so on a line and it stops being counted.
            </span>
          </button>
          {showOld && <div className="border-t border-[#dce4ec]">{found.longOverdue.map((group, i) => line(group, "text-[#768994]", i, true))}</div>}
        </div>
      )}

      <div className={card}>
        {heading("Films", "What this is read from. A finished film stops being counted here, for everyone; nothing in it is set aside or deleted.")}
        {found.films.map((f) => (
          <div key={f.fileId} className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2.5 border-b border-slate-100 last:border-b-0 text-sm ${f.wrapped ? "opacity-60" : ""}`}>
            <a href={linkTo(f.fileId)} className="font-bold text-[#122027] truncate hover:underline">{filmTitle(f.film)}</a>
            <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${MEDIUM_CLASS[f.kind] || MEDIUM_CLASS.motion}`}>{MEDIUM_LABEL[f.kind] || "Motion"}</span>
            {!f.wrapped && <span className="text-xs text-[#768994] tabular-nums">{f.orders} orders{f.longOverdue ? ` · ${f.longOverdue} long overdue` : ""}</span>}
            {/* As fresh as the last read: this page doesn't go to Google unless asked. */}
            <span className="ml-auto text-xs text-[#768994]">read {readAt(f.loadedAt)}</span>
            <button onClick={() => setWrapped(f.fileId, !f.wrapped)} className={actionClass}>
              <Sweep />
  {f.wrapped ? "Count it again" : "Film's finished"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
