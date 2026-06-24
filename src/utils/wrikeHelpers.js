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

  // Derive film title: most-frequent folder before "DIGITAL" across all paths (avoids reference paths)
  let filmTitle = linkedTask.projectName || "";
  if (!filmTitle && pathText) {
    const pathSegments = pathText.match(/\/Volumes\/[^\s]+/gi) || [];
    const filmFreq = {};
    for (const path of pathSegments) {
      const parts = path.split("/");
      const digIdx = parts.findIndex((p) => p.trim().toUpperCase() === "DIGITAL");
      if (digIdx > 0 && parts[digIdx - 1]) {
        const name = decodeURIComponent(parts[digIdx - 1]).replace(/[_\-]/g, " ").trim();
        filmFreq[name] = (filmFreq[name] || 0) + 1;
      }
    }
    if (Object.keys(filmFreq).length > 0) {
      filmTitle = Object.entries(filmFreq).sort((a, b) => b[1] - a[1])[0][0];
    }
    if (!filmTitle) {
      const parts = pathText.split("/");
      const digIdx = parts.findIndex((p) => p.trim().toUpperCase() === "DIGITAL");
      if (digIdx > 0 && parts[digIdx - 1]) {
        filmTitle = decodeURIComponent(parts[digIdx - 1]).replace(/[_\-]/g, " ").trim();
      }
    }
  }
  if (!filmTitle) filmTitle = titleText.split(/[_|-]/)[0]?.trim() || "";

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

  // --- Client guess (same rules as Legacy pull) ---
  const pathUpper = pathText.toUpperCase();
  const titleUpper = titleText.toUpperCase();
  let client = "";

  if (pathUpper.includes("UNIVERSAL")) {
    const terr = (guessedTerritory || "").toUpperCase();
    if (terr === "UK" || terr === "UNITED KINGDOM") client = "Universal Pictures UK";
    else if (terr === "AUSTRALIA" || terr === "AU" || terr === "AUS") client = "Universal Pictures Australia";
    else client = "Universal Pictures International";
  } else if (pathUpper.includes("PARAMOUNT")) {
    client = "Paramount Pictures";
  } else if (pathUpper.includes("SONY")) {
    client = "Sony Pictures";
  }

  if (!filmTitle || titleUpper.includes("SHOWREEL") || titleUpper.includes("INTERNAL") || titleUpper.includes("PITCH")) {
    filmTitle = filmTitle || "XYi Unbilled";
    if (!client) client = "Internal";
  }

  return {
    jobNumber: guessedJob || "⚠️ Unassigned",
    territory: guessedTerritory || "⚠️ Unassigned",
    category: "⚠️ Unassigned",
    notes: linkedTask.title || "",
    filmTitle,
    client,
  };
};
