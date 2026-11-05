import { useEffect, useState } from "react";
import { Check, Copy, FileText, Send, X } from "lucide-react";
import DateField from "../shared/DateField";
import { batchSizes } from "../../lib/orderForms/batches";
import { hasArtwork } from "../../lib/orderForms/wrikeBatch";

// One batch being prepared on a market: its colour and number (as its rows
// wear them in the table), its name and due date as the Wrike batch task will
// have them, what it holds at a glance, anything that would stop it briefing,
// and the way to brief it. The name is saved when it's left, not as it's typed:
// each save rewrites the film's shared copy.
export default function BatchCard({ batch, orders, inWrike, duplicates, today, onRename, onDue, onBrief, onDisband, onDescribe, describing = false, busy, index = 0 }) {
  const [name, setName] = useState(batch.name);
  useEffect(() => setName(batch.name), [batch.name]);
  const save = () => {
    const tidy = name.trim();
    if (tidy && tidy !== batch.name) onRename(tidy);
    else setName(batch.name);
  };

  const rows = batch.rows;
  const already = rows.filter(inWrike).length;
  const waiting = rows.filter((i) => !inWrike(i) && !hasArtwork(orders[i])).length;
  const ready = rows.length - already - waiting;
  const sizes = batchSizes(orders, rows);
  // A batch holding both rows of what looks like one order twice.
  const twins = rows.filter((i) => (duplicates.get(i) || []).some((j) => rows.includes(j)));
  const pastDue = !!batch.due && batch.due < today;

  return (
    <section className="list-row-in flex flex-col gap-3 rounded-2xl border border-[#dce4ec] bg-white p-4 shadow-sm" style={{ "--i": Math.min(index, 8) }}>
      <header className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl font-display text-lg font-bold text-white shadow-sm" style={{ background: batch.colour }}>
          {batch.number}
        </span>
        <div className="min-w-0 flex-1">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") { setName(batch.name); e.currentTarget.blur(); } }}
            aria-label="Batch task name"
            title="The batch task's name in Wrike"
            className="-ml-1.5 w-full truncate rounded-md border border-transparent bg-transparent px-1.5 py-0.5 font-mono text-sm font-bold text-[#122027] outline-none transition-colors hover:border-[#dce4ec] focus:border-[#12a0e1]"
          />
          <p className="mt-0.5 text-xs text-[#768994]">
            {rows.length} {rows.length === 1 ? "order" : "orders"}
            {already > 0 && ` · ${already} already in Wrike`}
          </p>
        </div>
        <button
          type="button"
          onClick={onDisband}
          aria-label={`Undo ${batch.name || "this batch"}`}
          title="Undo this batch: its orders go back to not being in one"
          className="press shrink-0 rounded-lg p-1.5 text-[#768994] transition-colors hover:bg-slate-100 hover:text-[#122027]"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      {sizes.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {sizes.slice(0, 3).map(({ size, n }) => (
            <span key={size} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold tabular-nums text-[#46606b]">
              {n} × {size}
            </span>
          ))}
          {sizes.length > 3 && <span className="px-1 py-0.5 text-[11px] font-semibold text-[#768994]">+{sizes.length - 3} more sizes</span>}
        </div>
      )}

      <div>
        <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-[#768994]">Due</span>
        <DateField floating compact value={batch.due} onChange={onDue} ariaLabel={`${batch.name || "Batch"} due date`} placeholder="Pick a date" allowClear={false} />
        {pastDue && <p className="mt-1 text-[11px] font-semibold text-rose-600">That date has passed.</p>}
      </div>

      {(waiting > 0 || twins.length > 0) && (
        <ul className="space-y-1 text-[11px] font-semibold leading-snug">
          {waiting > 0 && (
            <li className="text-[#768994]">
              {waiting} {waiting === 1 ? "order is" : "orders are"} waiting for artwork, so {waiting === 1 ? "it" : "they"} won't brief yet.
            </li>
          )}
          {twins.length > 0 && (
            <li className="flex items-start gap-1.5 text-fuchsia-700">
              <Copy className="mt-px h-3 w-3 shrink-0" />
              Rows {twins.map((i) => orders[i].row).join(", ")} look like the same order more than once.
            </li>
          )}
        </ul>
      )}

      <div className="mt-auto space-y-2 pt-1">
        {/* The batch task's description, opened beside the card (BriefPanel). */}
        {onDescribe && (
          <button
            type="button"
            onClick={onDescribe}
            aria-expanded={describing}
            className={`press flex w-full items-center justify-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition-colors ${
              describing ? "border-indigo-600 text-indigo-700" : "border-[#dce4ec] text-[#122027] hover:border-[#12a0e1]"
            }`}
          >
            <FileText className="h-3.5 w-3.5" />
            {batch.brief && Object.keys(batch.brief).length ? "Description · edited" : "Description"}
          </button>
        )}
        {ready > 0 ? (
          <button
            type="button"
            onClick={onBrief}
            disabled={busy}
            className="group press flex w-full items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-sm font-bold text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:opacity-50"
          >
            <Send className="h-3.5 w-3.5 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            Brief {ready} to Wrike
          </button>
        ) : already === rows.length ? (
          <p className="flex items-center justify-center gap-1.5 py-2 text-sm font-bold text-emerald-600">
            <Check className="h-4 w-4" strokeWidth={3} /> All in Wrike
          </p>
        ) : (
          <p className="py-2 text-center text-xs font-semibold text-[#768994]">Nothing ready to brief yet</p>
        )}
      </div>
    </section>
  );
}
