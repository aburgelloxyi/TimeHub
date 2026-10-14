// Department settings (src/lib/departments.js) and the shared cache's team
// filter (filterToTeams). No department is special-cased by name: Motion,
// Print and the rest differ only through the settings table, a department
// added in Administration gets the standard setup, and an untagged person
// gets a neutral one.
import {
  pageIdsFor,
  hasFeature,
  usesTeamBoard,
  boardLabelFor,
  canvasLabelFor,
  countedStatusFor,
  jobQuickFiltersFor,
} from "../src/lib/departments.js";
import { filterToTeams, keepForCache, marketFolderIds } from "../src/lib/wrikeEnrich.js";

const NOBODY = "NOT_A_MANAGER";

check("pages: Motion", pageIdsFor("Motion", NOBODY), ["todayslist", "canvas", "legacy", "profile"]);
check("pages: PM, with work-in-progress Client Orders last", pageIdsFor("PM", NOBODY), ["jobbook", "legacy", "profile", "orderforms"]);
check("pages: a department added in Administration gets the standard set", pageIdsFor("Sound", NOBODY), ["todayslist", "canvas", "legacy", "profile"]);
check("pages: untagged gets a neutral set, no Canvas", pageIdsFor(null, NOBODY), ["todayslist", "legacy", "profile"]);

check("labels: every department's board is named the same way", [boardLabelFor("Motion"), boardLabelFor("Print")], ["Motion Board", "Print Board"]);
check("labels: untagged board", boardLabelFor(null), "Team Board");
check("labels: canvas", [canvasLabelFor("Motion"), canvasLabelFor(null)], ["Motion Canvas", "Campaign Canvas"]);

check("features: DOOH Specs is Motion's", [hasFeature("Motion", "doohSpecs"), hasFeature("Print", "doohSpecs")], [true, false]);
check("features: Launch Tracker is Print's", [hasFeature("Print", "launchTracker"), hasFeature("Motion", "launchTracker")], [true, false]);
check("features: Amends is Motion's", [hasFeature("Motion", "amends"), hasFeature("Print", "amends")], [true, false]);
check("features: none without a department", hasFeature(null, "doohSpecs"), false);
check("header count: Motion counts its status, others overdue", [countedStatusFor("Motion"), countedStatusFor("Print")], ["Motion", null]);
check("quick filters: Print leads with LAUNCH", jobQuickFiltersFor("Print")[0], "LAUNCH");
check("quick filters: default leads with DOOH", jobQuickFiltersFor("AM")[0], "DOOH");

check(
  "team board departments are the ones the cache keeps tasks for",
  ["Motion", "Print", "AM", "Digital", "PM", "Operations", "Sound", null].map(usesTeamBoard),
  [true, true, true, true, false, false, true, false]
);

// The cache filter: assignment by Wrike id, plus the existing title, folder
// and subtask rules.
{
  const folders = { DIG: { id: "DIG", title: "Digital" }, OTHER: { id: "OTHER", title: "Print" } };
  const team = new Set(["U_PRINT", "U_MOTION"]);
  const tasks = [
    { id: "a", title: "Poster", responsibleIds: ["U_PRINT"], parentIds: ["OTHER"] },
    { id: "b", title: "Poster", responsibleIds: ["U_PM"], parentIds: ["OTHER"] },
    { id: "c", title: "UK_DOOH_Cut", responsibleIds: [], parentIds: [] },
    { id: "d", title: "Banner", responsibleIds: [], parentIds: ["DIG"] },
    { id: "e", title: "ODY_Launch_Markets", responsibleIds: [], parentIds: [] },
    { id: "f", title: "Parent", responsibleIds: [], parentIds: [], subTaskIds: ["g"] },
    { id: "g", title: "Child", responsibleIds: ["U_MOTION"], parentIds: [] },
    { id: "h", title: "", responsibleIds: ["U_PRINT"] },
  ];
  check(
    "cache filter: team member, keyword, Digital folder, launch hub, via a subtask",
    filterToTeams(tasks, folders, team).map((t) => t.id),
    ["a", "c", "d", "e", "f", "g"]
  );
}

// What a batch adds to the cache: the filter's picks and the subtasks under
// anything kept.
{
  const team = new Set(["U_PRINT"]);
  const ids = (batch, cached = []) => [...keepForCache(batch, cached, {}, team).keys()];
  const parent = { id: "p", title: "EBZR_Batch1_HU", responsibleIds: ["U_PRINT"], subTaskIds: ["s1", "s2"] };
  const s1 = { id: "s1", title: "EBZR_INTL_OOH_CLP_HU", responsibleIds: [] };
  const s2 = { id: "s2", title: "EBZR_INTL_INTH_Panaflex_HU", responsibleIds: [], subTaskIds: ["g"] };
  const grandchild = { id: "g", title: "Resize", responsibleIds: [] };
  const stranger = { id: "x", title: "Somebody else's", responsibleIds: ["U_PM"] };

  check("cache: unassigned subtasks of a kept task are kept, however deep", ids([parent, s1, s2, grandchild, stranger]), ["p", "s1", "s2", "g"]);
  check("cache: a subtask arriving alone is kept when its parent is cached", ids([s1, stranger], [parent]), ["s1"]);
  check("cache: known by its own superTaskIds when the parent's list is missing",
    ids([{ ...s1, superTaskIds: ["p"] }], [{ ...parent, subTaskIds: undefined }]), ["s1"]);
  check("cache: a parent that stops qualifying no longer keeps its subtasks in",
    ids([{ ...parent, responsibleIds: ["U_PM"] }, s1], [parent]), []);
  check("cache: a subtask with no title is still left out", ids([parent, { ...s1, title: "" }]), ["p"]);
}

// Client orders' tasks: anything filed in a market's folder, assigned or not.
{
  const folders = {
    M: { id: "M", title: "XY026292_INTL_DIGITAL_Outdoor_Campaign_Markets", childIds: ["ZA", "CZ"] },
    ZA: { id: "ZA", title: "South Africa", childIds: ["ZA2"] },
    ZA2: { id: "ZA2", title: "Batch folder", childIds: [] },
    CZ: { id: "CZ", title: "Czechia", childIds: [] },
    OTHER: { id: "OTHER", title: "Print", childIds: [] },
  };
  check("the folders inside a Markets folder", [...marketFolderIds(folders)].sort(), ["CZ", "ZA", "ZA2"]);
  const batch = { id: "b", title: "EBZR_Batch1_ZA", responsibleIds: [], parentIds: ["ZA"], subTaskIds: ["s"] };
  const sub = { id: "s", title: "EBZR_INTL__DFOH__1920x1080px_10s_ZA", responsibleIds: [], parentIds: ["ROOT"] };
  const elsewhere = { id: "x", title: "Unassigned elsewhere", responsibleIds: [], parentIds: ["OTHER"] };
  check("an unassigned batch in a market's folder is kept, with its subtasks; the same elsewhere isn't",
    [...keepForCache([batch, sub, elsewhere], [], folders, new Set()).keys()], ["b", "s"]);
  check("no folder tree: nothing extra", [...keepForCache([batch], [], {}, new Set()).keys()], []);
}

// Deleted tasks (Wrike's recycle bin) are never kept, however they qualified.
{
  const team = new Set(["U1"]);
  const live = { id: "a", title: "Live", responsibleIds: ["U1"], parentIds: [] };
  const gone = { id: "b", title: "Gone", responsibleIds: ["U1"], parentIds: [], scope: "RbTask" };
  check("a recycled task isn't kept, so the sync purges it", [...keepForCache([live, gone], [], {}, team).keys()], ["a"]);
}
