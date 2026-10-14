import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ClipboardList, FileSpreadsheet, Loader2, PencilLine, RefreshCw } from "lucide-react";
import PageHeader from "./shared/PageHeader";
import DropZone from "./orderForms/DropZone";
import FilmBar from "./orderForms/FilmBar";
import GoogleSource, { googleMessage } from "./orderForms/GoogleSource";
import HeaderSearch from "./orderForms/HeaderSearch";
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
import { makeMatcher, indexParents, orderKey } from "../lib/orderForms/wrikeMatch";
import { applySetAside, fileChanges, marketChanges, mergeChanges, teamNews } from "../lib/orderForms/status";
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

// wrikeData is the app's already-loaded Wrike tasks, used only to mark orders
// that exist there. See lib/orderForms/wrikeMatch.js for what it can't see.
export default function OrderForms({ wrikeData }) {
  const [files, setFiles] = useState(null); // null until the store has answered
  const [view, setView] = useState(readHash);
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
  const fileInputRef = useRef(null);
  const dragDepth = useRef(0);
  const today = isoToday();
  const matcher = useMemo(() => makeMatcher(wrikeData), [wrikeData]);
  const wrikeParents = useMemo(() => indexParents(wrikeData), [wrikeData]);

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
      ? teamNews(shownFiles.current, found, localStorage.getItem("wrike_user_id"))
      : [];
    setFiles(found);
    setLocal(storeReach() === "local");
    // A few are said one by one, each with a way to it; more than that is one line.
    if (news.length > 3) notify(`${news.length} updates from the team since you were last here.`, "info");
    else news.forEach((n) => notify(n.text, "info", n.fileId ? { action: { label: "View", onClick: () => goRef.current?.(n.fileId, n.market || null) } } : undefined));
  }, []);
  const goRef = useRef(null);

  useEffect(() => { reload(); }, [reload]);

  // What each studio's Drive folders hold now, to notice a loaded film whose
  // sheets have been cleared out: { clientId: films }. Listed once the films
  // are known and Google is signed in; a failure just means nothing is flagged.
  const [drive, setDrive] = useState({});
  const studios = useMemo(() => [...new Set((files || []).map((f) => f.source?.clientId).filter(Boolean))].sort().join(","), [files]);
  useEffect(() => {
    if (!studios || !googleConfigured() || !googleConnected()) return;
    let live = true;
    for (const clientId of studios.split(",")) {
      listFilms(clientId)
        .then((found) => { if (live) setDrive((prev) => ({ ...prev, [clientId]: found })); })
        .catch(() => {});
    }
    return () => { live = false; };
  }, [studios, signedInTick]);
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

  // `file` is as read; `shown` is the same without the rows set aside.
  shownFiles.current = files;
  goRef.current = go;
  const file = files?.find((f) => f.id === view.fileId) || files?.[0] || null;
  const shown = useMemo(() => applySetAside(file), [file]);
  const market = shown && view.market ? shown.markets.find((m) => m.name === view.market && !m.unreadable) : null;

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
  const adopt = useCallback(async (read, replaces, keepMarket) => {
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
    if (kept) notify(`${readable} of ${parsed.markets.length} markets read`, "success");
    else notify("Loaded in this browser, but it couldn't be shared with the team. Refresh it later to try again.", "error");
    setLocal(storeReach() === "local");
  }, [go]);

  const confirmReplace = (name) => confirmAction({
    title: "Replace what's loaded?",
    message: `${name} is already loaded. Replace it with this newer read?`,
    confirmLabel: "Replace",
  });

  const addFile = useCallback(async (picked) => {
    setError("");
    setBusy(true);
    try {
      const parsed = parseWorkbook(await readXlsx(picked), picked.name);
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
  }, [files, adopt]);

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
  const refresh = async () => {
    const current = file;
    setError("");
    setRefreshing({ done: 0, total: market ? 1 : 0 });
    try {
      if (!googleConnected()) {
        await connectGoogle();
        setSignedInTick((n) => n + 1);
      }
      if (market) {
        const fresh = await loadMarketOf(current.source, market.name);
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
      const loaded = await loadFilm({
        ...current.source,
        onProgress: (done, total) => setRefreshing({ done, total }),
      });
      if (loaded) await adopt(loaded, current, market?.name);
      else setError("That film's order sheets are no longer in the market folders.");
    } catch (err) {
      setError(googleMessage(err));
    } finally {
      setRefreshing(null);
    }
  };

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
    if (file?.id === target.id) go(null, null, { replace: true });
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
  const empty = files && files.length === 0;

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
        icon={ClipboardList}
        title="Client Orders"
        subtitle="Market orders at a glance"
      >
        <div className="flex items-center gap-2">
          {files?.length > 0 && <HeaderSearch files={files} matcher={matcher} today={today} />}
          {googleConfigured() && <GoogleButton />}
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
          <GoogleSource onLoaded={addFilm} onBusy={setGoogleBusy} onPartial={setPartial} signedInTick={signedInTick} />
        )}
        {adding && !empty && !partial && (
          <p className="text-sm text-[#768994] px-1">
            Or drop a downloaded .xlsx anywhere on the page, or{" "}
            <button onClick={() => fileInputRef.current?.click()} disabled={working} className="font-bold text-[#122027] underline underline-offset-2 hover:text-[#12a0e1]">choose a file</button>.
          </p>
        )}

        {partial && <MarketList file={partial} today={today} matcher={matcher} arriving />}

        {empty && !partial && <DropZone onFile={addFile} busy={busy} dragging={dragging} error={error} />}

        {files && files.length > 0 && !partial && (
          <>
            <FilmBar files={files} selectedId={file?.id} onSelect={(id) => { setEditingSheets(false); go(id, null); }} onRemove={dropFile} staleness={stalenessOf} onAdd={() => setAdding((v) => !v)} adding={adding}>
              {/* A film loaded before the page read Drive folders has no client to
                  read again from; it is loaded afresh with the plus beside the switcher. */}
              {file?.source?.clientId && (
                <HoverLabel label={`Read from Google at ${readAt(lastRead)}`}>
                  <button
                    onClick={refresh}
                    disabled={working}
                    className="key press flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-[#dce4ec] hover:border-[#12a0e1] shadow-sm text-sm font-bold text-[#122027] transition-colors disabled:opacity-60"
                  >
                    {refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    {refreshing
                      ? (market ? `Reading ${market.name}…` : `Reading ${refreshing.done} of ${refreshing.total || "…"}`)
                      : `Refresh${market ? ` ${market.name}` : ""} · read at ${readAt(lastRead)}`}
                  </button>
                </HoverLabel>
              )}
            </FilmBar>
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
