// A campaign's motion amends, read from the comments on its Wrike jobs and
// laid out by creative. Opened from the campaign window's Amends button.
// What counts as an amend, and why some comments are left out, is in
// lib/amends/amends.js.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, Loader2, MessageSquareWarning, RefreshCw, Search, X } from "lucide-react";
import { KINDS, THEMES } from "../../lib/amends/amends";
import { fetchAmends, readStoredAmends, storedAmendsAreFresh } from "../../lib/amends/fetchAmends";
import { reportError } from "../../lib/monitoring";

const KIND_TEXT = {
  review: "text-amber-600",
  content: "text-sky-600",
  pdf: "text-violet-600",
  fix: "text-emerald-600",
  question: "text-pink-600",
};
const THEME_HUE = {
  "CTA / date": 40,
  "Title treatment": 275,
  "File name / legend": 200,
  "Size / spec": 0,
  "Layout / position": 170,
  "Animation / timing": 320,
  "Artwork / colour": 95,
};
const THEME_SHORT = Object.fromEntries(THEMES.map((t) => [t[0], t[1]]));
// Notes shown before anybody touches a filter: what was asked for, not the replies.
const DEFAULT_KINDS = { review: true, content: true, pdf: true, fix: false, question: false };

const hueOf = (s) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 360;
};
const tint = (s) => `hsl(${hueOf(s)} 65% 52%)`;
const initials = (name) => name.split(/\s+/).map((w) => w.charAt(0)).join("").slice(0, 2).toUpperCase();
const day = (iso) => {
  const d = new Date(iso);
  return isNaN(d) ? "" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};
// The codes in filenames are the studio's, mostly ISO; these are the ones that aren't.
const FLAG_CODE = { UK: "gb", EN: "gb" };
const statusTone = (s) =>
  /deliver|complete|approved/i.test(s) ? "text-emerald-600 border-emerald-200"
    : /amend|revis/i.test(s) ? "text-amber-600 border-amber-200"
      : /cancel/i.test(s) ? "text-rose-600 border-rose-200"
        : "text-sky-600 border-sky-200";

const LABEL = "text-[10px] font-black uppercase tracking-widest text-[#768994] w-20 shrink-0 pt-2";
const chipClass = (on) =>
  `inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-colors focus-visible:ring-2 focus-visible:ring-[#c2410d]/40 focus-visible:outline-none ${
    on ? "bg-[#c2410d] text-white border-[#c2410d]" : "bg-white text-[#122027] border-[#dce4ec] hover:bg-slate-50"
  }`;

function Flag({ market }) {
  const code = FLAG_CODE[market] || (/^[A-Z]{2}$/.test(market) ? market.toLowerCase() : "");
  if (!code) return null;
  return (
    <img
      src={`https://flagcdn.com/w40/${code}.png`}
      alt=""
      loading="lazy"
      className="w-4 h-[11px] rounded-[2px] object-cover ring-1 ring-black/10"
      onError={(e) => { e.currentTarget.style.display = "none"; }}
    />
  );
}

function Avatar({ name }) {
  return (
    <span
      className="inline-flex items-center justify-center w-[18px] h-[18px] rounded-full text-[9px] font-black text-white shrink-0"
      style={{ background: tint(name) }}
    >
      {initials(name)}
    </span>
  );
}

function Chip({ on, onClick, count, children }) {
  return (
    <button type="button" onClick={onClick} className={chipClass(on)}>
      {children}
      {count != null && <span className={`tabular-nums font-semibold ${on ? "text-white/80" : "text-[#768994]"}`}>{count}</span>}
    </button>
  );
}

