// Film sync: preview, then add, films from Wrike's studio projects.
//
// Part of Administration. Split out of components/Management.jsx, which is
// still the entry point and re-exports what other screens import.
import { useState, useEffect } from "react";
import { Film, CheckCircle2, FolderOpen, Loader2, Download } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { notify } from "../../lib/toast";
import { planFilmSync } from "../../lib/wrikeCampaign";
import { STUDIOS } from "../../lib/studios";
import { plainWrikeError } from "../../lib/wrikeErrors";
import { WrikeApplyShell } from "./WrikeApplyShell";

// Req 6 — preview + apply the Film DB sync from Wrike's studio-folder projects.
// Read-only until "Add N films": additive only (never deletes local films).
export function FilmSyncModal({ studio: initialStudio = "Paramount", existingFilms, onClose, onApplied }) {
  const [studio, setStudio] = useState(initialStudio);
  const [plan, setPlan] = useState(null); // { error, studioFolder, projectCount, toAdd }
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [skipped, setSkipped] = useState(() => new Set()); // titles unticked

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setPlan(null);
    setSkipped(new Set());
    planFilmSync(studio, existingFilms)
      .then((p) => alive && setPlan(p))
      .catch((e) => alive && setPlan({ error: plainWrikeError(e), toAdd: [] }))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [studio, existingFilms]);

  const chosen = (plan?.toAdd || []).filter((t) => !skipped.has(t));
  const toggle = (t) => setSkipped((prev) => {
    const next = new Set(prev);
    next.has(t) ? next.delete(t) : next.add(t);
    return next;
  });

  const apply = async () => {
    if (!chosen.length) return;
    setApplying(true);
    const rows = chosen.map((title) => ({ title, studio }));
    const { error } = await supabase.from("films").insert(rows);
    setApplying(false);
    if (error) { notify("Couldn't add the films: " + error.message, "error"); return; }
    notify(`Added ${rows.length} film${rows.length === 1 ? "" : "s"} from Wrike.`, "success");
    onApplied?.();
    onClose();
  };

  return (
    <WrikeApplyShell title="Films in Wrike"
      subtitle={`Films in ${studio}'s Wrike folders that aren't in your Films list yet`} onClose={onClose}>
      <div className="px-6 py-5 overflow-y-auto flex-1">
        {/* Which studio folder to pull film projects from. */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <span className="text-[10px] font-black uppercase tracking-widest text-[#768994] mr-1">Studio</span>
          {STUDIOS.map((x) => x.studio).map((s) => (
            <button key={s} onClick={() => setStudio(s)}
              className={`press px-3 py-1.5 rounded-xl text-xs font-bold border ${
                studio === s
                  ? "bg-[#122027] text-white border-[#122027]"
                  : "bg-white text-[#122027] border-[#dce4ec] hover:border-[#1cc1a5]"
              }`}>
              {s}
            </button>
          ))}
        </div>
        {loading ? (
          <div className="flex items-center gap-2 text-[#768994] py-8 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" /> Reading {studio}&rsquo;s films from Wrike…
          </div>
        ) : plan?.error ? (
          <div className="text-sm font-bold text-rose-500 py-6 text-center">{plan.error}</div>
        ) : (
          <>
            <div className="flex items-center gap-2 text-xs text-[#768994] mb-4">
              <FolderOpen className="w-4 h-4 text-[#f4b740]" />
              <span>
                {plan.projectCount} film{plan.projectCount === 1 ? "" : "s"} in Wrike under{" "}
                <span className="font-bold text-[#122027]">{plan.studioFolders.map((f) => f.title).join(", ")}</span>
              </span>
            </div>
            {plan.toAdd.length === 0 ? (
              <div className="flex items-center gap-2 text-sm font-bold text-[#1cc1a5] py-6 justify-center">
                <CheckCircle2 className="w-4 h-4" /> Every {studio} film in Wrike is already in your Films list.
              </div>
            ) : (
              <>
                <p className="text-[10px] font-black uppercase tracking-widest text-[#768994] mb-2">
                  {plan.toAdd.length} film{plan.toAdd.length === 1 ? "" : "s"} not in your list
                  <span className="normal-case tracking-normal font-bold"> · untick any you don&rsquo;t want</span>
                </p>
                <div className="border border-[#dce4ec] rounded-2xl divide-y divide-[#f0f4f8] max-h-[320px] overflow-y-auto scrollbar-thin scrollbar-inset">
                  {plan.toAdd.map((t) => (
                    <label key={t} className={`flex items-center gap-2.5 px-4 py-2 text-sm cursor-pointer transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-slate-50 ${skipped.has(t) ? "text-[#768994]" : "text-[#122027]"}`}>
                      <input type="checkbox" checked={!skipped.has(t)} onChange={() => toggle(t)} className="accent-[#1cc1a5] w-3.5 h-3.5 shrink-0" />
                      <Film className="w-3.5 h-3.5 text-[#1cc1a5] shrink-0" /> {t}
                    </label>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
      <div className="px-6 py-4 border-t border-[#dce4ec] flex items-center justify-end gap-2 shrink-0">
        <button onClick={onClose}
          className="press px-5 py-2.5 text-sm font-bold text-[#768994] hover:text-[#122027] bg-white border border-[#dce4ec] rounded-xl">
          Not now
        </button>
        <button onClick={apply} disabled={applying || loading || !chosen.length}
          className="press flex items-center gap-2 px-6 py-2.5 bg-[#1cc1a5] hover:bg-[#17a892] text-white text-sm font-bold rounded-xl disabled:opacity-40">
          {applying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
          {chosen.length ? `Add ${chosen.length} film${chosen.length === 1 ? "" : "s"}` : "Nothing to add"}
        </button>
      </div>
    </WrikeApplyShell>
  );
}
