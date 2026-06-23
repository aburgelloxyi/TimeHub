import { TERRITORIES } from "../constants";

/**
 * Attempts to guess Job, Territory, and Notes from any raw Wrike task object.
 * Returns an object with { jobNumber, territory, category, notes }.
 */
export const guessFieldsFromTask = (linkedTask, jobOptions = []) => {
  if (!linkedTask)
    return { jobNumber: "", territory: "", category: "⚠️ Unassigned", notes: "" };

  const titleText = linkedTask.title || "";
  const projectText = linkedTask.projectName || "";
  const pathText = linkedTask.extractedPathData || "";
  const notesText = linkedTask.notesText || "";

  let customFieldsText = "";
  if (linkedTask.customFields) {
    customFieldsText = linkedTask.customFields
      .map((cf) => cf.value || "")
      .join(" ");
  }

  const searchTarget =
    `${titleText} ${projectText} ${pathText} ${notesText} ${customFieldsText}`.toUpperCase();

  // --- Territory guess ---
  let guessedTerritory = "";
  let earliestIndex = Infinity;
  const sortedTerritories = [...TERRITORIES].sort((a, b) => b.length - a.length);

  for (const terr of sortedTerritories) {
    const regex = new RegExp(`\\b${terr}\\b`, "i");
    const match = searchTarget.match(regex);
    if (match && match.index < earliestIndex) {
      earliestIndex = match.index;
      guessedTerritory = terr;
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