export default function CampaignAmends({ campaign, cached = [], codes = [], onClose }) {
  const [stored, setStored] = useState(() => readStoredAmends(campaign.id));
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState("");
  const [creative, setCreative] = useState("");
  const [kinds, setKinds] = useState(DEFAULT_KINDS);
  const [showPre, setShowPre] = useState(false);
  const [who, setWho] = useState("");
  const [market, setMarket] = useState("");
  const [theme, setTheme] = useState("");
  const [query, setQuery] = useState("");
  const abortRef = useRef(null);
  // The cache and codes only seed the job search; a sync landing mid-read must not restart it.
  const seedRef = useRef({ cached, codes });
  seedRef.current = { cached, codes };

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setError("");
    setProgress(null);
    try {
      const fresh = await fetchAmends({
        campaignId: campaign.id,
        title: campaign.title,
        cached: seedRef.current.cached,
        codes: seedRef.current.codes,
        signal: ctrl.signal,
        onProgress: (done, total) => setProgress({ done, total }),
      });
      if (!ctrl.signal.aborted) setStored(fresh);
    } catch (err) {
      if (ctrl.signal.aborted) return;
      reportError(err, { where: "CampaignAmends.load", campaign: campaign.title });
      setError("Couldn't read this campaign's comments from Wrike. Check Wrike is connected, then try again.");
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  }, [campaign.id, campaign.title]);

  useEffect(() => {
    if (!storedAmendsAreFresh(readStoredAmends(campaign.id))) load();
    return () => abortRef.current?.abort();
  }, [campaign.id, load]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const notes = stored?.result?.notes || [];
  const words = useMemo(() => query.toLowerCase().split(/\s+/).filter(Boolean), [query]);

  // Each filter's counts are taken with that filter left out, so a chip says
  // what pressing it would show.
  const pass = useCallback(
    (n, skip) =>
      (skip === "pre" || showPre || !n.pre) &&
      (skip === "creative" || !creative || n.creative === creative) &&
      (skip === "kind" || kinds[n.kind]) &&
      (skip === "who" || !who || n.who === who) &&
      (!market || n.market === market) &&
      (skip === "theme" || !theme || n.themes.indexOf(theme) !== -1) &&
      (!words.length || words.every((w) => `${n.text} ${n.name} ${n.who} ${n.job}`.toLowerCase().indexOf(w) !== -1)),
    [showPre, creative, kinds, who, market, theme, words]
  );
  const countBy = useCallback(
    (skip, keyOf) => {
      const out = {};
      notes.filter((n) => pass(n, skip)).forEach((n) => [].concat(keyOf(n)).forEach((k) => { out[k] = (out[k] || 0) + 1; }));
      return out;
    },
    [notes, pass]
  );

  const creativeCount = useMemo(() => countBy("creative", (n) => n.creative), [countBy]);
  const kindCount = useMemo(() => countBy("kind", (n) => n.kind), [countBy]);
  const whoCount = useMemo(() => countBy("who", (n) => n.who), [countBy]);
  const themeCount = useMemo(() => countBy("theme", (n) => n.themes), [countBy]);
  const preCount = useMemo(() => notes.filter((n) => n.pre && pass(n, "pre")).length, [notes, pass]);
  const markets = useMemo(() => [...new Set(notes.map((n) => n.market).filter(Boolean))].sort(), [notes]);

  const groups = useMemo(() => {
    const byCreative = {};
    notes.filter((n) => pass(n)).forEach((n) => {
      const g = (byCreative[n.creative] = byCreative[n.creative] || {});
      const key = `${n.jobId}\n${n.name}`;
      (g[key] = g[key] || []).push(n);
    });
    return Object.keys(byCreative)
      .map((name) => {
        const deliverables = Object.values(byCreative[name])
          .map((list) => list.slice().sort((a, b) => String(a.at).localeCompare(String(b.at))))
          .sort((a, b) => b.length - a.length || a[0].name.localeCompare(b[0].name));
        return { name, deliverables, count: deliverables.reduce((sum, d) => sum + d.length, 0) };
      })
      .sort((a, b) => b.count - a.count);
  }, [notes, pass]);
  const shown = groups.reduce((sum, g) => sum + g.count, 0);
  const shownDeliverables = groups.reduce((sum, g) => sum + g.deliverables.length, 0);

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-8 bg-[#122027]/90 backdrop-blur-md animate-in fade-in duration-200"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-[2rem] w-full max-w-[92vw] xl:max-w-7xl h-[90vh] shadow-2xl flex flex-col border border-[#dce4ec] overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="px-6 sm:px-8 py-5 border-b border-[#dce4ec] bg-slate-50 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-4 min-w-0">
            <div className="hidden sm:flex p-3 rounded-2xl bg-[#c2410d] text-white shadow-md">
              <MessageSquareWarning className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <h2 className="text-2xl font-black text-[#122027] tracking-tight leading-none truncate">{campaign.title}</h2>
              <p className="text-[10px] font-bold text-[#768994] uppercase tracking-widest mt-1.5">
                Motion amends
                {stored && ` · read from Wrike ${day(stored.at)} · ${stored.result.jobs} jobs`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white hover:bg-slate-100 border border-[#dce4ec] text-xs font-black uppercase tracking-widest text-[#122027] transition-colors disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-[#c2410d]/40 focus-visible:outline-none"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Refresh
            </button>
            <button
              type="button"
              onClick={onClose}
              title="Close"
              className="p-2.5 hover:bg-slate-200 text-[#768994] hover:text-rose-600 rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-[#c2410d]/40 focus-visible:outline-none"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 sm:px-8 py-6">
          {error && (
            <div className="mb-5 px-4 py-3 rounded-xl border border-rose-200 bg-rose-50 text-sm font-semibold text-rose-700">{error}</div>
          )}

          {loading && !notes.length && (
            <div className="h-full flex flex-col items-center justify-center gap-3 text-[#768994]">
              <Loader2 className="w-7 h-7 animate-spin text-[#c2410d]" />
              <p className="text-sm font-bold text-[#122027]">
                {progress ? `Reading comments: ${progress.done} of ${progress.total} jobs` : "Finding this campaign's motion jobs…"}
              </p>
              <p className="text-xs">One Wrike call per job, so a big campaign takes about a minute.</p>
            </div>
          )}

          {!loading && !error && stored && !notes.length && (
            <div className="h-full flex flex-col items-center justify-center gap-2 text-center">
              <p className="text-sm font-bold text-[#122027]">
                {stored.result.jobs ? "No amends were written on this campaign's motion jobs." : "No motion jobs found for this campaign in Wrike."}
              </p>
              {!stored.result.jobs && (
                <p className="text-xs text-[#768994] max-w-md">
                  Jobs are found by the film they are filed under and a title containing “Motion”.
                </p>
              )}
            </div>
          )}

          {notes.length > 0 && (
            <>
              <label className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#dce4ec] bg-slate-50 focus-within:border-[#c2410d] focus-within:ring-2 focus-within:ring-[#c2410d]/20 transition-[border-color,box-shadow]">
                <Search className="w-4 h-4 text-[#768994]" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search notes, sites, sizes, people…"
                  spellCheck={false}
                  className="flex-1 bg-transparent outline-none text-sm text-[#122027] placeholder:text-[#768994]"
                />
              </label>

              <div className="mt-4 space-y-2">
                <div className="flex gap-3">
                  <span className={LABEL}>Creative</span>
                  <div className="flex flex-wrap gap-1.5">
                    <Chip on={!creative} onClick={() => setCreative("")} count={Object.values(creativeCount).reduce((a, b) => a + b, 0)}>Every creative</Chip>
                    {Object.keys(creativeCount).sort((a, b) => creativeCount[b] - creativeCount[a]).map((c) => (
                      <Chip key={c} on={creative === c} onClick={() => setCreative(c)} count={creativeCount[c]}>
                        <span className="w-2 h-2 rounded-full" style={{ background: tint(c) }} />
                        {c}
                      </Chip>
                    ))}
                  </div>
                </div>
                <div className="flex gap-3">
                  <span className={LABEL}>Kind</span>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.keys(KINDS).map((k) => (
                      <Chip key={k} on={kinds[k]} onClick={() => setKinds((prev) => ({ ...prev, [k]: !prev[k] }))} count={kindCount[k] || 0}>{KINDS[k]}</Chip>
                    ))}
                    <Chip on={showPre} onClick={() => setShowPre((v) => !v)} count={preCount}>Before Motion started</Chip>
                  </div>
                </div>
                <div className="flex gap-3">
                  <span className={LABEL}>Person</span>
                  <div className="flex flex-wrap gap-1.5">
                    <Chip on={!who} onClick={() => setWho("")}>Everyone</Chip>
                    {Object.keys(whoCount).sort((a, b) => whoCount[b] - whoCount[a]).map((w) => (
                      <Chip key={w} on={who === w} onClick={() => setWho(w)} count={whoCount[w]}>
                        <Avatar name={w} />
                        {w}
                      </Chip>
                    ))}
                  </div>
                </div>
                <div className="flex gap-3 items-center">
                  <span className={`${LABEL} !pt-0`}>Market</span>
                  <select
                    value={market}
                    onChange={(e) => setMarket(e.target.value)}
                    className="bg-white border border-[#dce4ec] rounded-xl px-3 py-1.5 text-xs font-bold text-[#122027] outline-none focus:border-[#c2410d]"
                  >
                    <option value="">Every market</option>
                    {markets.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                {THEMES.map(([name]) => {
                  const on = theme === name;
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => setTheme(on ? "" : name)}
                      className={`text-left px-3 py-2.5 rounded-2xl border transition-colors focus-visible:ring-2 focus-visible:ring-[#c2410d]/40 focus-visible:outline-none ${
                        on ? "border-[#c2410d] bg-slate-50" : "border-[#dce4ec] bg-white hover:bg-slate-50"
                      }`}
                    >
                      <div className="text-xl font-black tabular-nums leading-none" style={{ color: `hsl(${THEME_HUE[name]} 70% 48%)` }}>{themeCount[name] || 0}</div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-[#768994] mt-1.5">{name}</div>
                    </button>
                  );
                })}
              </div>

              <p className="mt-5 text-xs font-semibold text-[#768994]">
                {shown} {shown === 1 ? "note" : "notes"} on {shownDeliverables} {shownDeliverables === 1 ? "deliverable" : "deliverables"}
                {stored.result.handoffs > 0 && ` · ${stored.result.handoffs} hand-off comments with nothing said are left out`}
              </p>

              {!shown && <p className="py-16 text-center text-sm font-bold text-[#768994]">Nothing matches.</p>}

              {groups.map((group) => (
                <section key={group.name} className="mt-7">
                  <h3 className="flex items-center gap-2.5 pb-2 border-b border-[#dce4ec]">
                    <span className="w-3 h-3 rounded-[4px]" style={{ background: tint(group.name) }} />
                    <span className="text-lg font-black text-[#122027] tracking-tight">{group.name}</span>
                    <span className="text-xs font-semibold text-[#768994]">
                      {group.deliverables.length} {group.deliverables.length === 1 ? "deliverable" : "deliverables"}
                    </span>
                  </h3>
                  <div className="mt-3 space-y-2.5">
                    {group.deliverables.map((list) => {
                      const first = list[0];
                      return (
                        <article key={`${first.jobId}:${first.name}`} className="rounded-2xl border border-[#dce4ec] bg-white px-4 py-3.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-sm font-black mr-1" style={{ color: tint(group.name) }}>{first.site || first.medium || "Deliverable"}</span>
                            {first.size && <span className="px-2 py-0.5 rounded-md border border-[#dce4ec] text-[11px] font-bold text-[#122027] tabular-nums">{first.size}</span>}
                            {first.length && <span className="px-2 py-0.5 rounded-md border border-[#dce4ec] text-[11px] font-bold text-[#122027]">{first.length}</span>}
                            {first.market && (
                              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border border-[#dce4ec] text-[11px] font-bold text-[#122027]">
                                <Flag market={first.market} />
                                {first.market}
                              </span>
                            )}
                            <span className="px-2 py-0.5 rounded-md border border-[#dce4ec] text-[11px] font-semibold text-[#768994]">{first.job}</span>
                            {first.status && <span className={`px-2 py-0.5 rounded-md border text-[11px] font-bold ${statusTone(first.status)}`}>{first.status}</span>}
                            {first.link && (
                              <a
                                href={first.link}
                                target="_blank"
                                rel="noreferrer"
                                title="Open the job in Wrike"
                                className="ml-auto p-1 rounded-md text-[#768994] hover:text-[#c2410d] hover:bg-slate-100 transition-colors"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            )}
                          </div>
                          <p className="mt-1 text-[11px] font-mono text-[#768994] break-all">{first.name}</p>
                          {list.map((n) => (
                            <div key={n.id} className="mt-3 pt-3 border-t border-[#dce4ec]">
                              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-[#768994]">
                                <span className={`font-black uppercase tracking-wider ${KIND_TEXT[n.kind]}`}>{KINDS[n.kind]}</span>
                                <span className="inline-flex items-center gap-1.5 font-bold text-[#122027]">
                                  <Avatar name={n.who} />
                                  {n.who}
                                  {n.motion && <span className="font-semibold text-[#768994]">· Motion</span>}
                                </span>
                                <span>{day(n.at)}</span>
                                {n.version > 0 && <span>on V{String(n.version).padStart(2, "0")}</span>}
                              </div>
                              <p className="mt-1 text-sm text-[#122027] whitespace-pre-wrap break-words">{n.text}</p>
                              {n.themes.length > 0 && (
                                <div className="mt-1.5 flex flex-wrap gap-1">
                                  {n.themes.map((t) => (
                                    <span
                                      key={t}
                                      className="px-1.5 py-0.5 rounded-md text-[10px] font-bold"
                                      style={{ color: `hsl(${THEME_HUE[t]} 70% 45%)`, background: `hsl(${THEME_HUE[t]} 70% 50% / 0.12)` }}
                                    >
                                      {THEME_SHORT[t]}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </article>
                      );
                    })}
                  </div>
                </section>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
