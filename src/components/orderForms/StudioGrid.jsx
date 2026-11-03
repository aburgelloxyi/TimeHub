import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, ChevronLeft, Clapperboard, Image as ImageIcon, Plus, Printer } from "lucide-react";
import { CLIENTS } from "../../lib/orderForms/driveTree";
import { posterKey, studioKey } from "../../lib/filmPosters";

// Client Orders' front door: the studios as cards, then one studio's films as
// posters, instead of the two pickers. A film loaded for both Motion and Print
// is one card, with a chip for each, because it is one film to choose.
//
// Nothing here writes except a picture's URL, and only an admin can start that:
// the button stays hidden until the pointer has rested on the card for two
// seconds, so it never sits in the way of choosing a film.

const EXTRA_STUDIOS = [{ id: "amazonmgm", label: "Amazon MGM" }];
const HOVER_DELAY = 2000;

const LOOK = {
  universal: { gradient: "from-[#0b2c6b] via-[#123f95] to-[#0d2a60]", tint: "from-[#123f95]/90 to-[#0b2c6b]/90" },
  paramount: { gradient: "from-[#0b1f3a] via-[#123a68] to-[#0a1a30]", tint: "from-[#123a68]/90 to-[#0b1f3a]/90" },
  amazonmgm: { gradient: "from-[#2a1f0a] via-[#6b4a12] to-[#1d1507]", tint: "from-[#6b4a12]/90 to-[#1d1507]/90" },
  dropped: { gradient: "from-[#2b3440] via-[#3a4757] to-[#222a35]", tint: "from-[#3a4757]/90 to-[#222a35]/90" },
};

// Motion and Print in the XYi apps' own colours for the two sides: After Effects purple, InDesign pink.
const MEDIA = {
  Motion: { colour: "#a78bfa", Icon: Clapperboard },
  Print: { colour: "#ee6fa5", Icon: Printer },
};

// One film however its order forms spell it: "Focker In-Law" and "Focker In Law" are the same film.
const filmKey = (title) => String(title || "").toLowerCase().replace(/[^a-z0-9]+/g, "");

const initials = (title) => {
  const words = String(title || "").split(/[^A-Za-z0-9]+/).filter(Boolean);
  return (words.slice(0, 2).map((w) => w[0]).join("") || "?").toUpperCase();
};

const studioOf = (file) => file.source?.clientId || "dropped";
const labelOf = (id) =>
  CLIENTS.find((c) => c.id === id)?.label || EXTRA_STUDIOS.find((s) => s.id === id)?.label || "Dropped files";
const mediumOf = (file) =>
  file.kind === "print" || /print/i.test(String(file.name || "")) ? "Print" : "Motion";
const readableMarkets = (file) => (file.markets || []).filter((m) => !m.unreadable).length;

