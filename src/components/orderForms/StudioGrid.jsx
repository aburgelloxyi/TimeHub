import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, Image as ImageIcon, Plus } from "lucide-react";
import { MEDIA } from "./media";
import { CLIENTS } from "../../lib/orderForms/driveTree";
import { posterKey, studioKey } from "../../lib/filmPosters";
import FilmDrawer from "./FilmDrawer";
import { SECTIONS } from "../../lib/orderForms/sections";
import { placeExtras, sameFilmName } from "../../lib/orderForms/extras";
import { EXTRA_STUDIOS, filmKey, mediumOf, studioLabel as labelOf, studioOf } from "../../lib/orderForms/studios";

// Client Orders' front door. With no studio open, the studios are large cards.
// Opening one shrinks the row to a slim strip and brings its films in as posters,
// centred under that card; switching studio, the rare move, never leaves the
// page. Which studio is open belongs to OrderForms, which remembers it. A film
// loaded for both Motion and Print is one card, because it is one film to
// choose. Choosing it opens a drawer beside the poster with the kinds of work
// the film has (FilmDrawer); Motion and Print are chosen in there. A film's
// Domestic and Launch reads join its card through the film code; one whose film
// has no order forms loaded stands as a card of its own.
//
// Nothing here writes except a picture's URL, and only an admin can start that:
// the button stays hidden until the pointer has rested on the card for two
// seconds, so it never sits in the way of choosing a film.

const HOVER_DELAY = 2000;

const LOOK = {
  universal: { gradient: "from-[#0b2c6b] via-[#123f95] to-[#0d2a60]", tint: "from-[#123f95]/90 to-[#0b2c6b]/90" },
  paramount: { gradient: "from-[#0b1f3a] via-[#123a68] to-[#0a1a30]", tint: "from-[#123a68]/90 to-[#0b1f3a]/90" },
  amazonmgm: { gradient: "from-[#2a1f0a] via-[#6b4a12] to-[#1d1507]", tint: "from-[#6b4a12]/90 to-[#1d1507]/90" },
  dropped: { gradient: "from-[#2b3440] via-[#3a4757] to-[#222a35]", tint: "from-[#3a4757]/90 to-[#222a35]/90" },
};


const initials = (title) => {
  const words = String(title || "").split(/[^A-Za-z0-9]+/).filter(Boolean);
  return (words.slice(0, 2).map((w) => w[0]).join("") || "?").toUpperCase();
};

const readableMarkets = (file) => (file.markets || []).filter((m) => !m.unreadable).length;

// A poster's width, which a short shelf is sized from; the drawer's, and how far it tucks behind the poster.
const POSTER_WIDTH = 380;
const DRAWER_WIDTH = 340;
const DRAWER_TUCK = 14;

