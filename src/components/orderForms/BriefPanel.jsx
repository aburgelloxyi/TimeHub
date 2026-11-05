import { useEffect, useMemo, useState } from "react";
import { Check, Copy, FileText, Loader2, X } from "lucide-react";
import { readBriefTemplate } from "../../lib/orderForms/wrikeBrief";
import { briefDefaults, fillTemplate, readTemplate, suggestFolder } from "../../lib/orderForms/briefTemplate";
import { notify } from "../../lib/toast";

// A batch's description for its Wrike batch task: the market folder's brief
// template as a form, its labels fixed and their values to fill, beside the
// description as Wrike will show it. "Folder" starts as the batch's own folder,
// worked out from the job numbers. Only what a PM changes is kept with the batch
// (batch.brief), and only when they leave the field: each save rewrites the
// film's shared copy. Briefing the batch gives its task this description.
const BRIEF_ERRORS = (err) => (/\(401\)|not_connected/.test(err?.message || "") ? "Connect Wrike in Profile first." : "Wrike couldn't be reached.");

export default function BriefPanel({ batch, filmTitle, kind, marketName, onSave, onClose }) {
  const [state, setState] = useState({ loading: true });
  useEffect(() => {
    let live = true;
    setState({ loading: true });
    readBriefTemplate({ filmTitle, kind, marketName })
      .then((found) => { if (live) setState(found.ok ? { ok: true, ...found, read: readTemplate(found.html) } : found); })
      .catch((err) => { if (live) setState({ ok: false, reason: BRIEF_ERRORS(err) }); });
    return () => { live = false; };
  }, [filmTitle, kind, marketName]);

  const suggestion = state.ok ? suggestFolder(state.read, state.marketsJob, state.marketFolder) : "";
  const defaults = useMemo(() => (state.ok ? briefDefaults(state.read, suggestion) : {}), [state, suggestion]);
  const [draft, setDraft] = useState({}); // what is being typed, by field
  const saved = batch.brief || {};
  const valueOf = (key) => draft[key] ?? saved[key] ?? defaults[key] ?? "";
  const commit = (key) => {
    if (!(key in draft)) return;
    const typed = draft[key].trim();
    setDraft(({ [key]: _done, ...rest }) => rest);
    if (typed === (saved[key] ?? defaults[key] ?? "").trim()) return;
    const next = { ...saved };
    if (typed === (defaults[key] || "").trim()) delete next[key]; else next[key] = typed;
    onSave(next);
  };
  const html = state.ok ? fillTemplate(state.read, Object.fromEntries(state.read.fields.map((f) => [f.key, valueOf(f.key)]))) : "";

  // As formatted text where the browser allows it, so it pastes into Wrike with its formatting; else as HTML.
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    const text = html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li)>/gi, "\n").replace(/<[^>]+>/g, "").replace(/\n{3,}/g, "\n\n").trim();
    try {
      if (window.ClipboardItem && navigator.clipboard?.write) {
        await navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([html], { type: "text/html" }), "text/plain": new Blob([text], { type: "text/plain" }) })]);
      } else {
        await navigator.clipboard.writeText(html);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      notify("Couldn't copy from here.");
    }
  };

  return (
    <section className="view-in flex h-full flex-col rounded-2xl border border-[#dce4ec] bg-white shadow-sm">
      <header className="flex flex-wrap items-center gap-3 border-b border-[#dce4ec] px-4 py-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white" style={{ background: batch.colour }}>
          <FileText className="h-4 w-4" />
        </span>
        <div className="min-w-0 mr-auto">
          <p className="text-sm font-bold text-[#122027]">Description for batch {batch.number}</p>
          <p className="truncate text-xs text-[#768994]">
            {state.loading ? "Reading the template from Wrike…"
              : state.ok ? `The batch task's description in Wrike, from ${state.source === "market" ? `${state.marketFolder}'s folder` : "the _Market template"}`
              : "No template to start from"}
          </p>
        </div>
        {state.ok && (
          <button type="button" onClick={copy} className="press flex items-center gap-1.5 rounded-lg border border-[#dce4ec] px-3 py-1.5 text-xs font-bold text-[#122027] transition-colors hover:border-[#12a0e1]">
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" strokeWidth={3} /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy"}
          </button>
        )}
        <button type="button" onClick={onClose} aria-label="Close the description" className="press rounded-lg p-1.5 text-[#768994] transition-colors hover:bg-slate-100 hover:text-[#122027]">
          <X className="h-4 w-4" />
        </button>
      </header>

      {state.loading && (
        <p className="flex items-center gap-2 px-4 py-6 text-sm text-[#768994]"><Loader2 className="h-4 w-4 animate-spin" /> Looking at this market in Wrike…</p>
      )}
      {!state.loading && !state.ok && <p className="px-4 py-6 text-sm text-[#768994]">{state.reason}</p>}

      {state.ok && (
        <div className="grid flex-1 gap-4 p-4 md:grid-cols-2">
          <div className="space-y-3">
            {state.read.fields.length === 0 && (
              <p className="text-sm text-[#768994]">This description has no "Label:" lines to fill in. It goes to Wrike as it is.</p>
            )}
            {state.read.fields.map((f) => {
              const value = valueOf(f.key);
              const guessed = f.key === "folder" && suggestion && value === suggestion && !(f.key in saved);
              const path = value.startsWith("/");
              return (
                <label key={f.key} className="block">
                  <span className="mb-1 flex items-center gap-2 text-xs font-bold text-[#122027]">
                    {f.label}:
                    {guessed && <span className="rounded-full bg-indigo-100 px-2 py-px text-[10px] font-bold text-indigo-700">Worked out from the job numbers, check it</span>}
                  </span>
                  <textarea
                    value={value}
                    placeholder={f.hint || "Empty"}
                    rows={Math.min(4, Math.max(1, Math.ceil(value.length / 52)))}
                    onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                    onBlur={() => commit(f.key)}
                    className={`w-full resize-none rounded-lg border border-[#dce4ec] bg-white px-2.5 py-1.5 text-sm text-[#122027] outline-none transition-colors placeholder:text-[#9aabb5] focus:border-[#12a0e1] ${path ? "font-mono text-xs" : ""}`}
                  />
                </label>
              );
            })}
          </div>
          <div className="min-w-0">
            <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-[#768994]">As it will read in Wrike</p>
            {/* The template's own markup, with anything that runs taken out (briefTemplate.js tokenize). */}
            <div
              className="brief-preview max-h-[28rem] overflow-y-auto rounded-xl bg-slate-50 p-4 text-sm leading-relaxed text-[#122027] break-words"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          </div>
        </div>
      )}
    </section>
  );
}
