import { READ_VERSION } from "../src/lib/orderForms/parseWorkbook.js";
import { folderIdOf, marketRowIn, stillCurrent } from "../src/lib/orderForms/loadFilm.js";

// Refreshing one market lists only its own folder (loadMarketOf).
check("a saved market's folder, from its link", [
  folderIdOf({ folderUrl: "https://drive.google.com/drive/folders/1AbC_d-9?usp=sharing" }), folderIdOf({ folderUrl: "" }), folderIdOf(null),
], ["1AbC_d-9", "", ""]);

const sheets = [
  { id: "old", name: "Street Fighter - Motion Outdoor", parents: ["f1"], modifiedTime: "2026-09-01T10:00:00Z" },
  { id: "new", name: "Copy of Street Fighter - Motion Outdoor", parents: ["f1"], modifiedTime: "2026-10-10T10:00:00Z" },
  { id: "print", name: "Street Fighter - Print and Digital Outdoor", parents: ["f1"], modifiedTime: "2026-10-12T10:00:00Z" },
  { id: "notes", name: "_StandardSizes", parents: ["f1"], modifiedTime: "2026-10-13T10:00:00Z" },
];
const row = marketRowIn("f1", "Austria (AUT)", sheets, "street fighter|motion");
check("the film's newest sheet in that folder, under the saved name", [row?.sheet.id, row?.name, row?.folderId], ["new", "Austria (AUT)", "f1"]);
check("no sheet there for the film: none, so the whole tree is listed", marketRowIn("f1", "Austria (AUT)", sheets, "ebenezer|motion"), null);


// When a Refresh can keep a market instead of reading its sheet again.
const now = Date.parse("2026-10-14T16:00:00Z");
const saved = { name: "Chile (CHI)", sheetId: "s1", sheetModified: "2026-10-10T09:00:00Z", readVersion: READ_VERSION, readAt: "2026-10-14T09:00:00Z" };
const listed = { name: "Chile (CHI)", sheet: { id: "s1", modifiedTime: "2026-10-10T09:00:00Z" } };
check("the same sheet, unchanged, read this morning: kept", stillCurrent(saved, listed, now), true);
check("edited since", stillCurrent(saved, { ...listed, sheet: { ...listed.sheet, modifiedTime: "2026-10-14T10:00:00Z" } }, now), false);
check("a different sheet in the folder now", stillCurrent(saved, { ...listed, sheet: { ...listed.sheet, id: "s2" } }, now), false);
check("read by an older version of the reader", stillCurrent({ ...saved, readVersion: READ_VERSION - 1 }, listed, now), false);
check("saved before edit times were kept", stillCurrent({ ...saved, sheetModified: undefined, readVersion: undefined }, listed, now), false);
check("last read more than a day ago, unchanged or not", stillCurrent({ ...saved, readAt: "2026-10-13T15:00:00Z" }, listed, now), false);
check("couldn't be read last time", stillCurrent({ ...saved, unreadable: "The sheet is no longer in this market's folder" }, listed, now), false);
check("no saved market", stillCurrent(undefined, listed, now), false);
