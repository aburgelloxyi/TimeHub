// The Studio Scan's screen: what Wrike has that the Job Book doesn't, and
// where the two disagree. Writes only to the Job Book and the Films list,
// never to Wrike. The matching rules are in lib/jobSync.js.
//
// Part of Administration. Split out of components/Management.jsx, which is
// still the entry point and re-exports what other screens import.
import { useState, useEffect, useCallback, useMemo } from "react";
import { Plus, X, Search, RefreshCw, CheckCircle2 } from "lucide-react";
import { supabase, selectAll } from "../../lib/supabaseClient";
import { confirmAction } from "../../lib/confirm";
import { scanStudioJobNumbers, fetchFoldersNow } from "../../lib/wrikeCampaign";
import { changedSinceCopy, copyHealth, correctionPatch, filmsToAdd, reconcile } from "../../lib/jobSync";
import { timeAgo } from "../../lib/systemStatus";
import { loadKeptCodes, scanSavedTree } from "../../hooks/useWrikeJobCheck";

const plural = (n, one, many = one + "s") => `${n} ${n === 1 ? one : many}`;

// Each reason a book row disagrees with Wrike, as a PM would say it.
const reasonText = (reason, cur) => ({
  film: "filed under a different film",
  label: "folder name left in the job number",
  description: "different description",
  duplicate: "the book already has the right copy",
  client: cur?.client ? "another studio's client" : "no client",
}[reason]);

function KeepButtons({ kept, onKeep, onUndo }) {
  return kept ? (
    <>
      <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">Left as it is</span>
      <button onClick={onUndo} className="px-2 py-1 text-[11px] font-bold rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors">Undo</button>
    </>
  ) : (
    <button onClick={onKeep} title="Leave the Job Book as it is and stop raising this job"
      className="px-2.5 py-1 text-[11px] font-bold rounded-lg border border-slate-300 text-slate-600 hover:border-slate-400 hover:text-[#122027] transition-colors">
      Keep ours
    </button>
  );
}