export default function StudioGrid({ files, extras = [], codes = {}, studio, onStudio, posters, titleOf, staleness, delivered, onOpen, onOpenExtra, onSetPoster, onSetStudioImage, canEdit = false }) {
  const [revealed, setRevealed] = useState(null);
  const timer = useRef(null);
  // The film whose drawer is open, where its poster moves to, and where every other poster goes meanwhile.
  const [drawer, setDrawer] = useState(null);
  const drawn = useRef(null);
  const cards = useRef({});

  // The picture button after two seconds of rest, and gone the moment the pointer leaves.
  const rest = (key) => {
    if (!canEdit) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setRevealed(key), HOVER_DELAY);
  };
  const leave = () => { clearTimeout(timer.current); setRevealed(null); };
  useEffect(() => () => clearTimeout(timer.current), []);

  const placed = useMemo(() => placeExtras(files, extras, codes, titleOf), [extras, codes, files, titleOf]);

  const studios = useMemo(() => {
    const by = new Map();
    const at = (id) => by.get(id) || by.set(id, { id, films: [], extras: [], markets: 0 }).get(id);
    for (const f of files || []) {
      const s = at(studioOf(f));
      s.films.push(f);
      s.markets += readableMarkets(f);
    }
    for (const p of placed) at(p.studio).extras.push(p);
    const order = [...CLIENTS.map((c) => c.id), ...EXTRA_STUDIOS.map((s) => s.id)];
    const out = order.map((id) => by.get(id) || { id, films: [], extras: [], markets: 0 });
    if (by.has("dropped")) out.push(by.get("dropped"));
    return out;
  }, [files, placed]);

  const current = (studio && studios.find((s) => s.id === studio)) || null;
  const index = current ? studios.indexOf(current) : -1;

  // How the shelf arrives: a plain fade when the page opens on a studio, rising as the cards shrink when one is
  // opened, and from the side of the studio just chosen when switching, the way the timesheet's days do. Held in
  // state, so a re-render for any other reason doesn't replay it.
  const [entry, setEntry] = useState("view-fade");

  // A second click on the open studio closes it, back to the large cards.
  const choose = (id) => {
    setDrawer(null);
    if (id === current?.id) { onStudio(null); return; }
    const to = studios.findIndex((s) => s.id === id);
    setEntry(index < 0 ? "view-in" : to > index ? "day-in-right" : "day-in-left");
    onStudio(id);
  };
  // With a studio open, left and right move along the studios, as tabs do.
  const onTabKey = (e) => {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step || !current || studios.length < 2) return;
    e.preventDefault();
    const next = studios[(index + step + studios.length) % studios.length];
    choose(next.id);
    tabs.current[next.id]?.focus();
  };

  // Where the open card's centre is, for the pill under it and the shelf centred on it. Measured rather than
  // computed from the grid, so it follows any width.
  const row = useRef(null);
  const tabs = useRef({});
  const [glide, setGlide] = useState(null);
  useLayoutEffect(() => {
    const measure = () => {
      // Against the row, not offsetLeft: each card's own wrapper is positioned, so offsetLeft would be 0 for all.
      const el = current && tabs.current[current.id];
      if (!el || !row.current) { setGlide(null); return; }
      const card = el.getBoundingClientRect();
      const box = row.current.getBoundingClientRect();
      setGlide((g) => ({ x: card.left - box.left + card.width / 2, room: box.width, moved: g !== null }));
    };
    measure();
    const watch = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    if (watch && row.current) watch.observe(row.current);
    return () => watch?.disconnect();
  }, [current, studios.length]);

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
    // A film's other kinds of work join its card; one with no order forms loaded makes its own.
    for (const p of current?.extras || []) {
      let at = [...by.values()].find((g) => g.titles.some((t) => sameFilmName(t, p.name)));
      if (!at) {
        const key = filmKey(p.name);
        at = by.get(key) || { key, title: p.name, titles: [p.name], files: [], markets: 0, sides: {}, delivered: false, stale: null };
        by.set(key, at);
      }
      at.extras = { ...(at.extras || {}), [p.extra.section]: p.extra };
    }
    for (const at of by.values()) {
      // Motion leads, since that is the side a film opens on; Print is a switch away in the header.
      at.primary = at.sides.Motion?.file || at.files[0] || null;
      at.media = ["Motion", "Print"].filter((m) => at.sides[m]);
      // The poster saved under any of the film's spellings, and the title that has it.
      const withPoster = at.titles.find((t) => posters[posterKey(current?.id, t)]);
      at.poster = withPoster ? posters[posterKey(current?.id, withPoster)] : null;
      at.title = withPoster || (at.primary ? titleOf(at.primary) : at.title);
    }
    return [...by.values()];
  }, [current, posters, titleOf, delivered, staleness]);

  // Opening a film gathers the others behind it like a deck of cards: each slides to where the chosen poster is
  // going, tilting, shrinking and fading, the nearest first and the farther ones a beat later and further, which
  // gives the depth. The chosen poster moves so that it and its drawer sit centred in the row, so the drawer
  // always opens on the right. Positions are read from the grid cells, which never move, so a deck still settling
  // from the last film is measured where it belongs.
  const toggleDrawer = (g) => {
    if (drawer?.key === g.key) { setDrawer(null); return; }
    const box = row.current?.getBoundingClientRect();
    const mine = cards.current[g.key]?.getBoundingClientRect();
    if (!box || !mine) return;
    const width = Math.max(240, Math.min(DRAWER_WIDTH, box.width - mine.width + DRAWER_TUCK));
    const group = mine.width + width - DRAWER_TUCK;
    const target = box.left + Math.max(0, (box.width - group) / 2);
    const distance = (r) => Math.hypot(r.left - mine.left, r.top - mine.top);
    const others = films
      .filter((f) => f.key !== g.key)
      .map((f) => ({ key: f.key, r: cards.current[f.key]?.getBoundingClientRect() }))
      .filter((o) => o.r)
      .sort((a, b) => distance(a.r) - distance(b.r));
    const deck = {};
    others.forEach(({ key, r }, rank) => {
      const side = r.left < mine.left ? -1 : 1;
      deck[key] = {
        x: target - r.left + side * (10 + rank * 6),
        y: mine.top - r.top + 6 + rank * 4,
        turn: side * (4 + rank * 2.5),
        delay: Math.min(rank, 6) * 45,
      };
    });
    setDrawer({ key: g.key, shift: target - mine.left, width, deck });
  };
  // Pointing anywhere outside the open film, Escape, or resizing the window closes its drawer.
  useEffect(() => {
    if (!drawer) return;
    const down = (e) => { if (!drawn.current?.contains(e.target)) setDrawer(null); };
    const key = (e) => { if (e.key === "Escape") setDrawer(null); };
    // The deck was laid out for this width; a resize would leave it pointing at the wrong place.
    const resize = () => setDrawer(null);
    document.addEventListener("pointerdown", down);
    document.addEventListener("keydown", key);
    window.addEventListener("resize", resize);
    return () => {
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("keydown", key);
      window.removeEventListener("resize", resize);
    };
  }, [drawer]);

  // A handful of films share a poster's width each, centred under their studio's card as far as the row allows;
  // more than that wrap as a shelf across the full width.
  const shelf = (() => {
    if (films.length > 4) return { gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" };
    const want = films.length * POSTER_WIDTH;
    const w = glide ? Math.min(glide.room, want) : want;
    const left = glide ? Math.max(0, Math.min(glide.x - w / 2, glide.room - w)) : 0;
    return { gridTemplateColumns: `repeat(${films.length}, minmax(0, 1fr))`, width: `min(100%, ${want}px)`, marginLeft: left };
  })();

  return (
    <div className="space-y-6">
      <div className={`studio-row relative ${current ? "has-open pb-3" : ""}`}>
        <div
          ref={row}
          role="tablist"
          aria-label="Studios"
          className="grid gap-3 sm:gap-4"
          style={{ gridTemplateColumns: `repeat(${studios.length}, minmax(0, 1fr))` }}
        >
          {studios.map((s, i) => {
            const look = LOOK[s.id] || LOOK.dropped;
            const image = posters[studioKey(s.id)];
            const key = `studio:${s.id}`;
            const shown = revealed === key;
            const active = s.id === current?.id;
            // Films, not order forms: a film loaded for Motion and for Print is one, and so is its Domestic read.
            const count = new Set([...s.films.map((f) => filmKey(titleOf(f))), ...s.extras.filter((p) => p.alone).map((p) => filmKey(p.name))]).size;
            return (
              <div key={s.id} className="list-row-in group relative" style={{ "--i": Math.min(i, 6) }} onMouseEnter={() => rest(key)} onMouseLeave={leave}>
                <button
                  ref={(el) => { tabs.current[s.id] = el; }}
                  role="tab"
                  id={`studio-tab-${s.id}`}
                  aria-selected={active}
                  aria-controls="studio-shelf"
                  tabIndex={!current || active ? 0 : -1}
                  onClick={() => choose(s.id)}
                  onKeyDown={onTabKey}
                  className={`studio-tab press relative block w-full overflow-hidden rounded-2xl text-left ring-1 ring-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#12a0e1] ${active ? "is-active shadow-xl" : "shadow-sm hover:shadow-lg"}`}
                >
                  <div className={`studio-tab-art relative bg-gradient-to-br ${look.gradient} ${current ? "h-20 sm:h-24" : "h-48 sm:h-64 xl:h-72"}`}>
                    {image && (
                      <img
                        src={image}
                        alt=""
                        className="studio-tab-image absolute inset-0 h-full w-full object-cover"
                        onError={(e) => { e.currentTarget.style.display = "none"; }}
                      />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/5" />
                    <div className={`studio-tab-label absolute inset-x-0 bottom-0 ${current ? "px-4 py-3" : "p-5 sm:p-6"}`}>
                      <p className={`studio-tab-title truncate font-display font-bold tracking-tight text-white ${current ? "text-base sm:text-xl" : "text-2xl sm:text-3xl"}`}>{labelOf(s.id)}</p>
                      <p className="mt-0.5 truncate text-[11px] font-medium text-white/75 sm:text-xs">
                        {count > 0
                          ? `${count} ${count === 1 ? "film" : "films"} · ${s.markets} ${s.markets === 1 ? "market" : "markets"}`
                          : "No films yet"}
                      </p>
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
        {/* Which studio the shelf below belongs to. It glides between cards; on first paint it is simply there. */}
        {current && glide && (
          <span
            aria-hidden="true"
            className={`studio-glide pointer-events-none absolute bottom-0 left-0 h-1 w-12 rounded-full bg-gradient-to-r from-[#12a0e1] to-[#1cc1a5] ${glide.moved ? "is-moving" : ""}`}
            style={{ transform: `translateX(calc(${glide.x}px - 50%))` }}
          />
        )}
      </div>

      {current && (
      <div
        key={current.id}
        id="studio-shelf"
        role="tabpanel"
        aria-labelledby={`studio-tab-${current.id}`}
        className={`studio-shelf -mx-4 px-4 pb-2 ${entry}`}
      >
      {films.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#dce4ec] bg-white/60 p-10 text-center">
          <Plus className="mx-auto h-6 w-6 text-[#768994]" />
          <p className="mt-2 text-sm font-bold text-[#122027]">No films loaded for {labelOf(current.id)} yet</p>
          <p className="mt-1 text-xs text-[#768994]">Load one from the studio's Drive, or drop an order form on the page.</p>
        </div>
      ) : (
        <div className="grid gap-6" style={shelf}>
          {films.map((g, i) => {
            const look = LOOK[current.id] || LOOK.dropped;
            const key = `film:${g.key}`;
            const shown = revealed === key;
            const isDrawn = drawer?.key === g.key;
            const away = drawer && !isDrawn ? drawer.deck[g.key] : null;
            // The grid cell stays put (its arrival animation holds its transform); the card inside it moves.
            const place = isDrawn
              ? { transform: `translateX(${drawer.shift}px)` }
              : away
                ? { transform: `translate(${away.x}px, ${away.y}px) rotate(${away.turn}deg) scale(0.9)`, opacity: 0, transitionDelay: `${away.delay}ms` }
                : undefined;
            return (
              <div
                key={g.key}
                ref={(el) => { cards.current[g.key] = el; }}
                className={`list-row-in group relative ${isDrawn ? "z-20" : ""}`}
                style={{ "--i": Math.min(i, 10) }}
                onMouseEnter={() => rest(key)}
                onMouseLeave={leave}
              >
                <div ref={isDrawn ? drawn : undefined} className={`deck-card relative ${away ? "is-away" : ""}`} style={place}>
                <div
                  role="button"
                  tabIndex={0}
                  aria-expanded={isDrawn}
                  aria-haspopup="dialog"
                  onClick={() => toggleDrawer(g)}
                  onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); toggleDrawer(g); } }}
                  className="press relative z-10 block w-full cursor-pointer text-left outline-none"
                >
                  {/* An open film stays level with its drawer rather than lifting on hover. */}
                  <div className={`relative aspect-[2/3] overflow-hidden rounded-xl bg-slate-900 shadow-sm ring-1 ring-black/5 transition-[transform,box-shadow] duration-300 ease-out ${isDrawn ? "shadow-2xl" : "group-hover:-translate-y-1 group-hover:shadow-2xl group-focus-within:ring-2 group-focus-within:ring-white/60"}`}>
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
                    <div className="absolute inset-x-0 bottom-0 p-4 pb-5">
                      {g.poster && <p className="line-clamp-2 font-display text-lg font-bold leading-snug text-white drop-shadow">{g.title}</p>}
                      <p className="mt-0.5 flex items-center gap-1.5 text-[11px] font-medium text-white/60">
                        {g.media.map((m) => <span key={m} className="h-1.5 w-1.5 rounded-full" style={{ background: MEDIA[m].colour }} />)}
                        <span>
                          {g.files.length ? `${g.markets} ${g.markets === 1 ? "market" : "markets"}` : SECTIONS.filter((x) => g.extras?.[x.id]).map((x) => x.label).join(" · ")}
                          {g.stale ? (g.stale.gone ? " · gone from Drive" : ` · ${g.stale.left} left`) : ""}
                        </span>
                      </p>
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
                {isDrawn && (
                  <FilmDrawer
                    film={g}
                    width={drawer.width}
                    tuck={DRAWER_TUCK}
                    media={MEDIA}
                    onOpen={(file) => { setDrawer(null); onOpen(file.id); }}
                    onOpenExtra={(extra) => { setDrawer(null); onOpenExtra(extra.id); }}
                    onClose={() => setDrawer(null)}
                  />
                )}
                {canEdit && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onSetPoster(current.id, g.title); }}
                    title="Set poster…"
                    className={`absolute right-2 top-2 z-[11] rounded-lg bg-black/45 p-1.5 text-white transition-opacity duration-300 hover:bg-black/70 ${shown ? "opacity-100" : "pointer-events-none opacity-0"}`}
                    style={g.delivered || g.stale ? { top: "2.75rem" } : undefined}
                  >
                    <ImageIcon className="h-3.5 w-3.5" />
                  </button>
                )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      </div>
      )}
    </div>
  );
}
