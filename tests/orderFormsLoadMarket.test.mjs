import { folderIdOf, marketRowIn } from "../src/lib/orderForms/loadFilm.js";

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
