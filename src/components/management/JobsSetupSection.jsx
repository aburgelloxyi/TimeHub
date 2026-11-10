// Jobs setup: pick a film, see the jobs it has in the Job Book and in Wrike,
// add new ones from its studio's standard list, and send them to Wrike.
// Also used by the PMs' Job Book page and the Films page's per-film dialog.
//
// Part of Administration. Split out of components/Management.jsx, which is
// still the entry point and re-exports what other screens import.
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Plus, X, Search, RefreshCw, AlertTriangle, ArrowLeft, CheckCircle2, ChevronRight, Folder, FolderOpen, FolderPlus, Loader2, Pencil, UploadCloud, Copy, Trash2 } from "lucide-react";
import { supabase, selectAll } from "../../lib/supabaseClient";
import { confirmAction } from "../../lib/confirm";
import { notify } from "../../lib/toast";
import { fetchAllFolders, buildFilmView, discoverItemPriceField, fetchFolderItemPrice, slotSuffix, studioFolderNaming } from "../../lib/wrikeCampaign";
import { studioNameOf } from "../../lib/studios";
import { plainWrikeError } from "../../lib/wrikeErrors";
import { codeFor, countByType, filmJobRows, templateJobTypes } from "../../lib/jobSetup";
import { PRINT_DIGITAL, buildJobLabel } from "../../lib/jobBook";
import { isoToday } from "../../utils/dates";
import { tokenMatch } from "../../utils/search";
import DateField from "../shared/DateField";
import { FILM_GROUP_ORDER, STUDIO_OPTIONS } from "./constants";
import { ComboField, FieldLabel, MODAL_INPUT } from "./fields";
import { FilmPicker } from "./FilmPicker";
import { FilmSyncModal } from "./FilmSyncModal";
import { JobForm, JobModal, nextJobCode } from "./JobForm";
import { PushToWrikeModal } from "./PushToWrikeModal";

// The folder colour for a job's state, matching the job folders in Wrike.
const FOLDER_TONE = {
  "in-wrike": "text-[#1cc1a5]", "wrike-only": "text-[#1cc1a5]",
  "not-sent": "text-[#f4b740]", "book-only": "text-[#b0bec5]",
  "folder-gone": "text-rose-400", "folder-renamed": "text-rose-400",
};

// How each state of a film's job reads to a PM.
const STATE = {
  "in-wrike":       { text: "In Wrike",                     tone: "bg-[#1cc1a5]/15 text-[#0f766e]" },
  "not-sent":       { text: "Not in Wrike yet",             tone: "bg-amber-100 text-amber-800" },
  "book-only":      { text: "Job Book only",                tone: "bg-slate-100 text-slate-600" },
  "wrike-only":     { text: "In Wrike, not in the Job Book", tone: "bg-amber-100 text-amber-800" },
  "folder-gone":    { text: "Its Wrike folder is gone",     tone: "bg-rose-100 text-rose-700" },
  "folder-renamed": { text: "Its Wrike folder was renamed", tone: "bg-rose-100 text-rose-700" },
};
const CANCELLED_NOTE = "Cancelled in Jobs setup";
const isCancelled = (job) => job?.status === "Closed" && String(job?.notes || "").startsWith(CANCELLED_NOTE);

const panel = "border border-[#dce4ec] rounded-2xl flex flex-col min-h-0";
const panelHead = "flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 border-b border-[#f0f4f8]";
const linkBtn = "press flex items-center gap-1 text-[11px] font-bold text-[#0f766e] hover:underline disabled:opacity-50 disabled:no-underline";
const solidBtn = "press bg-[#1cc1a5] hover:bg-[#17a892] text-white font-bold";
const iconBtn = "press p-1.5 rounded-lg text-slate-400 disabled:opacity-40";
const cellInput = "w-full border border-[#dce4ec] rounded-lg px-2.5 py-1.5 text-xs text-[#122027] bg-white outline-none focus:border-[#1cc1a5]";

