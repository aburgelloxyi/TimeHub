import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Check, ExternalLink, FolderOpen, Loader2, RefreshCw, Send } from "lucide-react";
import SectionBand from "./SectionBand";
import Notice, { noticeButton } from "./Notice";
import { googleMessage } from "./GoogleSource";
import { connectGoogle, connectGoogleForWriting, googleCanWrite, googleConnected, onGoogleChange } from "../../lib/orderForms/googleApi";
import { UPLOAD_SHEETS } from "../../lib/orderForms/enterpriseUploads";
import { createUploadTasks, readUploadsSheet, uploadFields, writeJobNumbers } from "../../lib/orderForms/wrikeUploads";
import { UPLOADS } from "../../lib/orderForms/sections";

// A film's Enterprise Uploads: its rows in the studio's uploads sheet, as the
// plain tasks they become in its Enterprise_Daily_Uploads folder. Each row says whether it's
// there already. The Worker makes the ready ones every half hour
// (worker/uploadsSweep.js); "Create" does it now, then puts the job number in
// the sheet, as the sweep does.

const LOOK = UPLOADS;
// The dark themes repaint bg-white and bg-slate-100 (Timesheeter.css), so the band's white button is written as
// #ffffff to stay white, and the chips are a tint, which shows on Light's white, Dark's slate and OLED's black alike.
const GRADIENT = `linear-gradient(120deg, ${LOOK.fillFrom}, ${LOOK.fillTo})`;

const dayLabel = (iso) =>
  iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }) : "";

const wrikeMessage = (err) =>
  /\(401\)|not_connected/.test(err?.message || "") ? "Connect Wrike in Profile first." : "Wrike couldn't be reached. Try again in a moment.";

