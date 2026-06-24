import { TERRITORIES, REGION_ALIASES } from "../constants";

/**
 * Attempts to guess Job, Territory, and Notes from any raw Wrike task object.
 * Returns an object with { jobNumber, territory, category, notes }.
 */
export const guessFieldsFromTask = (linkedTask, jobOptions = [], extraText = "") => {
  if (!linkedTask)
    return { jobNumber: "", territory: "", category: "⚠️ Unassigned", notes: "" };

  const titleText = linkedTask.title || "";

  // Support both pre-enriched objects (from handleSyncMyJobs) and raw Wrike API responses
  let projectText = linkedTask.projectName || "";
  let pathText = linkedTask.extractedPathData || "";
  let notesText = linkedTask.notesText || "";

  if (!pathText && linkedTask.description) {
    const htmlStripped = linkedTask.description.replace(/<[^>]*>/g, " ");
    const folderMatches = htmlStripped.match(/\/Volumes\/[^\s]+/gi);
    if (folderMatches) pathText = folderMatches.join(" ").toUpperCase();
    const xyInDesc = htmlStripped.match(/(XY\d{5,6})/i);
    if (xyInDesc && !pathText.includes(xyInDesc[1].toUpperCase()))
      pathText += " " + xyInDesc[1].toUpperCase();
    notesText = linkedTask.description.replace(/<[^>]*>/g, "").trim();
    if (!projectText) projectText = titleText.split(/[_|-]/)[0]?.trim() || "";
  }

  let customFieldsText = "";
  if (linkedTask.customFields) {
    customFieldsText = linkedTask.customFields
      .map((cf) => cf.value || "")
      .join(" ");
  }

  const searchTarget =
    `${titleText} ${projectText} ${pathText} ${notesText} ${customFieldsText} ${extraText}`.toUpperCase();

  // --- Territory guess ---
  let guessedTerritory = "";
  let earliestIndex = Infinity;
  const sortedTerritories = [...TERRITORIES].sort((a, b) => b.length - a.length);

  for (const terr of sortedTerritories) {
    const escapedTerr = terr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`\\b${escapedTerr}\\b`, "i");
    const match = searchTarget.match(regex);
    if (match && match.index < earliestIndex) {
      earliestIndex = match.index;
      guessedTerritory = terr;
    }
  }

  // Also check REGION_ALIASES (e.g. UAE → United Arab Emirates, UK → UK)
  for (const [abbr, targetTerritory] of Object.entries(REGION_ALIASES)) {
    const escapedAbbr = abbr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`\\b${escapedAbbr}\\b`, "i");
    const match = searchTarget.match(regex);
    if (match && match.index < earliestIndex) {
      earliestIndex = match.index;
      guessedTerritory = targetTerritory;
    }
  }

  // --- Job number guess ---
  let guessedJob = "";
  const xyMatch = searchTarget.match(/(XY\d{5,6})/i);

  if (xyMatch) {
    const rawXy = xyMatch[1].toUpperCase();
    const matchingOption = jobOptions.find((job) =>
      job.toUpperCase().includes(rawXy)
    );
    guessedJob = matchingOption ? matchingOption : rawXy;
  } else {
    for (const job of jobOptions) {
      const shortJob = job.split("-")[0].trim().toUpperCase();
      if (shortJob.length > 3 && searchTarget.includes(shortJob)) {
        guessedJob = job;
        break;
      }
    }
  }

  return {
    jobNumber: guessedJob || "⚠️ Unassigned",
    territory: guessedTerritory || "⚠️ Unassigned",
    category: "⚠️ Unassigned",
    notes: linkedTask.title || "",
  };
};
