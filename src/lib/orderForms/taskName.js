// The task name as a PM would type it from the sheet's: the sheet's formula
// leaves a doubled underscore where a field is empty (no site name gives
// "EBZR_INTL__DFOH__1920x1080px_10s_ZA"), and a site name can have spaces.
// Spaces become underscores, runs of them become one, and none is left at
// either end. Matching ignores the same differences (taskKey), so a task
// named either way is still found. On its own so the Worker can use it.
export const tidyTaskName = (name) =>
  String(name || "").trim().replace(/\s+/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "");
