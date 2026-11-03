import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, FileSpreadsheet, Loader2, PencilLine, Plus, RefreshCw, Trash2 } from "lucide-react";
import PageHeader from "./shared/PageHeader";
import DropZone from "./orderForms/DropZone";
import MediumSwitch from "./orderForms/MediumSwitch";
import GoogleSource, { googleMessage } from "./orderForms/GoogleSource";
import HeaderSearch from "./orderForms/HeaderSearch";
import ReportButton from "./orderForms/ReportButton";
import MarketList from "./orderForms/MarketList";
import MarketView from "./orderForms/MarketView";
import Corrections from "./orderForms/Corrections";
import { readXlsx } from "../lib/orderForms/readXlsx";
import { parseWorkbook } from "../lib/orderForms/parseWorkbook";
import { listFiles, saveFile, saveDecisions, saveSeen, removeFile, fileKey, storeReach } from "../lib/orderForms/store";
import { connectGoogle, googleConfigured, googleConnected, onGoogleChange } from "../lib/orderForms/googleApi";
import GoogleButton from "./orderForms/GoogleButton";
import { HoverLabel } from "./shared/FloatingCard";
import { loadFilm, loadMarketOf, listFilms } from "../lib/orderForms/loadFilm";
import { clientFor, driveStaleness } from "../lib/orderForms/driveTree";
import StudioGrid from "./orderForms/StudioGrid";
import DomesticView from "./orderForms/DomesticView";
import LaunchView from "./orderForms/LaunchView";
import { parseDomestic } from "../lib/orderForms/domestic";
import { parseLaunch } from "../lib/orderForms/launch";
import { isOrderFile, placeExtras, sameFilmName } from "../lib/orderForms/extras";
import { SECTIONS } from "../lib/orderForms/sections";
import { filmKey, mediumOf, storeStudio, storedStudio, studioLabel, studioOf } from "../lib/orderForms/studios";
import { loadPosters, posterKey, setPoster, studioKey } from "../lib/filmPosters";
import { makeMatcher, indexParents, orderKey } from "../lib/orderForms/wrikeMatch";
import { applySetAside, fileChanges, filmDelivered, marketChanges, mergeChanges, teamNews } from "../lib/orderForms/status";
import { confirmAction } from "../lib/confirm";
import { notify } from "../lib/toast";
import { isoToday } from "../utils/dates";

// The PMs' view of the clients' order forms. Orders come in two ways: a film
// read live from Google (every market's sheet, found in the client's Drive
// folders), or a workbook dropped onto the page. Either way they are parsed in
// the browser and then shared between the PMs (see lib/orderForms/store.js
// for where, and why not in a table the browser can read). A market's page is where the
// writes are: its edit mode writes to Google Sheets, and its Wrike button
// creates the market's folder.

// `#orderforms/<fileId>/<market>` — the open file and market live in the hash,
// so a reload stays put and Back returns from a market to the overview.
// A fourth part, "brief", opens the market ready to brief its orders into
// Wrike, and "row-14" opens it at that order (the Control Centre links both
// ways). It is acted on once and dropped.
const readHash = () => {
  const [page, fileId, market, action] = window.location.hash.slice(1).split("/");
  if (page !== "orderforms") return {};
  return { fileId: fileId ? decodeURIComponent(fileId) : null, market: market ? decodeURIComponent(market) : null, action: action || null };
};
const hashFor = (fileId, market) =>
  `#orderforms${fileId ? `/${fileId}` : ""}${fileId && market ? `/${encodeURIComponent(market)}` : ""}`;

// The film a Google-loaded file is for, as its sheets name it. Films loaded
// before the title was kept have it in their name ("Studio · Film · Medium"),
// in the case it is written; the key Refresh finds them by is lowercased.
const filmTitleOf = (file) =>
  file?.source?.clientId
    ? file.film || file.name.split(" · ").slice(1, -1).join(" · ") || String(file.source.filmKey || "").split("|")[0]
    : "";

const hasFiles = (e) => Array.from(e.dataTransfer?.types || []).includes("Files");

const readAt = (iso) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

// How old an open film's last read is before it's read again by itself.
const AUTO_READ_AFTER = 2 * 60 * 60 * 1000;

