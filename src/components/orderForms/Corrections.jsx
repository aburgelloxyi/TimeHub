import React, { useEffect, useMemo, useState } from "react";
import { ChevronRight, Loader2, PencilLine, Search } from "lucide-react";
import { PAGE_GRADIENTS } from "../../lib/pageGradients";
import { mapPool } from "../../lib/fetchPool";
import { confirmAction } from "../../lib/confirm";
import { notify } from "../../lib/toast";
import {
  GOOGLE_SHEET, applyCellChanges, connectGoogle, connectGoogleForWriting, downloadSheet, googleCanWrite, googleConnected,
} from "../../lib/orderForms/googleApi";
import { listFilms } from "../../lib/orderForms/loadFilm";
import { gridsFromBuffer } from "../../lib/orderForms/readXlsx";
import { cellRange, correctionProblem, docsForMarket, findChanges } from "../../lib/orderForms/corrections";
import { googleMessage } from "./GoogleSource";

// Part of a market's edit mode: one correction made across every order sheet
// in that market's folder, whichever film it is for. Rename a column's header,
// or change a value in a column.
//
// Two steps on purpose. Preview reads the sheets and lists every cell that
// would change, and writes nothing. Apply writes exactly those cells, after a
// confirmation and a separate Google sign-in that asks for edit access.

const GRADIENT = PAGE_GRADIENTS.orderforms;
const IN_FLIGHT = 4;
const inputClass =
  "px-3 py-2.5 text-sm border border-[#dce4ec] rounded-xl outline-none focus:border-[#12a0e1] bg-white min-w-0 shadow-sm disabled:opacity-60";
const labelClass = "block mb-1.5 text-[10px] font-black uppercase tracking-widest text-[#768994]";
const primaryClass =
  `press flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r ${GRADIENT} text-white text-sm font-bold rounded-xl shadow-md shadow-indigo-600/20 disabled:opacity-40 disabled:shadow-none shrink-0`;

const KINDS = [
  { id: "header", label: "Rename a column" },
  { id: "value", label: "Change a value" },
];

