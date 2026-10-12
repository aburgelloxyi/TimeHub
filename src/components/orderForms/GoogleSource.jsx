import React, { useEffect, useState } from "react";
import { CloudDownload, Film, Loader2, Link2 } from "lucide-react";
import SearchableSelect from "../shared/SearchableSelect";
import { connectGoogle, disconnectGoogle, googleConnected } from "../../lib/orderForms/googleApi";
import { CLIENTS, clientFor } from "../../lib/orderForms/driveTree";
import { listFilms, loadFilm } from "../../lib/orderForms/loadFilm";

// Loading a film straight from Google: connect, pick a client, pick a film.
// The films are whatever has an order sheet in the client's market folders.
// The sign-in lasts for this tab; nothing is written to Google.

const CLIENT_KEY = "xyi_orders_client";

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

const buttonClass =
  "press flex items-center gap-2 px-4 py-2 bg-[#122027] hover:bg-[#25373c] text-white text-sm font-bold rounded-xl transition-colors disabled:opacity-50 shrink-0";

// `onPartial` gets the markets read so far while a film loads, then null.
export default function GoogleSource({ onLoaded, onBusy, onPartial, signedInTick }) {
  const [connected, setConnected] = useState(googleConnected);
  const [clientId, setClientId] = useState(() => clientFor(localStorage.getItem(CLIENT_KEY))?.id || CLIENTS[0].id);
  const [films, setFilms] = useState(null); // the picked client's, null until listed
  const [filmKey, setFilmKey] = useState("");
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
    localStorage.setItem(CLIENT_KEY, id);
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
      await openClient(clientId);
    } catch (err) {
      setWorking("");
      fail(err);
    }
  };

  // Back after a reload, still signed in: list the films again without a click.
  useEffect(() => {
    if (googleConnected()) openClient(clientId);
    // Once, on arrival. openClient is recreated every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The page's Refresh can sign in again by itself. When it has, show the
  // films here too instead of a Connect button that no longer applies.
  useEffect(() => {
    if (!signedInTick || !googleConnected()) return;
    setConnected(true);
    if (!films) openClient(clientId);
    // Runs when the page reports a sign-in, not when the films change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedInTick]);

  // The page holds off file drops while a film is loading.
  useEffect(() => { onBusy?.(!!progress); }, [progress, onBusy]);

  const load = async () => {
    const name = `${client.label} · ${film.label}`;
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

  return (
    <div className="bg-white border border-[#dce4ec] rounded-2xl shadow-sm px-5 py-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2.5 mr-auto min-w-0">
          <CloudDownload className="w-5 h-5 text-[#12a0e1] shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-bold text-[#122027]">Load a film from Google</p>
            <p className="text-xs text-[#768994] truncate">
              {!connected ? "Reads every market's order sheet with your own Google access. Read-only."
                : working ? working
                : film ? `${film.markets.length} ${film.markets.length === 1 ? "market has" : "markets have"} a sheet for this film`
                : films ? `${films.length} ${films.length === 1 ? "film" : "films"} with order sheets in ${client.label}'s market folders`
                : "Pick a client to list its films."}
            </p>
          </div>
        </div>

        {!connected && (
          <button onClick={connect} disabled={busy} className={buttonClass}>
            {working ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
            {working || "Connect Google"}
          </button>
        )}

        {connected && (
          <div className="flex flex-wrap items-end gap-2">
            <div className="text-[11px] font-bold text-[#768994]">
              <span className="block mb-1">Client</span>
              <div role="group" aria-label="Client" className="flex p-1 rounded-xl border border-[#dce4ec] bg-slate-50">
                {CLIENTS.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => c.id !== clientId && openClient(c.id)}
                    disabled={busy}
                    aria-pressed={c.id === clientId}
                    className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-colors disabled:opacity-60 ${
                      c.id === clientId ? "bg-[#122027] text-white" : "text-[#122027] hover:bg-white"
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="text-[11px] font-bold text-[#768994] w-72">
              <span className="block mb-1">Film</span>
              {/* Typing filters the list; anything that isn't one of the films
                  clears the choice rather than loading a film that doesn't exist. */}
              <SearchableSelect
                options={(films || []).map((f) => f.label)}
                value={film?.label || ""}
                onChange={(picked) => setFilmKey(films?.find((f) => f.label === picked)?.key || "")}
                placeholder={working ? "Listing films…" : "Pick a film"}
                showAllOnOpen
                icon={Film}
                disabled={busy || !films?.length}
              />
            </div>
            <button onClick={load} disabled={busy || !film} className={`${buttonClass} py-2.5`}>
              {progress ? <Loader2 className="w-4 h-4 animate-spin" /> : <CloudDownload className="w-4 h-4" />}
              {progress ? `Reading ${progress.done} of ${progress.total || "…"}` : "Load markets"}
            </button>
            {!films && !working && (
              <button onClick={() => openClient(clientId)} className="px-2 py-2 text-xs font-bold text-[#768994] hover:text-[#122027]">
                Retry
              </button>
            )}
            <button
              onClick={() => { disconnectGoogle(); setConnected(false); setFilms(null); setFilmKey(""); setError(""); }}
              disabled={busy}
              className="px-2 py-2 text-xs font-bold text-[#768994] hover:text-[#122027] disabled:opacity-50"
            >
              Disconnect
            </button>
          </div>
        )}
      </div>

      {progress && progress.total > 0 && (
        <div className="mt-3 h-1.5 rounded-full bg-slate-100 overflow-hidden">
          <div className="h-full bg-[#12a0e1] transition-[width] duration-300" style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }} />
        </div>
      )}
      {error && <p role="alert" className="mt-3 text-sm font-medium text-rose-600">{error}</p>}
    </div>
  );
}