export default function StudioGrid({ files, posters, titleOf, staleness, delivered, onOpen, onSetPoster, onSetStudioImage, canEdit = false }) {
  const [studio, setStudio] = useState(null);
  const [revealed, setRevealed] = useState(null);
  const timer = useRef(null);

  // The picture button after two seconds of rest, and gone the moment the pointer leaves.
  const rest = (key) => {
    if (!canEdit) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setRevealed(key), HOVER_DELAY);
  };
  const leave = () => { clearTimeout(timer.current); setRevealed(null); };
  useEffect(() => () => clearTimeout(timer.current), []);

  const studios = useMemo(() => {
    const by = new Map();
    for (const f of files || []) {
      const id = studioOf(f);
      const at = by.get(id) || { id, films: [], markets: 0 };
      at.films.push(f);
      at.markets += readableMarkets(f);
      by.set(id, at);
    }
    const order = [...CLIENTS.map((c) => c.id), ...EXTRA_STUDIOS.map((s) => s.id)];
    const out = order.map((id) => by.get(id) || { id, films: [], markets: 0 });
    if (by.has("dropped")) out.push(by.get("dropped"));
    return out;
  }, [files]);

  const current = studios.find((s) => s.id === studio) || null;

  // The same film loaded twice (Motion and Print) is one card: one title, a button for each side, markets added up.
  const films = useMemo(() => {
    const by = new Map();
    for (const f of current?.films || []) {
      const title = titleOf(f);
      const key = filmKey(title);
      const at = by.get(key) || { key, title, titles: [], files: [], markets: 0, sides: {}, delivered: true, stale: null };
      at.files.push(f);
      if (!at.titles.includes(title)) at.titles.push(title);
      at.markets += readableMarkets(f);
      const medium = mediumOf(f);
      const side = at.sides[medium] || { file: f, markets: 0 };
      side.markets += readableMarkets(f);
      at.sides[medium] = side;
      if (!delivered(f)) at.delivered = false;
      const st = staleness(f);
      if (st && !at.stale) at.stale = st;
      by.set(key, at);
    }
    for (const at of by.values()) {
      // Motion leads, since that is the detail the FilmBar opens on; Print is a toggle away.
      at.primary = at.sides.Motion?.file || at.files[0];
      at.media = ["Motion", "Print"].filter((m) => at.sides[m]);
      // The poster saved under any of the film's spellings, and the title that has it.
      const withPoster = at.titles.find((t) => posters[posterKey(current.id, t)]);
      at.poster = withPoster ? posters[posterKey(current.id, withPoster)] : null;
      at.title = withPoster || titleOf(at.primary);
    }
    return [...by.values()];
  }, [current, posters, titleOf, delivered, staleness]);

  if (!current) {
    return (
      <div className="space-y-5">
        <div className="flex items-baseline justify-between px-1">
          <h2 className="font-display text-xl font-bold tracking-tight text-[#122027]">Studios</h2>
          <p className="text-xs font-medium text-[#768994]">Choose a studio, then a film</p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {studios.map((s, i) => {
            const look = LOOK[s.id] || LOOK.dropped;
            const image = posters[studioKey(s.id)];
            const key = `studio:${s.id}`;
            const shown = revealed === key;
            // Films, not order forms: a film loaded for Motion and for Print is one.
            const count = new Set(s.films.map((f) => filmKey(titleOf(f)))).size;
            return (
              <div key={s.id} className="list-row-in group relative" style={{ "--i": Math.min(i, 6) }} onMouseEnter={() => rest(key)} onMouseLeave={leave}>
                <button
                  onClick={() => setStudio(s.id)}
                  className="relative block w-full overflow-hidden rounded-2xl text-left shadow-sm ring-1 ring-black/5 transition-[transform,box-shadow] duration-300 ease-out hover:-translate-y-1 hover:shadow-xl"
                >
                  <div className={`relative aspect-[16/9] bg-gradient-to-br ${look.gradient}`}>
                    {image && (
                      <img
                        src={image}
                        alt=""
                        className="absolute inset-0 h-full w-full object-cover opacity-90 transition-transform duration-700 ease-out group-hover:scale-105"
                        onError={(e) => { e.currentTarget.style.display = "none"; }}
                      />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-black/10" />
                    <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-5">
                      <div className="min-w-0">
                        <p className="font-display text-2xl font-bold tracking-tight text-white">{labelOf(s.id)}</p>
                        <p className="mt-0.5 text-xs font-medium text-white/75">
                          {count} {count === 1 ? "film" : "films"} · {s.markets} {s.markets === 1 ? "market" : "markets"}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-xl bg-white/10 px-3 py-1.5 text-[11px] font-bold text-white ring-1 ring-white/25 transition-colors group-hover:bg-white/25">
                        {s.films.length > 0 ? "Open" : "Empty"}
                      </span>
                    </div>
                  </div>
                </button>
                {canEdit && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onSetStudioImage(s.id); }}
                    title="Set studio image…"
                    className={`absolute right-3 top-3 rounded-lg bg-black/45 p-2 text-white transition-opacity duration-300 hover:bg-black/70 ${shown ? "opacity-100" : "pointer-events-none opacity-0"}`}
                  >
                    <ImageIcon className="h-4 w-4" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div key={current.id} className="view-fade space-y-5">
      <div className="flex flex-wrap items-center gap-3 px-1">
        <button onClick={() => setStudio(null)} className="press flex items-center gap-1 text-xs font-bold text-[#768994] hover:text-[#122027]">
          <ChevronLeft className="h-4 w-4" /> Studios
        </button>
        <h2 className="font-display text-xl font-bold tracking-tight text-[#122027]">{labelOf(current.id)}</h2>
        <span className="text-xs font-medium text-[#768994]">
          {films.length} {films.length === 1 ? "film" : "films"}
        </span>
      </div>

      {films.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#dce4ec] bg-white/60 p-10 text-center">
          <Plus className="mx-auto h-6 w-6 text-[#768994]" />
          <p className="mt-2 text-sm font-bold text-[#122027]">No films loaded for {labelOf(current.id)} yet</p>
          <p className="mt-1 text-xs text-[#768994]">Load one from the studio's Drive, or drop an order form on the page.</p>
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,230px))] gap-6">
          {films.map((g, i) => {
            const look = LOOK[current.id] || LOOK.dropped;
            const key = `film:${g.key}`;
            const shown = revealed === key;
            const open = (file) => onOpen(file.id);
            return (
              <div key={g.key} className="list-row-in group relative" style={{ "--i": Math.min(i, 10) }} onMouseEnter={() => rest(key)} onMouseLeave={leave}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => open(g.primary)}
                  onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); open(g.primary); } }}
                  className="press block w-full cursor-pointer text-left outline-none"
                >
                  <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-slate-900 shadow-sm ring-1 ring-black/5 transition-[transform,box-shadow] duration-300 ease-out group-hover:-translate-y-1 group-hover:shadow-2xl group-focus-within:ring-2 group-focus-within:ring-white/60">
                    {/* No poster yet: the title itself, set large, rather than two initials. */}
                    <div className={`absolute inset-0 flex flex-col justify-center bg-gradient-to-br p-5 ${look.tint}`}>
                      <span className="font-display text-5xl font-bold leading-none text-white/15">{initials(g.title)}</span>
                      <span className="mt-3 font-display text-2xl font-bold leading-tight tracking-tight text-white/90">{g.title}</span>
                    </div>
                    {g.poster && (
                      <img
                        src={g.poster}
                        alt=""
                        className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
                        onError={(e) => { e.currentTarget.style.display = "none"; }}
                      />
                    )}
                    {/* Dark enough under the title that a poster's own lettering never fights it. */}
                    <div className={`absolute inset-x-0 bottom-0 bg-gradient-to-t to-transparent ${g.poster ? "h-3/5 from-black via-black/75" : "h-1/4 from-black/70"}`} />
                    {/* The title, lifted out of the way when the two sides slide up beneath it. */}
                    <div className="absolute inset-x-0 bottom-0 p-3 pb-4 transition-transform duration-300 ease-out group-hover:-translate-y-16 group-focus-within:-translate-y-16">
                      {g.poster && <p className="line-clamp-2 font-display text-base font-bold leading-snug text-white drop-shadow">{g.title}</p>}
                      <p className="mt-0.5 flex items-center gap-1.5 text-[11px] font-medium text-white/60">
                        {g.media.map((m) => <span key={m} className="h-1.5 w-1.5 rounded-full" style={{ background: MEDIA[m].colour }} />)}
                        <span>
                          {g.markets} {g.markets === 1 ? "market" : "markets"}
                          {g.stale ? (g.stale.gone ? " · gone from Drive" : ` · ${g.stale.left} left`) : ""}
                        </span>
                      </p>
                    </div>
                    {/* Motion and Print, side by side, sliding up from the bottom edge on hover: each opens its own orders. */}
                    <div className="absolute inset-x-0 bottom-0 flex h-16 translate-y-full transition-transform duration-300 ease-out group-hover:translate-y-0 group-focus-within:translate-y-0">
                      {g.media.map((m) => {
                        const { colour, Icon } = MEDIA[m];
                        const side = g.sides[m];
                        return (
                          <button
                            key={m}
                            onClick={(e) => { e.stopPropagation(); open(side.file); }}
                            title={`Open the ${m.toLowerCase()} orders`}
                            className="flex flex-1 flex-col justify-center gap-0.5 px-3 text-left text-white backdrop-blur-md transition-[filter] duration-150 hover:brightness-125 focus-visible:outline-none focus-visible:brightness-125"
                            style={{ background: `linear-gradient(to top, ${colour}e6, ${colour}b3)` }}
                          >
                            <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide">
                              <Icon className="h-3.5 w-3.5" strokeWidth={2.5} />
                              {m}
                            </span>
                            <span className="text-[11px] font-medium text-white/85">
                              {side.markets} {side.markets === 1 ? "market" : "markets"}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    {g.delivered && (
                      <span className="absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-[#1cc1a5] text-white shadow" title="Every market delivered">
                        <Check className="h-3.5 w-3.5" strokeWidth={3} />
                      </span>
                    )}
                    {g.stale && (
                      <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-white shadow" title={g.stale.gone ? "Gone from Drive" : "Some markets have left Drive"}>
                        <AlertTriangle className="h-3.5 w-3.5" strokeWidth={2.5} />
                      </span>
                    )}
                  </div>
                </div>
                {canEdit && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onSetPoster(g.primary); }}
                    title="Set poster…"
                    className={`absolute right-2 top-2 rounded-lg bg-black/45 p-1.5 text-white transition-opacity duration-300 hover:bg-black/70 ${shown ? "opacity-100" : "pointer-events-none opacity-0"}`}
                    style={g.delivered || g.stale ? { top: "2.75rem" } : undefined}
                  >
                    <ImageIcon className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
