import { mediumOf, templateJobTypes, filmJobRows, countByType, highestCode, codeFor, pickProject } from "../src/lib/jobSetup.js";
import { studioFolderNaming } from "../src/lib/wrikeCampaign.js";

// Print or Digital
check("from the folder above", mediumOf(["Print", "INT_Creative"], "JOBNUMBER_Standee"), "Print");
check("from its own name", mediumOf(["Launch"], "JOBNUMBER_INTL_DIGITAL_Outdoor_Campaign_Markets"), "Digital");
check("neither says", mediumOf(["Launch"], "JOBNUMBER_Reporting"), "");

// A studio's job types
const tree = {
  tpl:   { id: "tpl", title: "_Paramount_MASTER_TEMPLATES", childIds: ["print", "launch"] },
  print: { id: "print", title: "Print", childIds: ["int"] },
  int:   { id: "int", title: "INT_Creative", childIds: ["fin", "intl"] },
  fin:   { id: "fin", title: "JOBNUMBER_Finishing", childIds: [] },
  intl:  { id: "intl", title: "INTL", childIds: ["std"] },
  std:   { id: "std", title: "JOBNUMBER_Standee", childIds: [] },
  launch:{ id: "launch", title: "Launch", childIds: [] },
};
const t = templateJobTypes(tree, "Paramount");
check("every JOBNUMBER folder is a type", t.types.map((x) => x.description), ["Finishing", "Standee"]);
check("grouped by the folders above, without the template itself", t.types.map((x) => x.group), ["Print › INT Creative", "Print › INT Creative › INTL"]);
check("keeps the folder name Push looks for", t.types[0].label, "JOBNUMBER_Finishing");
check("medium comes along", t.types[1].medium, "Print");
check("no template for the studio", templateJobTypes(tree, "Sony"), null);

// What a film has, from both sides
const filmTree = {
  id: "film", label: "Digger", children: [
    { id: "f1", label: "XY026051_Main_Quad", code: "XY026051", description: "Main Quad" },
    { id: "f2", label: "JOBNUMBER_Standee", code: null },
    { id: "f3", label: "XY026090_Titles", code: "XY026090", description: "Titles" },
    { id: "f4", label: "JOBNUMBER_Finishing", code: null },
  ],
};
const book = [
  { id: 1, job_number: "Digger : XY026051, INT - Main Quad", project_description: "INT - Main Quad", template_slot: "JOBNUMBER_Main_Quad", wrike_folder_id: "f1" },
  { id: 2, job_number: "Digger : XY026060, INT - Standee", project_description: "INT - Standee", template_slot: "JOBNUMBER_Standee" },
  { id: 3, job_number: "Digger : XY026070, INT - Finishing", template_slot: "JOBNUMBER_Finishing", wrike_folder_id: "f4" },
  { id: 4, job_number: "Digger : XY026080, INT - Banners", template_slot: "JOBNUMBER_Banners", wrike_folder_id: "zzz" },
  { id: 5, job_number: "Digger : XY026085, Studio Management" },
];
const rows = filmJobRows(book, filmTree);
const state = Object.fromEntries(rows.map((r) => [r.code, r.state]));
check("filed and in Wrike", state.XY026051, "in-wrike");
check("made here, not sent", state.XY026060, "not-sent");
check("its folder went back to its template name", state.XY026070, "folder-renamed");
check("its folder is gone", state.XY026080, "folder-gone");
check("in the book only", state.XY026085, "book-only");
check("in Wrike only", state.XY026090, "wrike-only");
check("newest number first", rows.map((r) => r.code)[0], "XY026090");
check("film not in Wrike: nothing is accused",
  filmJobRows(book, null).map((r) => r.state), ["book-only", "in-wrike", "in-wrike", "not-sent", "in-wrike"]);

check("how many of each type, each job counted once",
  Object.entries(countByType(rows, filmTree)).sort(),
  [["Banners", 1], ["Finishing", 1], ["Main_Quad", 1], ["Standee", 1], ["Titles", 1]]);

// Numbering
check("highest across labels, codes and folder names",
  highestCode(["Digger : XY026051, Main Quad", "XY026454", "XY026090_Titles", "Studio Management", null]), 26454);
check("none", highestCode([]), 0);
check("six digits", codeFor(26455), "XY026455");

// Which Wrike project
const projects = [{ id: "a", title: "Shrek" }, { id: "b", title: "Shrek_5" }, { id: "c", title: "Shrek 25th Anniversary" }];
check("the one the page found wins", pickProject(projects, "Shrek 5", "c").id, "c");
check("else an exact name, underscores aside", pickProject(projects, "Shrek 5").id, "b");
check("a near match is not chosen for you", pickProject([{ id: "a", title: "Shrek" }], "Shrek 5"), null);

// Naming a job the way the scan will, before its folder exists
const base = studioFolderNaming("Paramount");
check("base studio folder is the international arm", base.client, "Paramount Pictures International");
check("its descriptions take the INT prefix", base.describe("Standee"), "INT - Standee");
check("a prefix already there isn't doubled", base.describe("INT - Standee"), "INT - Standee");
const uk = studioFolderNaming("Universal UK");
check("regional folder", [uk.client, uk.describe("Sky VIP Assets")], ["Universal Pictures UK", "UK - Sky VIP Assets"]);
check("not a studio folder", studioFolderNaming("Some Folder").client, "");
