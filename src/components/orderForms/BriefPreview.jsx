import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, ArrowLeft, CornerDownRight, Layers, Loader2, Send, X } from "lucide-react";
import { formatDay } from "./format";
import PickerMenu from "./PickerMenu";
import DateField from "../shared/DateField";

// The brief's second step: exactly what "Create in Wrike" will make, laid out
// as Wrike will file it (the batch task, a subtask per order) with the custom
// fields each is given, and anything the sheet asked for that Wrike won't
// take. Nothing is created until its button is pressed.

// A field's value as a person reads it: a list's options joined, a date as a day.
const shown = (value, today) => {
  if (/^\[.*\]$/.test(value)) {
    try { return JSON.parse(value).join(", "); } catch { return value; }
  }
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? formatDay(value, today) : value;
};

function FieldChips({ list, titles, today }) {
  if (!list?.length) return null;
  return (
    <span className="flex flex-wrap gap-1 mt-1">
      {list.map((f) => (
        <span key={f.id} className="inline-flex items-center gap-1 max-w-[16rem] px-1.5 py-0.5 rounded-md bg-slate-100 text-[10px] text-slate-600">
          <span className="font-bold whitespace-nowrap">{titles[f.id] || "Field"}</span>
          <span className="truncate" title={shown(f.value, today)}>{shown(f.value, today)}</span>
        </span>
      ))}
    </span>
  );
}

// What the sheet gives for a field, in a few words.
function sheetSays({ field, values, empty, refused }, count, today) {
  if (!field) return "Not a field in Wrike";
  const gaps = empty + refused;
  if (!values.length) return gaps ? "Empty in the sheet" : "";
  const one = values.length === 1 ? shown(values[0], today) : "Varies by order";
  return gaps ? `${one}; empty on ${gaps} of ${count}` : one;
}

// One field's control: the value to give the batch, picked from what Wrike
// will take. Empty means "as the sheet has it".
function FieldControl({ item, set, onSet, today }) {
  const { field } = item;
  const options = field?.settings?.values || [];
  const raw = set?.raw || "";
  const common = { compact: true, ariaLabel: `${item.title} for the batch` };
  if (!field) return <div className="px-2 py-1 rounded-md border border-dashed border-[#dce4ec] text-xs text-[#b6c3cc]">—</div>;
  if (field.type === "DropDown") {
    return <PickerMenu {...common} placeholder="As the sheet has it" items={options.map((o) => ({ id: o, label: o }))} value={raw} onChange={(v) => onSet(v)} />;
  }
  if (field.type === "Multiple") {
    const picked = raw ? raw.split(";").map((v) => v.trim()).filter(Boolean) : [];
    return (
      <PickerMenu
        {...common}
        placeholder="As the sheet has it"
        items={[
          ...(picked.length ? [{ id: "__summary", label: picked.join(", ") }] : []),
          ...options.map((o) => ({ id: o, label: o, note: picked.includes(o) ? "✓" : "" })),
        ]}
        value={picked.length ? "__summary" : ""}
        onChange={(v) => {
          if (v === "__summary") return;
          const next = picked.includes(v) ? picked.filter((p) => p !== v) : [...picked, v];
          onSet(next.join("; "));
        }}
      />
    );
  }
  if (field.type === "Date") {
    return <DateField floating compact value={raw} onChange={(v) => onSet(v || "")} ariaLabel={common.ariaLabel} placeholder="As the sheet has it" />;
  }
  return (
    <input
      value={raw}
      onChange={(e) => onSet(e.target.value)}
      placeholder="As the sheet has it"
      aria-label={common.ariaLabel}
      inputMode={field.type === "Numeric" ? "decimal" : undefined}
      className="w-full px-2 py-1 rounded-md border border-[#dce4ec] bg-white text-sm text-[#122027] placeholder:text-[#b6c3cc] focus:outline-none focus:border-[#12a0e1]"
    />
  );
}

