import React from "react";
import { ChevronDown, ChevronRight, Film } from "lucide-react";
import PickerMenu from "./PickerMenu";
import { clientFor } from "../../lib/orderForms/driveTree";
import { loadedAgo, MEDIUM_LABEL as MEDIUM, MEDIUM_CLASS, MEDIUM_SOLID } from "./format";

// Which loaded film the page is showing, as one line: a switcher that opens a
// list of everything loaded, grouped by client, and a Motion / Print toggle
// when the same film is loaded in both. `children` sits at the right-hand end
// (Refresh).

const norm = (s) => String(s || "").trim().toLowerCase();

// A Google-loaded file knows its client and film; a dropped workbook is just
// its file name.
const describe = (file) => {
  const client = clientFor(file.source?.clientId)?.label || "";
  const film = client ? file.film || file.name.split(" · ").slice(1, -1).join(" · ") || file.name : file.name.replace(/\.xlsx$/i, "");
  return { client: client || "Dropped files", film };
};

export default function FilmBar({ files, selectedId, onSelect, onRemove, children }) {
  const current = files.find((f) => f.id === selectedId) || files[0];
  const now = describe(current);
  const twin = files.find((f) => f.id !== current.id && f.source?.clientId && f.source.clientId === current.source?.clientId
    && norm(describe(f).film) === norm(now.film) && f.kind !== current.kind);

  const items = files.map((file) => {
    const { client, film } = describe(file);
    return { id: file.id, label: film, tag: MEDIUM[file.kind] || "Motion", tagClass: MEDIUM_CLASS[file.kind] || MEDIUM_CLASS.motion, note: loadedAgo(file.loadedAt), group: client };
  });

  return (
    <div className="flex flex-wrap items-center gap-3">
      <PickerMenu
        items={items}
        value={current.id}
        onChange={onSelect}
        onRemove={(id) => onRemove(files.find((f) => f.id === id))}
        trigger={({ open, toggle }) => (
          <button
            onClick={toggle}
            aria-expanded={open}
            aria-haspopup="listbox"
            className="flex items-center gap-2 pl-3 pr-2.5 py-2.5 rounded-xl bg-white border border-[#dce4ec] hover:border-[#12a0e1] shadow-sm transition-colors min-w-0"
          >
            <Film className="w-4 h-4 text-[#768994] shrink-0" />
            <span className="text-sm font-bold text-[#768994] shrink-0">{now.client}</span>
            <ChevronRight className="w-3.5 h-3.5 text-[#b6c3cc] shrink-0" />
            <span className="font-display text-lg font-bold tracking-tight leading-none text-[#122027] truncate">{now.film}</span>
            {files.length > 1 && <span className="px-1.5 py-0.5 rounded-full bg-slate-100 text-[10px] font-black text-[#768994] shrink-0">{files.length}</span>}
            <ChevronDown className={`w-4 h-4 text-[#768994] shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
          </button>
        )}
      />

      {/* The same film in the other medium, when that is loaded too. */}
      {twin ? (
        <div role="group" aria-label="Medium" className="flex p-1 rounded-xl border border-[#dce4ec] bg-white shadow-sm">
          {[current, twin].sort((a, b) => (a.kind === "motion" ? -1 : 1) - (b.kind === "motion" ? -1 : 1)).map((file) => (
            <button
              key={file.id}
              onClick={() => onSelect(file.id)}
              aria-pressed={file.id === current.id}
              className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-colors ${file.id === current.id ? MEDIUM_SOLID[file.kind] : "text-[#768994] hover:text-[#122027]"}`}
            >
              {MEDIUM[file.kind]}
            </button>
          ))}
        </div>
      ) : (
        <span className={`px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-wider ${MEDIUM_CLASS[current.kind] || MEDIUM_CLASS.motion}`}>{MEDIUM[current.kind] || "Motion"}</span>
      )}

      <div className="ml-auto flex items-center gap-2">{children}</div>
    </div>
  );
}
