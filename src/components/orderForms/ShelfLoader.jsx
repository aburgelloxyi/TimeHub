import { useEffect, useMemo, useState } from "react";
import { CloudDownload, Loader2, Plus, Search, X } from "lucide-react";
import { connectGoogle, googleConnected } from "../../lib/orderForms/googleApi";
import { clientFor, sameFilm } from "../../lib/orderForms/driveTree";
import { listFilms, loadFilm } from "../../lib/orderForms/loadFilm";
import { filmKey, studioLabel } from "../../lib/orderForms/studios";
import { MEDIUM_LABEL } from "./format";
import { MEDIA, ON_COLOUR } from "./media";
import MarketFlag from "./MarketFlag";
import { googleMessage, LISTING_LINES } from "./GoogleSource";

// Loading a film from Google where the films are: the open studio's shelf ends
// in a "Load a film" tile. It lists the studio's Drive, and the films not loaded
// yet join the shelf as ghost posters (dashed, faded, one per film with a chip
// for each of Motion and Print). Choosing one reads it in place, the ghost
// filling as its markets arrive, and then opens it. Nothing here writes to Google.

const GRADIENT = "from-[#12a0e1] to-[#1cc1a5]";
const bare = (s) => String(s || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const sideOf = (medium) => MEDIUM_LABEL[medium] || "Motion";

export function useShelfLoader({ studioId, files, onLoaded, onBusy }) {
  const [phase, setPhase] = useState("idle"); // idle | connecting | listing | open
  const [films, setFilms] = useState(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(null); // { key, medium, done, total, arrived }

  // Another studio starts afresh.
  useEffect(() => { setPhase("idle"); setFilms(null); setError(""); setQuery(""); }, [studioId]);
  // The page holds off file drops while a film is being read.
  useEffect(() => { onBusy?.(!!loading); }, [loading, onBusy]);

  const label = studioLabel(studioId);
  const open = async () => {
    setError("");
    try {
      // Asked for inside the click, so the browser lets Google's window open.
      if (!googleConnected()) {
        setPhase("connecting");
        await connectGoogle();
      }
      setPhase("listing");
      const found = await listFilms(studioId);
      setFilms(found);
      setPhase("open");
      if (!found.length) setError(`No order sheets were found in ${label}'s market folders.`);
    } catch (err) {
      setError(googleMessage(err));
      setPhase("idle");
    }
  };
  const close = () => {
    if (loading) return;
    setPhase("idle");
    setQuery("");
    setError("");
  };

  // The studio's films by title, each with the sides not loaded yet; a film fully loaded has no ghost.
  const ghosts = useMemo(() => {
    const loadedHere = (entry) => (files || []).some((f) => f.source?.clientId === studioId && sameFilm(f.source.filmKey, entry.key));
    const by = new Map();
    for (const entry of films || []) {
      if (loadedHere(entry)) continue;
      const key = filmKey(entry.title);
      const at = by.get(key) || { key, title: entry.title, entries: [] };
      at.entries.push(entry);
      by.set(key, at);
    }
    const wanted = bare(query);
    return [...by.values()]
      .map((g) => ({ ...g, entries: g.entries.sort((a, b) => (a.medium === "motion" ? -1 : 1) - (b.medium === "motion" ? -1 : 1)) }))
      .filter((g) => !wanted || bare(g.title).includes(wanted))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [films, files, studioId, query]);

  const load = async (entry, ghostKey) => {
    if (loading) return;
    setError("");
    setLoading({ key: ghostKey, medium: entry.medium, done: 0, total: entry.markets.length, arrived: [] });
    try {
      // The hour may have run out since the films were listed.
      if (!googleConnected()) await connectGoogle();
      const file = await loadFilm({
        clientId: studioId,
        filmKey: entry.key,
        onProgress: (done, total) => setLoading((l) => l && { ...l, done, total }),
        onMarket: (m) => setLoading((l) => l && { ...l, arrived: [...l.arrived, m.name].slice(-4) }),
      });
      if (!file) setError("That film's order sheets are no longer in the market folders.");
      else await onLoaded(file);
    } catch (err) {
      setError(googleMessage(err));
    } finally {
      setLoading(null);
    }
  };

  return { drive: !!clientFor(studioId), label, phase, films, ghosts, error, query, setQuery, loading, open, close, load };
}

// The tile at the end of the shelf. While the Drive is listed it says what's
// happening, lightly, as the old loader did.
export function AddTile({ loader }) {
  const [line, setLine] = useState(0);
  const busy = loader.phase === "listing" || loader.phase === "connecting";
  useEffect(() => {
    if (loader.phase !== "listing") return undefined;
    setLine(0);
    const timer = setInterval(() => setLine((n) => Math.min(n + 1, LISTING_LINES.length - 1)), 1700);
    return () => clearInterval(timer);
  }, [loader.phase]);

  return (
    <div className="list-row-in">
      <button
        type="button"
        onClick={loader.open}
        disabled={busy}
        className="add-poster group press relative flex aspect-[2/3] w-full flex-col items-center justify-center gap-4 overflow-hidden rounded-xl border-2 border-dashed border-[#748494] p-6 text-center focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#12a0e1]/30 disabled:cursor-progress"
      >
        <span aria-hidden="true" className="add-poster-glow absolute inset-0" />
        <span className={`relative flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br ${GRADIENT} text-white shadow-lg shadow-[#12a0e1]/30`}>
          {busy ? <Loader2 className="h-7 w-7 animate-spin" /> : <Plus className="h-7 w-7 transition-transform duration-300 group-hover:rotate-90" strokeWidth={2.75} />}
        </span>
        <span role="status" aria-live="polite" className="relative">
          <span key={busy ? line : "idle"} className="view-fade block font-display text-2xl font-bold leading-tight tracking-tight text-[#122027]">
            {loader.phase === "connecting" ? "Waiting for Google…" : busy ? `${LISTING_LINES[line]}…` : "Load a film"}
          </span>
          <span className="mt-1.5 block text-xs font-medium text-[#768994]">
            {busy ? `Reading ${loader.label}'s folders` : googleConnected() ? `from ${loader.label}'s Drive` : "Connects Google, read-only"}
          </span>
          {loader.error && !busy && <span role="alert" className="mt-2 block text-xs font-semibold text-rose-600">{loader.error}</span>}
        </span>
      </button>
    </div>
  );
}

// A film in the Drive not loaded yet, as a poster in outline. The tile loads
// its first side (Motion when there is one); the chips load either.
export function GhostTile({ ghost, loader, tint, poster, index, hidden }) {
  const mine = loader.loading?.key === ghost.key ? loader.loading : null;
  const busy = !!loader.loading;
  const first = ghost.entries[0];
  const share = mine?.total ? mine.done / mine.total : 0;
  const start = () => !busy && loader.load(first, ghost.key);

  return (
    <div className="list-row-in group relative" style={{ "--i": Math.min(index, 8), opacity: hidden ? 0 : undefined, pointerEvents: hidden ? "none" : undefined }}>
      <div
        role="button"
        tabIndex={busy ? -1 : 0}
        aria-label={`Load ${ghost.title} (${sideOf(first.medium)})`}
        aria-disabled={busy || undefined}
        onClick={start}
        onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); start(); } }}
        className={`ghost-poster press relative block aspect-[2/3] w-full overflow-hidden rounded-xl text-left outline-none focus-visible:ring-4 focus-visible:ring-[#12a0e1]/40 ${busy ? (mine ? "is-loading" : "is-waiting") : "cursor-pointer"}`}
      >
        <div className={`absolute inset-0 bg-gradient-to-br ${tint}`} />
        {poster && <img src={poster} alt="" className="absolute inset-0 h-full w-full object-cover opacity-25 grayscale" onError={(e) => { e.currentTarget.style.display = "none"; }} />}
        {/* What has been read so far, rising from the foot as the markets arrive. */}
        {mine && (
          <div className={`ghost-fill absolute inset-0 origin-bottom bg-gradient-to-t ${GRADIENT}`} style={{ transform: `scaleY(${Math.max(0.03, share)})` }} />
        )}
        <div className="ghost-edge pointer-events-none absolute inset-0 rounded-xl border-2 border-dashed" />

        <div className="relative flex h-full flex-col p-5">
          <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-white/60">
            <CloudDownload className="h-3.5 w-3.5" /> {mine ? "Reading" : "In Drive"}
          </p>
          <p className="mt-3 font-display text-[1.7rem] font-bold leading-tight tracking-tight text-white">{ghost.title}</p>

          {mine ? (
            <div className="mt-auto" role="status" aria-live="polite">
              <p className="font-display text-5xl font-bold leading-none tracking-tighter text-white tabular-nums">
                {mine.done}<span className="text-white/50">/{mine.total || "…"}</span>
              </p>
              <p className="mt-1 text-xs font-semibold text-white/80">{sideOf(mine.medium)} markets</p>
              <ul className="mt-3 space-y-1">
                {mine.arrived.map((name) => (
                  <li key={name} className="view-fade flex items-center gap-2 text-xs font-semibold text-white/85">
                    <MarketFlag name={name} className="h-3 w-4" /> <span className="truncate">{name}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="relative z-[1] mt-auto flex flex-wrap gap-2">
              {ghost.entries.map((entry) => {
                const side = sideOf(entry.medium);
                const { colour, Icon } = MEDIA[side];
                return (
                  <button
                    key={entry.key}
                    type="button"
                    disabled={busy}
                    onClick={(e) => { e.stopPropagation(); loader.load(entry, ghost.key); }}
                    className={`drawer-chip press flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-wide shadow-sm disabled:opacity-50 ${ON_COLOUR}`}
                    style={{ background: colour }}
                  >
                    <Icon className="h-3 w-3" strokeWidth={2.75} /> {side}
                    <span className="font-bold opacity-70">{entry.markets.length}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Above the shelf while its Drive films are showing: how many, a search when
// there are plenty, the other way in (a downloaded .xlsx), and Done.
export function LoaderBar({ loader, onChooseFile }) {
  const total = new Set((loader.films || []).map((f) => filmKey(f.title))).size;
  return (
    <div className="view-fade flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-[#dce4ec] bg-white px-4 py-2.5 shadow-sm">
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${GRADIENT} text-white`}>
        <CloudDownload className="h-4 w-4" />
      </span>
      <p className="text-sm font-bold text-[#122027]">
        {loader.ghosts.length || "No"} {loader.ghosts.length === 1 ? "film" : "films"} in {loader.label}'s Drive to load
        {total > loader.ghosts.length && !loader.query ? <span className="font-medium text-[#768994]"> · the rest are on the shelf</span> : null}
      </p>
      {total > 8 && (
        <label className="flex w-56 items-center gap-2 rounded-xl border border-[#dce4ec] bg-white px-3 py-1.5 focus-within:border-[#12a0e1]">
          <Search className="h-4 w-4 shrink-0 text-[#768994]" />
          <input autoFocus value={loader.query} onChange={(e) => loader.setQuery(e.target.value)} placeholder="Find a film" className="min-w-0 flex-1 bg-transparent text-sm text-[#122027] outline-none placeholder:text-[#9aabb5]" />
        </label>
      )}
      <p className="text-xs text-[#768994]">
        or drop an .xlsx on the page, or{" "}
        <button type="button" onClick={onChooseFile} className="font-bold text-[#122027] underline underline-offset-2 hover:text-[#12a0e1]">choose a file</button>
      </p>
      {loader.error && <p role="alert" className="text-xs font-semibold text-rose-600">{loader.error}</p>}
      <button
        type="button"
        onClick={loader.close}
        disabled={!!loader.loading}
        className="group/close press ml-auto flex items-center gap-1.5 rounded-xl border border-[#dce4ec] px-3 py-1.5 text-xs font-bold text-[#122027] transition-colors hover:border-[#12a0e1] disabled:opacity-50"
      >
        <X className="h-3.5 w-3.5 transition-transform duration-300 group-hover/close:rotate-90" /> Done
      </button>
    </div>
  );
}
