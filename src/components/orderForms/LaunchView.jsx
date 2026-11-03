import { useMemo, useState } from "react";
import { AlertTriangle, History, Search } from "lucide-react";
import { SECTIONS } from "../../lib/orderForms/sections";
import SectionBand from "./SectionBand";
import MarketFlag from "./MarketFlag";

// A launch artwork as each market asked for it: the formats it needs, its own
// versions of the artwork's lines beside the English they translate, whether
// they're literal, and its socials. A market that answered more than once shows
// its newest answer, and says what changed.

const LOOK = SECTIONS.find((s) => s.id === "launches");

// Addresses in a market's socials become links; the rest stays text.
function Socials({ text }) {
  const parts = String(text).split(/(https?:\/\/\S+)/g);
  return (
    <p className="text-xs leading-relaxed text-[#46606b]">
      {parts.map((part, i) =>
        /^https?:\/\//.test(part)
          ? <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="font-semibold text-[#0f766e] underline decoration-[#14b8a6]/40 underline-offset-2 hover:decoration-[#14b8a6]">{part.replace(/^https?:\/\/(www\.)?/, "")}</a>
          : <span key={i}>{part}</span>)}
    </p>
  );
}

function Market({ market, index }) {
  const lines = market.lines.filter((l) => l.text);
  return (
    <section className="list-row-in rounded-2xl border border-[#dce4ec] bg-white p-5 shadow-sm" style={{ "--i": Math.min(index, 8) }}>
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <MarketFlag name={market.market} className="h-[18px] w-6" />
          <p className="truncate font-display text-xl font-bold tracking-tight text-[#122027]">{market.market}</p>
        </div>
        {market.literal && (
          <span className="max-w-[45%] shrink-0 truncate rounded-full bg-[#14b8a6]/10 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest text-[#0f766e]" title={market.literal}>
            {/^literal$/i.test(market.literal) ? "Literal" : /^ov$/i.test(market.literal) ? "OV" : "Not literal"}
          </span>
        )}
      </header>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {market.formats.map((f) => (
          <span key={f} className="rounded-full bg-gradient-to-r from-[#14b8a6] to-[#22c55e] px-2.5 py-0.5 text-[11px] font-bold text-white shadow-sm">{f}</span>
        ))}
      </div>

      {lines.length > 0 && (
        <div className="mt-4 space-y-3">
          {lines.map((l) => (
            <div key={l.asked}>
              <p className="truncate text-[10px] font-black uppercase tracking-widest text-[#768994]" title={l.asked}>{l.asked}</p>
              <p className="mt-0.5 whitespace-pre-line font-display text-lg font-bold leading-snug tracking-tight text-[#122027]">{l.text}</p>
            </div>
          ))}
        </div>
      )}

      {market.literal && !/^(literal|ov)$/i.test(market.literal) && (
        <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs italic leading-relaxed text-[#46606b]">{market.literal}</p>
      )}

      {market.socials && !/^(no|n\/?a)$/i.test(market.socials) && (
        <div className="mt-3 border-t border-[#eef2f6] pt-3">
          <Socials text={market.socials} />
        </div>
      )}

      {market.replaced > 0 && (
        <p className="mt-3 flex items-start gap-1.5 rounded-xl bg-amber-50 px-3 py-2 text-[11px] font-semibold leading-snug text-amber-800">
          <History className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>
            Answered {market.replaced + 1} times, the newest shown.{" "}
            {market.changed.length ? `It changed ${market.changed.map((c) => (c === "formats" || c === "literal" ? c : `“${c.toLowerCase()}”`)).join(", ")}.` : "Nothing changed."}
          </span>
        </p>
      )}
    </section>
  );
}

export default function LaunchView({ file, film, onRemove }) {
  const { artwork, markets = [], pieces = 0, replies = 0, import: checked } = file.launch || {};
  const [query, setQuery] = useState("");
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? markets.filter((m) => m.market.toLowerCase().includes(q)) : markets;
  }, [markets, query]);
  // How many markets asked for each format, most asked first.
  const tally = useMemo(() => {
    const by = new Map();
    for (const m of markets) for (const f of m.formats) by.set(f, (by.get(f) || 0) + 1);
    return [...by].sort((a, b) => b[1] - a[1]);
  }, [markets]);
  const drift = checked && (checked.offCountry || checked.offFormat);

  return (
    <div className="space-y-6">
      <SectionBand
        look={LOOK}
        eyebrow={`${film} · Launch`}
        count={markets.length}
        title={artwork || "Launch"}
        unit={`${markets.length === 1 ? "market" : "markets"} · ${pieces} ${pieces === 1 ? "piece" : "pieces"} · ${replies} ${replies === 1 ? "reply" : "replies"}`}
        facts={[file.filmCode].filter(Boolean)}
        fileName={file.name}
        loadedAt={file.loadedAt}
        onRemove={onRemove}
      >
        <div className="flex flex-wrap gap-2">
          {tally.map(([f, n]) => (
            <span key={f} className="flex items-center gap-2 rounded-full bg-black/15 py-1 pl-3 pr-1 text-xs font-bold ring-1 ring-white/20">
              {f}
              <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-black text-[#0f766e]">{n}</span>
            </span>
          ))}
        </div>
      </SectionBand>

      {drift ? (
        <div role="status" className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-bold">The Wrike_Import tab doesn't line up with its task names.</p>
            <p className="mt-1">
              Of its {checked.tasks} tasks, {checked.offCountry} have a Country that isn't the market in their name
              {checked.offFormat ? `, and ${checked.offFormat} a Format that isn't the one their name says` : ""}. Check it before importing it into Wrike.
            </p>
            {checked.examples.length > 0 && (
              <ul className="mt-2 space-y-1 font-mono text-[11px]">
                {checked.examples.map((t) => <li key={t.title} className="truncate">{t.title} → {t.country}{t.format ? `, ${t.format}` : ""}</li>)}
              </ul>
            )}
          </div>
        </div>
      ) : null}

      {markets.length > 6 && (
        <label className="flex max-w-sm items-center gap-2 rounded-xl border border-[#dce4ec] bg-white px-3 py-2 shadow-sm focus-within:border-[#14b8a6]">
          <Search className="h-4 w-4 text-[#768994]" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a market" className="min-w-0 flex-1 bg-transparent text-sm text-[#122027] outline-none placeholder:text-[#9aabb4]" />
        </label>
      )}

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {shown.map((m, i) => <Market key={m.market} market={m} index={i} />)}
      </div>
      {shown.length === 0 && <p className="px-1 text-sm text-[#768994]">No market matches “{query}”.</p>}
    </div>
  );
}