const count = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// `onApplied` is told when sheets have been written, so the page can read the
// open market again.
export default function Corrections({ clientId, market, onApplied }) {
  const [open, setOpen] = useState(false);
  const [films, setFilms] = useState(null);
  const [skipped, setSkipped] = useState(() => new Set()); // sheet ids unticked
  const [kind, setKind] = useState("header");
  const [column, setColumn] = useState("");
  const [find, setFind] = useState("");
  const [to, setTo] = useState("");
  const [working, setWorking] = useState("");
  // What the last preview found, one entry per sheet, with the correction it
  // was made for. Any edit to the form clears it: Apply must match what was shown.
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState("");

  const docs = useMemo(() => docsForMarket(films, market), [films, market]);
  const chosen = docs.filter((d) => !skipped.has(d.sheet.id));
  const correction = { kind, column, find, to: to.trim() };
  const problem = correctionProblem(correction);
  const total = preview?.reduce((n, p) => n + (p.changes?.length || 0), 0) || 0;

  const change = (set) => (value) => { set(value); setPreview(null); };

  // The market's other sheets are listed when the section is first opened.
  const loadDocs = async () => {
    setError("");
    setWorking("Listing this market's sheets…");
    try {
      if (!googleConnected()) await connectGoogle();
      setFilms(await listFilms(clientId));
    } catch (err) {
      setError(googleMessage(err));
    } finally {
      setWorking("");
    }
  };

  useEffect(() => {
    setFilms(null);
    setSkipped(new Set());
    setPreview(null);
    setOpen(false);
  }, [clientId, market]);

  const runPreview = async () => {
    setError("");
    setWorking("Reading the sheets…");
    try {
      if (!googleConnected()) await connectGoogle();
      const found = await mapPool(chosen, IN_FLIGHT, async (doc) => {
        // An uploaded Excel file has no cells Google can write to.
        if (doc.sheet.mimeType !== GOOGLE_SHEET) return { ...doc, note: "An Excel file, not a Google Sheet, so it can't be corrected here" };
        try {
          const changes = findChanges(await gridsFromBuffer(await downloadSheet(doc.sheet)), correction);
          return { ...doc, changes };
        } catch (err) {
          if (err?.reason === "signed-out") throw err;
          return { ...doc, note: "This sheet couldn't be read" };
        }
      });
      setPreview(found);
    } catch (err) {
      setError(googleMessage(err));
    } finally {
      setWorking("");
    }
  };

  const apply = async () => {
    const targets = preview.filter((p) => p.changes?.length);
    const ok = await confirmAction({
      title: `Change ${count(total, "cell")} in ${count(targets.length, "sheet")}?`,
      message: `This writes to the Google Sheets in ${market}'s folder. To undo it, use each sheet's version history in Google.`,
      confirmLabel: "Apply",
      danger: true,
    });
    if (!ok) return;
    setError("");
    setWorking("Waiting for Google…");
    try {
      // Inside the click, so the browser lets Google's window open.
      if (!googleCanWrite()) await connectGoogleForWriting();
      setWorking("Writing…");
      const done = [];
      // One sheet at a time: a failure stops here with the rest untouched.
      for (const p of preview) {
        if (!p.changes?.length) { done.push(p); continue; }
        try {
          const result = await applyCellChanges(p.sheet.id, p.changes.map((c) => ({ ...c, range: cellRange(c.tab, c.cell) })));
          done.push({ ...p, changes: null, note: `${count(result.written, "cell")} changed${result.changed ? `, ${result.changed} left alone because ${result.changed === 1 ? "it" : "they"} had been edited since the preview` : ""}`, applied: true });
        } catch (err) {
          if (err?.reason === "signed-out" || err?.reason === "denied") throw err;
          done.push({ ...p, changes: null, note: err?.reason === "no-access" ? "Your Google account can't edit this sheet" : "Writing to this sheet failed; nothing in it was changed" });
        }
      }
      setPreview(done);
      notify(`Applied to ${count(done.filter((d) => d.applied).length, "sheet")}`, "success");
      onApplied?.();
    } catch (err) {
      setError(err?.reason === "denied"
        ? "Google didn't grant edit access to spreadsheets, so nothing was written."
        : googleMessage(err));
    } finally {
      setWorking("");
    }
  };

  const busy = !!working;

  return (
    <div className="border-b border-[#dce4ec] bg-slate-50/60">
      <button
        onClick={() => { setOpen((v) => !v); if (!open && !films && !busy) loadDocs(); }}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-5 py-3 text-left text-sm font-bold text-[#122027]"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin text-indigo-600" /> : <ChevronRight className={`w-4 h-4 text-[#768994] transition-transform duration-300 ${open ? "rotate-90" : ""}`} />}
        Change a column across all of {market}'s sheets
        <span className="font-medium text-xs text-[#768994] truncate">{working || "Every film's order sheet in this market's folder. Previewed before anything is written."}</span>
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-4">
          {films && (
            <div>
              <span className={labelClass}>Sheets in {market} · {chosen.length} of {docs.length} selected</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-x-4 rounded-xl border border-[#dce4ec] px-3 py-2">
                {docs.map((d) => (
                  <label key={d.sheet.id} className="flex items-center gap-2 py-1 text-sm text-[#122027] min-w-0">
                    <input
                      type="checkbox"
                      checked={!skipped.has(d.sheet.id)}
                      disabled={busy}
                      onChange={() => {
                        setSkipped((prev) => { const next = new Set(prev); if (!next.delete(d.sheet.id)) next.add(d.sheet.id); return next; });
                        setPreview(null);
                      }}
                      className="accent-indigo-600 shrink-0"
                    />
                    <span className="truncate" title={d.sheet.name}>{d.film}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {!films && !busy && (
            <button onClick={loadDocs} className="text-xs font-bold text-[#768994] hover:text-[#122027]">Retry</button>
          )}

          {films && (
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <span className={labelClass}>Correction</span>
                <div role="group" aria-label="Correction" className="flex p-1 rounded-xl border border-[#dce4ec] bg-slate-50">
                  {KINDS.map((k) => (
                    <button
                      key={k.id}
                      onClick={() => change(setKind)(k.id)}
                      disabled={busy}
                      aria-pressed={k.id === kind}
                      className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-colors ${k.id === kind ? "bg-[#122027] text-white" : "text-[#768994] hover:text-[#122027]"}`}
                    >
                      {k.label}
                    </button>
                  ))}
                </div>
              </div>
              <label>
                <span className={labelClass}>{kind === "header" ? "Column header now" : "In the column headed"}</span>
                <input value={column} onChange={(e) => change(setColumn)(e.target.value)} disabled={busy} placeholder="Market" className={`${inputClass} w-52`} />
              </label>
              {kind === "value" && (
                <label>
                  <span className={labelClass}>Cells reading</span>
                  <input value={find} onChange={(e) => change(setFind)(e.target.value)} disabled={busy} placeholder="Pending" className={`${inputClass} w-44`} />
                </label>
              )}
              <label>
                <span className={labelClass}>Should read</span>
                <input value={to} onChange={(e) => change(setTo)(e.target.value)} disabled={busy} placeholder={kind === "header" ? "Country" : "Confirmed"} className={`${inputClass} w-52`} />
              </label>
              <button onClick={runPreview} disabled={busy || !!problem || !chosen.length} title={problem || undefined} className={primaryClass}>
                <Search className="w-4 h-4" />
                Preview
              </button>
            </div>
          )}

          {error && <p role="alert" className="text-sm font-medium text-rose-600">{error}</p>}

          {preview && (
            <div className="rounded-xl border border-[#dce4ec] overflow-hidden">
              <div className="flex flex-wrap items-center gap-3 px-4 py-3 bg-slate-50/60 border-b border-[#dce4ec]">
                <p className="text-sm font-bold text-[#122027] mr-auto">
                  {total > 0 ? `${count(total, "cell")} would change in ${count(preview.filter((p) => p.changes?.length).length, "sheet")}`
                    : preview.some((p) => p.applied) ? "Applied" : "Nothing to change in these sheets"}
                </p>
                {total > 0 && (
                  <button onClick={apply} disabled={busy} className={primaryClass}>
                    <PencilLine className="w-4 h-4" />
                    Apply to Google
                  </button>
                )}
              </div>
              {preview.map((p) => (
                <div key={p.sheet.id} className="px-4 py-3 border-b border-slate-100 last:border-b-0 text-sm">
                  <div className="flex flex-wrap items-baseline gap-x-3">
                    <a href={p.sheet.webViewLink} target="_blank" rel="noreferrer" className="font-bold text-[#122027] hover:underline">{p.film}</a>
                    <span className="text-xs text-[#768994]">{p.note || (p.changes.length ? count(p.changes.length, "cell") : "No match")}</span>
                  </div>
                  {p.changes?.length > 0 && (
                    <ul className="mt-1.5 space-y-0.5">
                      {p.changes.slice(0, 12).map((c) => (
                        <li key={`${c.tab}!${c.cell}`} className="flex flex-wrap items-baseline gap-x-2 text-xs">
                          <span className="font-mono text-[#768994] w-14 shrink-0">{c.cell}</span>
                          <span className="line-through text-rose-600 break-all">{c.from}</span>
                          <span className="text-[#768994]">→</span>
                          <span className="font-bold text-emerald-700 break-all">{c.to}</span>
                        </li>
                      ))}
                      {p.changes.length > 12 && <li className="text-xs text-[#768994]">and {p.changes.length - 12} more</li>}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
