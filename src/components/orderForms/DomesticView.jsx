import { useMemo, useState } from "react";
import { AlertTriangle, CalendarDays, Check, Copy, MapPin } from "lucide-react";
import { domesticItems } from "../../lib/orderForms/domestic";
import { SECTIONS } from "../../lib/orderForms/sections";
import SectionBand from "./SectionBand";

// A film's Domestic pieces, grouped by the venue they go to: each piece with
// its sizes, material and copy, when it's due, and the Wrike task the sheet
// would make for it.

const LOOK = SECTIONS.find((s) => s.id === "domestic");

const niceDate = (value) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : value;

function CopyTask({ task }) {
  const [copied, setCopied] = useState(false);
  const copy = () => navigator.clipboard?.writeText(task).then(() => {
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  });
  return (
    <button type="button" onClick={copy} title="Copy the task name" className="press group/task flex w-full items-center gap-2 rounded-lg bg-white px-2.5 py-1.5 text-left ring-1 ring-[#dce4ec] transition-colors hover:ring-[#f59e0b]">
      <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-[#46606b]">{task}</span>
      {copied ? <Check className="h-3.5 w-3.5 shrink-0 text-[#1cc1a5]" /> : <Copy className="h-3.5 w-3.5 shrink-0 text-[#768994] group-hover/task:text-[#f59e0b]" />}
    </button>
  );
}

function Size({ label, value }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-black uppercase tracking-widest text-[#768994]">{label}</p>
      <p className="mt-0.5 text-xs font-semibold text-[#122027]">{value || "—"}</p>
    </div>
  );
}

function Piece({ item }) {
  return (
    <li className="rounded-xl bg-slate-50 p-4 ring-1 ring-black/[0.03]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="min-w-0 flex-1 font-bold leading-snug text-[#122027]">{item.item}</p>
        {item.type && <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest text-amber-800">{item.type}</span>}
      </div>
      {(item.material || item.finishing) && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {[item.material, item.finishing].filter(Boolean).map((t) => (
            <span key={t} className="rounded-full bg-white px-2.5 py-0.5 text-[11px] font-semibold text-[#46606b] ring-1 ring-[#dce4ec]">{t}</span>
          ))}
        </div>
      )}
      <div className="mt-3 grid grid-cols-3 gap-3">
        <Size label="Visible" value={item.visible} />
        <Size label="Trim" value={item.trim} />
        <Size label="Bleed" value={item.bleed} />
      </div>
      {item.copy && <p className="mt-3 font-display text-lg font-bold leading-tight tracking-tight text-[#122027]">“{item.copy}”</p>}
      <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px] font-bold">
        {item.date && (
          <span className="flex items-center gap-1 rounded-full bg-[#122027] px-2.5 py-0.5 text-white">
            <CalendarDays className="h-3 w-3" /> {niceDate(item.date)}
          </span>
        )}
        {item.deadline && <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-rose-700">Due {niceDate(item.deadline)}</span>}
        {item.timing && <span className="rounded-full bg-white px-2.5 py-0.5 text-[#46606b] ring-1 ring-[#dce4ec]">{item.timing}</span>}
      </div>
      <div className="mt-3">
        {item.task ? <CopyTask task={item.task} /> : (
          <p className="flex items-center gap-1.5 text-[11px] font-bold text-amber-700">
            <AlertTriangle className="h-3.5 w-3.5" /> No size yet, so no task name
          </p>
        )}
      </div>
    </li>
  );
}

export default function DomesticView({ file, film, onRemove }) {
  const items = useMemo(() => domesticItems(file), [file]);
  // Venues in the order the sheet lists them.
  const venues = useMemo(() => {
    const by = new Map();
    for (const item of items) {
      const key = item.venue.toLowerCase();
      const at = by.get(key) || { key, venue: item.venue, city: item.city, state: item.state, number: item.number, items: [] };
      at.items.push(item);
      by.set(key, at);
    }
    return [...by.values()];
  }, [items]);
  const types = [...new Set(items.map((i) => i.type).filter(Boolean))];
  const unsized = items.filter((i) => !i.size).length;

  return (
    <div className="space-y-6">
      <SectionBand
        look={LOOK}
        eyebrow={`${film} · Domestic`}
        count={items.length}
        title={items.length === 1 ? "Piece" : "Pieces"}
        unit={`at ${venues.length} ${venues.length === 1 ? "venue" : "venues"}`}
        facts={[
          ...types,
          `${file.filmCode}`,
          ...(unsized ? [`${unsized} without a size`] : []),
        ]}
        fileName={file.name}
        loadedAt={file.loadedAt}
        onRemove={onRemove}
      />
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {venues.map((v, i) => (
          <section key={v.key} className="list-row-in rounded-2xl border border-[#dce4ec] bg-white p-5 shadow-sm" style={{ "--i": Math.min(i, 8) }}>
            <header className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-display text-xl font-bold leading-tight tracking-tight text-[#122027]">{v.venue}</p>
                {(v.city || v.state) && (
                  <p className="mt-1 flex items-center gap-1 text-xs font-medium text-[#768994]">
                    <MapPin className="h-3.5 w-3.5" /> {[v.city, v.state].filter(Boolean).join(", ")}
                  </p>
                )}
              </div>
              <span className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-black text-white shadow-sm" style={{ backgroundImage: `linear-gradient(90deg, ${LOOK.fillFrom}, ${LOOK.fillTo})` }}>
                {v.items.length} {v.items.length === 1 ? "piece" : "pieces"}
              </span>
            </header>
            <ol className="mt-4 space-y-3">
              {v.items.map((item, j) => <Piece key={`${item.item}-${j}`} item={item} />)}
            </ol>
          </section>
        ))}
      </div>
    </div>
  );
}
