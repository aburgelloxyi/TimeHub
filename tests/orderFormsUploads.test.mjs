// Digital Enterprise Uploads: the AMs' sheet read into rows, and each row
// placed in its film's Enterprise_Daily_Uploads folder. The sheet is laid out
// as the real one: headers over two rows, a date as a day number and as text.
import { readUploads, planUploads, findUploadsFolder, dayOf, codeOf, taskKey } from "../src/lib/orderForms/enterpriseUploads.js";

const sheet = [
  ["ENTERPRISE UPLOAD NAME", "DATE", "Market Deadline", "Department", "Reporting", "Market", "Quote", "Job Number"],
  [],
  ["FIL_SOCIAL_CREATIVE_ONE_MONTH_COUNTDOWN", 46330, "2026-11-04", "Asset Management", "Yes", "OV", "Approved"],
  ["FIL_SOCIAL_CREATIVE_WILDPOSTING_ARTWORK_VIDEOS", "4/11/2026"],
  ["  FIL_INTL_WATCHING YOU_200K_300x250 "],
  ["", "4/11/2026"],
  ["EBZR_DOM_Teaser_1580x2494_Banner_OLSON_MISC_7", "5/11/2026", "", "", "", "", "", "XY1"],
  ["FIL_SOCIAL_CREATIVE_ONE_MONTH_COUNTDOWN", "ASAP"],
  ["ZZZ_SOMETHING", "6/11/2026"],
];

const read = readUploads(sheet);
check("the columns, wherever their headers are", read.columns, { name: 0, date: 1, marketDeadline: 2, department: 3, reporting: 4, market: 5, quote: 6, jobNumber: 7 });
check("a row per name; a row with no name isn't one", read.uploads.map((u) => u.row), [3, 4, 5, 7, 8, 9]);
check("a row's values", read.uploads[0], {
  row: 3, name: "FIL_SOCIAL_CREATIVE_ONE_MONTH_COUNTDOWN", date: "2026-11-04", dateText: "2026-11-04",
  marketDeadline: "2026-11-04", department: "Asset Management", reporting: "Yes", market: "OV", quote: "Approved", jobNumber: "",
});
check("a name is tidied as a task name", read.uploads[2].name, "FIL_INTL_WATCHING_YOU_200K_300x250");
check("dates: day number, ISO, day first", [dayOf(46330), dayOf("2026-11-04"), dayOf("4/11/2026"), dayOf("13/25/2026"), dayOf("ASAP")], ["2026-11-04", "2026-11-04", "2026-11-04", "", ""]);
check("no name column, no rows", readUploads([["Something"], ["x"]]).ok, false);
check("film code and task key", [codeOf("fil_x"), taskKey("FIL__A b")], ["FIL", "fil_a_b"]);

const tree = {
  studio: { id: "studio", title: "Paramount", childIds: ["fil", "ebzr"] },
  fil: { id: "fil", title: "Focker In-Law", childIds: ["fdig"] },
  fdig: { id: "fdig", title: "Digital", childIds: ["fint"] },
  fint: { id: "fint", title: "INT_Digital", childIds: ["fup"] },
  fup: { id: "fup", title: "XY026214_Enterprise_Daily_Uploads", childIds: [] },
  ebzr: { id: "ebzr", title: "Ebenezer", childIds: ["edig"] },
  edig: { id: "edig", title: "Digital", childIds: ["eint"] },
  eint: { id: "eint", title: "INT_Digital", childIds: ["eup"] },
  eup: { id: "eup", title: "XY026300_Enterprise_Daily_Uploads", childIds: [] },
};
const fil = findUploadsFolder(tree, "Focker In Law");
check("the film's uploads folder, and its job number", [fil.ok, fil.folder.id, fil.jobNumber, fil.jobCode], [true, "fup", "XY026214_Enterprise_Daily_Uploads", "XY026214"]);
check("a domestic row goes to the film's one uploads folder too", findUploadsFolder(tree, "Ebenezer").folder.id, "eup");
check("no uploads folder: says so", findUploadsFolder({ ...tree, fint: { ...tree.fint, childIds: [] } }, "Focker In-Law").reason, "Focker In-Law has no Enterprise_Daily_Uploads folder in Wrike.");
check("two uploads folders: refuses to pick",
  findUploadsFolder({ ...tree, fint: { ...tree.fint, childIds: ["fup", "fup2"] }, fup2: { id: "fup2", title: "XY9_Enterprise_Daily_Uploads", childIds: [] } }, "Focker In-Law").ok, false);
check("a film not in Wrike", findUploadsFolder(tree, "Nope").ok, false);

const codes = { FIL: "Focker In-Law", EBZR: "Ebenezer" };
const inFolder = new Map([["fup", new Map([[taskKey("FIL_SOCIAL_CREATIVE_WILDPOSTING_ARTWORK_VIDEOS"), { id: "T1", title: "x", permalink: "p" }]])]]);
const planned = planUploads(read.uploads, {
  codes,
  placeOf: (film) => findUploadsFolder(tree, film),
  existing: (id) => inFolder.get(id) || new Map(),
});
check("each row's state", planned.map((u) => [u.row, u.state]), [[3, "ready"], [4, "in-wrike"], [5, "ready"], [7, "ready"], [8, "blocked"], [9, "blocked"]]);
check("already in Wrike comes with its task", planned[1].task.id, "T1");
check("the domestic row goes to the film's folder", planned[3].place.folder.id, "eup");
check("a repeated name is held back", planned[4].reason, "Same name as row 3.");
check("an unknown code says what to do", planned[5].reason, '"ZZZ" isn\'t a known film code. Add it in Film Codes.');
check("a date that isn't one is said", planUploads([{ row: 2, name: "FIL_A", date: "", dateText: "ASAP" }], { codes, placeOf: () => fil }).map((u) => [u.state, u.reason]),
  [["ready", '"ASAP" isn\'t a date, so it has no due date.']]);