// Exported: also rendered inside the PMs' standalone Job Book page (JobBook.jsx).
// initialFilm + lockPickers render it against one already-chosen film (the Films
// page's dialog), so that dialog gets the real thing rather than a copy.
export function JobsSetupSection({ setActiveTab, initialFilm, lockPickers = false }) {
  const [tab, setTab] = useState("film");
  const [filmTitle, setFilmTitle] = useState(initialFilm || "");
  const film = filmTitle.trim();
  const connected = !!localStorage.getItem("wrike_user_id");

  // ── Lists the forms pick from ────────────────────────────────────────────────
  const [films, setFilms] = useState([]);
  const [filmsLoading, setFilmsLoading] = useState(true);
  const [filmList, setFilmList] = useState([]); // { title, studio, lastTouched }
  const [clients, setClients] = useState([]);
  const [workCategories, setWorkCategories] = useState([]);
  const [descs, setDescs] = useState([]);
  const [showFilmSync, setShowFilmSync] = useState(false);

  // lastTouched is the film's most recently changed job; the picker leads with
  // those. selectAll: a plain read stops at 1000 rows without saying so, and
  // "most recent" would then be decided by an arbitrary part of the book.
  const loadFilms = useCallback(() => {
    Promise.all([
      supabase.from("films").select("title, studio").order("title"),
      selectAll("jobs", "film_title, updated_at"),
    ]).then(([filmRes, jobRows]) => {
      const rows = filmRes.data || [];
      const latest = new Map();
      (jobRows || []).forEach((j) => {
        if (!j.film_title) return;
        const ts = new Date(j.updated_at || 0).getTime();
        if (ts > (latest.get(j.film_title) || 0)) latest.set(j.film_title, ts);
      });
      setFilmList(rows.map((f) => ({ title: f.title, studio: f.studio || null, lastTouched: latest.get(f.title) || 0 })));
      setFilms(rows.map((f) => f.title));
      setFilmsLoading(false);
    });
  }, []);

  useEffect(() => {
    loadFilms();
    supabase.from("clients").select("name").order("name").then(({ data }) => setClients((data || []).map((c) => c.name)));
    supabase.from("job_work_categories").select("name").order("name").then(({ data }) => setWorkCategories((data || []).map((c) => c.name)));
    supabase.from("project_descriptions").select("description").order("description").then(({ data }) => setDescs((data || []).map((d) => d.description)));
  }, [loadFilms]);

  // ── Wrike's folders, read once and again on request ─────────────────────────
  // Read from Wrike itself rather than the saved copy: this page ends in a write
  // to Wrike, and the read takes about a second.
  const [folders, setFolders] = useState({ byId: null, loading: false, error: null });
  const loadFolders = useCallback(async () => {
    setFolders((f) => ({ ...f, loading: true, error: null }));
    try {
      setFolders({ byId: await fetchAllFolders(), loading: false, error: null });
    } catch (e) {
      setFolders((f) => ({ ...f, loading: false, error: plainWrikeError(e) }));
    }
  }, []);
  useEffect(() => { if (connected) loadFolders(); }, [connected, loadFolders]);

  // A film shared into several studio folders: which one is on screen. null is
  // the base studio. A new film has its own set, so the choice doesn't carry.
  const [territoryId, setTerritoryId] = useState(null);
  useEffect(() => { setTerritoryId(null); }, [film]);

  const filmView = useMemo(
    () => (folders.byId && film ? buildFilmView(folders.byId, film, territoryId) : null),
    [folders.byId, film, territoryId]
  );
  // The studio folder the film sits in ("Universal UK") and the studio it
  // belongs to ("Universal"). Wrike says where the film is; the Films list is
  // the fallback for a film Wrike doesn't have yet.
  const studioFolderTitle = filmView?.studio || null;
  const studioName = studioNameOf(studioFolderTitle) || filmList.find((f) => f.title === film)?.studio || null;
  // Only studios whose template Push has been run against.
  const templateStudio = STUDIO_OPTIONS.includes(studioName) ? studioName : null;
  const template = useMemo(
    () => (folders.byId && templateStudio ? templateJobTypes(folders.byId, templateStudio) : null),
    [folders.byId, templateStudio]
  );
  const naming = useMemo(() => studioFolderNaming(studioFolderTitle || studioName || ""), [studioFolderTitle, studioName]);
  // The scan's name for this studio's client, in the Clients list's own spelling;
  // blank when the list has no such client, so a made-up name is never filed.
  const defaultClient = useMemo(
    () => clients.find((c) => c.toLowerCase() === naming.client.toLowerCase()) || "",
    [clients, naming]
  );

  // ── The film's jobs, from the Job Book and from Wrike ───────────────────────
  const [filmJobs, setFilmJobs] = useState([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const loadFilmJobs = useCallback(async (title) => {
    if (!title) { setFilmJobs([]); return; }
    setJobsLoading(true);
    const { data, error } = await supabase.from("jobs").select("*").eq("film_title", title);
    if (error) notify("Couldn't read this film's jobs: " + error.message, "error");
    setFilmJobs(data || []);
    setJobsLoading(false);
  }, []);
  useEffect(() => { loadFilmJobs(film); }, [film, loadFilmJobs]);

  const rows = useMemo(() => filmJobRows(filmJobs, filmView?.tree || null), [filmJobs, filmView]);
  const haveByType = useMemo(() => countByType(rows, filmView?.tree || null), [rows, filmView]);
  const notSent = rows.filter((r) => r.state === "not-sent" && !isCancelled(r.job)).map((r) => r.job);
  const sentFromHere = rows.filter((r) => r.state === "in-wrike" && r.job?.template_slot && !isCancelled(r.job)).map((r) => r.job);
  const wrikeOnly = rows.filter((r) => r.state === "wrike-only").length;
  const [madeIds, setMadeIds] = useState(() => new Set()); // made in this visit, marked "New"

  // ── Choosing what to add ────────────────────────────────────────────────────
  // One pick per job to make. The same kind can be picked twice: two launches
  // off one template folder are two jobs.
  const [picks, setPicks] = useState([]); // { key, typeId, label, description, medium, cost }
  const [shared, setShared] = useState({ client: "", start_date: isoToday(), office: "LDN", ordered_by: "", billed_to: "" });
  const [typeQuery, setTypeQuery] = useState("");
  const [closedGroups, setClosedGroups] = useState(() => new Set());
  const toggleGroup = (name) => setClosedGroups((prev) => {
    const next = new Set(prev);
    next.has(name) ? next.delete(name) : next.add(name);
    return next;
  });
  const [creating, setCreating] = useState(false);
  const pickSeq = useRef(0);
  const priceField = useRef(undefined); // undefined: not looked up. null: can't be seen.
  const newJobsRef = useRef(null);

  // A different film or studio folder is a different client and a fresh list.
  useEffect(() => {
    setPicks([]);
    setShared((s) => ({ ...s, client: defaultClient }));
  }, [film, studioFolderTitle, defaultClient]);

  const updatePick = (key, patch) => setPicks((p) => p.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  const newPick = (type) => ({
    key: ++pickSeq.current, typeId: type.id, label: type.label,
    description: naming.describe(type.description), medium: type.medium || "Digital", cost: "",
  });
  const toggleType = (type) => {
    if (picks.some((p) => p.typeId === type.id)) { setPicks((p) => p.filter((x) => x.typeId !== type.id)); return; }
    const pick = newPick(type);
    setPicks((p) => [...p, pick]);
    // The template folder's Item Price in Wrike is the job's usual fixed cost.
    // Only project managers can see that field, and many folders carry none;
    // either way the cost is just left for the PM to type.
    (async () => {
      if (priceField.current === undefined) priceField.current = await discoverItemPriceField().catch(() => null);
      if (!priceField.current) return;
      const price = await fetchFolderItemPrice(type.id, priceField.current.id);
      if (price != null) setPicks((p) => p.map((x) => (x.key === pick.key && x.cost === "" ? { ...x, cost: String(price) } : x)));
    })();
  };

  const types = template?.types || [];
  const shownTypes = types.filter((t) => tokenMatch(typeQuery, t.description, t.group));
  const groups = useMemo(() => {
    const out = [];
    shownTypes.forEach((t) => {
      const last = out[out.length - 1];
      if (last && last.name === t.group) last.types.push(t); else out.push({ name: t.group, types: [t] });
    });
    return out;
  }, [shownTypes]);

  const canCreate = picks.length > 0 && !!film && !!shared.client && !!shared.start_date
    && picks.every((p) => p.description.trim()) && !creating;

  // One Job Book row per pick, numbered in a run from the next free number. If
  // someone takes a number while this runs the insert is refused, and that job
  // is given the next free one instead.
  const createJobs = async () => {
    if (!canCreate) return;
    setCreating(true);
    const made = [];
    const failed = [];
    let n = parseInt((await nextJobCode()).slice(2), 10);
    for (const p of picks) {
      for (let attempt = 0; ; attempt++) {
        const description = p.description.trim();
        const { data, error } = await supabase.from("jobs").insert({
          job_number: buildJobLabel({ film, code: codeFor(n), description }),
          film_title: film,
          client: shared.client,
          project_description: description,
          print_digital: p.medium,
          office: shared.office,
          start_date: shared.start_date,
          ordered_by: shared.ordered_by.trim() || null,
          billed_to: shared.billed_to.trim() || null,
          fixed_cost: p.cost === "" ? null : parseFloat(p.cost),
          status: "Active",
          template_slot: p.label,
        }).select().single();
        if (!error) { made.push(data); n += 1; break; }
        if (error.code === "23505" && attempt < 3) { n = parseInt((await nextJobCode()).slice(2), 10); continue; }
        failed.push(`${description}: ${error.message}`);
        break;
      }
    }
    setCreating(false);
    if (failed.length) notify(`${failed.length} job${failed.length === 1 ? "" : "s"} couldn't be made. ${failed[0]}`, "error");
    if (!made.length) return;
    setMadeIds((prev) => new Set([...prev, ...made.map((j) => j.id)]));
    setPicks([]);
    await loadFilmJobs(film);
    // Made and sent are one action for the PM: the confirmation follows at once,
    // so a job doesn't sit in the book unsent because a second button was missed.
    // If it's closed, the jobs stay listed as "Not in Wrike yet" with the button.
    if (connected) setPush({ mode: "push", jobs: made });
    else notify(`${made.length} job${made.length === 1 ? "" : "s"} made. Connect Wrike from your profile to send ${made.length === 1 ? "it" : "them"} there.`, "success");
  };

  // ── Sending, editing, taking back ───────────────────────────────────────────
  const [push, setPush] = useState(null); // { mode: "push" | "retag", jobs }
  const [editJob, setEditJob] = useState(null);
  const [editSaving, setEditSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const closePush = (wrote) => {
    setPush(null);
    loadFilmJobs(film);
    if (wrote) loadFolders();
  };

  const saveEdit = async (form) => {
    if (!editJob?.id) return;
    setEditSaving(true);
    const { error } = await supabase.from("jobs").update({
      ...form,
      start_date: form.start_date || null,
      completed_date: form.completed_date || null,
      fixed_cost: form.fixed_cost === "" ? null : parseFloat(form.fixed_cost),
      third_party_cost: form.third_party_cost === "" ? null : parseFloat(form.third_party_cost),
      estimated_cost: form.estimated_cost === "" ? null : parseFloat(form.estimated_cost),
    }).eq("id", editJob.id);
    setEditSaving(false);
    if (error) { notify("Couldn't save: " + error.message, "error"); return; }
    setEditJob(null);
    loadFilmJobs(film);
  };

  // Nothing in Wrike carries this job's number (never sent, or its folder is
  // gone or renamed off it), so the row can go and the number is free again.
  const removeJob = async (job) => {
    const ok = await confirmAction({
      title: "Remove this job?",
      message: `“${job.job_number}” will be taken out of the Job Book. Nothing in Wrike carries its number, so the number becomes free again.`,
      confirmLabel: "Remove job",
      danger: true,
    });
    if (!ok) return;
    setBusyId(job.id);
    const { error } = await supabase.from("jobs").delete().eq("id", job.id);
    setBusyId(null);
    if (error) { notify("Couldn't remove it: " + error.message, "error"); return; }
    loadFilmJobs(film);
  };

  // Its Wrike folder still carries the number, so the row stays, closed, and the
  // number can't be given to another job. Wrike itself isn't touched.
  const cancelJob = async (job) => {
    const ok = await confirmAction({
      title: "Cancel this job?",
      message: `“${job.job_number}” will be closed and marked cancelled. Its number stays reserved, because its folder in Wrike still carries it. Rename or delete that folder in Wrike yourself if it's no longer wanted.`,
      confirmLabel: "Cancel job",
      danger: true,
    });
    if (!ok) return;
    setBusyId(job.id);
    const { error } = await supabase.from("jobs").update({
      status: "Closed",
      job_done: true,
      completed_date: isoToday(),
      notes: `${CANCELLED_NOTE} on ${isoToday()}.${job.notes ? ` ${job.notes}` : ""}`,
    }).eq("id", job.id);
    setBusyId(null);
    if (error) { notify("Couldn't cancel it: " + error.message, "error"); return; }
    loadFilmJobs(film);
  };

  // ── A one-off job ───────────────────────────────────────────────────────────
  const [singleSaving, setSingleSaving] = useState(false);
  const [singleMade, setSingleMade] = useState(null);
  const createSingle = async (form) => {
    setSingleSaving(true);
    const { error } = await supabase.from("jobs").insert({
      ...form,
      start_date: form.start_date || null,
      completed_date: form.completed_date || null,
      fixed_cost: form.fixed_cost === "" ? null : parseFloat(form.fixed_cost),
      third_party_cost: form.third_party_cost === "" ? null : parseFloat(form.third_party_cost),
      estimated_cost: form.estimated_cost === "" ? null : parseFloat(form.estimated_cost),
    });
    setSingleSaving(false);
    if (error) {
      notify(error.code === "23505"
        ? `Job number “${form.job_number}” is already in the Job Book.`
        : "Couldn't make the job: " + error.message, "error");
      return;
    }
    setSingleMade(form.job_number);
    if (form.film_title === film) loadFilmJobs(film);
  };

  const goToFilms = () => { window.location.hash = "management/films"; };

  // Why there's nothing to pick from, when there isn't.
  const noTypesReason = !connected
    ? "Connect Wrike from your profile to see the kinds of job this film's studio uses."
    : !folders.byId
    ? (folders.error ? "The kinds of job come from Wrike, which couldn't be read just now." : null)
    : !studioName
    ? "TimeHub can't tell which studio this film belongs to. Set its studio on the Films page, or add its jobs one at a time."
    : !templateStudio
    ? `${studioName} doesn't have a standard list of jobs set up here yet, so add this film's jobs one at a time.`
    : !template
    ? `Wrike has no ${templateStudio} template folder to read the list from.`
    : null;

  return (
    <div className="flex flex-col gap-5">
      {tab === "single" && (
        <div className="flex items-center gap-3">
          <button onClick={() => setTab("film")} className={`${linkBtn} text-xs`}>
            <ArrowLeft className="w-3.5 h-3.5" /> {film ? `Back to ${film}` : "Back to a film's jobs"}
          </button>
          <p className="text-sm font-black text-[#122027]">A one-off job</p>
        </div>
      )}

      {tab === "film" && (
        <>
          <div className="flex flex-wrap items-end gap-3">
            {!lockPickers && (
              <div className="flex-1 min-w-[260px] max-w-xl">
                <FilmPicker value={filmTitle} onChange={setFilmTitle} films={filmList} loading={filmsLoading}
                  studioOrder={FILM_GROUP_ORDER} onOpenFilms={goToFilms} />
              </div>
            )}
            <button onClick={() => setTab("single")} title="A job that isn't one of the studio's usual kinds"
              className="press ml-auto flex items-center gap-1.5 px-3.5 py-2.5 bg-white border border-[#dce4ec] hover:border-[#1cc1a5] text-[#122027] text-xs font-bold rounded-xl">
              <Plus className="w-3.5 h-3.5 text-[#1cc1a5]" /> Add a one-off job
            </button>
          </div>
          {!lockPickers && !filmsLoading && films.length === 0 && (
            <p className="text-xs text-[#768994]">
              There are no films yet.{" "}
              <button onClick={() => setShowFilmSync(true)} className="font-bold text-[#0f766e] hover:underline">Bring them in from Wrike</button>{" "}
              or add one on the <button onClick={goToFilms} className="font-bold text-[#0f766e] hover:underline">Films</button> page.
            </p>
          )}

          {!connected && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">
              Wrike isn&rsquo;t connected, so this page can&rsquo;t see a film&rsquo;s folders or send jobs there. Connect it from your profile. You can still add a one-off job.
            </p>
          )}
          {folders.error && (
            <p className="flex flex-wrap items-center gap-2 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-2.5">
              {folders.error}
              <button onClick={loadFolders} className="press font-bold underline underline-offset-2">Try again</button>
            </p>
          )}

          {!film ? (
            <p className="text-sm text-[#768994] py-8 text-center border border-dashed border-[#dce4ec] rounded-2xl">
              Choose a film to see the jobs it has and add new ones.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-[#768994]">
                {folders.loading ? (
                  <span className="flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Reading Wrike…</span>
                ) : filmView ? (
                  <span>In Wrike under <span className="font-bold text-[#122027]">{studioFolderTitle}</span></span>
                ) : connected && folders.byId ? (
                  <span className="text-amber-800">
                    Wrike has no project called &ldquo;{film}&rdquo; yet. Jobs made here are kept in the Job Book and can be sent once the project exists.
                  </span>
                ) : null}
                {/* The same film shared into more than one studio folder. */}
                {filmView?.territories?.length > 1 && (
                  <span className="flex items-center gap-1.5">
                    Also in:
                    {filmView.territories.map((t) => {
                      const on = t.studioFolder.id === filmView.studioFolder?.id;
                      return (
                        <button key={t.studioFolder.id} onClick={() => setTerritoryId(t.studioFolder.id)} aria-pressed={on}
                          className={`press px-2 py-1 rounded-lg border text-[11px] font-bold ${
                            on ? "bg-[#1cc1a5]/10 border-[#1cc1a5]/50 text-[#0f766e]" : "bg-white border-[#dce4ec] text-[#768994] hover:text-[#122027]"
                          }`}>
                          {t.studio}
                        </button>
                      );
                    })}
                  </span>
                )}
                {connected && !folders.loading && (
                  <button onClick={() => { loadFolders(); loadFilmJobs(film); }} className={`${linkBtn} turn-on-hover`}
                    title="Read the folders again, to pick up changes made in Wrike">
                    <RefreshCw className="w-3 h-3" /> Read Wrike again
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 items-start">
                {/* ── What the film has ── */}
                <div className={`${panel} max-h-[60vh]`}>
                  <div className={panelHead}>
                    <p className="text-sm font-black text-[#122027]">
                      This film&rsquo;s jobs <span className="font-bold text-[#768994]">· {rows.length}</span>
                    </p>
                    {jobsLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-[#768994]" />}
                    <span className="ml-auto flex items-center gap-3">
                      {sentFromHere.length > 0 && connected && (
                        <button onClick={() => setPush({ mode: "retag", jobs: sentFromHere })} className={`${linkBtn} turn-on-hover`}
                          title="Tasks added in Wrike since a job was sent don't have its number until this is run">
                          <RefreshCw className="w-3 h-3" /> Update job numbers on new tasks
                        </button>
                      )}
                      {notSent.length > 0 && connected && (
                        <button onClick={() => setPush({ mode: "push", jobs: notSent })}
                          className={`${solidBtn} flex items-center gap-1.5 px-3 py-1.5 text-[11px] rounded-lg`}>
                          <UploadCloud className="w-3.5 h-3.5" /> Send {notSent.length} to Wrike
                        </button>
                      )}
                    </span>
                  </div>
                  {rows.length === 0 ? (
                    <p className="px-4 py-8 text-center text-xs text-[#768994]">
                      {jobsLoading ? "Looking…" : "This film has no jobs yet."}
                    </p>
                  ) : (
                    <ul className="overflow-y-auto divide-y divide-[#f0f4f8]">
                      {rows.map((r) => {
                        const cancelled = isCancelled(r.job);
                        // Without Wrike's folders, only "made here and never sent"
                        // is known for certain; the rest would be a guess.
                        const state = folders.byId || r.state === "not-sent" ? STATE[r.state] : null;
                        const busy = busyId === r.job?.id;
                        return (
                          <li key={r.job?.id || r.code}
                            className={`flex items-center gap-3 px-4 py-2 transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-slate-50 ${r.job && madeIds.has(r.job.id) ? "rise-in" : ""} ${cancelled ? "opacity-60" : ""}`}>
                            <Folder className={`w-3.5 h-3.5 shrink-0 ${cancelled ? "text-[#b0bec5]" : FOLDER_TONE[r.state] || "text-[#b0bec5]"}`} />
                            <span className="font-mono font-black text-xs text-[#0f766e] w-[72px] shrink-0">{r.code || "—"}</span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-xs text-[#122027] truncate" title={r.job?.job_number || r.description}>
                                {r.description || r.job?.job_number || "—"}
                                {r.job && madeIds.has(r.job.id) && <span className="ml-1.5 text-[10px] font-black text-[#0f766e]">New</span>}
                              </span>
                              {r.state === "folder-renamed" && (
                                <span className="block text-[11px] text-rose-700 truncate" title={r.liveLabel}>now called {r.liveLabel}</span>
                              )}
                            </span>
                            {(cancelled || state) && (
                              <span className={`text-[10px] font-black px-2 py-0.5 rounded-full shrink-0 ${cancelled ? "bg-slate-100 text-slate-600" : state.tone}`}>
                                {cancelled ? "Cancelled" : state.text}
                              </span>
                            )}
                            {r.job && (
                              <span className="flex items-center gap-1 shrink-0">
                                <button onClick={() => setEditJob(r.job)} title="Edit this job's details" aria-label={`Edit ${r.code}`}
                                  className={`${iconBtn} hover:text-[#122027] hover:bg-slate-100`}>
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                {!cancelled && r.job.template_slot && (
                                  r.state === "in-wrike" ? (
                                    <button onClick={() => cancelJob(r.job)} disabled={busy} title="Cancel this job. Its number stays reserved." aria-label={`Cancel ${r.code}`}
                                      className={`${iconBtn} hover:text-rose-600 hover:bg-rose-50`}>
                                      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                                    </button>
                                  ) : (
                                    <button onClick={() => removeJob(r.job)} disabled={busy} title="Remove this job from the Job Book" aria-label={`Remove ${r.code}`}
                                      className={`${iconBtn} hover:text-rose-600 hover:bg-rose-50`}>
                                      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                    </button>
                                  )
                                )}
                              </span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {wrikeOnly > 0 && (
                    <p className="px-4 py-2.5 border-t border-[#f0f4f8] text-[11px] text-[#768994]">
                      {wrikeOnly} job{wrikeOnly === 1 ? " is" : "s are"} in Wrike but not in the Job Book.{" "}
                      <button onClick={() => setActiveTab?.("jobs")} className="font-bold text-[#0f766e] hover:underline">
                        Add {wrikeOnly === 1 ? "it" : "them"} from the Job Book page
                      </button>
                    </p>
                  )}
                </div>

                {/* ── What can be added ── */}
                <div className={`${panel} max-h-[60vh]`}>
                  <div className={panelHead}>
                    <p className="text-sm font-black text-[#122027]">
                      Add jobs{templateStudio && types.length > 0 && <span className="font-bold text-[#768994]"> · {templateStudio}&rsquo;s standard list</span>}
                    </p>
                    {types.length > 0 && (
                      <div className="relative ml-auto w-[220px] max-w-full">
                        <Search className="w-3.5 h-3.5 text-[#768994] absolute left-2.5 top-1/2 -translate-y-1/2" />
                        <input value={typeQuery} onChange={(e) => setTypeQuery(e.target.value)} placeholder="Find a kind of job…"
                          className="w-full pl-8 pr-2 py-1.5 text-xs bg-white border border-[#dce4ec] rounded-lg outline-none focus:border-[#1cc1a5]" />
                      </div>
                    )}
                  </div>
                  {folders.loading && !folders.byId ? (
                    <p className="flex items-center justify-center gap-2 px-4 py-8 text-xs text-[#768994]">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Reading the list from Wrike…
                    </p>
                  ) : noTypesReason ? (
                    <div className="px-4 py-8 text-center">
                      <p className="text-xs text-[#768994] max-w-sm mx-auto">{noTypesReason}</p>
                      <button onClick={() => setTab("single")} className="press mt-3 px-4 py-1.5 text-xs font-bold text-[#0f766e] border border-[#1cc1a5]/40 hover:bg-[#1cc1a5]/10 rounded-lg">
                        Add a one-off job
                      </button>
                    </div>
                  ) : groups.length === 0 ? (
                    <p className="px-4 py-8 text-center text-xs text-[#768994]">Nothing in the list matches &ldquo;{typeQuery}&rdquo;.</p>
                  ) : (
                    <div className="overflow-y-auto">
                      {groups.map((g) => {
                        // A search keeps every folder with a match open.
                        const shut = !typeQuery.trim() && closedGroups.has(g.name);
                        const parts = g.name.split(" › ");
                        return (
                        <div key={g.name}>
                          <button type="button" onClick={() => toggleGroup(g.name)} aria-expanded={!shut}
                            className="sticky top-0 z-10 w-full flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 text-left text-[11px] border-b border-[#f0f4f8] transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-slate-100">
                            <ChevronRight className={`w-3 h-3 text-[#768994] shrink-0 transition-transform duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] ${shut ? "" : "rotate-90"}`} />
                            {shut
                              ? <Folder className="w-3.5 h-3.5 text-[#f4b740] shrink-0" />
                              : <FolderOpen className="w-3.5 h-3.5 text-[#f4b740] shrink-0" />}
                            <span className="min-w-0 truncate text-[#768994]">
                              {parts.slice(0, -1).map((x) => `${x} › `).join("")}
                              <span className="font-bold text-[#122027]">{parts[parts.length - 1]}</span>
                            </span>
                            <span className="ml-auto text-[10px] font-bold text-[#768994] shrink-0">{g.types.length}</span>
                          </button>
                          {!shut && g.types.map((t) => {
                            const on = picks.some((p) => p.typeId === t.id);
                            const have = haveByType[slotSuffix(t.label)] || 0;
                            const Icon = on ? FolderPlus : Folder;
                            return (
                              <label key={t.id} className={`flex items-center gap-2.5 pl-9 pr-4 py-1.5 text-xs cursor-pointer transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] ${on ? "bg-[#1cc1a5]/[0.07]" : "hover:bg-slate-50"}`}>
                                <input type="checkbox" checked={on} onChange={() => toggleType(t)} className="accent-[#1cc1a5] w-3.5 h-3.5 shrink-0" />
                                <Icon className={`w-3.5 h-3.5 shrink-0 ${on ? "settle-in text-[#10b981]" : have > 0 ? "text-[#1cc1a5]" : "text-[#12a0e1]"}`} />
                                <span className={`flex-1 min-w-0 truncate font-bold ${on ? "text-[#0d9488]" : "text-[#122027]"}`}>{t.description}</span>
                                {have > 0 && (
                                  <span className="text-[11px] text-[#768994] shrink-0" title="Tick it to make another">
                                    this film has {have}
                                  </span>
                                )}
                              </label>
                            );
                          })}
                        </div>
                        );
                      })}
                    </div>
                  )}
                  {picks.length > 0 && (
                    <div className="rise-in flex items-center gap-3 px-4 py-2.5 border-t border-[#f0f4f8]">
                      <span className="text-xs font-bold text-[#122027] tabular-nums">{picks.length} to add</span>
                      <button onClick={() => newJobsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
                        className={`${solidBtn} ml-auto px-3 py-1.5 text-[11px] rounded-lg`}>
                        Check and create
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* ── The jobs about to be made ── */}
              {picks.length > 0 && (
                <div ref={newJobsRef} className="rise-in border border-[#1cc1a5]/40 rounded-2xl overflow-hidden scroll-mt-4">
                  <div className="flex items-center justify-between gap-3 px-4 py-3 bg-[#1cc1a5]/[0.07] border-b border-[#1cc1a5]/20">
                    <p className="text-sm font-black text-[#122027]">
                      {picks.length} new job{picks.length === 1 ? "" : "s"} for {film}
                    </p>
                    <button onClick={() => setPicks([])} className="text-[11px] font-bold text-[#768994] hover:text-rose-600">Clear</button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4 px-4 pt-4">
                    <div className="xl:col-span-2">
                      <ComboField label="Client" required value={shared.client} onChange={(v) => setShared((s) => ({ ...s, client: v }))}
                        options={clients} placeholder="Find the client…" />
                    </div>
                    <div>
                      <FieldLabel text="Start date" required />
                      <DateField value={shared.start_date} onChange={(v) => setShared((s) => ({ ...s, start_date: v }))} allowClear={false} placeholder="Pick a date…" />
                    </div>
                    <div>
                      <FieldLabel text="Ordered by" />
                      <input value={shared.ordered_by} onChange={(e) => setShared((s) => ({ ...s, ordered_by: e.target.value }))} placeholder="Name" className={MODAL_INPUT} />
                    </div>
                    <div>
                      <FieldLabel text="Billed to" />
                      <input value={shared.billed_to} onChange={(e) => setShared((s) => ({ ...s, billed_to: e.target.value }))} placeholder="Company or name" className={MODAL_INPUT} />
                    </div>
                  </div>
                  <p className="px-4 pt-1.5 text-[11px] text-[#768994]">These apply to every job below. Anything else can be filled in afterwards.</p>

                  <div className="px-4 py-4 overflow-x-auto">
                    <table className="w-full text-xs" style={{ minWidth: 640 }}>
                      <thead>
                        <tr className="text-left text-[10px] font-black uppercase tracking-widest text-[#768994]">
                          <th className="pb-2 pr-3">Description</th>
                          <th className="pb-2 pr-3 w-[170px]">Print or digital</th>
                          <th className="pb-2 pr-3 w-[130px]">Fixed cost</th>
                          <th className="pb-2 w-[70px]"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {picks.map((p) => (
                          <tr key={p.key} className="rise-in">
                            <td className="py-1 pr-3">
                              <input value={p.description} onChange={(e) => updatePick(p.key, { description: e.target.value })}
                                aria-label="Description" className={`${cellInput} ${p.description.trim() ? "" : "border-rose-300"}`} />
                            </td>
                            <td className="py-1 pr-3">
                              <span className="inline-flex border border-[#dce4ec] rounded-lg overflow-hidden">
                                {PRINT_DIGITAL.map((m) => (
                                  <button key={m} type="button" onClick={() => updatePick(p.key, { medium: m })} aria-pressed={p.medium === m}
                                    className={`press px-2.5 py-1.5 text-[11px] font-bold ${p.medium === m ? "bg-[#122027] text-white" : "bg-white text-[#768994] hover:text-[#122027]"}`}>
                                    {m}
                                  </button>
                                ))}
                              </span>
                            </td>
                            <td className="py-1 pr-3">
                              <span className="relative block">
                                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#768994] font-bold">£</span>
                                <input type="number" step="0.01" min="0" value={p.cost} onChange={(e) => updatePick(p.key, { cost: e.target.value })}
                                  placeholder="0.00" aria-label="Fixed cost" className={`${cellInput} pl-6 tabular-nums`} />
                              </span>
                            </td>
                            <td className="py-1">
                              <span className="flex items-center gap-1">
                                <button onClick={() => setPicks((list) => [...list, { ...p, key: ++pickSeq.current }])}
                                  title="Another job of this kind" aria-label="Add another job of this kind"
                                  className={`${iconBtn} hover:text-[#122027] hover:bg-slate-100`}>
                                  <Copy className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={() => setPicks((list) => list.filter((x) => x.key !== p.key))}
                                  title="Leave this one out" aria-label="Leave this job out"
                                  className={`${iconBtn} hover:text-rose-600 hover:bg-rose-50`}>
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-3 px-4 py-3 border-t border-[#dce4ec] bg-slate-50/60">
                    <p className="mr-auto text-[11px] text-[#768994]">
                      {!shared.client ? "Choose a client to carry on."
                        : !picks.every((p) => p.description.trim()) ? "Every job needs a description."
                        : `Each gets the next free job number. ${filmView ? "You then confirm what goes to Wrike." : "They can be sent to Wrike once the film has a project there."}`}
                    </p>
                    <button onClick={createJobs} disabled={!canCreate}
                      className={`${solidBtn} flex items-center gap-2 px-6 py-2.5 disabled:opacity-40 text-sm rounded-xl`}>
                      {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                      Create {picks.length} job{picks.length === 1 ? "" : "s"}
                    </button>
                  </div>
                </div>
              )}

              {rows.some((r) => r.state === "folder-gone" || r.state === "folder-renamed") && (
                <p className="flex items-start gap-2 text-xs text-amber-800">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />
                  A job marked in red no longer has its folder in Wrike. Send it again to give it a fresh folder, or remove it if it&rsquo;s no longer wanted.
                </p>
              )}
            </>
          )}
        </>
      )}

      {tab === "single" && (
        singleMade == null ? (
          <JobForm job={film ? { film_title: film } : undefined}
            clients={clients} films={films} workCategories={workCategories} descs={descs}
            onSave={createSingle} saving={singleSaving} submitLabel="Create job" layout="inline" />
        ) : (
          <div className="rise-in flex flex-wrap items-center gap-3 py-4">
            <span className="flex items-center gap-2 px-4 py-2.5 bg-[#1cc1a5]/10 text-[#0f766e] text-sm font-bold rounded-2xl">
              <CheckCircle2 className="settle-in w-4 h-4" /> {singleMade} is in the Job Book
            </span>
            <button onClick={() => setActiveTab?.("jobs")}
              className="press px-4 py-2.5 bg-[#122027] hover:bg-[#1a2e38] text-white text-sm font-bold rounded-xl">
              See it in the Job Book
            </button>
            <button onClick={() => setSingleMade(null)}
              className="press px-4 py-2.5 bg-white border border-[#dce4ec] hover:border-[#1cc1a5] text-[#122027] text-sm font-bold rounded-xl">
              Add another
            </button>
          </div>
        )
      )}

      {editJob && (
        <JobModal job={editJob}
          clients={clients} films={films} workCategories={workCategories} descs={descs}
          onSave={saveEdit} onClose={() => setEditJob(null)} saving={editSaving} />
      )}

      {showFilmSync && (
        <FilmSyncModal studio={studioName || "Paramount"} existingFilms={films}
          onClose={() => setShowFilmSync(false)} onApplied={loadFilms} />
      )}

      {push && (
        <PushToWrikeModal
          studio={templateStudio || studioName} studioFolderTitle={studioFolderTitle}
          preferredProjectId={filmView?.filmProject?.id}
          filmTitle={film} jobs={push.jobs} mode={push.mode} onClose={closePush} />
      )}
    </div>
  );
}
