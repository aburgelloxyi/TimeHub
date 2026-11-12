import React, { useEffect, useState } from "react";
import { ExternalLink, FolderCheck, FolderPlus, Loader2, Plus } from "lucide-react";
import { confirmAction } from "../../lib/confirm";
import { notify } from "../../lib/toast";
import { planMarketFolderLive, createMarketFolder, HOME_LABEL } from "../../lib/orderForms/wrikeMarketFolder";
import Sweep, { sweepClass } from "./Sweep";

// Adds this market's country folder to the film's Markets job folder in Wrike,
// or to the Bespoke one beside it, with its Google Drive link. It reads Wrike
// first and says exactly what it would create; nothing is written until that
// is confirmed. Each folder the market has, made here or found already there,
// is a link to it.
//
// `known` is what the page worked out on opening the market (checkMarketFolder):
// the market's folders, each with its home, and whether the film has a Bespoke
// folder to offer. A market with no folder yet has a dashed outline, the app's
// usual look for something still to be added. `onMade` is told about each
// folder as it comes to exist, with its home.

const buttonClass =
  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#dce4ec] hover:border-[#12a0e1] text-sm font-bold text-[#122027] transition-colors disabled:opacity-60";

export default function WrikeFolderButton({ filmTitle, kind, marketName, driveUrl, known, onMade }) {
  const [busy, setBusy] = useState(null); // the home being added
  const [made, setMade] = useState([]); // [{ title, permalink, home }]
  const folders = ["markets", "bespoke"]
    .map((home) => made.find((f) => f.home === home) || known?.folders?.find((f) => f.home === home))
    .filter(Boolean);
  const offersBespoke = !!known?.bespoke;
  const setFolder = (found) => { setMade((prev) => [...prev.filter((f) => f.home !== found.home), found]); onMade?.(found); };

  useEffect(() => setMade([]), [filmTitle, kind, marketName]);

  const add = async (home) => {
    if (!driveUrl) {
      notify("Refresh this market first, so its Google Drive folder is known.");
      return;
    }
    setBusy(home);
    try {
      const plan = await planMarketFolderLive({ filmTitle, kind, marketName, home });
      if (!plan.ok) {
        notify(plan.reason);
        return;
      }
      if (plan.existing) {
        setFolder({ ...plan.existing, home });
        notify(`${plan.existing.title} is already in ${plan.parent.title}.`, "success");
        return;
      }
      const ok = await confirmAction({
        title: `Add "${plan.title}" to ${HOME_LABEL[home]}?`,
        message: `A new folder in ${plan.film} › ${plan.parent.title}, with that folder's job number. ${
          plan.field
            ? `Its "${plan.field.title}" field will be set to this market's Google Drive folder.`
            : "No \"Order Form\" custom field was found in Wrike, so the folder will be created without its Google Drive link."
        }`,
        confirmLabel: "Add folder",
      });
      if (!ok) return;
      const result = await createMarketFolder(plan, driveUrl);
      setFolder({ id: result.id, title: plan.title, permalink: result.permalink, home });
      const missed = [plan.field && !result.linked && `the "${plan.field.title}" field, so it has no Drive link`, !result.numbered && "its job number"].filter(Boolean);
      notify(
        missed.length ? `${plan.title} added, but Wrike refused ${missed.join(" and ")}.` : `${plan.title} added to ${plan.parent.title}.`,
        missed.length ? "error" : "success"
      );
    } catch (err) {
      notify(/\(401\)|not_connected/.test(err.message) ? "Connect Wrike in Profile first." : "Wrike couldn't be reached, so nothing was added.");
    } finally {
      setBusy(null);
    }
  };

  const links = folders.filter((f) => f.permalink).map((f) => (
    <a key={f.home} href={f.permalink} target="_blank" rel="noreferrer" title={f.title} className={`group ${sweepClass} ${buttonClass}`}>
      <Sweep />
      <FolderCheck className="w-3.5 h-3.5 text-emerald-600 transition-colors duration-300 group-hover/s:!text-white" />
      {offersBespoke ? `${HOME_LABEL[f.home]} folder` : "Wrike folder"}
      <ExternalLink className="w-3 h-3 text-[#768994] transition-[transform,color] duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover/s:!text-white" />
    </a>
  ));

  if (!folders.length) {
    return (
      <>
        <button onClick={() => add("markets")} disabled={!!busy} className={`group ${sweepClass} ${buttonClass} ${known?.state === "missing" ? "border-dashed border-[#9aabb5]" : ""}`}>
          <Sweep />
          {busy === "markets" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FolderPlus className="w-3.5 h-3.5 transition-transform duration-200 group-hover:scale-110" />}
          {busy === "markets" ? "Checking Wrike…" : "Add folder to Wrike"}
        </button>
        {offersBespoke && (
          <button onClick={() => add("bespoke")} disabled={!!busy} title="Add the folder to the film's Bespoke job folder instead"
            className={`group ${sweepClass} ${buttonClass} border-dashed border-violet-300 text-violet-700`}>
            <Sweep />
            {busy === "bespoke" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FolderPlus className="w-3.5 h-3.5" />}
            {busy === "bespoke" ? "Checking Wrike…" : "Bespoke"}
          </button>
        )}
      </>
    );
  }

  // A market can have a folder in both: the other is offered as a small add.
  const other = offersBespoke ? ["markets", "bespoke"].find((home) => !folders.some((f) => f.home === home)) : null;
  return (
    <>
      {links}
      {other && (
        <button onClick={() => add(other)} disabled={!!busy} title={`Add this market's folder to the film's ${HOME_LABEL[other]} job folder too`}
          className="flex items-center gap-1 px-2 py-1.5 rounded-lg border border-dashed border-[#c5d2da] text-xs font-bold text-[#768994] hover:text-[#122027] hover:border-[#12a0e1] transition-colors disabled:opacity-60">
          {busy === other ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
          {HOME_LABEL[other]}
        </button>
      )}
    </>
  );
}
