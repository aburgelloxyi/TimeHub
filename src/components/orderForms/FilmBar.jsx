import React from "react";
import { Check, ChevronDown, ChevronRight, Film, Plus } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import PickerMenu from "./PickerMenu";
import { CLIENTS, clientFor } from "../../lib/orderForms/driveTree";
import { loadedAgo, MEDIUM_LABEL as MEDIUM, MEDIUM_CLASS, MEDIUM_SOLID } from "./format";

// Which loaded film the page is showing, as one line: a switcher that opens a
// list of everything loaded, grouped by client, and a Motion / Print toggle
// when the same film is loaded in both. `children` sits at the right-hand end
// (Refresh).

const norm = (s) => String(s || "").trim().toLowerCase();
const staleNote = (stale) =>
  !stale ? "" : stale.gone ? "gone from Drive" : stale.had ? `${stale.left} of ${stale.had} markets left` : `only ${stale.left} ${stale.left === 1 ? "market" : "markets"} left`;
// Studios keep one order, left to right, whatever was loaded most recently;
// dropped workbooks come last.
const studioRank = (label) => {
  const at = CLIENTS.findIndex((c) => c.label === label);
  return at === -1 ? CLIENTS.length : at;
};

// A Google-loaded file knows its client and film; a dropped workbook is just
// its file name.
const describe = (file) => {
  const client = clientFor(file.source?.clientId)?.label || "";
  const film = client ? file.film || file.name.split(" · ").slice(1, -1).join(" · ") || file.name : file.name.replace(/\.xlsx$/i, "");
  return { client: client || "Dropped files", film };
};

// `staleness(file)` says whether a film's sheets have left Drive (see
// driveStaleness); those are marked in the list.
// `onAdd` opens and closes the film loader (`adding` says which it is).
// `delivered(file)` says a film's every market is delivered (filmDelivered):
// a grey tick in the list, and "Delivered" beside the one shown.
export default function FilmBar({ files, selectedId, onSelect, onRemove, staleness, delivered, onAdd, adding = false, children }) {
  const current = files.find((f) => f.id === selectedId) || files[0];
  const now = describe(current);
  const twin = files.find((f) => f.id !== current.id && f.source?.clientId && f.source.clientId === current.source?.clientId
    && norm(describe(f).film) === norm(now.film) && f.kind !== current.kind);

  // By film, Motion before Print, so a film's two sit together whenever each
  // was loaded.
  const items = files
    .map((file) => {
      const { client, film } = describe(file);
      return { id: file.id, label: film, kind: file.kind, tag: MEDIUM[file.kind] || "Motion", tagClass: MEDIUM_CLASS[file.kind] || MEDIUM_CLASS.motion, note: loadedAgo(file.loadedAt), alert: staleNote(staleness?.(file)), done: !!delivered?.(file), group: client };
    })
    .sort((a, b) => studioRank(a.group) - studioRank(b.group) || a.label.localeCompare(b.label) || (a.kind === "motion" ? -1 : 1) - (b.kind === "motion" ? -1 : 1));

  return (
    <div className="flex flex-wrap items-center gap-3">
      <PickerMenu
        items={items}
        value={current.id}
        onChange={onSelect}
        onRemove={(id) => onRemove(files.find((f) => f.id === id))}
        sideBySide
        trigger={({ open, toggle }) => (
          <button
            onClick={toggle}
            aria-expanded={open}
            aria-haspopup="listbox"
            className="key flex items-center gap-2 pl-3 pr-2.5 py-2.5 rounded-xl bg-white border border-[#dce4ec] hover:border-[#12a0e1] shadow-sm transition-colors min-w-0"
          >
            <Film className="w-4 h-4 text-[#768994] shrink-0" />
            <span className="text-sm font-bold text-[#768994] shrink-0">{now.client}</span>
            <ChevronRight className="w-3.5 h-3.5 text-[#b6c3cc] shrink-0" />
            <span className="font-display text-lg font-bold tracking-tight leading-none text-[#122027] truncate">{now.film}</span>
            {delivered?.(current) && (
              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-slate-100 text-[10px] font-black uppercase tracking-wider text-slate-600 shrink-0">
                <Check className="w-3 h-3" strokeWidth={3} />
                Delivered
              </span>
            )}
            {files.length > 1 && <span className="px-1.5 py-0.5 rounded-full bg-slate-100 text-[10px] font-black text-[#768994] shrink-0">{files.length}</span>}
            <ChevronDown className={`w-4 h-4 text-[#768994] shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
          </button>
        )}
      />

      {/* The same film in the other medium, when that is loaded too. */}
      {twin ? (
        <div role="group" aria-label="Medium" className="well flex p-1 rounded-xl border border-[#dce4ec] bg-slate-100">
          {[current, twin].sort((a, b) => (a.kind === "motion" ? -1 : 1) - (b.kind === "motion" ? -1 : 1)).map((file) => (
            <button
              key={file.id}
              onClick={() => onSelect(file.id)}
              aria-pressed={file.id === current.id}
              className={`relative px-3 py-1.5 rounded-lg text-sm font-bold transition-colors ${file.id === current.id ? "text-white" : "text-[#768994] hover:text-[#122027]"}`}
            >
              {/* One thumb shared by both, so it slides to whichever is chosen. */}
              {file.id === current.id && (
                <motion.span
                  layoutId="medium-thumb"
                  transition={{ type: "tween", duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
                  className={`thumb absolute inset-0 rounded-lg ${MEDIUM_SOLID[file.kind]}`}
                />
              )}
              <span className="relative">{MEDIUM[file.kind]}</span>
            </button>
          ))}
        </div>
      ) : (
        <span className={`px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-wider ${MEDIUM_CLASS[current.kind] || MEDIUM_CLASS.motion}`}>{MEDIUM[current.kind] || "Motion"}</span>
      )}

      {/* Loading another film belongs with the films. An icon that opens out
          to its name on hover, like the timesheet's tools. While the loader
          is open it shrinks away into its centre, as the loader's own close
          bubble grows from its centre (GoogleSource), and back on close. */}
      <AnimatePresence initial={false}>
        {onAdd && !adding && (
        <motion.button
          key="add"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1, transition: { duration: 0.42, ease: [0.34, 1.4, 0.64, 1], delay: 0.12 } }}
          exit={{ scale: 0, opacity: 0, rotate: 90, transition: { duration: 0.36, ease: [0.55, 0, 0.75, 0.2] } }}
          onClick={onAdd}
          aria-label="Load another film"
          className="group/add key press flex items-center p-2.5 rounded-xl border shadow-sm text-sm font-bold transition-colors focus:outline-none focus-visible:ring-4 focus-visible:ring-[#12a0e1]/30 bg-white border-[#dce4ec] text-[#122027] hover:border-[#12a0e1]"
        >
          <Plus className="w-4 h-4 shrink-0 transition-transform duration-300 ease-out group-hover/add:rotate-90" />
          <span className="max-w-0 overflow-hidden whitespace-nowrap opacity-0 transition-[max-width,opacity,margin] duration-300 ease-out [@media(hover:hover)]:group-hover/add:max-w-[10rem] [@media(hover:hover)]:group-hover/add:opacity-100 [@media(hover:hover)]:group-hover/add:ml-2 group-focus-visible/add:max-w-[10rem] group-focus-visible/add:opacity-100 group-focus-visible/add:ml-2">
            Load another film
          </span>
        </motion.button>
        )}
      </AnimatePresence>

      <div className="ml-auto flex items-center gap-2">{children}</div>
    </div>
  );
}
