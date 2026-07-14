import { TERRITORIES, REGION_ALIASES } from "../constants";

/**
 * Attempts to guess Job, Territory, and Notes from any raw Wrike task object.
 * Returns an object with { jobNumber, territory, category, notes }.
 *
 * @param getJob  Optional job_number -> Job Book record lookup (from
 *                useJobLookup). When the guessed job number is already
 *                registered there, its film_title/client win over anything
 *                derived from Wrike below — Job Book is admin-curated and
 *                takes priority over a fresh folder-climb/title guess.
 */
export const guessFieldsFromTask = (linkedTask, jobOptions = [], extraText = "", getJob = null) => {
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
  // NOTE: job-number-derived title (below, after guessedJob is computed) takes priority over this —
  // projectName comes from fragile Wrike folder tree-climbing and can misfire on shared/multi-parent
  // folder structures (e.g. picking up a sibling campaign's folder instead of the real one).
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
    `${titleText} ${projectText} ${pathText} ${notesText} ${customFieldsText} ${extraText}`
      .toUpperCase()
      .replace(/_/g, " ");

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
  // A dedicated "Job Number" custom field may carry a suffix beyond the base
  // code (e.g. "XY025953_LUG_D6" for a localized delivery package). Check the
  // raw (pre-underscore-stripped) custom field values first so that suffix
  // survives — searchTarget below has already turned "_" into " ", which
  // would otherwise truncate it down to the bare "XY025953".
  let guessedJob = "";
  let fullCodeMatch = null;
  if (linkedTask.customFields) {
    for (const cf of linkedTask.customFields) {
      if (cf.value && typeof cf.value === "string") {
        const m = cf.value.match(/(XY\d{5,6}(?:_[A-Za-z0-9]+)*)/i);
        if (m) { fullCodeMatch = m[1].toUpperCase(); break; }
      }
    }
  }
  const xyMatch = fullCodeMatch ? [null, fullCodeMatch] : searchTarget.match(/(XY\d{5,6})/i);

  if (xyMatch) {
    const fullCode = xyMatch[1].toUpperCase();
    const rawXy = fullCode.match(/XY\d{5,6}/i)[0];
    const matchingOption = jobOptions.find((job) =>
      job.toUpperCase().includes(rawXy)
    );
    guessedJob = matchingOption
      ? matchingOption.toUpperCase().includes(fullCode)
        ? matchingOption
        : matchingOption.replace(new RegExp(rawXy, "i"), fullCode)
      : fullCode;
  } else {
    for (const job of jobOptions) {
      const shortJob = job.split("-")[0].trim().toUpperCase();
      if (shortJob.length > 3 && searchTarget.includes(shortJob)) {
        guessedJob = job;
        break;
      }
    }
  }

  // Job number "Film Name : CODE, Description" is the ground truth — it's a stable,
  // user-maintained format, whereas the projectName/path-derived filmTitle above comes from
  // fragile Wrike folder tree-climbing that can misfire (e.g. picking a sibling campaign's
  // folder). Always prefer the job-number-derived title when the job number has this format.
  // Split on " : " (space-colon-space) specifically, not the first bare colon — film
  // titles can contain their own colon (e.g. "Paw Patrol: The Dino Movie : XY025793, ...").
  if (guessedJob && guessedJob !== "⚠️ Unassigned" && guessedJob.includes(" : ")) {
    filmTitle = guessedJob.split(" : ")[0].trim();
  }
  if (!filmTitle) filmTitle = titleText.split(/[_|-]/)[0]?.trim() || "";
  // Normalize all-caps titles (e.g. server folder names "THE ODYSSEY" → "The Odyssey")
  if (filmTitle && filmTitle === filmTitle.toUpperCase() && filmTitle !== filmTitle.toLowerCase()) {
    filmTitle = filmTitle.replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
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

  // Job Book override — an admin-curated record for this job number beats any
  // guess derived above, however it was derived.
  if (getJob && guessedJob && guessedJob !== "⚠️ Unassigned") {
    const known = getJob(guessedJob);
    if (known?.film_title) filmTitle = known.film_title;
    if (known?.client) client = known.client;
    // Upgrade a bare "XY025716" to Job Book's canonical
    // "Film : XY025716, Description" string so pulled rows read consistently
    // with those that carried the full string from Wrike. This also lets the
    // caller's comma-split derive a project description it otherwise couldn't.
    if (known?.job_number?.includes(" : ") && !guessedJob.includes(" : ")) {
      guessedJob = known.job_number;
    } else if (!guessedJob.includes(" : ") && filmTitle && filmTitle !== "XYi Unbilled") {
      // Brand-new job with no Job Book record yet — synthesize the canonical
      // "Film : CODE, Description" string ourselves instead of leaving a
      // bare/suffixed code that external systems (e.g. the timesheet
      // bookmarklet) won't recognize.
      guessedJob = `${filmTitle} : ${guessedJob}, ${linkedTask.title || ""}`
        .trim()
        .replace(/,\s*$/, "");
    }
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
