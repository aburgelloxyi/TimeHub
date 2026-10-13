import React, { useEffect, useState } from "react";
import { ExternalLink, FolderPlus, Loader2 } from "lucide-react";
import { confirmAction } from "../../lib/confirm";
import { notify } from "../../lib/toast";
import { planMarketFolderLive, createMarketFolder } from "../../lib/orderForms/wrikeMarketFolder";

// Adds this market's country folder to the film's Markets folder in Wrike, with
// its Google Drive link. It reads Wrike first and says exactly what it would
// create; nothing is written until that is confirmed. Once the folder exists,
// made here or found already there, the button is a link to it.
//
// `known` is what the page worked out on opening the market (checkMarketFolder):
// a folder that is known to exist is a link from the start, and one known to be
// missing is marked as the next thing to do, since orders can't be briefed
// without it. `onMade` is told when the folder comes to exist.

const buttonClass =
  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#dce4ec] hover:border-[#12a0e1] text-sm font-bold text-[#122027] transition-colors disabled:opacity-60";

export default function WrikeFolderButton({ filmTitle, kind, marketName, driveUrl, known, onMade }) {
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState(null); // { title, permalink }
  const folder = made || (known?.state === "exists" ? known.folder : null);
  const setFolder = (found) => { setMade(found); onMade?.(found); };

  useEffect(() => setMade(null), [filmTitle, kind, marketName]);

  const add = async () => {
    if (!driveUrl) {
      notify("Refresh this market first, so its Google Drive folder is known.");
      return;
    }
    setBusy(true);
    try {
      const plan = await planMarketFolderLive({ filmTitle, kind, marketName });
      if (!plan.ok) {
        notify(plan.reason);
        return;
      }
      if (plan.existing) {
        setFolder(plan.existing);
        notify(`${plan.existing.title} is already in ${plan.parent.title}.`, "success");
        return;
      }
      const ok = await confirmAction({
        title: `Add "${plan.title}" to Wrike?`,
        message: `A new folder in ${plan.film} › ${plan.parent.title}. ${
          plan.field
            ? `Its "${plan.field.title}" field will be set to this market's Google Drive folder.`
            : "No \"Order Form\" custom field was found in Wrike, so the folder will be created without its Google Drive link."
        }`,
        confirmLabel: "Add folder",
      });
      if (!ok) return;
      const made = await createMarketFolder(plan, driveUrl);
      setFolder({ title: plan.title, permalink: made.permalink });
      notify(
        plan.field && !made.linked
          ? `${plan.title} added, but Wrike refused the "${plan.field.title}" field here, so it has no Drive link.`
          : `${plan.title} added to Wrike.`,
        plan.field && !made.linked ? "error" : "success"
      );
    } catch (err) {
      notify(/\(401\)|not_connected/.test(err.message) ? "Connect Wrike in Profile first." : "Wrike couldn't be reached, so nothing was added.");
    } finally {
      setBusy(false);
    }
  };

  if (folder?.permalink) {
    return (
      <a href={folder.permalink} target="_blank" rel="noreferrer" title={folder.title} className={`group ${buttonClass}`}>
        <ExternalLink className="w-3.5 h-3.5 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
        Wrike folder
      </a>
    );
  }
  return (
    <button onClick={add} disabled={busy} className={`group relative ${buttonClass} ${known?.state === "missing" ? "!text-indigo-600" : ""}`}>
      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FolderPlus className="w-3.5 h-3.5 transition-transform duration-200 group-hover:scale-110" />}
      {busy ? "Checking Wrike…" : "Add folder to Wrike"}
      {/* The next thing to do for this market. */}
      {known?.state === "missing" && !busy && (
        <span aria-hidden className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
          {/* Three pulses to catch the eye, then it rests as a plain dot. */}
          <span className="absolute inline-flex h-full w-full rounded-full bg-indigo-500 opacity-60 animate-ping [animation-iteration-count:3] [animation-fill-mode:forwards] motion-reduce:hidden" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-indigo-600" />
        </span>
      )}
    </button>
  );
}
