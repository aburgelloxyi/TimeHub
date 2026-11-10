// Send to Wrike: copy a studio's template into a film's Wrike project (when the
// project has none of its folders yet) and put each job's number on its folder
// and tasks. Also "update job numbers", the same without the copy.
//
// Part of Administration. Split out of components/Management.jsx, which is
// still the entry point and re-exports what other screens import.
import { useState, useEffect, useMemo, useRef } from "react";
import { AlertTriangle, CheckCircle2, Loader2, UploadCloud, X } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { notify } from "../../lib/toast";
import { discoverJobNumberField, fetchAllFolders, findStudioFolder, findMasterTemplateFolder, fetchFolderProjects, collectSubtreeIds, planPropagate, applyPropagate, copyTemplateDeep, mapSlotFoldersUnder, pickSlotFolder, slotSuffix, renameFolder, setFolderJobNumber, triggerFieldCascade } from "../../lib/wrikeCampaign";
import { pickProject } from "../../lib/jobSetup";
import { plainWrikeError } from "../../lib/wrikeErrors";
import { StrictSelect } from "./fields";
import { CheckRow, WrikeApplyShell } from "./WrikeApplyShell";

const typeName = (label) => (label || "").replace(/^(JOBNUMBER|XY\d+)_?/i, "").replace(/_/g, " ").trim() || "General";

