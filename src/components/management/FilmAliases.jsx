// The other names a film goes by, on each film in the Films list. Client
// Orders tries them when an order sheet names a film differently from Wrike
// (findFilm in src/lib/orderForms/wrikeFilm.js).
//
// Part of Administration, beside FilmStudioPicker.
import { useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { supabase, selectAll } from "../../lib/supabaseClient";
import { notify } from "../../lib/toast";
import { aliasClash } from "../../lib/orderForms/wrikeFilm";
import { forgetFilmAliases } from "../../lib/filmAliases";
import FloatingCard from "../shared/FloatingCard";

export function FilmAliases({ item, patchItem }) {
  const aliases = item.aliases || [];
  const [rect, setRect] = useState(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const button = useRef(null);
  const card = useRef(null);

  useEffect(() => {
    if (!rect) return undefined;
    const outside = (e) => {
      if (!card.current?.contains(e.target) && !button.current?.contains(e.target)) setRect(null);
    };
    const escape = (e) => e.key === "Escape" && setRect(null);
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [rect]);

  const save = async (next) => {
    setBusy(true);
    const { error } = await supabase.from("films").update({ aliases: next }).eq("id", item.id);
    setBusy(false);
    if (error) {
      notify("Couldn't save the alias: " + error.message, "error");
      return false;
    }
    patchItem(item.id, { aliases: next });
    forgetFilmAliases();
    return true;
  };

  const add = async () => {
    const alias = draft.trim();
    if (!alias || busy) return;
    // Checked against the whole list as it is now, not this page's copy.
    let films;
    try {
      films = await selectAll("films", "id, title, aliases");
    } catch (e) {
      notify("Couldn't check the alias: " + (e.message || e), "error");
      return;
    }
    const clash = aliasClash(films, item.id, alias);
    if (clash) {
      notify(clash, "error");
      return;
    }
    if (await save([...aliases, alias])) setDraft("");
  };

  const open = () => setRect(rect ? null : button.current.getBoundingClientRect());

  return (
    <>
      <button
        ref={button}
        onClick={open}
        title={aliases.length ? `Also called: ${aliases.join(", ")}` : "Add another name this film goes by"}
        className={`shrink-0 max-w-[9rem] truncate px-2 py-1 rounded-full text-[11px] font-bold border transition-[opacity,background-color,color] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#12a0e1]/40 ${
          aliases.length
            ? "bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100"
            : "text-[#768994] border-dashed border-[#dce4ec] opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 hover:text-[#122027]"
        } ${rect ? "!opacity-100" : ""}`}
      >
        {aliases.length ? `aka ${aliases[0]}${aliases.length > 1 ? ` +${aliases.length - 1}` : ""}` : "+ aka"}
      </button>
      {rect && (
        <FloatingCard rect={rect} innerRef={card} className="p-3 w-72">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Also called</p>
          <p className="text-[11px] text-slate-400 mb-2.5 leading-snug">
            Client Orders looks for {item.title} in Wrike when an order sheet uses one of these names.
          </p>
          {aliases.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2.5">
              {aliases.map((alias) => (
                <span key={alias} className="inline-flex items-center gap-1 pl-2.5 pr-1 py-0.5 rounded-full bg-violet-500/20 text-violet-100 text-xs font-semibold">
                  {alias}
                  <button onClick={() => save(aliases.filter((a) => a !== alias))} disabled={busy} title={`Remove "${alias}"`}
                    className="p-0.5 rounded-full hover:bg-white/15 disabled:opacity-40">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
              placeholder="Another name…"
              className="flex-1 min-w-0 px-2.5 py-1.5 text-sm rounded-lg bg-white/10 border border-white/10 text-white placeholder-slate-500 outline-none focus:border-[#12a0e1]" />
            <button onClick={add} disabled={busy || !draft.trim()} title="Add"
              className="p-1.5 rounded-lg bg-gradient-to-br from-[#12a0e1] to-[#7c3aed] text-white disabled:opacity-40">
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </FloatingCard>
      )}
    </>
  );
}
