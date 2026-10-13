import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ClipboardList, FileSpreadsheet, Loader2, PencilLine, Plus, RefreshCw, X } from "lucide-react";
import PageHeader, { pageHeaderActionClass } from "./shared/PageHeader";
import DropZone from "./orderForms/DropZone";
import FilmBar from "./orderForms/FilmBar";
import GoogleSource, { googleMessage } from "./orderForms/GoogleSource";
import MarketList from "./orderForms/MarketList";
import MarketView from "./orderForms/MarketView";
import Corrections from "./orderForms/Corrections";
import { readXlsx } from "../lib/orderForms/readXlsx";
import { parseWorkbook } from "../lib/orderForms/parseWorkbook";
import { listFiles, saveFile, removeFile } from "../lib/orderForms/store";
import { connectGoogle, googleConfigured, googleConnected } from "../lib/orderForms/googleApi";
import { loadFilm, loadMarketOf } from "../lib/orderForms/loadFilm";
import { makeMatcher, indexParents, orderKey } from "../lib/orderForms/wrikeMatch";
import { applySetAside } from "../lib/orderForms/status";
import { confirmAction } from "../lib/confirm";
import { notify } from "../lib/toast";
import { isoToday } from "../utils/dates";

// The PMs' readable view of the clients' order forms. Orders come in two
// ways: a film read live from Google (every market's sheet, found in the
// client's Drive folders), or a workbook dropped onto the page. Either way they are
// parsed in the browser and kept in this browser only (see lib/orderForms/
// store.js for why they never go to Supabase). A market's page is where the
// writes are: its edit mode writes to Google Sheets, and its Wrike button
// creates the market's folder.

// `#orderforms/<fileId>/<market>` — the open file and market live in the hash,
// so a reload stays put and Back returns from a market to the overview.
const readHash = () => {
  const [page, fileId, market] = window.location.hash.slice(1).split("/");
  if (page !== "orderforms") return {};
  return { fileId: fileId || null, market: market ? decodeURIComponent(market) : null };
};
const hashFor = (fileId, market) =>
  `#orderforms${fileId ? `/${fileId}` : ""}${fileId && market ? `/${encodeURIComponent(market)}` : ""}`;

// The film a Google-loaded file is for, as its sheets name it. Films loaded
// before the title was kept still have it in the key Refresh finds them by.
const filmTitleOf = (file) =>
  file?.source?.clientId ? file.film || String(file.source.filmKey || "").split("|")[0] : "";

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
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  // The film loader is shown when asked for (the header's Add film), or when
  // nothing is loaded yet. `editingSheets` opens the correction on the overview.
  const [adding, setAdding] = useState(false);
  const [editingSheets, setEditingSheets] = useState(false);
  const fileInputRef = useRef(null);
  const dragDepth = useRef(0);
  const today = isoToday();
  const matcher = useMemo(() => makeMatcher(wrikeData), [wrikeData]);
  const wrikeParents = useMemo(() => indexParents(wrikeData), [wrikeData]);

  useEffect(() => {
    listFiles().then(setFiles);
  }, []);

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
  const file = files?.find((f) => f.id === view.fileId) || files?.[0] || null;
  const shown = useMemo(() => applySetAside(file), [file]);
  const market = shown && view.market ? shown.markets.find((m) => m.name === view.market && !m.unreadable) : null;

  // What a PM has decided about a market's orders, kept on the file: rows set
  // aside (ignored) and tasks matched by hand (links), both by market name.
  const decideFor = (target, marketName) => {
    const change = (work) => {
      const updated = work(target);
      saveFile(updated);
      setFiles((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
    };
    const setIgnored = (order, on) => change((f) => {
      const keys = new Set(f.ignored?.[marketName] || []);
      if (on) keys.add(orderKey(order)); else keys.delete(orderKey(order));
      return { ...f, ignored: { ...f.ignored, [marketName]: [...keys] } };
    });
    return {
      links: target.links?.[marketName],
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
    // What was decided about the older read carries over to the newer one.
    const parsed = replaces ? { ...read, ignored: replaces.ignored, links: replaces.links } : read;
    if (replaces) await removeFile(replaces.id);
    const kept = await saveFile(parsed);
    setFiles((prev) => [parsed, ...(prev || []).filter((f) => f.id !== replaces?.id)]);
    go(parsed.id, keepMarket || null, { replace: !!replaces });
    const readable = parsed.markets.filter((m) => !m.unreadable).length;
    if (kept) notify(`${readable} of ${parsed.markets.length} markets read`, "success");
    else notify("Loaded for now. This browser couldn't store it, so it won't be here after a reload.", "error");
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
      const existing = (files || []).find((f) => f.name === parsed.name);
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
    const existing = (files || []).find((f) => f.name === loaded.name);
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
        const updated = { ...current, markets: current.markets.map((m) => (m.name === market.name ? fresh : m)) };
        const kept = await saveFile(updated);
        setFiles((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
        if (fresh.unreadable) setError(`${market.name}: ${fresh.unreadable}`);
        else if (kept) notify(`${market.name} read again`, "success");
        else notify("Read for now. This browser couldn't store it, so it won't be here after a reload.", "error");
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
      message: `${target.name} will be removed from this browser. Nothing in Google is affected.`,
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
        {files?.length > 0 && (
          <button onClick={() => setAdding((v) => !v)} aria-expanded={adding} className={pageHeaderActionClass}>
            {adding ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            {adding ? "Close" : "Add film"}
          </button>
        )}
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
            <FilmBar files={files} selectedId={file?.id} onSelect={(id) => { setEditingSheets(false); go(id, null); }} onRemove={dropFile}>
              {/* A film loaded before the page read Drive folders has no client to
                  read again from; it is loaded afresh from Add film instead. */}
              {file?.source?.clientId && (
                <button
                  onClick={refresh}
                  disabled={working}
                  title={`Read from Google at ${readAt(lastRead)}`}
                  className="press flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-[#dce4ec] hover:border-[#12a0e1] shadow-sm text-sm font-bold text-[#122027] transition-colors disabled:opacity-60"
                >
                  {refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  {refreshing
                    ? (market ? `Reading ${market.name}…` : `Reading ${refreshing.done} of ${refreshing.total || "…"}`)
                    : `Refresh${market ? ` ${market.name}` : ""} · read at ${readAt(lastRead)}`}
                </button>
              )}
            </FilmBar>
            {error && <p role="alert" className="text-sm font-medium text-rose-600">{error}</p>}
            {market
              ? <MarketView market={market} kind={market.kind || file.kind} filmTitle={filmTitleOf(file)} clientId={file.source?.clientId} filmKey={file.source?.filmKey} onChanged={refresh} today={today} matcher={matcher} wrikeParents={wrikeParents} decide={decideFor(file, market.name)} onBack={() => go(file.id, null)} />
              : (
                <MarketList
                  file={shown}
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
                        editingSheets ? "bg-[#122027] border-[#122027] text-white" : "bg-white border-[#dce4ec] text-[#122027] hover:border-[#12a0e1]"
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