// Every check is made against Wrike as it is when this opens (template found?
// film project found? Job Number field found?), and nothing is written unless
// they all hold.
//
// `studio` names the template ("Universal"); `studioFolderTitle` is the folder
// the film sits in, which for a regional film differs ("Universal UK").
// mode "push"  copies the template in if the project has none of it, then numbers.
// mode "retag" never copies: it re-applies numbers to folders already there, for
//              tasks added since.
export function PushToWrikeModal({ studio, studioFolderTitle, preferredProjectId, filmTitle, jobs, mode = "push", onClose }) {
  const isRetag = mode === "retag";
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [applying, setApplying] = useState(false);
  const [progress, setProgress] = useState(null); // { step, done, total }
  const [result, setResult] = useState(null);     // { outcomes, droppedTaskFolders }
  const [targetId, setTargetId] = useState("");   // chosen Wrike project id

  // Identified by job id, not job type: one type can hold several jobs (two
  // launches off one template folder), and keying by type would merge them.
  const slots = useMemo(() => jobs.map((j) => ({
    id: j.id,
    label: j.template_slot,
    jobNumber: j.job_number,
    code: (j.job_number?.match(/XY\d+/) || [])[0] || j.job_number,
  })), [jobs]);

  // All by default; unticking one leaves it out of this send (its Job Book row
  // is untouched).
  const [excluded, setExcluded] = useState(() => new Set());
  const selectedSlots = useMemo(() => slots.filter((s) => !excluded.has(s.id)), [slots, excluded]);
  const toggleSlot = (id) => setExcluded((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [field, byId] = await Promise.all([discoverJobNumberField(), fetchAllFolders()]);
        const template = findMasterTemplateFolder(byId, studio);
        const studioFolder = findStudioFolder(byId, studioFolderTitle || studio);
        const projects = studioFolder ? await fetchFolderProjects(studioFolder.childIds) : [];
        // Every folder inside the master template: never copied into, never
        // written to.
        const templateIds = template ? collectSubtreeIds(byId, template.id) : new Set();
        if (alive) {
          setPlan({ field, template, studioFolder, projects, templateIds, byId });
          setTargetId(pickProject(projects, filmTitle, preferredProjectId)?.id || "");
        }
      } catch (e) {
        if (alive) setError(plainWrikeError(e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [studio, studioFolderTitle, preferredProjectId, filmTitle]);

  const filmProject = useMemo(
    () => plan?.projects?.find((p) => p.id === targetId) || null,
    [plan, targetId]
  );
  const canApply = plan && plan.field && filmProject && (isRetag || plan.template) && selectedSlots.length > 0 && !applying;

  // Jobs already done: a live Wrike folder already carries THIS job's code.
  // Unticked to start with, so sending again only touches what's new. Every
  // folder sharing a type is looked at, since two jobs can sit on one type and
  // each is done only if a folder carries its own code.
  const doneSlots = useMemo(() => {
    const done = new Set();
    if (!plan?.byId || !filmProject) return done;
    const bySuffix = {};
    const walk = (id) => {
      const n = plan.byId[id];
      if (!n) return;
      if (/^(JOBNUMBER|XY\d+)_/i.test(n.title || "")) {
        (bySuffix[slotSuffix(n.title)] ||= []).push(n.title);
      }
      (n.childIds || []).forEach(walk);
    };
    walk(filmProject.id);
    slots.forEach((s) => {
      const live = bySuffix[slotSuffix(s.label)] || [];
      if (live.some((t) => new RegExp(`^${s.code}_`, "i").test(t))) done.add(s.id);
    });
    return done;
  }, [plan, filmProject, slots]);

  // Sending again skips what's done; updating numbers is about exactly those.
  const inited = useRef(false);
  useEffect(() => {
    if (inited.current || !plan || !filmProject) return;
    inited.current = true;
    if (!isRetag && doneSlots.size) setExcluded(new Set(doneSlots));
  }, [plan, filmProject, doneSlots, isRetag]);

  const apply = async () => {
    if (!canApply) return;
    setApplying(true);
    setError(null);

    // The master template must never be written to. Copying only reads its
    // source, but this makes a write into it impossible even if a lookup ever
    // returned the wrong folder.
    const templateIds = plan.templateIds || new Set();
    const inTemplate = (id) => templateIds.has(id);
    const TEMPLATE_GUARD = "Stopped to protect the studio's template: a folder to write to turned out to be inside it. Nothing was changed.";

    try {
      if (inTemplate(filmProject.id) || filmProject.id === plan.template?.id) {
        throw new Error(TEMPLATE_GUARD);
      }

      let droppedTaskFolders = [];
      // The project's job folders ("JOBNUMBER_…" or already "XY#####_…"), by the
      // part of the name that survives a rename.
      setProgress({ step: "Checking the film's folders in Wrike…", done: 0, total: 1 });
      let slotFolders = await mapSlotFoldersUnder(filmProject.id);

      // Copy the template in only when the project has none of its job folders.
      if (Object.keys(slotFolders).length === 0) {
        if (isRetag) throw new Error("This film has none of the studio's folders in Wrike yet. Send its jobs to Wrike first.");
        if (!plan.template) throw new Error(`Wrike has no ${studio} template to copy.`);
        // The template's CHILDREN go straight into the film project, so it
        // doesn't gain a wrapper folder named after the template.
        const tpl = plan.byId[plan.template.id];
        const children = (tpl?.childIds || []).map((id) => plan.byId[id]).filter(Boolean);
        if (!children.length) throw new Error(`The ${studio} template in Wrike is empty.`);
        const report = { rootId: null, copies: 0, droppedTaskFolders: [] };
        for (const child of children) {
          await copyTemplateDeep({
            byId: plan.byId,
            sourceId: child.id,
            parentId: filmProject.id,
            title: child.title,
            onProgress: (step) => setProgress({ step, done: 0, total: 1 }),
            report,
          });
        }
        if (!report.copies) throw new Error("Wrike copied nothing from the template.");
        droppedTaskFolders = report.droppedTaskFolders || [];
        setProgress({ step: "Reading the new folders…", done: 0, total: 1 });
        slotFolders = await mapSlotFoldersUnder(filmProject.id);
      }

      // A folder is claimed by identity, not by type: pickSlotFolder gives the
      // one already carrying this job's code (so sending twice changes nothing),
      // else a free "JOBNUMBER_…" one, and never one carrying another job's code.
      const claimedIds = new Set();
      const outcomes = [];
      for (let i = 0; i < selectedSlots.length; i++) {
        const s = selectedSlots[i];
        const suffix = slotSuffix(s.label);
        const available = slotFolders[suffix] || [];
        const folder = pickSlotFolder(available, s.code, claimedIds);
        const outcome = { id: s.id, code: s.code, name: typeName(s.label), ok: false, notes: [] };
        outcomes.push(outcome);
        if (!folder) {
          outcome.notes.push(available.length
            ? "Every folder of this kind in Wrike already belongs to another job. Add one more in Wrike, then send again."
            : "The film has no folder of this kind in Wrike.");
          continue;
        }
        claimedIds.add(folder.id);
        if (inTemplate(folder.id)) throw new Error(TEMPLATE_GUARD);

        const newTitle = `${s.code}_${suffix}`;
        setProgress({ step: `Numbering ${s.code}…`, done: i, total: selectedSlots.length });
        if (folder.title !== newTitle) await renameFolder(folder.id, newTitle);
        outcome.ok = true;

        // Which Wrike folder this job owns, and under what name, so the app can
        // later tell "renamed in Wrike" from "never sent".
        if (s.id) {
          const { error: saveErr } = await supabase.from("jobs")
            .update({ wrike_folder_id: folder.id, wrike_folder_title: newTitle })
            .eq("id", s.id);
          if (saveErr) outcome.notes.push(`The Job Book couldn't record its folder (${saveErr.message}), so it may still show as not in Wrike.`);
        }

        // The field carries the whole folder name, not the bare code: several
        // folders under one film share a code prefix, and the name is what says
        // which job an item belongs to. Wrike's own cascading then copies it to
        // everything inside, including tasks added later.
        try {
          await setFolderJobNumber(folder.id, plan.field.id, newTitle);
          await triggerFieldCascade(folder.id, plan.field.id);
        } catch (e) {
          outcome.ok = false;
          outcome.notes.push(`Its folder was named, but the job number couldn't be put on it (${e.message}). Send it again.`);
        }

        // Also number the tasks already there directly, in case the field's
        // settings limit cascading. Tasks already carrying the value are skipped.
        const p = await planPropagate(folder.id, plan.field.id, newTitle);
        const r = await applyPropagate(p.willSet, plan.field.id, newTitle,
          (d, t) => setProgress({ step: `Numbering the tasks in ${s.code}…`, done: d, total: t }));
        outcome.tasks = r.ok.length;
        if (r.failed.length) {
          outcome.notes.push(`${r.failed.length} task${r.failed.length === 1 ? "" : "s"} couldn't be numbered. Use “Update job numbers” on the film to try those again.`);
        }
      }
      setResult({ outcomes, droppedTaskFolders });
      const good = outcomes.filter((o) => o.ok && !o.notes.length).length;
      notify(
        good === outcomes.length
          ? `${good} job${good === 1 ? " is" : "s are"} in Wrike.`
          : `${good} of ${outcomes.length} jobs went through cleanly. The rest are listed.`,
        good === outcomes.length ? "success" : "error"
      );
    } catch (e) {
      // Stopped part-way: what was done stays done, and sending again carries on
      // from there, since a folder already carrying a job's number is recognised.
      setError(`${plainWrikeError(e)} Anything already numbered stays as it is; send again to finish the rest.`);
    } finally {
      setApplying(false);
      setProgress(null);
    }
  };

  const studioLabel = plan?.studioFolder?.title || studioFolderTitle || studio;

  return (
    <WrikeApplyShell title={isRetag ? "Update job numbers in Wrike" : "Send to Wrike"}
      subtitle={isRetag
        ? `Puts each job's number on tasks added to “${filmTitle}” since it was sent`
        : `Names each job's folder in “${filmTitle}” and numbers its tasks`}
      onClose={() => onClose(!!result)}>
      <div className="px-6 py-5 overflow-y-auto flex-1">
        {loading ? (
          <div className="flex items-center gap-2 text-[#768994] py-8 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" /> Checking Wrike…
          </div>
        ) : result ? (
          <div className="space-y-3">
            <ul className="rise-in border border-[#dce4ec] rounded-2xl divide-y divide-[#f0f4f8]">
              {result.outcomes.map((o) => {
                const clean = o.ok && !o.notes.length;
                const Icon = clean ? CheckCircle2 : o.ok ? AlertTriangle : X;
                return (
                  <li key={o.id} className="flex items-start gap-2.5 px-4 py-2.5">
                    <Icon className={`settle-in w-4 h-4 shrink-0 mt-0.5 ${clean ? "text-[#1cc1a5]" : o.ok ? "text-[#f4b740]" : "text-rose-500"}`} />
                    <div className="min-w-0 text-xs">
                      <p className="font-bold text-[#122027]">
                        <span className="font-mono">{o.code}</span> · {o.name}
                        {clean && <span className="font-medium text-[#768994]"> · in Wrike{o.tasks ? `, ${o.tasks} task${o.tasks === 1 ? "" : "s"} numbered` : ""}</span>}
                      </p>
                      {o.notes.map((n, i) => <p key={i} className="text-[11px] text-[#8a6d1a] mt-0.5">{n}</p>)}
                    </div>
                  </li>
                );
              })}
            </ul>
            {result.droppedTaskFolders?.length > 0 && (
              <div className="px-3 py-2 bg-[#f4b740]/10 border border-[#f4b740]/30 rounded-xl">
                <p className="flex items-center gap-1.5 text-[11px] font-bold text-[#8a6d1a] mb-1">
                  <AlertTriangle className="w-3.5 h-3.5" /> Some folders were too big for Wrike to copy in one go
                </p>
                <p className="text-[11px] text-[#8a6d1a] leading-snug">
                  The folders inside them came across with all their tasks, but tasks sitting directly in these
                  ones did not. Add them by hand if they&rsquo;re needed:
                </p>
                <ul className="mt-1 text-[11px] text-[#8a6d1a] list-disc pl-4">
                  {result.droppedTaskFolders.map((d) => (
                    <li key={d.title}>{d.title}: {d.count} task{d.count === 1 ? "" : "s"}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <>
            <p className="text-[10px] font-black uppercase tracking-widest text-[#768994] mb-1">Before anything is sent</p>
            <div className="border border-[#dce4ec] rounded-2xl px-4 py-2 mb-4">
              <CheckRow ok={!!plan?.field} label="Wrike has a Job Number field"
                value={plan?.field ? `“${plan.field.title}”` : "Not found, so there is nowhere to put the number"} />
              {!isRetag && (
                <CheckRow ok={!!plan?.template} label={`${studio}'s standard folders`}
                  value={plan?.template ? `${plan.template.title}, ${plan.template.jobCount} kinds of job` : `Wrike has no ${studio} template`} />
              )}
              <CheckRow ok={!!filmProject} label="This film's project in Wrike"
                warn={!filmProject && (plan?.projects?.length > 0)}
                value={filmProject
                  ? `${filmProject.title}, in ${studioLabel}`
                  : plan?.projects?.length
                    ? `Nothing in ${studioLabel} is called exactly “${filmTitle}”. Choose it below.`
                    : `${studioLabel} has no film projects in Wrike. Create this film's project there first; its jobs stay in the Job Book and can be sent later.`} />
            </div>

            {!!plan?.projects?.length && (
              <div className="mb-4">
                <label className="block text-[10px] font-black uppercase tracking-widest text-[#768994] mb-1.5">
                  Film project in Wrike · {studioLabel}
                </label>
                <StrictSelect
                  value={filmProject?.title || ""}
                  onChange={(title) => {
                    const p = plan.projects.find((x) => x.title === title);
                    setTargetId(p?.id || "");
                  }}
                  options={plan.projects.map((p) => p.title)}
                  placeholder={`Find the project in ${studioLabel}…`} />
                <p className="text-[10px] text-[#768994] mt-1">
                  {isRetag ? "The jobs' folders are looked for inside this project." : "The studio's folders are copied into this project if it doesn't have them yet."}
                </p>
              </div>
            )}

            <p className="text-[10px] font-black uppercase tracking-widest text-[#768994] mb-2">
              {selectedSlots.length} of {slots.length} job{slots.length === 1 ? "" : "s"} to {isRetag ? "update" : "send"}
              {!isRetag && doneSlots.size > 0 && <span className="text-[#0f766e] normal-case font-bold"> · {doneSlots.size} already in Wrike</span>}
            </p>
            {slots.length === 0 ? (
              <p className="text-xs text-[#768994] italic mb-2">There are no jobs to send.</p>
            ) : (
              <div className="border border-[#dce4ec] rounded-2xl divide-y divide-[#f0f4f8] max-h-[220px] overflow-y-auto scrollbar-thin scrollbar-inset mb-2">
                {slots.map((s) => {
                  const on = !excluded.has(s.id);
                  const done = doneSlots.has(s.id);
                  return (
                    <label key={s.id}
                      className={`flex items-center justify-between gap-2 px-4 py-2 text-xs cursor-pointer transition-opacity ${on ? "" : "opacity-50"}`}>
                      <span className="flex items-center gap-2 min-w-0">
                        <input type="checkbox" checked={on} onChange={() => toggleSlot(s.id)}
                          className="accent-[#1cc1a5] w-3.5 h-3.5 shrink-0" />
                        <span className="text-[#122027] truncate">{typeName(s.label)}</span>
                        {done && <span className="text-[10px] font-black text-[#0f766e] bg-[#1cc1a5]/15 px-1.5 py-0.5 rounded-full shrink-0">In Wrike</span>}
                      </span>
                      <span className={`font-mono font-bold shrink-0 ${on ? "text-[#0f766e]" : "text-[#768994] line-through"}`}>{s.code}</span>
                    </label>
                  );
                })}
              </div>
            )}

            {progress && (
              <div className="mt-3">
                <p className="text-xs font-bold text-[#0f766e] mb-1.5">{progress.step}</p>
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full w-full bg-[#1cc1a5] origin-left transition-[transform] ease-[cubic-bezier(0.16,1,0.3,1)]"
                    style={{ transform: `scaleX(${progress.total ? progress.done / progress.total : 1})` }} />
                </div>
              </div>
            )}
            {error && <p className="text-xs font-bold text-rose-600 mt-3">{error}</p>}
          </>
        )}
      </div>
      <div className="px-6 py-4 border-t border-[#dce4ec] flex items-center justify-end gap-2 shrink-0">
        <button onClick={() => onClose(!!result)}
          className="px-5 py-2.5 text-sm font-bold text-[#768994] hover:text-[#122027] bg-white border border-[#dce4ec] rounded-xl press">
          {result ? "Done" : "Not now"}
        </button>
        {!result && (
          <button onClick={apply} disabled={!canApply}
            title={!canApply && !applying ? "Everything in the list above has to be in place first" : ""}
            className="flex items-center gap-2 px-6 py-2.5 bg-[#1cc1a5] hover:bg-[#17a892] text-white text-sm font-bold rounded-xl press disabled:opacity-40">
            {applying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UploadCloud className="w-3.5 h-3.5" />}
            {isRetag ? "Update in Wrike" : "Send to Wrike"}
          </button>
        )}
      </div>
    </WrikeApplyShell>
  );
}