export function StudioJobScanModal({ onClose, onApplied, startFrom = "saved" }) {
  const [phase, setPhase] = useState("scanning"); // scanning | review | saving | done
  // "saved": the folder list TimeHub keeps. "live": downloaded from Wrike now.
  const [source, setSource] = useState("saved");
  const [treeAt, setTreeAt] = useState(null);
  const [health, setHealth] = useState("ok");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [candidates, setCandidates] = useState([]);
  const [bookRows, setBookRows] = useState([]);
  const [filmTitles, setFilmTitles] = useState([]);
  const [keptCodes, setKeptCodes] = useState(new Set());
  const [selected, setSelected] = useState({});   // code -> bool
  const [done, setDone] = useState(null);         // { jobs, films, undated }
  const [changed, setChanged] = useState(false);  // the book was written to
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [showMismatches, setShowMismatches] = useState(false);

  // The whole jobs table: a truncated read would make jobs already in the book
  // look new and invite duplicates.
  const loadBook = useCallback(async () => {
    const [rows, kept, films] = await Promise.all([
      selectAll("jobs", "id, job_number, film_title, client"),
      loadKeptCodes(),
      selectAll("films", "id, title"),
    ]);
    setBookRows(rows);
    setKeptCodes(kept);
    setFilmTitles(films.map((f) => f.title));
    return rows;
  }, []);

  const load = useCallback(async (from, why = "") => {
    setPhase("scanning");
    setError("");
    setNotice(why);
    try {
      let found, usedSource = from;
      if (from === "saved") {
        try {
          const saved = await scanSavedTree();
          found = saved.candidates;
          setTreeAt(saved.treeAt);
          setHealth(copyHealth(saved));
        } catch {
          usedSource = "live"; // no saved copy to read: fall through to Wrike itself
        }
      }
      if (usedSource === "live") found = await scanStudioJobNumbers();
      const rows = await loadBook();
      const have = new Set(Object.keys(reconcile(found, rows).byCode));
      const sel = {};
      found.forEach((c) => { if (!have.has(c.code)) sel[c.code] = true; });
      setSource(usedSource);
      setCandidates(found);
      setSelected(sel);
    } catch (e) {
      setError(e.message || String(e));
    }
    setPhase("review");
  }, [loadBook]);

  useEffect(() => { load(startFrom); }, [load, startFrom]);

  const result = useMemo(() => reconcile(candidates, bookRows), [candidates, bookRows]);
  const live = (c) => showArchived || !c.archived;

  const newOnes = result.newJobs.filter(live);
  const archivedNew = result.newJobs.length - result.newJobs.filter((c) => !c.archived).length;
  const corrections = result.corrections.filter((x) => live(x.cand));
  const archivedCorrections = result.corrections.length - result.corrections.filter((x) => !x.cand.archived).length;
  const redundant = result.redundant;
  const openCorrections = corrections.filter((x) => !keptCodes.has(x.code));
  const openRedundant = redundant.filter((x) => !keptCodes.has(x.code));
  const mismatchCount = corrections.length + redundant.length;
  const openCount = openCorrections.length + openRedundant.length;

  const shown = newOnes.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return [c.code, c.filmTitle, c.client, c.region, c.projectDescription]
      .some((v) => (v || "").toLowerCase().includes(q));
  });
  const chosen = newOnes.filter((c) => selected[c.code]);
  const allShownSelected = shown.length > 0 && shown.every((c) => selected[c.code]);
  const newFilms = filmsToAdd(chosen, filmTitles);
  const anyDates = newOnes.some((c) => c.createdDate);

  const toggle = (code) => setSelected((p) => ({ ...p, [code]: !p[code] }));
  const toggleAllShown = () =>
    setSelected((p) => {
      const next = { ...p };
      shown.forEach((c) => { next[c.code] = !allShownSelected; });
      return next;
    });

  // The saved copy is patched as Wrike reports changes, and a patch that fails
  // isn't retried. So before anything is written from it, Wrike is asked about
  // just the folders involved: one call per hundred. If one has been renamed or
  // binned since, the whole of Wrike is read again and nothing is written.
  // Returns what Wrike said (it carries the creation dates too), or null when
  // the write should stop. With no Wrike connection there is nothing to compare
  // against, and the write goes ahead on the copy.
  const askWrikeFirst = async (cands) => {
    if (source !== "saved") return {};
    const { byId } = await fetchFoldersNow(cands.map((c) => c.folderId));
    const moved = changedSinceCopy(cands, byId);
    if (!moved.length) return byId;
    await load("live", `Wrike had changed since TimeHub's copy was taken (${moved.slice(0, 3).join(", ")}${moved.length > 3 ? " and others" : ""}), so it has been read again and nothing was saved. Check the list and go again.`);
    return null;
  };

  const addJobs = async () => {
    if (!chosen.length) return;
    setPhase("saving");
    const now = await askWrikeFirst(chosen);
    if (!now) return;
    const rows = chosen.map((c) => ({
      job_number: c.jobNumber,
      film_title: c.filmTitle || null,
      client: c.client || null,
      project_description: c.projectDescription || null,
      start_date: c.createdDate || now[c.folderId]?.createdDate || null,
    }));
    let saved = 0;
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200);
      const { error: err } = await supabase.from("jobs").insert(chunk);
      if (err) { setError(`Stopped after ${saved} of ${rows.length}: ${err.message}`); setChanged(saved > 0); await loadBook(); setPhase("review"); return; }
      saved += chunk.length;
    }
    // Films follow their jobs. ignoreDuplicates: someone may have added one by
    // hand since this screen opened.
    let filmsAdded = 0;
    if (newFilms.length) {
      const { error: filmErr } = await supabase.from("films").upsert(newFilms, { onConflict: "title", ignoreDuplicates: true });
      if (!filmErr) filmsAdded = newFilms.length;
    }
    setChanged(true);
    setDone({ jobs: saved, films: filmsAdded, undated: rows.filter((r) => !r.start_date).length });
    setPhase("done");
  };

  const keepCode = async (code) => {
    const { error: err } = await supabase.from("job_sync_kept").upsert({ code }, { onConflict: "code" });
    if (err) { setError(`Couldn't save that for ${code}: ${err.message}`); return; }
    setKeptCodes((prev) => new Set(prev).add(code));
  };
  const unkeepCode = async (code) => {
    const { error: err } = await supabase.from("job_sync_kept").delete().eq("code", code);
    if (err) { setError(`Couldn't undo that for ${code}: ${err.message}`); return; }
    setKeptCodes((prev) => { const next = new Set(prev); next.delete(code); return next; });
  };

  // Make book rows say what Wrike says. A row whose correct twin is already in
  // the book is removed instead of rewritten: rewriting it would collide with
  // the twin's label, and two identical rows aren't wanted anyway.
  const matchWrike = async (fixes, spares) => {
    setPhase("saving");
    if (!(await askWrikeFirst(fixes.map((x) => x.cand)))) return;
    const failures = [];
    for (const { code, cand, cur } of fixes) {
      const twin = (result.extras[code] || []).some((r) => (r.job_number || "") === cand.jobNumber);
      const { error: err } = twin
        ? await supabase.from("jobs").delete().eq("id", cur.id)
        : await supabase.from("jobs").update(correctionPatch(cur, cand)).eq("id", cur.id);
      if (err) failures.push(`${code}: ${err.message}`);
    }
    const ids = spares.map((x) => x.row.id);
    for (let i = 0; i < ids.length; i += 200) {
      const { error: err } = await supabase.from("jobs").delete().in("id", ids.slice(i, i + 200));
      if (err) failures.push(`spare copies: ${err.message}`);
    }
    setError(failures.length
      ? `${plural(failures.length, "change")} didn't go through: ${failures.slice(0, 3).join("; ")}${failures.length > 3 ? "…" : ""}`
      : "");
    setChanged(true);
    await loadBook();
    setPhase("review");
  };

  const matchWrikeForAll = async () => {
    const ok = await confirmAction({
      title: `Use Wrike's details for ${plural(openCount, "job")}?`,
      message:
        (openCorrections.length ? `${plural(openCorrections.length, "job")} in the Job Book will be changed to match Wrike. ` : "") +
        (openRedundant.length ? `${plural(openRedundant.length, "spare copy", "spare copies")} will be removed. ` : "") +
        "Jobs you chose to keep are left alone.",
      confirmLabel: `Change ${openCount}`,
    });
    if (ok) await matchWrike(openCorrections, openRedundant);
  };

  const close = () => (changed ? onApplied() : onClose());
  const contested = candidates.contestedCodes || [];
  const unplaced = candidates.truncatedCodes || [];
  const rowBtn = "px-2.5 py-1 text-[11px] font-bold rounded-lg transition-colors disabled:opacity-50";

  return (
    <div className="fixed inset-0 z-[9999] bg-black/40 flex items-center justify-center p-4" onMouseDown={close}>
      <div
        className="bg-white rounded-3xl w-full max-w-6xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-black text-[#122027]">Jobs in Wrike</h2>
            {phase !== "scanning" && (
              <p className="text-xs text-[#768994] mt-0.5">
                {source === "saved"
                  ? <>Compared with the copy of Wrike&rsquo;s folders TimeHub keeps{treeAt ? ` (fully refreshed ${timeAgo(treeAt, new Date())})` : ""}. </>
                  : <>Read straight from Wrike just now. </>}
                {source === "saved" && (
                  <button onClick={() => load("live")} disabled={phase === "saving"}
                    className="font-bold text-[#0f766e] hover:underline disabled:opacity-50">
                    Read Wrike again now
                  </button>
                )}
                {source === "saved" && health !== "ok" && (
                  <span className="block text-amber-800 font-bold mt-0.5">
                    That copy may be behind ({health === "old" ? "it hasn't been refreshed for over a day" : "Wrike has stopped sending live updates"}), so read Wrike again before changing anything.
                  </span>
                )}
              </p>
            )}
          </div>
          <button onClick={close} aria-label="Close" className="text-slate-400 hover:text-slate-700"><X className="w-5 h-5" /></button>
        </div>

        {phase === "scanning" && (
          <div className="flex-1 flex flex-col items-center justify-center py-20 gap-3 text-[#768994]">
            <RefreshCw className="w-6 h-6 animate-spin text-[#1cc1a5]" />
            <p className="font-bold text-sm">{notice ? "Reading Wrike again…" : "Comparing the Job Book with Wrike…"}</p>
          </div>
        )}

        {phase === "done" && (
          <div className="flex-1 flex flex-col items-center justify-center py-20 gap-2 text-center px-8">
            <CheckCircle2 className="w-10 h-10 text-emerald-500 mb-1" />
            <p className="font-black text-[#122027]">
              Added {plural(done.jobs, "job")} to the Job Book{done.films ? ` and ${plural(done.films, "film")} to the Films list` : ""}.
            </p>
            {done.undated > 0 && (
              <p className="text-xs text-[#768994] max-w-md">
                {done.undated === done.jobs ? "They have" : `${done.undated} of them have`} no start date, because Wrike couldn&rsquo;t be asked for one. You&rsquo;ll find them under &ldquo;No date&rdquo;.
              </p>
            )}
            <button onClick={onApplied} className="mt-3 px-5 py-2 bg-[#1cc1a5] hover:bg-[#17a892] text-white text-sm font-bold rounded-xl">
              Done
            </button>
          </div>
        )}

        {(phase === "review" || phase === "saving") && (
          <>
            <div className="px-6 py-3 border-b border-slate-100 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
              <span className="font-bold text-[#122027]">
                {newOnes.length ? `${plural(newOnes.length, "job")} in Wrike ${newOnes.length === 1 ? "isn't" : "aren't"} in the Job Book yet` : "Every Wrike job is in the Job Book"}
                {mismatchCount > 0 && ` · ${mismatchCount} in the book ${mismatchCount === 1 ? "doesn't" : "don't"} match Wrike`}
              </span>
              <label className="ml-auto flex items-center gap-1.5 font-bold text-[#122027] cursor-pointer">
                <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="accent-[#1cc1a5]" />
                Include archived jobs
                {!showArchived && archivedNew + archivedCorrections > 0 && (
                  <span className="font-medium text-[#768994]">({archivedNew + archivedCorrections} hidden)</span>
                )}
              </label>
              {error && <span className="w-full font-bold text-rose-600">{error}</span>}
              {notice && !error && <span className="w-full font-bold text-amber-800">{notice}</span>}
              {contested.length > 0 && (
                <details className="w-full text-[#768994]">
                  <summary className="cursor-pointer font-bold">
                    {plural(contested.length, "job number")} {contested.length === 1 ? "is" : "are"} on more than one Wrike folder, so one had to be picked
                  </summary>
                  <ul className="mt-1 space-y-0.5 max-h-28 overflow-y-auto">
                    {contested.map((c) => (
                      <li key={c.code} className="truncate" title={`Also: ${c.over.join(" | ")}`}>
                        <span className="font-mono font-bold text-[#122027]">{c.code}</span> — used {c.chose}; also at {c.over.join("; ")}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {unplaced.length > 0 && (
                <span className="w-full text-[#768994]" title={unplaced.join(", ")}>
                  Couldn&rsquo;t work out the film or client for {plural(unplaced.length, "job")}; check {unplaced.length === 1 ? "it" : "them"} before adding.
                </span>
              )}
            </div>

            {mismatchCount > 0 && (
              <div className="border-b border-amber-100 bg-amber-50/60">
                <div className="px-6 py-2.5 flex items-center gap-3">
                  <span className="text-xs font-bold text-amber-800">
                    {plural(mismatchCount, "job")} in the book {mismatchCount === 1 ? "says" : "say"} something different from Wrike
                    {openCount < mismatchCount && ` · ${mismatchCount - openCount} left as ${mismatchCount - openCount === 1 ? "it is" : "they are"}`}
                  </span>
                  <button onClick={() => setShowMismatches((v) => !v)}
                    className="ml-auto shrink-0 px-3 py-1.5 bg-white border border-amber-300 hover:border-amber-400 text-amber-800 text-[11px] font-bold rounded-lg transition-colors">
                    {showMismatches ? "Hide" : "Show them"}
                  </button>
                  {/* Only once the list is open, so nobody changes rows they haven't seen. */}
                  {showMismatches && openCount > 0 && (
                    <button onClick={matchWrikeForAll} disabled={phase === "saving"}
                      className="shrink-0 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-[11px] font-bold rounded-lg transition-colors">
                      Use Wrike&rsquo;s for all {openCount}
                    </button>
                  )}
                </div>
                {showMismatches && (
                  <ul className="max-h-[45vh] overflow-y-auto border-t border-amber-100 divide-y divide-amber-100/70">
                    {corrections.map((x) => {
                      const kept = keptCodes.has(x.code);
                      return (
                        <li key={x.code} className={`px-6 py-2.5 flex items-start gap-4 ${kept ? "opacity-60" : ""}`}>
                          <span className="font-mono font-black text-xs text-amber-800 w-[78px] shrink-0 pt-0.5">{x.code}</span>
                          <div className="min-w-0 flex-1 text-xs space-y-0.5">
                            <p className="truncate" title={x.cur.job_number}>
                              <span className="font-bold text-[#768994]">Job Book</span>{" "}
                              <span className="text-slate-500">{x.cur.job_number || "—"}{x.reasons.includes("client") && ` · ${x.cur.client || "no client"}`}</span>
                            </p>
                            <p className="truncate" title={x.cand.jobNumber}>
                              <span className="font-bold text-[#0f766e]">Wrike</span>{" "}
                              <span className="text-[#122027] font-medium">{x.cand.jobNumber}{x.reasons.includes("client") && ` · ${x.cand.client}`}</span>
                            </p>
                            <p className="text-[11px] text-[#768994] truncate" title={x.cand.folderPath}>
                              {x.reasons.map((r) => reasonText(r, x.cur)).join(", ")}
                              {x.cand.folderPath && ` · in Wrike at ${x.cand.folderPath}`}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {!kept && (
                              <button onClick={() => matchWrike([x], [])} disabled={phase === "saving"}
                                className={`${rowBtn} bg-[#1cc1a5] hover:bg-[#17a892] text-white`}>
                                Use Wrike&rsquo;s
                              </button>
                            )}
                            <KeepButtons kept={kept} onKeep={() => keepCode(x.code)} onUndo={() => unkeepCode(x.code)} />
                          </div>
                        </li>
                      );
                    })}
                    {redundant.map((x) => {
                      const kept = keptCodes.has(x.code);
                      return (
                        <li key={`spare-${x.row.id}`} className={`px-6 py-2.5 flex items-start gap-4 ${kept ? "opacity-60" : ""}`}>
                          <span className="font-mono font-black text-xs text-amber-800 w-[78px] shrink-0 pt-0.5">{x.code}</span>
                          <div className="min-w-0 flex-1 text-xs space-y-0.5">
                            <p className="truncate" title={x.row.job_number}>
                              <span className="font-bold text-[#768994]">Spare copy</span>{" "}
                              <span className="text-slate-500">{x.row.job_number}</span>
                            </p>
                            <p className="text-[11px] text-[#768994] truncate" title={x.kept.job_number}>
                              the book also has {x.kept.job_number}, which says everything this one does
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {!kept && (
                              <button onClick={() => matchWrike([], [x])} disabled={phase === "saving"}
                                className={`${rowBtn} bg-[#1cc1a5] hover:bg-[#17a892] text-white`}>
                                Remove copy
                              </button>
                            )}
                            <KeepButtons kept={kept} onKeep={() => keepCode(x.code)} onUndo={() => unkeepCode(x.code)} />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}

            {newOnes.length === 0 ? (
              <div className="flex-1 flex items-center justify-center py-16 text-center text-[#768994] text-sm px-8">
                {error
                  ? "The check didn't finish. The message above says why."
                  : candidates.length === 0
                  ? "No job folders were found in Wrike. If that can't be right, your Wrike connection may have dropped: reconnect from your profile and try again."
                  : "Nothing new in Wrike. Every job there is already in the Job Book."}
              </div>
            ) : (
              <>
                <div className="px-6 py-2.5 flex items-center gap-3 border-b border-slate-100">
                  <label className="flex items-center gap-2 text-[11px] font-black text-[#768994] cursor-pointer shrink-0">
                    <input type="checkbox" checked={allShownSelected} onChange={toggleAllShown} className="accent-[#1cc1a5]" />
                    Tick all shown
                  </label>
                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#768994]" />
                    <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find a film, client, region or job number…"
                      className="w-full pl-8 pr-3 py-1.5 text-[12px] border border-slate-200 rounded-lg outline-none focus:border-[#1cc1a5]" />
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto">
                  <table className="w-full text-[12px]">
                    <thead className="sticky top-0 bg-slate-50 z-10">
                      <tr className="text-left text-[10px] font-black uppercase tracking-widest text-[#768994]">
                        <th className="px-4 py-2 w-8"></th>
                        <th className="px-2 py-2">Job</th>
                        <th className="px-2 py-2">Film</th>
                        <th className="px-2 py-2">Region</th>
                        <th className="px-2 py-2">Client</th>
                        <th className="px-2 py-2">Description</th>
                        {anyDates && <th className="px-2 py-2">Created</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {shown.map((c) => (
                        <tr key={c.code} className="border-b border-slate-50 hover:bg-slate-50/60 cursor-pointer" onClick={() => toggle(c.code)}>
                          <td className="px-4 py-2 align-top">
                            <input type="checkbox" checked={!!selected[c.code]} onChange={() => toggle(c.code)}
                              aria-label={`Add ${c.code}`} className="accent-[#1cc1a5]" onClick={(e) => e.stopPropagation()} />
                          </td>
                          {/* Where the folder sits in Wrike: it tells a house job
                              from one filed outside any studio when the film or
                              client came out blank. */}
                          <td className="px-2 py-2 font-black font-mono text-[#0f766e] align-top">
                            {c.code}
                            {c.folderPath && (
                              <div className="font-sans font-medium text-[10px] text-slate-400 truncate max-w-[280px]" title={c.folderPath}>
                                {c.folderPath}
                              </div>
                            )}
                          </td>
                          <td className="px-2 py-2 font-bold text-[#122027] truncate max-w-[260px] align-top" title={c.jobNumber}>
                            {c.filmTitle || <span className="font-medium text-slate-400">{c.ancestryTruncated ? "couldn't work it out" : "—"}</span>}
                          </td>
                          <td className="px-2 py-2 align-top">
                            {c.region
                              ? <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-[#1cc1a5]/15 text-[#0f766e]">{c.region}</span>
                              : <span className="text-slate-400">—</span>}
                          </td>
                          <td className="px-2 py-2 text-slate-600 align-top">{c.client || <span className="text-slate-400">—</span>}</td>
                          <td className="px-2 py-2 text-slate-500 truncate max-w-[320px] align-top" title={c.projectDescription}>{c.projectDescription || "—"}</td>
                          {anyDates && <td className="px-2 py-2 text-slate-400 whitespace-nowrap tabular-nums align-top">{c.createdDate || "—"}</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="px-6 py-3 border-t border-slate-100 flex items-center justify-between gap-4">
                  <p className="text-[11px] text-[#768994] font-medium min-w-0">
                    Nothing already in the Job Book is changed.
                    {newFilms.length > 0 && (
                      <span title={newFilms.map((f) => f.title).join(", ")}>
                        {" "}Also adds {plural(newFilms.length, "film")} to the Films list: {newFilms.slice(0, 3).map((f) => f.title).join(", ")}{newFilms.length > 3 ? ` and ${newFilms.length - 3} more` : ""}.
                      </span>
                    )}
                  </p>
                  <button onClick={addJobs} disabled={chosen.length === 0 || phase === "saving"}
                    className="shrink-0 flex items-center gap-1.5 px-5 py-2 bg-[#1cc1a5] hover:bg-[#17a892] disabled:bg-slate-200 disabled:text-slate-400 text-white text-sm font-bold rounded-xl transition-[background-color] ease-[cubic-bezier(0.16,1,0.3,1)]">
                    {phase === "saving" ? <><RefreshCw className="w-4 h-4 animate-spin" /> Saving…</> : <><Plus className="w-4 h-4" /> Add {plural(chosen.length, "job")} to the Job Book</>}
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
