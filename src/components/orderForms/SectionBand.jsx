import { Trash2 } from "lucide-react";

// The band at the top of a Domestic or Launch view: the kind of work's own
// colours (as in the drawer), its big figure, a few facts, and what it's read from.
export default function SectionBand({ look, eyebrow, count, unit, title, facts = [], fileName, loadedAt, onRemove, children }) {
  return (
    <div
      className="view-in relative overflow-hidden rounded-3xl p-6 text-white shadow-lg sm:p-8"
      style={{ backgroundImage: `linear-gradient(120deg, ${look.from}, ${look.to})` }}
    >
      <div className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full bg-white/10 blur-2xl" />
      <div className="relative flex flex-wrap items-end justify-between gap-6">
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-white/75">{eyebrow}</p>
          <div className="mt-2 flex items-baseline gap-4">
            <span className="font-display text-7xl font-bold leading-none tracking-tighter">{count}</span>
            <div className="min-w-0">
              <p className="truncate font-display text-3xl font-bold leading-tight tracking-tight">{title}</p>
              <p className="text-sm font-semibold text-white/80">{unit}</p>
            </div>
          </div>
          {facts.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {facts.map((f) => (
                <span key={f} className="rounded-full bg-white/15 px-3 py-1 text-xs font-bold ring-1 ring-white/25">{f}</span>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-2 text-right">
          <p className="max-w-xs truncate text-[11px] font-medium text-white/70" title={fileName}>{fileName}</p>
          {loadedAt && <p className="text-[11px] font-medium text-white/60">Read {new Date(loadedAt).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>}
          {onRemove && (
            <button type="button" onClick={onRemove} className="press flex items-center gap-1.5 rounded-xl bg-white/15 px-3 py-1.5 text-xs font-bold ring-1 ring-white/25 transition-colors hover:bg-white/25">
              <Trash2 className="h-3.5 w-3.5" /> Remove
            </button>
          )}
        </div>
      </div>
      {children && <div className="relative mt-5">{children}</div>}
    </div>
  );
}
