import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { SECTIONS, UPLOADS } from "../../lib/orderForms/sections";
import { extraSummary } from "../../lib/orderForms/extras";
import { ON_COLOUR } from "./media";

// The drawer that slides out from behind a film's poster with the kinds of work
// the film has: International, Domestic, Titles, Launches, and Uploads where the
// studio keeps an uploads sheet, each counted, and opened when there is
// something to open. Its backdrop is the film's own
// poster, blurred, so each film's drawer wears that film's colours.
// StudioGrid moves the poster so the drawer always has room on its right.
//
// The outer box sits where the drawer ends up and clips; the panel inside slides
// from behind the poster's edge (the poster overlaps the box by `tuck`), so it
// never shows on the poster's far side on the way out.
export default function FilmDrawer({ film, width, tuck, media, onOpen, onOpenExtra, uploads = null, onOpenUploads, onClose }) {
  const first = useRef(null);
  useEffect(() => { first.current?.focus({ preventScroll: true }); }, []);

  // What each kind of work has for this film: International its order forms' markets, the others their reads.
  const rows = SECTIONS.map((s) => {
    if (s.id === "international") {
      return { ...s, count: film.primary ? film.markets : 0, detail: "", open: film.primary ? () => onOpen(film.primary) : null, chips: !!film.primary && film.media.length > 1 };
    }
    const extra = film.extras?.[s.id];
    const { count, detail } = extra ? extraSummary(extra) : { count: 0, detail: "" };
    return { ...s, count, detail, open: extra ? () => onOpenExtra(extra) : null, chips: false };
  });
  // Uploads opens while its count isn't known yet: the page itself reads the sheet.
  if (uploads) {
    rows.push({ ...UPLOADS, count: uploads.count ?? "–", detail: "AM sheet", open: uploads.count === 0 ? null : onOpenUploads, chips: false });
  }
  const firstOpen = rows.find((r) => r.open)?.id;

  return (
    <div
      role="dialog"
      aria-label={`${film.title}: choose the orders`}
      className="absolute inset-y-0 z-0 overflow-hidden rounded-r-xl shadow-2xl"
      style={{ width, left: `calc(100% - ${tuck}px)` }}
    >
      <div className="film-drawer relative flex h-full flex-col bg-[#0c1216] text-white" style={{ paddingLeft: tuck }}>
        {film.poster && (
          <img src={film.poster} alt="" aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full scale-125 object-cover opacity-50 blur-2xl" />
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/35 via-black/55 to-black/85" />

        <div className="relative flex items-start justify-between gap-3 px-5 pt-5">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/55">The orders for</p>
            <p className="mt-1 line-clamp-2 font-display text-xl font-bold leading-tight tracking-tight">{film.title}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="drawer-close press -mr-1 rounded-lg p-1.5 text-white/60 hover:bg-white/10 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <ol className="relative mt-4 flex flex-1 flex-col">
          {rows.map((s, i) => (
            <li
              key={s.id}
              className={`drawer-row border-t border-white/10 ${s.chips ? "flex-[1.6]" : "flex-1"}`}
              style={{ "--i": i, "--from": s.from, "--to": s.to, "--fill-from": s.fillFrom, "--fill-to": s.fillTo }}
            >
              <div className={`drawer-section relative flex h-full items-center gap-4 px-5 ${s.open ? "" : "cursor-default"}`} aria-disabled={s.open ? undefined : "true"}>
                {/* The whole row opens it; the chips above open one side directly. */}
                {s.open && (
                  <button
                    ref={s.id === firstOpen ? first : undefined}
                    type="button"
                    onClick={s.open}
                    aria-label={`Open ${film.title}'s ${s.label.toLowerCase()} orders`}
                    className="absolute inset-0 z-[1] focus-visible:outline-none"
                  />
                )}
                <span className="drawer-count relative font-display text-5xl font-bold leading-none tracking-tighter">{s.count}</span>
                <div className="drawer-text relative min-w-0 flex-1">
                  <p className="truncate font-display text-[1.7rem] font-bold leading-none tracking-tight">{s.label}</p>
                  <p className="drawer-detail mt-1.5 truncate text-xs font-semibold text-white/70">
                    {s.count === 1 ? s.unit.one : s.unit.many}
                    {s.detail ? ` · ${s.detail}` : ""}
                  </p>
                  {s.chips && (
                    <div className="relative z-[2] mt-3 flex gap-2">
                      {film.media.map((m) => {
                        const { colour, Icon } = media[m];
                        return (
                          <button
                            key={m}
                            type="button"
                            onClick={() => onOpen(film.sides[m].file)}
                            className={`drawer-chip press flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-wide shadow-sm ${ON_COLOUR}`}
                            style={{ background: colour }}
                          >
                            <Icon className="h-3 w-3" strokeWidth={2.75} />
                            {m}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                {/* A chevron at rest; pointed at, its shaft draws in and the head slides along to meet it. */}
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="drawer-arrow relative h-[1.8rem] w-[1.8rem] shrink-0">
                  <path className="drawer-arrow-shaft" d="M4 12h14" />
                  <path className="drawer-arrow-head" d="M8 6l6 6-6 6" />
                </svg>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
