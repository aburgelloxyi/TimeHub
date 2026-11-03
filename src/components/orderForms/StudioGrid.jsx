import { useMemo, useState } from "react";
import { AlertTriangle, Check, ChevronLeft, Image as ImageIcon, Layers, Plus } from "lucide-react";
import { CLIENTS } from "../../lib/orderForms/driveTree";
import { posterKey, studioKey } from "../../lib/filmPosters";

// Client Orders' front door: the studios as cards, then one studio's films as
// posters, instead of the two pickers. Choosing a film hands back to the page,
// which opens it exactly as the switcher would. Nothing here writes except a
// picture's URL, and only when someone asks for it.

// Amazon MGM has no Drive folder in the list yet, but the studio is real and
// the card should be there to take one when it arrives.
const EXTRA_STUDIOS = [{ id: "amazonmgm", label: "Amazon MGM" }];

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

const studioOf = (file) => file.source?.clientId || "dropped";
const labelOf = (id) =>
  CLIENTS.find((c) => c.id === id)?.label || EXTRA_STUDIOS.find((s) => s.id === id)?.label || "Dropped files";

export default function StudioGrid({ files, posters, titleOf, staleness, delivered, onOpen, onSetPoster, onSetStudioImage }) {
  const [studio, setStudio] = useState(null);

  // Every studio card, in the clients' order, then Amazon MGM, then dropped workbooks. A studio with no films
  // still gets a card: it is somewhere to put one.
  const studios = useMemo(() => {
    const by = new Map();
    for (const f of files || []) {
      const id = studioOf(f);
      const at = by.get(id) || { id, films: [], markets: 0, delivered: 0 };
      at.films.push(f);
      at.markets += (f.markets || []).filter((m) => !m.unreadable).length;
      if (delivered(f)) at.delivered += 1;
      by.set(id, at);
    }
    const order = [...CLIENTS.map((c) => c.id), ...EXTRA_STUDIOS.map((s) => s.id)];
    const empty = (id) => ({ id, films: [], markets: 0, delivered: 0 });
    const out = order.map((id) => by.get(id) || empty(id));
    if (by.has("dropped")) out.push(by.get("dropped"));
    return out;
  }, [files, delivered]);

  const current = studios.find((s) => s.id === studio) || null;

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
            return (
              <div key={s.id} className="list-row-in group relative" style={{ "--i": Math.min(i, 6) }}>
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
                          {s.films.length} {s.films.length === 1 ? "film" : "films"} · {s.markets} {s.markets === 1 ? "market" : "markets"}
                          {s.films.length > 0 ? ` · ${s.delivered} delivered` : ""}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-xl bg-white/10 px-3 py-1.5 text-[11px] font-bold text-white ring-1 ring-white/25 transition-colors group-hover:bg-white/25">
                        {s.films.length > 0 ? "Open" : "Empty"}
                      </span>
                    </div>
                    <Layers className="absolute right-4 top-4 h-5 w-5 text-white/40" strokeWidth={1.5} />
                  </div>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onSetStudioImage(s.id); }}
                  title="Set studio image…"
                  className="absolute right-3 top-3 rounded-lg bg-black/45 p-2 text-white opacity-0 transition-opacity duration-200 hover:bg-black/70 focus:opacity-100 group-hover:opacity-100"
                >
                  <ImageIcon className="h-4 w-4" />
                </button>
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
          {current.films.length} {current.films.length === 1 ? "film" : "films"}
        </span>
      </div>

      {current.films.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#dce4ec] bg-white/60 p-10 text-center">
          <Plus className="mx-auto h-6 w-6 text-[#768994]" />
          <p className="mt-2 text-sm font-bold text-[#122027]">No films loaded for {labelOf(current.id)} yet</p>
          <p className="mt-1 text-xs text-[#768994]">Load one from the studio's Drive, or drop an order form on the page.</p>
        </div>
      ) : (
        <div className="grid gap-5 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
          {current.films.map((f, i) => {
            const title = titleOf(f);
            const look = LOOK[current.id] || LOOK.dropped;
            const poster = posters[posterKey(current.id, title)];
            const stale = staleness(f);
            return (
              <div key={f.id} className="list-row-in group relative" style={{ "--i": Math.min(i, 10) }}>
                <button onClick={() => onOpen(f.id)} className="press block w-full text-left">
                  <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-slate-200 shadow-sm ring-1 ring-black/5 transition-[transform,box-shadow] duration-300 ease-out group-hover:-translate-y-1 group-hover:shadow-xl">
                    {/* The tinted card underneath is the fallback, so a link that dies leaves a card, not a hole. */}
                    <div className={`absolute inset-0 flex items-center justify-center bg-gradient-to-br ${look.tint}`}>
                      <span className="font-display text-3xl font-bold text-white/75">{initials(title)}</span>
                    </div>
                    {poster && (
                      <img
                        src={poster}
                        alt=""
                        className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
                        onError={(e) => { e.currentTarget.style.display = "none"; }}
                      />
                    )}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent p-3">
                      <p className="line-clamp-2 text-sm font-bold text-white">{title}</p>
                    </div>
                    {delivered(f) && (
                      <span className="absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-[#1cc1a5] text-white shadow" title="Every market delivered">
                        <Check className="h-3.5 w-3.5" strokeWidth={3} />
                      </span>
                    )}
                    {stale && (
                      <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-white shadow" title={stale.gone ? "Gone from Drive" : "Some markets have left Drive"}>
                        <AlertTriangle className="h-3.5 w-3.5" strokeWidth={2.5} />
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-xs font-medium text-[#768994]">
                    {(f.markets || []).filter((m) => !m.unreadable).length} markets
                    {stale ? (stale.gone ? " · gone from Drive" : ` · ${stale.left} left`) : ""}
                  </p>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onSetPoster(f); }}
                  title="Set poster…"
                  className="absolute right-2 top-2 rounded-lg bg-black/45 p-1.5 text-white opacity-0 transition-opacity duration-200 hover:bg-black/70 group-hover:opacity-100"
                  style={delivered(f) || stale ? { top: "2.75rem" } : undefined}
                >
                  <ImageIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
