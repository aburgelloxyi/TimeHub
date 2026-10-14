import React, { useEffect, useState } from "react";
import { ChevronRight, Clapperboard, CloudDownload, Loader2, Link2, Search } from "lucide-react";
import { MEDIUM_LABEL, MEDIUM_CLASS } from "./format";
import { connectGoogle, disconnectGoogle, googleConnected, onGoogleChange } from "../../lib/orderForms/googleApi";
import { CLIENTS, clientFor } from "../../lib/orderForms/driveTree";
import { listFilms, loadFilm } from "../../lib/orderForms/loadFilm";

// Loading a film straight from Google, as one question at a time filling the
// card: connect, which studio, which film. Picking the film loads it. What has
// been answered sits in the card's header as a trail that steps back. The films are
// whatever has an order sheet in the studio's market folders. The sign-in
// lasts for this tab; nothing here writes to Google.

export const GOOGLE_MESSAGES = {
  "not-configured": "Google sign-in isn't set up for this copy of TimeHub.",
  offline: "Google's sign-in couldn't be loaded. Check your connection.",
  denied: "Google didn't grant access. Use your xyi.com account and allow read access.",
  cancelled: "Sign-in was closed before it finished.",
  popup: "The Google sign-in window was blocked. Allow pop-ups for this site and retry.",
  "signed-out": "Your Google sign-in has lapsed. Connect again.",
  "not-found": "That client's Drive folder couldn't be found.",
  "no-access": "Your Google account can't open that client's Drive folder.",
  failed: "Google couldn't be reached. Try again in a moment.",
};
export const googleMessage = (err) => GOOGLE_MESSAGES[err?.reason] || "Something went wrong reading from Google.";

// XYi's own blue to teal, not the page's indigo: this card is where the
// studio's work comes in.
const GRADIENT = "from-[#12a0e1] to-[#1cc1a5]";
const buttonClass =
  `press flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r ${GRADIENT} text-white text-sm font-bold rounded-xl shadow-md shadow-[#12a0e1]/20 hover:shadow-lg hover:shadow-[#12a0e1]/30 transition-shadow disabled:opacity-40 disabled:shadow-none shrink-0`;
// What fills the card while a studio's folders are being listed, which takes
// a few seconds: the film grid in outline, filling in from the left, under a
// line that changes as it goes. The lines are what is actually happening,
// said lightly.
const LISTING_LINES = [
  "Opening every country's folder",
  "Counting order sheets",
  "Seeing who has filled theirs in",
  "Sorting Motion from Print",
  "Ignoring the folder called Copy of Copy of",
  "Nearly there",
];

function ListingFilms({ studio }) {
  const [line, setLine] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setLine((n) => Math.min(n + 1, LISTING_LINES.length - 1)), 1700);
    return () => clearInterval(timer);
  }, []);
  return (
    <div role="status" aria-live="polite">
      <p className="flex items-center gap-2.5 font-display text-2xl font-bold tracking-tight text-[#122027] mb-4">
        <Clapperboard className="w-6 h-6 text-[#12a0e1] animate-bounce" />
        <span key={line} className="animate-in fade-in slide-in-from-bottom-1 duration-300">{LISTING_LINES[line]}…</span>
        <span className="sr-only">Reading {studio}'s folders</span>
      </p>
      <div aria-hidden className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
        {Array.from({ length: 9 }, (_, i) => (
          <div
            key={i}
            className="flex items-center gap-2 px-4 py-3 rounded-2xl border border-[#dce4ec] animate-pulse"
            style={{ animationDelay: `${i * 120}ms` }}
          >
            <span className="h-3 rounded bg-slate-200" style={{ width: `${38 + ((i * 17) % 34)}%` }} />
            <span className="ml-auto h-3 w-10 rounded bg-slate-200" />
          </div>
        ))}
      </div>
    </div>
  );
}