// wrikeData is the app's already-loaded Wrike tasks, used only to mark orders
// that exist there. See lib/orderForms/wrikeMatch.js for what it can't see.
export default function OrderForms({ wrikeData, isAdmin = false, filmCodes = {} }) {
  // Everything in the shared store: the International order forms, and Domestic and Launch reads (extras.js).
  // The International screens are only ever handed order forms.
  const [stored, setFiles] = useState(null); // null until the store has answered
  const files = useMemo(() => (stored ? stored.filter(isOrderFile) : null), [stored]);
  const extras = useMemo(() => (stored || []).filter((f) => !isOrderFile(f)), [stored]);
  const [view, setView] = useState(readHash);
  // The picture on each film's card, by pasted URL. Empty until the shared map answers.
  const [posters, setPosters] = useState({});
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  // The markets read so far while a film loads from Google, shown as they
  // arrive. Not a file yet: nothing is stored until the load finishes.
  const [partial, setPartial] = useState(null);
  const [refreshing, setRefreshing] = useState(null); // { done, total }
  const [signedInTick, setSignedInTick] = useState(0);
  // A sign-in made from the header's Google button counts like any other.
  useEffect(() => onGoogleChange(() => { if (googleConnected()) setSignedInTick((n) => n + 1); }), []);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  // The film loader is shown when asked for (the plus beside the film
  // switcher), or when nothing is loaded yet. `editingSheets` opens the correction on the overview.
  const [adding, setAdding] = useState(false);
  const [editingSheets, setEditingSheets] = useState(false);
  // The studio whose films are open on the front page, or none for the studio cards. Kept here rather than in
  // the grid so it survives opening a film, and so the header can say it.
  const [studio, setStudio] = useState(storedStudio);
  const openStudio = useCallback((id) => {
    setStudio(id || null);
    storeStudio(id || null);
  }, []);
  const fileInputRef = useRef(null);
  const dragDepth = useRef(0);
  const today = isoToday();
  // The posters first. Matching orders to Wrike's tasks means indexing every cached task (tens of thousands)
  // and checking every order of every film, so on the front page it waits until the page is up; opening
  // straight onto a film needs it at once.
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const later = window.requestIdleCallback || ((fn) => setTimeout(fn, 250));
    const cancel = window.cancelIdleCallback || clearTimeout;
    const handle = later(() => setSettled(true), { timeout: 1200 });
    return () => cancel(handle);
  }, []);
  const ready = settled || !!view.fileId;
  const matcher = useMemo(() => makeMatcher(ready ? wrikeData : []), [wrikeData, ready]);
  // Films whose every market is delivered in Wrike, for the "Delivered" mark.
  const deliveredFilms = useMemo(() => new Set((ready ? files || [] : []).filter((f) => filmDelivered(f, (file, m) =>
    matcher.match(m.orders, file.links?.[m.name], file.briefed?.[m.name], m.kind || file.kind))).map((f) => f.id)), [files, matcher, ready]);
  const wrikeParents = useMemo(() => indexParents(ready ? wrikeData : []), [wrikeData, ready]);

  // `local` is true when the shared store couldn't be reached and the page is
  // showing this browser's last copies.
  const [local, setLocal] = useState(false);
  const loadedAt = useRef(0);
  // What the page is showing, for comparing with a fresh read: the difference
  // someone else made is said in a toast (see teamNews). Not on the first load,
  // when there is nothing it was showing.
  const shownFiles = useRef(null);
  const reload = useCallback(async () => {
    loadedAt.current = Date.now();
    const found = await listFiles();
    const news = shownFiles.current && storeReach() === "shared"
      ? teamNews(shownFiles.current, found.filter(isOrderFile), localStorage.getItem("wrike_user_id"))
      : [];
    setFiles(found);
    setLocal(storeReach() === "local");
    // A few are said one by one, each with a way to it; more than that is one line.
    if (news.length > 3) notify(`${news.length} updates from the team since you were last here.`, "info");
    else news.forEach((n) => notify(n.text, "info", n.fileId ? { action: { label: "View", onClick: () => goRef.current?.(n.fileId, n.market || null) } } : undefined));
  }, []);
  const goRef = useRef(null);

  useEffect(() => { let live = true; loadPosters().then((p) => { if (live) setPosters(p); }); return () => { live = false; }; }, []);

  useEffect(() => { reload(); }, [reload]);

  // What each studio's Drive folders hold now, to notice a loaded film whose
  // sheets have been cleared out: { clientId: films }. Listed once the films
  // are known and Google is signed in; a failure just means nothing is flagged.
  const [drive, setDrive] = useState({});
  const studios = useMemo(() => [...new Set((files || []).map((f) => f.source?.clientId).filter(Boolean))].sort().join(","), [files]);
  useEffect(() => {
    if (!ready || !studios || !googleConfigured() || !googleConnected()) return;
    let live = true;
    for (const clientId of studios.split(",")) {
      listFilms(clientId)
        .then((found) => { if (live) setDrive((prev) => ({ ...prev, [clientId]: found })); })
        .catch(() => {});
    }
    return () => { live = false; };
  }, [studios, signedInTick, ready]);
  const stalenessOf = useCallback((f) => driveStaleness(f, drive[f?.source?.clientId]), [drive]);

  // Someone else may have refreshed a film or set a row aside. Coming back to
  // the tab picks that up, at most once a minute and never mid-load.
  const workingRef = useRef(false);
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible" || workingRef.current) return;
      if (Date.now() - loadedAt.current > 60000) reload();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [reload]);

  useEffect(() => {
    const onHashChange = () => setView(readHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const go = useCallback((fileId, market, { replace = false } = {}) => {
    const hash = hashFor(fileId, market);
    if (window.location.hash !== hash) window.history[replace ? "replaceState" : "pushState"]({}, "", hash);
    setView({ fileId, market });
    // A message about one film or market has nothing to say about the next.
    setError("");
  }, []);

  // Choosing a film's picture by pasted URL; setPoster merges it into the shared map. A blank URL puts the
  // tinted fallback back.
  const setFilmPoster = useCallback(async (studioId, title) => {
    // The studio id the grid groups by, so a dropped workbook's poster finds its card.
    const key = posterKey(studioId, title);
    const url = window.prompt(`Paste the image URL for ${title || "this film"}'s poster (or leave it blank to reset):`, posters[key] || "");
    if (url === null) return;
    const { posters: next, error: why } = await setPoster(key, url);
    if (why) notify(why, "error");
    else setPosters(next);
  }, [posters]);

  // A studio's card image: the same prompt and the same map, under the studio's own key.
  const setStudioImage = useCallback(async (studioId) => {
    const label = studioId === "amazonmgm" ? "Amazon MGM" : studioId.charAt(0).toUpperCase() + studioId.slice(1);
    const key = studioKey(studioId);
    const url = window.prompt(`Paste the image URL for ${label} (or leave it blank to reset):`, posters[key] || "");
    if (url === null) return;
    const { posters: next, error: why } = await setPoster(key, url);
    if (why) notify(why, "error");
    else setPosters(next);
  }, [posters]);

  // `file` is as read; `shown` is the same without the rows set aside.
  shownFiles.current = files;
  goRef.current = go;
  const file = files?.find((f) => f.id === view.fileId) || files?.[0] || null;
  const shown = useMemo(() => applySetAside(file), [file]);
  const market = shown && view.market ? shown.markets.find((m) => m.name === view.market && !m.unreadable) : null;

  // The header says where you are: the studio cards, a studio's films, a film, or one of its markets, with the
  // levels above as a trail back up. "Client Orders" closes the studio; a studio crumb opens that one's films.
  // A Domestic or Launch read open in its own view, with the film and studio it belongs to.
  const placed = useMemo(() => placeExtras(files, extras, filmCodes, filmTitleOf), [files, extras, filmCodes]);
  const openExtra = view.fileId ? placed.find((p) => p.extra.id === view.fileId) || null : null;
  const opened = view.fileId && !openExtra ? file : null;
  const toFront = (studioId) => {
    openStudio(studioId);
    setEditingSheets(false);
    go(null, null);
  };
  const studioFilms = files && studio
    ? new Set([
        ...files.filter((f) => studioOf(f) === studio).map((f) => filmKey(filmTitleOf(f))),
        ...placed.filter((p) => p.alone && p.studio === studio).map((p) => filmKey(p.name)),
      ]).size
    : 0;
  // The open film's other side (Motion or Print), and its poster, which the header shows small and washes across
  // the band. A poster can be saved under any spelling of the film's title, so each is tried.
  const twin = opened
    ? files.find((f) => f.id !== opened.id && f.source?.clientId === opened.source?.clientId && f.kind !== opened.kind
      && filmKey(filmTitleOf(f)) === filmKey(filmTitleOf(opened))) || null
    : null;
  const posterOf = (studioId, titles) => titles.map((t) => posters[posterKey(studioId, t)]).find(Boolean) || null;
  const filmPoster = opened
    ? posterOf(studioOf(opened), [filmTitleOf(opened), ...(twin ? [filmTitleOf(twin)] : [])])
    : openExtra
      ? posterOf(openExtra.studio, [openExtra.name, ...(files || []).filter((f) => sameFilmName(filmTitleOf(f), openExtra.name)).map(filmTitleOf)])
      : null;
  const headerChip = "flex items-center gap-1 rounded-full bg-white/15 px-3 py-1 text-[11px] font-bold text-white ring-1 ring-white/25";
  const readableCount = opened ? (opened.markets || []).filter((m) => !m.unreadable).length : 0;

  const header = openExtra
    ? {
        crumbs: [
          { label: "Client Orders", onClick: () => toFront(null) },
          { label: studioLabel(openExtra.studio), onClick: () => toFront(openExtra.studio) },
        ],
        title: `${openExtra.name} · ${SECTIONS.find((s) => s.id === openExtra.extra.section)?.label || ""}`,
        subtitle: openExtra.extra.section === "launches" ? openExtra.extra.launch?.artwork || "Launch" : "US cinema pieces",
        cover: filmPoster,
        backdrop: filmPoster,
      }
    : !opened
    ? studio
      ? {
          crumbs: [{ label: "Client Orders", onClick: () => openStudio(null) }],
          title: studioLabel(studio),
          subtitle: studioFilms ? `${studioFilms} ${studioFilms === 1 ? "film" : "films"}` : "No films loaded yet",
        }
      : { title: "Client Orders", subtitle: "Market orders at a glance" }
    : {
        crumbs: [
          { label: "Client Orders", onClick: () => toFront(null) },
          { label: studioLabel(studioOf(opened)), onClick: () => toFront(studioOf(opened)) },
          ...(market ? [{ label: filmTitleOf(opened), onClick: () => go(opened.id, null) }] : []),
        ],
        title: market ? market.name : filmTitleOf(opened),
        cover: filmPoster,
        backdrop: filmPoster,
        // The film's side, with the other one a switch away; how many markets; whether it's all delivered.
        meta: (
          <>
            <MediumSwitch current={opened} twin={twin} onSelect={(id) => { setEditingSheets(false); go(id, market ? market.name : null); }} />
            {!market && <span className={headerChip}>{readableCount} {readableCount === 1 ? "market" : "markets"}</span>}
            {deliveredFilms.has(opened.id) && <span className={headerChip}><Check className="h-3 w-3" strokeWidth={3} /> Delivered</span>}
          </>
        ),
      };

  // What a PM has decided about a market's orders, kept on the file: rows set
  // aside (ignored) and tasks matched by hand (links), both by market name.
  const decideFor = (target, marketName) => {
    // `save` is saveDecisions for what the PMs share (rows set aside, tasks
    // matched by hand) and saveSeen for this person's own change markers.
    const change = (work, save = saveDecisions) => {
      const updated = work(target);
      save(updated);
      setFiles((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
    };
    const setIgnored = (order, on) => change((f) => {
      const keys = new Set(f.ignored?.[marketName] || []);
      if (on) keys.add(orderKey(order)); else keys.delete(orderKey(order));
      return { ...f, ignored: { ...f.ignored, [marketName]: [...keys] } };
    });
    return {
      changes: target.changes?.[marketName],
      // "Got it" on what changed: it has been looked at.
      onSeen: () => change((f) => {
        const { [marketName]: _seen, ...rest } = f.changes || {};
        return { ...f, changes: rest };
      }, saveSeen),
      links: target.links?.[marketName],
      // Tasks created from here, by order: [{ key, id, title, permalink }].
      briefed: target.briefed?.[marketName],
      // Records of tasks made from here that Wrike no longer has (someone
      // deleted them there), dropped so the orders can be briefed again.
      onUnbriefed: (keys) => change((f) => {
        const kept = { ...f.briefed?.[marketName] };
        keys.forEach((k) => delete kept[k]);
        return { ...f, briefed: { ...f.briefed, [marketName]: kept } };
      }),
      onBriefed: (made) => change((f) => ({
        ...f,
        briefed: { ...f.briefed, [marketName]: { ...f.briefed?.[marketName], ...Object.fromEntries(made.map(({ key, ...task }) => [key, task])) } },
      })),
      onSetAside: (order) => setIgnored(order, true),
      onRestore: (order) => setIgnored(order, false),
      onLink: (order, value) => change((f) => {
        const links = { ...f.links?.[marketName] };
        if (value) links[orderKey(order)] = value; else delete links[orderKey(order)];
        return { ...f, links: { ...f.links, [marketName]: links } };
      }),
    };
  };

  // Take a parsed file into the page and the store. `replaces` is the loaded
  // file it supersedes (same name), already agreed to by the caller.
  // `tally` is a Refresh's count of sheets read and kept (loadFilm).
  const adopt = useCallback(async (read, replaces, keepMarket, tally) => {
    // A film has one id for everyone (fileKey), so a newer read replaces the
    // older one wherever it was loaded. What was decided about the older read
    // carries over, and what the newer one changed is kept until looked at.
    const parsed = {
      ...read,
      id: fileKey(read),
      ...(replaces
        ? { ignored: replaces.ignored, links: replaces.links, briefed: replaces.briefed, wrapped: replaces.wrapped, changes: fileChanges(replaces, read) }
        : {}),
    };
    if (replaces && replaces.id !== parsed.id) await removeFile(replaces.id);
    const kept = await saveFile(parsed);
    setFiles((prev) => [parsed, ...(prev || []).filter((f) => f.id !== replaces?.id)]);
    go(parsed.id, keepMarket || null, { replace: !!replaces });
    const readable = parsed.markets.filter((m) => !m.unreadable).length;
    if (kept && tally?.kept) notify(`${tally.read} ${tally.read === 1 ? "sheet" : "sheets"} read, ${tally.kept} unchanged since the last read`, "success");
    else if (kept) notify(`${readable} of ${parsed.markets.length} markets read`, "success");
    else notify("Loaded in this browser, but it couldn't be shared with the team. Refresh it later to try again.", "error");
    setLocal(storeReach() === "local");
  }, [go]);

  // A Domestic or Launch read, shared like an order form; a second read of the same file replaces the first.
  const adoptExtra = useCallback(async (read) => {
    const id = fileKey(read);
    const existing = (stored || []).find((f) => f.id === id);
    if (existing && !(await confirmReplace(read.name))) return;
    const saved = { ...read, id };
    const kept = await saveFile(saved);
    setFiles((prev) => [saved, ...(prev || []).filter((f) => f.id !== id)]);
    go(id, null, { replace: !!existing });
    const label = SECTIONS.find((x) => x.id === read.section)?.label || "Sheet";
    if (kept) notify(`${label} sheet read`, "success");
    else notify("Loaded in this browser, but it couldn't be shared with the team. Load it again later to share it.", "error");
    setLocal(storeReach() === "local");
  }, [stored, go]);

  const confirmReplace = (name) => confirmAction({
    title: "Replace what's loaded?",
    message: `${name} is already loaded. Replace it with this newer read?`,
    confirmLabel: "Replace",
  });

  const addFile = useCallback(async (picked) => {
    setError("");
    setBusy(true);
    try {
      const sheets = await readXlsx(picked);
      // A Domestic or Launch sheet is asked about first: its tabs could pass for an order form's market tabs.
      const extra = parseDomestic(sheets, picked.name) || parseLaunch(sheets, picked.name);
      if (extra) {
        await adoptExtra(extra);
        return;
      }
      const parsed = parseWorkbook(sheets, picked.name);
      if (!parsed) {
        setError("This doesn't look like an order form. No market tabs were found in it.");
        return;
      }
      const existing = (files || []).find((f) => f.id === fileKey(parsed));
      if (existing && !(await confirmReplace(parsed.name))) return;
      await adopt(parsed, existing);
    } catch (err) {
      // Only the reason is kept: a workbook's contents never go into an error.
      setError(err.message === "not-xlsx"
        ? "That isn't an .xlsx file. In Google Sheets, choose File, Download, Microsoft Excel (.xlsx)."
        : "That file couldn't be read. Download it again from Google Sheets and retry.");
    } finally {
      setBusy(false);
    }
  }, [files, adopt, adoptExtra]);

  const addFilm = useCallback(async (loaded) => {
    const existing = (files || []).find((f) => f.id === fileKey(loaded));
    if (existing && !(await confirmReplace(loaded.name))) return;
    await adopt(loaded, existing);
    setAdding(false);
  }, [files, adopt]);

  // Read a Google-loaded film again from the client's folders. Asking to refresh
  // is the confirmation, so the old read is replaced without a second prompt.
  // With a market open only that market's sheet is read, and it is put back
  // into the film where it was.
  // A whole-film Refresh skips sheets unchanged since they were last read
  // (loadFilm); with ⌥ (Alt) held it reads every one.
  const refresh = async (event) => {
    const everything = !!event?.altKey;
    const current = file;
    setError("");
    setRefreshing({ done: 0, total: market ? 1 : 0 });
    try {
      if (!googleConnected()) {
        await connectGoogle();
        setSignedInTick((n) => n + 1);
      }
      if (market) {
        const fresh = await loadMarketOf(current.source, market);
        if (!fresh) {
          setError(`${market.name}'s folder no longer holds a sheet for this film.`);
          return;
        }
        const was = current.markets.find((m) => m.name === market.name);
        const changed = fresh.unreadable ? current.changes?.[market.name] : mergeChanges(current.changes?.[market.name], marketChanges(was, fresh));
        const { [market.name]: _gone, ...otherChanges } = current.changes || {};
        const updated = {
          ...current,
          markets: current.markets.map((m) => (m.name === market.name ? fresh : m)),
          changes: changed ? { ...otherChanges, [market.name]: changed } : otherChanges,
        };
        const kept = await saveFile(updated);
        setFiles((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
        if (fresh.unreadable) setError(`${market.name}: ${fresh.unreadable}`);
        else if (kept) notify(`${market.name} read again`, "success");
        else notify("Read in this browser, but it couldn't be shared with the team.", "error");
        return;
      }
      const tally = {};
      const loaded = await loadFilm({
        ...current.source,
        previous: everything ? null : current,
        tally,
        onProgress: (done, total) => setRefreshing({ done, total }),
      });
      if (loaded) await adopt(loaded, current, market?.name, tally);
      else setError("That film's order sheets are no longer in the market folders.");
    } catch (err) {
      setError(googleMessage(err));
    } finally {
      setRefreshing(null);
    }
  };

  // An open film is read again in the background once its last read is a couple of hours old, so PMs see what
  // changed without pressing Refresh. Only for someone already signed in to Google (it never asks), once per film
  // per visit, and saved only when a sheet had to be read: a film whose sheets are all as last read costs Google a
  // folder listing and the database nothing. A sheet is read again at least daily whatever it says (stillCurrent),
  // so saving then keeps the next visit from reading them all again. It's merged onto the film as it is when the
  // read finishes, so a decision made meanwhile isn't lost.
  const autoRead = useRef(new Map());
  const openedRef = useRef(null);
  openedRef.current = opened;
  useEffect(() => {
    const target = openedRef.current;
    if (!target?.source?.clientId || !googleConfigured() || !googleConnected() || workingRef.current) return;
    const now = Date.now();
    if (now - Date.parse(target.loadedAt) < AUTO_READ_AFTER) return;
    if (now - (autoRead.current.get(target.id) || 0) < AUTO_READ_AFTER) return;
    autoRead.current.set(target.id, now);
    (async () => {
      const tally = {};
      setRefreshing({ done: 0, total: 0 });
      try {
        const loaded = await loadFilm({ ...target.source, previous: target, tally, onProgress: (done, total) => setRefreshing({ done, total }) });
        if (!loaded || !tally.read) return;
        const latest = shownFiles.current?.find((f) => f.id === target.id) || target;
        const next = {
          ...loaded,
          id: target.id,
          ignored: latest.ignored,
          links: latest.links,
          briefed: latest.briefed,
          wrapped: latest.wrapped,
          changes: fileChanges(latest, loaded),
        };
        await saveFile(next);
        setFiles((prev) => (prev || []).map((f) => (f.id === next.id ? next : f)));
        const moved = Object.keys(next.changes).filter((name) => JSON.stringify(next.changes[name]) !== JSON.stringify(latest.changes?.[name])).length;
        if (moved) notify(`${filmTitleOf(target)} (${mediumOf(target)}): ${moved} ${moved === 1 ? "market has" : "markets have"} changed since ${readAt(target.loadedAt)}`, "info");
      } catch {
        // Quiet: nothing was asked for, and Refresh is still there.
      } finally {
        setRefreshing(null);
      }
    })();
  }, [opened?.id]);

  const dropFile = async (target) => {
    const ok = await confirmAction({
      title: "Remove this from the page?",
      message: `${target.name} will be removed for everyone who uses Client Orders. Nothing in Google is affected, and it can be loaded again.`,
      confirmLabel: "Remove",
      danger: true,
    });
    if (!ok) return;
    await removeFile(target.id);
    setFiles((prev) => prev.filter((f) => f.id !== target.id));
    if (view.fileId === target.id) go(null, null, { replace: true });
  };

  // The whole page is the drop target, so a second file can be added from the
  // overview. dragenter/leave fire for every child element, hence the depth.
  const onDragEnter = (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth.current += 1;
    setDragging(true);
  };
  const onDragLeave = (e) => {
    if (!hasFiles(e)) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  };
  const onDrop = (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped && !working) addFile(dropped);
  };

  const working = busy || googleBusy || !!refreshing;
  workingRef.current = working || !!partial;

  // True for the one render in which a finished load swaps the arriving list
  // for the real one, so that list doesn't fade in over itself.
  const justLoaded = useRef(false);
  if (partial) justLoaded.current = true;
  useEffect(() => { if (!partial) justLoaded.current = false; });
  // A market refreshed on its own was read later than the rest of its film.
  const lastRead = market?.loadedAt || file?.loadedAt;
  const empty = files && files.length === 0 && extras.length === 0;

  return (
    <div
      className="min-h-screen bg-slate-100 text-[#122027] font-sans pb-16"
      onDragEnter={onDragEnter}
      onDragOver={(e) => hasFiles(e) && e.preventDefault()}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <PageHeader
        pageId="orderforms"
        title={header.title}
        subtitle={header.subtitle}
        crumbs={header.crumbs}
        cover={header.cover}
        backdrop={header.backdrop}
        meta={opened ? (
          <>
            {header.meta}
            {/* The film's own actions, with the film rather than among the page's tools. A film loaded before the
                page read Drive folders has no client to read again from; it is loaded afresh instead. */}
            <span aria-hidden="true" className="mx-0.5 h-4 w-px bg-white/25" />
            {opened.source?.clientId && (
              <HoverLabel label={market ? `Read from Google at ${readAt(lastRead)}` : `Read from Google at ${readAt(lastRead)}. Sheets unchanged since are kept; hold ⌥ (Alt) to read every one.`}>
                <button onClick={refresh} disabled={working} className={`${headerChip} press transition-colors hover:bg-white/25 disabled:opacity-60`}>
                  {refreshing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" strokeWidth={2.75} />}
                  {refreshing
                    ? (market && refreshing.total === 1 ? `Reading ${market.name}…` : `Reading ${refreshing.done} of ${refreshing.total || "…"}`)
                    : `Read ${readAt(lastRead)}`}
                </button>
              </HoverLabel>
            )}
            <button
              onClick={() => dropFile(opened)}
              aria-label={`Remove ${filmTitleOf(opened)} (${mediumOf(opened)}) from the page`}
              title={`Remove ${filmTitleOf(opened)} (${mediumOf(opened)}) from the page`}
              className="press flex items-center rounded-full bg-white/10 p-1.5 text-white/70 ring-1 ring-white/20 transition-colors hover:bg-rose-500/80 hover:text-white hover:ring-rose-300/60"
            >
              <Trash2 className="h-3 w-3" strokeWidth={2.5} />
            </button>
          </>
        ) : header.meta}
      >
        {/* Apart enough that the connected G's glow fades before the search's
            glass, which would otherwise cut it off in a hard line. */}
        <div className="flex items-center gap-3.5">
          {files?.length > 0 && <HeaderSearch files={files} matcher={matcher} today={today} />}
          {googleConfigured() && <GoogleButton />}
          <ReportButton />
          {/* The front page's one main action, so it stands apart at the end of the page's tools. */}
          {!view.fileId && files && !empty && !adding && (
            <button onClick={() => setAdding(true)} className="group/load press ml-2 flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-bold text-[#4338ca] shadow-sm transition-colors hover:bg-white/90">
              <Plus className="h-4 w-4 transition-transform duration-300 group-hover/load:rotate-90" strokeWidth={2.75} /> Load a film
            </button>
          )}
        </div>
      </PageHeader>

      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx"
        className="hidden"
        onChange={(e) => {
          const picked = e.target.files?.[0];
          e.target.value = "";
          if (picked) addFile(picked).then(() => setAdding(false));
        }}
      />

      <div className="max-w-[1800px] mx-auto px-4 sm:px-6 py-6 space-y-4">
        {files === null && <div className="h-64 rounded-2xl bg-white/60 border border-[#dce4ec] animate-pulse" />}

        {local && files?.length > 0 && (
          <p role="status" className="px-4 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-700">
            The shared orders couldn't be reached, so this is this browser's last copy. What you load or decide now stays here until it can be shared.
          </p>
        )}

        {files && googleConfigured() && (empty || adding || partial) && (
          <GoogleSource onLoaded={addFilm} onBusy={setGoogleBusy} onPartial={setPartial} signedInTick={signedInTick} onClose={adding && !empty ? () => setAdding(false) : undefined} />
        )}
        {adding && !empty && !partial && (
          <p className="text-sm text-[#768994] px-1">
            Or drop a downloaded .xlsx anywhere on the page, or{" "}
            <button onClick={() => fileInputRef.current?.click()} disabled={working} className="font-bold text-[#122027] underline underline-offset-2 hover:text-[#12a0e1]">choose a file</button>.
          </p>
        )}

        {partial && <MarketList file={partial} today={today} matcher={matcher} arriving />}

        {empty && !partial && <DropZone onFile={addFile} busy={busy} dragging={dragging} error={error} />}

        {openExtra && (openExtra.extra.section === "domestic"
          ? <DomesticView file={openExtra.extra} film={openExtra.name} onRemove={() => dropFile(openExtra.extra)} />
          : <LaunchView file={openExtra.extra} film={openExtra.name} onRemove={() => dropFile(openExtra.extra)} />)}

        {files && files.length > 0 && !partial && view.fileId && !openExtra && (
          <>
            {error && <p role="alert" className="text-sm font-medium text-rose-600">{error}</p>}
            {stalenessOf(file) && (
              <div role="status" className="flex flex-wrap items-center gap-3 px-4 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-700">
                <p className="mr-auto">
                  {stalenessOf(file).gone
                    ? `This film's order sheets are no longer in ${clientFor(file.source.clientId)?.label || "the studio"}'s Drive folders, so it has probably run its course. What's here is the last read.`
                    : stalenessOf(file).had
                      ? `Only ${stalenessOf(file).left} of this film's ${stalenessOf(file).had} markets still have a sheet in Drive, so it looks like it's being wound down.`
                      : `Only ${stalenessOf(file).left} ${stalenessOf(file).left === 1 ? "market has" : "markets have"} a sheet for this film in Drive, where the studio's fullest film has ${stalenessOf(file).typical}. Its folders look to have been cleared out.`}
                </p>
                <button onClick={() => dropFile(file)} className="px-3 py-1 rounded-lg bg-white border border-amber-200 hover:border-amber-600 text-xs font-bold text-amber-700 transition-colors">
                  Remove it
                </button>
              </div>
            )}
            {market
              ? <MarketView market={market} kind={market.kind || file.kind} filmTitle={filmTitleOf(file)} clientId={file.source?.clientId} filmKey={file.source?.filmKey} startBriefing={view.action === "brief"} openRow={Number(/^row-(\d+)$/.exec(view.action || "")?.[1]) || null} onStarted={() => go(file.id, market.name, { replace: true })} onChanged={refresh} today={today} matcher={matcher} wrikeParents={wrikeParents} decide={decideFor(file, market.name)} onBack={() => go(file.id, null)} />
              : (
                <MarketList
                  file={shown}
                  still={justLoaded.current}
                  today={today}
                  matcher={matcher}
                  onOpen={(name) => go(file.id, name)}
                  // A film read from Google can be corrected across its markets
                  // from here. The sheets are read again with Refresh.
                  actions={file.source?.clientId && (
                    <button
                      onClick={() => setEditingSheets((v) => !v)}
                      aria-expanded={editingSheets}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-sm font-bold transition-colors ${
                        editingSheets ? "key-down bg-[#122027] border-[#122027] text-white" : "key bg-white border-[#dce4ec] text-[#122027] hover:border-[#12a0e1]"
                      }`}
                    >
                      <PencilLine className="w-3.5 h-3.5" />
                      {editingSheets ? "Done editing" : "Edit sheets"}
                    </button>
                  )}
                  panel={editingSheets && file.source?.clientId && <Corrections bare clientId={file.source.clientId} filmKey={file.source.filmKey} />}
                />
              )}
          </>
        )}

        {files && (files.length > 0 || extras.length > 0) && !partial && !view.fileId && (
          <StudioGrid
            files={files}
            extras={extras}
            codes={filmCodes}
            studio={studio}
            onStudio={openStudio}
            posters={posters}
            titleOf={filmTitleOf}
            staleness={stalenessOf}
            delivered={(f) => deliveredFilms.has(f.id)}
            onOpen={(id) => { setEditingSheets(false); go(id, null); }}
            onOpenExtra={(id) => go(id, null)}
            onSetPoster={setFilmPoster}
            onSetStudioImage={setStudioImage}
            canEdit={isAdmin}
          />
        )}
      </div>

      {dragging && !empty && (
        <div className="fixed inset-0 z-[9000] pointer-events-none flex items-center justify-center bg-[#122027]/60 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 px-10 py-8 rounded-2xl border-2 border-dashed border-white/70 text-white">
            <FileSpreadsheet className="w-10 h-10" strokeWidth={1.5} />
            <p className="font-display text-2xl font-bold tracking-tight">Drop to add this order form</p>
          </div>
        </div>
      )}
    </div>
  );
}