function Row({ upload, fields, index }) {
  const { state } = upload;
  const facts = [
    upload.marketDeadline && ["Market deadline", dayLabel(upload.marketDeadline) || upload.marketDeadline],
    upload.market && ["Market", upload.market],
    upload.department && ["Department", upload.department],
    upload.reporting && ["Reporting", upload.reporting],
    upload.quote && ["Quote", upload.quote],
  ].filter(Boolean);
  const refused = state === "ready" && fields ? uploadFields(upload, fields).refused : [];
  return (
    <li className="list-row-in flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3" style={{ "--i": Math.min(index, 10) }}>
      <span className="w-8 shrink-0 text-right font-mono text-[11px] font-bold tabular-nums text-[#768994]" title="The sheet's row">{upload.row}</span>
      <div className="min-w-0 flex-1 basis-72">
        <p className={`break-all font-mono text-sm font-bold ${state === "blocked" ? "text-[#768994]" : "text-[#122027]"}`}>{upload.name}</p>
        {(facts.length > 0 || upload.reason || refused.length > 0) && (
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {facts.map(([label, value]) => (
              <span key={label} title={label} className="rounded-full bg-slate-500/10 px-2 py-0.5 text-[11px] font-semibold text-[#46606b]">{value}</span>
            ))}
            {upload.reason && <span className={`text-[11px] font-semibold ${state === "blocked" ? "text-rose-600" : "text-[#768994]"}`}>{upload.reason}</span>}
            {refused.map((r) => <span key={r} className="text-[11px] font-semibold text-[#768994]">{r}, so it's left empty.</span>)}
          </div>
        )}
      </div>
      <span className="w-28 shrink-0 text-right text-xs font-bold tabular-nums text-[#122027]">{dayLabel(upload.date) || <span className="text-[#768994]">No date</span>}</span>
      <span className="flex w-28 shrink-0 justify-end">
        {state === "in-wrike" ? (
          upload.task?.permalink ? (
            <a href={upload.task.permalink} target="_blank" rel="noopener noreferrer" className="group flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-bold text-emerald-700 transition-colors hover:bg-emerald-500/20">
              <Check className="h-3 w-3" strokeWidth={3} /> In Wrike
              <ArrowUpRight className="h-3 w-3 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </a>
          ) : (
            <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-bold text-emerald-700"><Check className="h-3 w-3" strokeWidth={3} /> In Wrike</span>
          )
        ) : state === "ready" ? (
          <span className="rounded-full px-2.5 py-1 text-[11px] font-bold text-white shadow-sm" style={{ backgroundImage: GRADIENT }}>Ready</span>
        ) : (
          <span className="rounded-full bg-rose-500/10 px-2.5 py-1 text-[11px] font-bold text-rose-700">Can't place</span>
        )}
      </span>
    </li>
  );
}

function Side({ group, permalink, fields, index, onCreate, busy }) {
  const ready = group.uploads.filter((u) => u.state === "ready");
  const place = group.uploads.find((u) => u.place)?.place;
  return (
    <section className="list-row-in overflow-hidden rounded-2xl border border-[#dce4ec] bg-white shadow-sm" style={{ "--i": Math.min(index, 8) }}>
      <header className="flex flex-wrap items-center gap-4 border-b border-[#dce4ec] px-4 py-3">
        <div className="mr-auto min-w-0">
          <p className="font-display text-xl font-bold tracking-tight text-[#122027]">{group.title}</p>
      {place ? (
            <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-[#768994]">
              <span className="rounded-full px-2 py-0.5 text-[11px] font-bold text-white" style={{ backgroundImage: GRADIENT }}>{place.jobCode || "No job number"}</span>
              {permalink
                ? <a href={permalink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 font-mono font-semibold hover:text-[#122027]"><FolderOpen className="h-3.5 w-3.5" />{place.folder.title}</a>
                : <span className="flex items-center gap-1 font-mono font-semibold"><FolderOpen className="h-3.5 w-3.5" />{place.folder.title}</span>}
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-[#768994]">These rows can't be placed yet.</p>
          )}
        </div>
        {ready.length > 0 && (
          <button
            type="button"
            onClick={() => onCreate(ready)}
            disabled={busy}
            className="group press flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold text-white shadow-sm disabled:opacity-50"
            style={{ backgroundImage: GRADIENT }}
          >
            <Send className="h-3.5 w-3.5 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            Create {ready.length} {ready.length === 1 ? "task" : "tasks"}
          </button>
        )}
      </header>
      <ul className="divide-y divide-[#dce4ec]">
        {group.uploads.map((u, i) => <Row key={u.row} upload={u} fields={fields} index={i} />)}
      </ul>
    </section>
  );
}

export default function EnterpriseUploads({ studioId, film, codes }) {
  const sheet = UPLOAD_SHEETS[studioId];
  const [state, setState] = useState({ loading: true });
  const [making, setMaking] = useState(null); // { done, total }
  const [result, setResult] = useState(null);
  const [connected, setConnected] = useState(googleConnected);
  useEffect(() => onGoogleChange(() => setConnected(googleConnected())), []);

  const read = useCallback(async () => {
    if (!sheet || !googleConnected()) { setState({ loading: false }); return; }
    setState((s) => ({ ...s, loading: true, error: "" }));
    try {
      const got = await readUploadsSheet(sheet.id, codes, film);
      setState(got.ok ? { loading: false, ...got, at: Date.now() } : { loading: false, error: got.reason });
    } catch (err) {
      setState({ loading: false, error: err?.reason ? googleMessage(err) : wrikeMessage(err) });
    }
  }, [sheet, codes, film]);
  useEffect(() => { read(); }, [read, connected]);

  const uploads = useMemo(() => state.uploads || [], [state.uploads]);
  // The rows that have a folder, under it, and any that don't, apart, saying why.
  const groups = useMemo(() => [
    { key: "placed", title: "Enterprise Uploads", uploads: uploads.filter((u) => u.place) },
    { key: "unplaced", title: "Not placed", uploads: uploads.filter((u) => !u.place) },
  ].filter((g) => g.uploads.length), [uploads]);
  const count = (s) => uploads.filter((u) => u.state === s).length;
  const ready = uploads.filter((u) => u.state === "ready");

  const create = async (list) => {
    setMaking({ done: 0, total: list.length });
    setResult(null);
    try {
      const done = await createUploadTasks(list, { status: state.status, fields: state.fields, onProgress: (n, total) => setMaking({ done: n, total }) });
      const wrote = await writeJobNumbers(sheet.id, state).catch(() => ({ failed: true }));
      setResult({ ...done, wrote });
    } catch (err) {
      setResult({ made: [], failed: list.map((u) => ({ row: u.row, name: u.name, reason: wrikeMessage(err) })) });
    }
    setMaking(null);
    read();
  };

  if (!sheet) return null;
  const sheetUrl = `https://docs.google.com/spreadsheets/d/${sheet.id}/edit`;

  return (
    <div className="space-y-4">
      <SectionBand
        look={LOOK}
        eyebrow={`${film} · ${sheet.label}`}
        count={state.uploads ? ready.length : "–"}
        title="Ready for Wrike"
        unit={state.uploads ? `of ${uploads.length} ${uploads.length === 1 ? "upload" : "uploads"} in the AMs' sheet` : "Reading the sheet"}
        facts={state.uploads ? [`${count("in-wrike")} in Wrike`, ...(count("blocked") ? [`${count("blocked")} can't be placed`] : [])] : []}
        fileName="Ready rows go into Wrike by themselves every half hour"
        loadedAt={state.at}
      >
        <div className="flex flex-wrap items-center gap-2">
          {ready.length > 0 && (
            <button
              type="button"
              onClick={() => create(ready)}
              disabled={!!making || state.loading}
              className="group press flex items-center gap-2 rounded-xl bg-[#ffffff] px-4 py-2 text-sm font-bold text-[#4c1d95] shadow-md transition-shadow hover:shadow-lg disabled:opacity-60"
            >
              {making ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />}
              {making ? `Making ${Math.min(making.done + 1, making.total)} of ${making.total}…` : `Create ${ready.length} ${ready.length === 1 ? "task" : "tasks"} in Wrike`}
            </button>
          )}
          <a href={sheetUrl} target="_blank" rel="noopener noreferrer" className="press flex items-center gap-1.5 rounded-xl bg-white/15 px-3 py-2 text-xs font-bold ring-1 ring-white/25 transition-colors hover:bg-white/25">
            <ExternalLink className="h-3.5 w-3.5" /> Open the sheet
          </a>
          <button type="button" onClick={read} disabled={state.loading || !!making} className="press flex items-center gap-1.5 rounded-xl bg-white/15 px-3 py-2 text-xs font-bold ring-1 ring-white/25 transition-colors hover:bg-white/25 disabled:opacity-60">
            <RefreshCw className={`h-3.5 w-3.5 ${state.loading ? "animate-spin" : ""}`} /> Read again
          </button>
        </div>
      </SectionBand>

      {!connected && (
        <Notice tone="info" title="Connect Google to read the sheet" actions={<button type="button" onClick={() => connectGoogle().catch(() => {})} className={noticeButton}>Connect Google</button>}>
          The uploads are read straight from the AMs' sheet.
        </Notice>
      )}
      {state.error && <Notice title="The uploads couldn't be read">{state.error}</Notice>}

      {result && (
        <Notice
          tone={result.failed.length ? "warn" : "info"}
          icon={result.failed.length ? undefined : Check}
          title={`${result.made.length} ${result.made.length === 1 ? "task" : "tasks"} made in Wrike${result.failed.length ? `, ${result.failed.length} refused` : ""}`}
          actions={result.wrote === null && state.columns?.jobNumber != null && !googleCanWrite()
            ? <button type="button" onClick={() => connectGoogleForWriting().catch(() => {})} className={noticeButton}>Allow editing sheets</button>
            : null}
        >
          {result.failed.map((f) => <span key={f.row} className="block">Row {f.row}, {f.name}: {f.reason}</span>)}
          {result.wrote?.written > 0 && <span className="block">Job numbers written to {result.wrote.written} {result.wrote.written === 1 ? "row" : "rows"} of the sheet.</span>}
          {result.wrote?.skipped > 0 && <span className="block">{result.wrote.skipped} {result.wrote.skipped === 1 ? "row was" : "rows were"} edited meanwhile, so their job number was left alone.</span>}
          {result.wrote?.failed && <span className="block">The job numbers couldn't be written to the sheet.</span>}
          {result.wrote === null && state.columns?.jobNumber != null && !googleCanWrite() && <span className="block">Job numbers weren't written to the sheet: Google hasn't been allowed to edit sheets yet.</span>}
        </Notice>
      )}

      {state.loading && !state.uploads && connected && (
        <p className="flex items-center gap-2 px-1 py-6 text-sm text-[#768994]"><Loader2 className="h-4 w-4 animate-spin" /> Reading the sheet, then looking for {film}'s folders in Wrike…</p>
      )}

      {state.uploads && uploads.length === 0 && (
        <Notice tone="info" icon={Check} title={`The sheet has no uploads for ${film} yet`}>Rows added to the sheet, named with the film's code, show here when it's read again.</Notice>
      )}

      {groups.map((g, i) => (
        <Side
          key={g.key}
          group={g}
          permalink={state.permalinks?.[g.uploads.find((u) => u.place)?.place.folder.id]}
          fields={state.fields}
          index={i}
          onCreate={create}
          busy={!!making || state.loading}
        />
      ))}
    </div>
  );
}