// `onPartial` gets the markets read so far while a film loads, then null.
export default function GoogleSource({ onLoaded, onBusy, onPartial, signedInTick }) {
  const [connected, setConnected] = useState(googleConnected);
  const [clientId, setClientId] = useState(""); // nothing picked: the studio is the first question
  const [films, setFilms] = useState(null); // the picked client's, null until listed
  const [filmKey, setFilmKey] = useState("");
  const [query, setQuery] = useState("");
  const [working, setWorking] = useState("");
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState("");

  const client = clientFor(clientId);
  const film = films?.find((f) => f.key === filmKey) || null;

  const fail = (err) => {
    if (err?.reason === "signed-out") setConnected(false);
    setError(googleMessage(err));
  };

  const openClient = async (id) => {
    setError("");
    setClientId(id);
    setFilms(null);
    setFilmKey("");
    setQuery("");
    setWorking(`Reading ${clientFor(id).label}'s folders…`);
    try {
      const found = await listFilms(id);
      setFilms(found);
      if (!found.length) setError(`No order sheets were found in ${clientFor(id).label}'s market folders.`);
    } catch (err) {
      fail(err);
    } finally {
      setWorking("");
    }
  };

  const connect = async () => {
    setError("");
    setWorking("Waiting for Google…");
    try {
      await connectGoogle();
      setConnected(true);
      setWorking("");
    } catch (err) {
      setWorking("");
      fail(err);
    }
  };

  // The page's Refresh can sign in again by itself. When it has, don't keep
  // offering a Connect button that no longer applies.
  useEffect(() => {
    if (signedInTick && googleConnected()) setConnected(true);
  }, [signedInTick]);
  // The header's Google button can connect or disconnect while this is open.
  // Disconnecting there clears what was picked here, as Disconnect here does.
  useEffect(() => onGoogleChange(() => {
    const now = googleConnected();
    setConnected(now);
    if (!now) { setClientId(""); setFilms(null); setFilmKey(""); setError(""); }
  }), []);

  // The page holds off file drops while a film is loading.
  useEffect(() => { onBusy?.(!!progress); }, [progress, onBusy]);

  // Picking a film is the last question, so it loads.
  const load = async (picked) => {
    const filmKey = picked.key;
    setFilmKey(filmKey);
    const name = `${client.label} · ${picked.label}`;
    setError("");
    setProgress({ done: 0, total: 0 });
    const arrived = [];
    try {
      // The hour may have run out since the films were listed. Asked for here,
      // inside the click, so the browser lets Google's window open.
      if (!googleConnected()) await connectGoogle();
      const file = await loadFilm({
        clientId, filmKey,
        onProgress: (done, total) => setProgress({ done, total }),
        onMarket: (market) => {
          arrived.push(market);
          onPartial?.({ name, markets: [...arrived] });
        },
      });
      if (!file) setError("That film's order sheets are no longer in the market folders.");
      else await onLoaded(file);
    } catch (err) {
      fail(err);
    } finally {
      setProgress(null);
      onPartial?.(null);
    }
  };

  const busy = !!working || !!progress;
  const wanted = query.trim().toLowerCase();
  const shownFilms = (films || []).filter((f) => !wanted || f.label.toLowerCase().includes(wanted));
  const signOut = () => { disconnectGoogle(); setConnected(false); setClientId(""); setFilms(null); setFilmKey(""); setError(""); };
  const tileClass =
    "group relative overflow-hidden rounded-2xl border border-[#dce4ec] bg-white text-left transition-[border-color,box-shadow] hover:border-transparent hover:shadow-lg focus:outline-none focus-visible:ring-4 focus-visible:ring-[#12a0e1]/30 disabled:opacity-60";
  const sweepClass =
    `absolute inset-0 bg-gradient-to-r ${GRADIENT} origin-left scale-x-0 group-hover:scale-x-100 group-focus-visible:scale-x-100 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]`;

  return (
    <div className="bg-white border border-[#dce4ec] rounded-2xl shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4 border-b border-[#dce4ec]">
        <div className={`w-11 h-11 shrink-0 rounded-2xl bg-gradient-to-br ${GRADIENT} text-white flex items-center justify-center shadow-md shadow-[#12a0e1]/20`}>
          {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <CloudDownload className="w-5 h-5" />}
        </div>
        <div className="min-w-0 mr-auto">
          <p className="font-display text-xl font-bold tracking-tight leading-none text-[#122027]">Load a film from Google</p>
          {/* What has been answered, as a trail. The studio steps back to the first question. */}
          <p className="flex items-center gap-1.5 text-xs text-[#768994] mt-1.5 min-w-0">
            {!connected ? "Reads the markets' order sheets with your own Google access."
              : !client ? "Two questions: the studio, then the film."
              : (
                <>
                  <button onClick={() => { setClientId(""); setFilms(null); setFilmKey(""); setError(""); }} disabled={busy} className="font-bold text-[#122027] hover:text-[#12a0e1] underline underline-offset-2 disabled:no-underline">
                    {client.label}
                  </button>
                  {film && <><ChevronRight className="w-3 h-3 shrink-0" /><span className="font-bold text-[#122027] truncate">{film.label}</span></>}
                </>
              )}
          </p>
        </div>
        {connected && (
          <button onClick={signOut} disabled={busy} className="text-[11px] text-[#768994] hover:text-[#122027] underline underline-offset-2 disabled:opacity-50">
            Sign out of Google
          </button>
        )}
      </div>

      <div className="px-5 py-6">
        {!connected && (
          <div className="flex flex-col items-center text-center py-4">
            <p className="font-display text-2xl font-bold tracking-tight text-[#122027]">First, connect Google</p>
            <p className="text-sm text-[#768994] mt-1.5 mb-5">Read-only until you choose to edit a sheet.</p>
            <button onClick={connect} disabled={busy} className={buttonClass}>
              {working ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
              {working || "Connect Google"}
            </button>
          </div>
        )}

        {connected && !client && (
          <>
            <p className="font-display text-2xl font-bold tracking-tight text-[#122027] mb-4">Which studio is it for?</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {CLIENTS.map((c) => (
                <button key={c.id} onClick={() => openClient(c.id)} disabled={busy} className={`${tileClass} px-6 py-7`}>
                  <span aria-hidden className={sweepClass} />
                  <span className="relative flex items-center justify-between gap-3">
                    <span className="font-display text-3xl font-bold tracking-tight text-[#122027] group-hover:text-white group-focus-visible:text-white transition-colors duration-300">{c.label}</span>
                    <ChevronRight className="w-6 h-6 text-[#768994] group-hover:text-white group-hover:translate-x-1 transition-[color,transform] duration-300" />
                  </span>
                </button>
              ))}
            </div>
          </>
        )}

        {connected && client && !progress && (
          <>
            <div className="flex flex-wrap items-center gap-3 mb-4">
              {!working && (
                <p className="font-display text-2xl font-bold tracking-tight text-[#122027] mr-auto">
                  {films?.length ? "Which film?" : films ? `No order sheets found for ${client.label}` : `${client.label}'s folders couldn't be read`}
                </p>
              )}
              {films?.length > 8 && (
                <label className="flex items-center gap-2 px-3 py-2 rounded-xl border border-[#dce4ec] bg-white focus-within:border-[#12a0e1] w-64">
                  <Search className="w-4 h-4 text-[#768994] shrink-0" />
                  <input
                    autoFocus
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={`Search ${films.length} films`}
                    className="flex-1 min-w-0 text-sm text-[#122027] bg-transparent outline-none placeholder:text-[#9aabb5]"
                  />
                </label>
              )}
            </div>
            {working && <ListingFilms studio={client.label} />}
            {!working && !films && (
              <button onClick={() => openClient(clientId)} className="text-sm font-bold text-[#122027] underline underline-offset-2 hover:text-[#12a0e1]">Try again</button>
            )}
            {films?.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2 max-h-[22rem] overflow-y-auto scrollbar-thin -mr-2 pr-2">
                {shownFilms.map((f) => (
                  <button key={f.key} onClick={() => load(f)} disabled={busy} className={`${tileClass} px-4 py-3`}>
                    <span aria-hidden className={sweepClass} />
                    <span className="relative flex items-center gap-2 min-w-0">
                      <span className="flex-1 min-w-0 truncate text-sm font-bold text-[#122027] group-hover:text-white group-focus-visible:text-white transition-colors duration-300">{f.title}</span>
                      <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider shrink-0 ${MEDIUM_CLASS[f.medium]}`}>{MEDIUM_LABEL[f.medium]}</span>
                      <span className="text-[11px] text-[#768994] group-hover:text-white/80 transition-colors duration-300 shrink-0 tabular-nums">
                        {f.markets.length} {f.markets.length === 1 ? "market" : "markets"}
                      </span>
                    </span>
                  </button>
                ))}
                {shownFilms.length === 0 && <p className="text-sm text-[#768994] py-2">No film matches that.</p>}
              </div>
            )}
          </>
        )}

        {progress && (
          <p className="font-display text-2xl font-bold tracking-tight text-[#122027]">
            Reading {progress.done} of {progress.total || "…"} markets
          </p>
        )}

        {error && <p role="alert" className="mt-4 text-sm font-medium text-rose-600">{error}</p>}
      </div>

      {progress && progress.total > 0 && (
        <div className="h-1.5 bg-slate-100">
          <div className={`h-full bg-gradient-to-r ${GRADIENT} transition-[width] duration-300`} style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }} />
        </div>
      )}
    </div>
  );
}
