import { useMemo, useState } from "react";
import { AlertTriangle, Check, ChevronLeft, Image as ImageIcon, Layers } from "lucide-react";
import { CLIENTS } from "../../lib/orderForms/driveTree";
import { posterKey } from "../../lib/filmPosters";

// Client Orders' front door: the studios as cards, then one studio's films as
// posters, instead of the two pickers. Choosing a film hands back to the page,
// which opens it exactly as the switcher would. Nothing here writes except a
// poster's URL, and that only when someone asks for it.

const STUDIO_LOOK = {
  universal: { gradient: "from-[#0b2c6b] via-[#123f95] to-[#0d2a60]", tint: "from-[#123f95]/90 to-[#0b2c6b]/90" },
  paramount: { gradient: "from-[#0b1f3a] via-[#123a68] to-[#0a1a30]", tint: "from-[#123a68]/90 to-[#0b1f3a]/90" },
  dropped: { gradient: "from-[#2b3440] via-[#3a4757] to-[#222a35]", tint: "from-[#3a4757]/90 to-[#222a35]/90" },
};

const initials = (title) => {
  const words = String(title || "").split(/[^A-Za-z0-9]+/).filter(Boolean);
  return (words.slice(0, 2).map((w) => w[0]).join("") || "?").toUpperCase();
};

const studioOf = (file) => file.source?.clientId || "dropped";
const studioLabel = (id) => CLIENTS.find((c) => c.id === id)?.label || "Dropped files";

export default function StudioGrid({ files, posters, titleOf, staleness, delivered, onOpen, onSetPoster }) {
  const [studio, setStudio] = useState(null);

  // The studios with something in them, in the clients' own order, dropped workbooks last.
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
    const rank = (id) => (id === "dropped" ? CLIENTS.length : CLIENTS.findIndex((c) => c.id === id));
    return [...by.values()].sort((a, b) => rank(a.id) - rank(b.id));
  }, [files, delivered]);

  const current = studios.find((s) => s.id === studio) || null;

  if (!current) {
    return (
      <div className="space-y-4">
        <div className="flex items-baseline justify-between px-1">
          <h2 className="font-display text-lg font-bold text-[#122027]">Studios</h2>
          <p className="text-xs font-medium text-[#768994]">Choose a studio, then a film</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {studios.map((s) => {
            const look = STUDIO_LOOK[s.id] || STUDIO_LOOK.dropped;
            return (
              <button
                key={s.id}
                onClick={() => setStudio(s.id)}
                className={`group relative overflow-hidden rounded-2xl bg-gradient-to-br ${look.gradient} p-6 text-left text-white shadow-sm transition-transform hover:-translate-y-0.5`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-display text-2xl font-bold tracking-tight">{studioLabel(s.id)}</p>
                    <p className="mt-1 text-sm text-white/70">
                      {s.films.length} {s.films.length === 1 ? "film" : "films"} · {s.markets} {s.markets === 1 ? "market" : "markets"}
                    </p>
                  </div>
                  <Layers className="h-6 w-6 shrink-0 text-white/50" strokeWidth={1.5} />
                </div>
                <div className="mt-5 flex items-center justify-between text-xs font-bold">
                  <span className="text-white/70">{s.delivered} delivered</span>
                  <span className="rounded-lg bg-white/10 px-2.5 py-1 ring-1 ring-white/20 transition-colors group-hover:bg-white/20">Open</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 px-1">
        <button onClick={() => setStudio(null)} className="flex items-center gap-1 text-xs font-bold text-[#768994] hover:text-[#122027]">
          <ChevronLeft className="h-4 w-4" /> Studios
        </button>
        <h2 className="font-display text-lg font-bold text-[#122027]">{studioLabel(current.id)}</h2>
        <span className="text-xs font-medium text-[#768994]">
          {current.films.length} {current.films.length === 1 ? "film" : "films"}
        </span>
      </div>

      <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
        {current.films.map((f) => {
          const title = titleOf(f);
          const look = STUDIO_LOOK[current.id] || STUDIO_LOOK.dropped;
          const poster = posters[posterKey(current.id, title)];
          const stale = staleness(f);
          return (
            <div key={f.id} className="group relative">
              <button onClick={() => onOpen(f.id)} className="block w-full text-left">
                <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-slate-200 shadow-sm ring-1 ring-black/5 transition-transform group-hover:-translate-y-0.5">
                  {/* The tinted card underneath is the fallback, so a pasted link that dies leaves a card rather than a hole. */}
                  <div className={`absolute inset-0 flex items-center justify-center bg-gradient-to-br ${look.tint}`}>
                    <span className="font-display text-3xl font-bold text-white/80">{initials(title)}</span>
                  </div>
                  {poster && (
                    <img src={poster} alt="" className="absolute inset-0 h-full w-full object-cover" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                  )}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3">
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
                className="absolute right-2 top-2 rounded-lg bg-black/50 p-1.5 text-white opacity-0 transition-opacity hover:bg-black/70 group-hover:opacity-100"
                style={delivered(f) || stale ? { top: "2.75rem" } : undefined}
              >
                <ImageIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