// The brief's custom fields, one control each: what the sheet gives, and a
// value for the batch where it gives nothing Wrike will take (or, switched
// to "Every order", in place of what it gives). Only Wrike gets these.
// Shown are the fields with gaps and any already set here; the rest, which
// the sheet fills, wait behind "Show all".
function FieldsStrip({ summary, overrides, onOverride, count, today }) {
  const [all, setAll] = React.useState(false);
  const needed = summary.filter((item) => overrides[item.title]?.raw || (item.field && item.empty + item.refused > 0));
  const shownFields = all ? summary : needed;
  return (
    <div className="px-4 py-3 border-b border-[#dce4ec] bg-slate-50/60">
      <p className={`flex flex-wrap items-baseline gap-x-2 text-[11px] text-[#768994] ${shownFields.length ? "mb-2" : ""}`}>
        <span className="font-black uppercase tracking-widest text-[10px] text-[#122027]">Fields</span>
        <span>
          {needed.length
            ? "Fill in what the sheet leaves empty. Only Wrike gets these; the sheet isn't changed."
            : "The sheet fills every field. You can still set one for the batch; only Wrike gets it."}
        </span>
        <button onClick={() => setAll((v) => !v)} className="ml-auto font-bold text-[#12a0e1] hover:underline">
          {all ? (needed.length ? "Show only the gaps" : "Hide fields") : `Show all ${summary.length} fields`}
        </button>
      </p>
      {/* Fields slide in and out as "Show all" opens and closes, the ones
          already shown easing into their new places. */}
      <motion.div layout className="grid gap-x-3 gap-y-2.5 grid-cols-[repeat(auto-fill,minmax(11rem,1fr))]">
        <AnimatePresence initial={false} mode="popLayout">
        {shownFields.map((item, n) => {
          const set = overrides[item.title];
          const gaps = item.empty + item.refused;
          return (
            <motion.div
              key={item.title}
              layout
              initial={{ opacity: 0, y: -6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: 0.22, ease: "easeOut", delay: n * 0.03 } }}
              exit={{ opacity: 0, y: -4, scale: 0.97, transition: { duration: 0.15, ease: "easeIn" } }}
              className="min-w-0"
            >
              <span className="flex items-center justify-between gap-1 mb-0.5">
                <span className="text-[10px] font-black uppercase tracking-widest text-[#768994] truncate">{item.title}</span>
                {set?.raw && (
                  <button onClick={() => onOverride(item.title, null)} aria-label={`Clear ${item.title}`} className="p-0.5 rounded text-[#b6c3cc] hover:text-[#122027]">
                    <X className="w-3 h-3" />
                  </button>
                )}
              </span>
              <FieldControl item={item} set={set} today={today} onSet={(raw) => onOverride(item.title, raw ? { raw, all: !!set?.all } : null)} />
              <span className={`block mt-0.5 text-[10px] truncate ${gaps && !set?.raw && item.field ? "font-bold text-amber-700" : "text-[#768994]"}`} title={sheetSays(item, count, today)}>
                {set?.raw ? (
                  <label className="inline-flex items-center gap-1 cursor-pointer">
                    <input type="checkbox" checked={!!set.all} onChange={(e) => onOverride(item.title, { ...set, all: e.target.checked })} className="accent-[#12a0e1]" />
                    {set.all ? "Every order" : `Only where the sheet is empty${gaps ? ` (${gaps})` : " (none)"}`}
                  </label>
                ) : sheetSays(item, count, today)}
              </span>
            </motion.div>
          );
        })}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

export default function BriefPreview({ path, plan, fields, titles, status, today, creating, onBack, onCreate, overrides = {}, onOverride }) {
  const pastDue = plan.due && today && plan.due < today;
  const notes = [
    ...(fields.missing.length ? [`No ${fields.missing.join(", ")} field found in Wrike, so ${fields.missing.length === 1 ? "it's" : "they're"} left empty.`] : []),
    ...fields.refused.map((r) => `${r.title} left empty on ${r.rows.length === 1 ? "row" : "rows"} ${r.rows.join(", ")}: ${r.reason}.`),
  ];
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="mt-3 rounded-xl border border-[#dce4ec] bg-white shadow-sm overflow-hidden"
    >
      <p className="px-4 py-2 border-b border-[#dce4ec] text-[11px] text-[#768994] truncate">
        In {path}
      </p>

      <FieldsStrip summary={fields.summary} overrides={overrides} onOverride={onOverride} count={plan.tasks.length} today={today} />

      <ul className="max-h-80 overflow-y-auto divide-y divide-slate-100">
        <li className="px-4 py-2.5">
          <span className="flex items-center gap-2">
            <span className="w-6 h-6 shrink-0 flex items-center justify-center rounded-md bg-gradient-to-br from-[#12a0e1] to-[#1cc1a5] text-white">
              <Layers className="w-3.5 h-3.5" />
            </span>
            <span className="font-mono text-sm font-bold text-[#122027] truncate">{plan.name}</span>
            <span className="text-[11px] text-[#768994] whitespace-nowrap">
              Milestone · due <span className={pastDue ? "font-bold text-amber-700" : ""}>{formatDay(plan.due, today)}</span>
              {status ? ` · ${status.name}` : ""}
            </span>
          </span>
          <span className="block pl-8"><FieldChips list={fields.batch} titles={titles} today={today} /></span>
        </li>
        {plan.tasks.map((t) => (
          <li key={t.key} className="pl-6 pr-4 py-2">
            <span className="flex items-center gap-2">
              <CornerDownRight className="w-3.5 h-3.5 shrink-0 text-[#b6c3cc]" />
              <span className="font-mono text-xs text-[#122027] truncate" title={t.title}>{t.title}</span>
              <span className="ml-auto text-[10px] tabular-nums text-[#768994] whitespace-nowrap">Row {t.row}</span>
            </span>
            <span className="block pl-5"><FieldChips list={fields.byKey[t.key]} titles={titles} today={today} /></span>
          </li>
        ))}
      </ul>

      {(pastDue || notes.length > 0) && (
        <div className="px-4 py-2.5 border-t border-amber-200 bg-amber-50 space-y-1">
          {pastDue && (
            <p className="flex items-start gap-1.5 text-[11px] font-bold text-amber-700">
              <AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0" />
              The due date, {formatDay(plan.due, today)}, has already passed. Go back to change it, or create it as it is.
            </p>
          )}
          {notes.map((n) => (
            <p key={n} className="flex items-start gap-1.5 text-[11px] text-amber-700">
              <AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0" />
              {n}
            </p>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-t border-[#dce4ec] bg-slate-50">
        <button
          onClick={onBack}
          disabled={!!creating}
          className="press flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold text-[#768994] hover:text-[#122027] hover:bg-slate-100 transition-colors disabled:opacity-50"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back
        </button>
        <span className="text-[11px] text-[#768994]">Nobody is assigned; do that in Wrike.</span>
        <button
          onClick={onCreate}
          disabled={!!creating}
          className="press ml-auto flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gradient-to-r from-[#12a0e1] to-[#1cc1a5] text-white text-sm font-bold shadow-sm hover:shadow-md transition-shadow disabled:opacity-60"
        >
          {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          {creating ? `Creating ${creating.done} of ${creating.total}…` : `Create ${plan.tasks.length + 1} tasks in Wrike`}
        </button>
      </div>
    </motion.div>
  );
}
