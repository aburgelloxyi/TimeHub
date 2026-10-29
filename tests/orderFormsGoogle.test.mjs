import { sheetFilm, marketName, filmsIn, clientFor, driveStaleness, isTestFolder, sameFilm } from "../src/lib/orderForms/driveTree.js";

check("the clients' test folder isn't a market", ["AA_Test_Market", "TEST", "zz test market"].map(isTestFolder), [true, true, true]);
check("nor are working copies, templates and reference sheets", ["Copy of _StandardSizes", "_StandardSizes", "Copy of Chile (CHI)", "Order form TEMPLATE"].map(isTestFolder), [true, true, true, true]);
check("a market is never taken for one", ["Greece (GR)", "LATEST", "Contest (XX)", "Germany (GER)", "Chile (CHI)", "Côte d'Ivoire (CIV)"].map(isTestFolder), [false, false, false, false, false, false]);
import { marketFromSheets } from "../src/lib/orderForms/parseWorkbook.js";

// ── A sheet's film and medium ─────────────────────────────────────────────────
check("Universal naming: motion", sheetFilm("FID_Motion_Outdoor"), { film: "FID", medium: "motion" });
check("Universal naming: print", sheetFilm("FID_Print_Outdoor"), { film: "FID", medium: "print" });
check("Paramount naming: print", sheetFilm("Street Fighter - Print and Digital Outdoor"), { film: "Street Fighter", medium: "print" });
check("Paramount naming: motion", sheetFilm("Street Fighter - Motion Outdoor"), { film: "Street Fighter", medium: "motion" });
check("a film code with an underscore in it", sheetFilm("FF_X_Motion_Outdoor"), { film: "FF_X", medium: "motion" });
check("a hyphenated film", sheetFilm("Spider-Man - Motion Outdoor"), { film: "Spider-Man", medium: "motion" });
check("a copy is the same film", sheetFilm("Copy of Ebenezer - Print and Digital Outdoor"), { film: "Ebenezer", medium: "print" });
check("an uploaded .xlsx", sheetFilm("FID_DOOH.xlsx"), { film: "FID", medium: "motion" });
check("not an order form", [sheetFilm("_StandardSizes"), sheetFilm("Cleaning data calc_01"), sheetFilm("Printers list"), sheetFilm("")], [null, null, null, null]);

// ── A market's name from its folder ───────────────────────────────────────────
check("capitals are eased, the code kept", marketName("BULGARIA (BG)"), "Bulgaria (BG)");
check("two words", marketName("NEW ZEALAND (NZ)"), "New Zealand (NZ)");
check("no code", marketName("BANGLADESH"), "Bangladesh");
check("already mixed case", [marketName("Croatia (HRV)"), marketName("CIS - Markets")], ["Croatia (HRV)", "CIS - Markets"]);

// ── Films across a client's market folders ────────────────────────────────────
const folders = [
  { id: "bg", name: "BULGARIA (BG)" },
  { id: "at", name: "AUSTRIA (AT)" },
  { id: "clean", name: "Cleaning Data" },
];
const sheets = [
  { id: "1", name: "FID_Motion_Outdoor", parents: ["bg"], modifiedTime: "2026-09-01T10:00:00Z" },
  { id: "2", name: "FID_Print_Outdoor", parents: ["bg"], modifiedTime: "2026-09-01T10:00:00Z" },
  { id: "3", name: "FID_Motion_Outdoor", parents: ["at"], modifiedTime: "2026-09-01T10:00:00Z" },
  { id: "4", name: "Copy of FID_Motion_Outdoor", parents: ["at"], modifiedTime: "2026-10-01T10:00:00Z" },
  { id: "5", name: "ZZZ_Motion_Outdoor", parents: ["at"], modifiedTime: "2026-09-01T10:00:00Z" },
  { id: "6", name: "Sizes", parents: ["clean"], modifiedTime: "2026-09-01T10:00:00Z" },
  { id: "7", name: "FID_Motion_Outdoor", parents: ["elsewhere"], modifiedTime: "2026-09-01T10:00:00Z" },
];
const films = filmsIn(folders, sheets, { FID: "Forgotten Island" });
check("one film per title and medium, known codes spelt out", films.map((f) => f.label), ["Forgotten Island · Motion", "Forgotten Island · Print", "ZZZ · Motion"]);
check("a film's markets, by name", films[0].markets.map((m) => m.name), ["Austria (AT)", "Bulgaria (BG)"]);
check("two sheets in one market: the most recently changed", films[0].markets[0].sheet.id, "4");
check("only the markets that have the sheet", films[1].markets.map((m) => m.name), ["Bulgaria (BG)"]);
check("the key Refresh finds the film by", films.map((f) => f.key), ["forgotten island|motion", "forgotten island|print", "zzz|motion"]);
check("nothing to list", filmsIn([], []), []);

const spelt = filmsIn(
  [{ id: "hu", name: "Hungary (HUN)" }, { id: "cl", name: "Chile (CHI)" }, { id: "at", name: "Austria (AT)" }],
  [
    { id: "1", name: "Focker In Law - Motion Outdoor", parents: ["hu"] },
    { id: "2", name: "Focker In-Law - Motion Outdoor", parents: ["cl"] },
    { id: "3", name: "Focker In-Law - Motion Outdoor", parents: ["at"] },
    { id: "4", name: "Focker In Law - Print and Digital Outdoor", parents: ["hu", "cl", "at"] },
  ],
);
check("punctuation doesn't split a film", spelt.map((f) => [f.key, f.markets.length]), [["focker in law|motion", 3], ["focker in law|print", 1]]);
check("titled the way most markets spell it", spelt.map((f) => f.label), ["Focker In-Law · Motion", "Focker In Law · Print"]);

check("clients", [clientFor("universal")?.label, clientFor("paramount")?.label, clientFor("index")], ["Universal", "Paramount", null]);

// ── A market's own workbook ───────────────────────────────────────────────────
const HEAD = ["MARKET", "Are your orders confirmed?", "MEDIA SITE NAME", "WIDTH", "HEIGHT", "DURATION", "DELIVERY DEADLINE"];
const sheet = (title, rows) => [[title], [], HEAD, ...rows];

const croatia = marketFromSheets({
  _StandardSizes: [["Name", "Width"]],
  AA_Test_Market: sheet("MARKET - [MOTION] - ORDER FORM", [["OV", "Y", "ignore", 1, 1, 5, "01/11/2026"]]),
  "Croatia (HRV)": sheet("CROATIA - [MOTION] - ORDER FORM", [["HR", "CONFIRMED", "Foyer", 1920, 1080, 15, "01/11/2026"], ["HR", "", "Lobby", 10, 20, 5, ""]]),
}, "Croatia");
check("named after its folder", croatia.name, "Croatia");
check("code from the sheet's tab", croatia.code, "HRV");
check("orders from the market tab only", croatia.orders.map((o) => o.siteName), ["Foyer"]);
check("kind", croatia.kind, "motion");
check("readable", croatia.unreadable, null);
check("rows with no deadline are counted, not listed", croatia.undated, 1);

const twoTabs = marketFromSheets({
  "Batch 1": sheet("X - [PRINT] - ORDER FORM", [["HR", "Y", "One", 10, 20, "", "01/11/2026"]]),
  "Batch 2": sheet("X - [PRINT] - ORDER FORM", [["HR", "N", "Two", 30, 40, "", "02/11/2026"], ["HR", "", "Three", 1, 1, "", ""]]),
}, "Croatia");
check("several order tabs are read together", twoTabs.orders.map((o) => [o.siteName, o.tab]), [["One", "Batch 1"], ["Two", "Batch 2"]]);
check("undated rows add up across tabs", twoTabs.undated, 1);

check("a workbook with no order form", marketFromSheets({ Notes: [["hello"]] }, "Croatia").unreadable, "No header row found");
check("a workbook with only helper tabs", marketFromSheets({ _Control: [["x"]] }, "Croatia").unreadable, "No order form tab in this sheet");

// ── Flags ─────────────────────────────────────────────────────────────────────
import { marketFlag } from "../src/components/orderForms/format.js";
import { TERRITORY_FLAGS } from "../src/constants.js";

check("flag: a market by its plain name", marketFlag("Croatia"), TERRITORY_FLAGS.Croatia);
check("flag: two words", marketFlag("New Zealand"), TERRITORY_FLAGS["New Zealand"]);
check("flag: a tab name with its code", marketFlag("Germany (GER)"), TERRITORY_FLAGS.Germany);
check("flag: surrounding spaces", marketFlag("  Spain  "), TERRITORY_FLAGS.Spain);
check("flag: unknown market shows none", marketFlag("Atlantis"), "");
check("flag: empty", marketFlag(""), "");
check("flag: Universal's folder names", ["Bulgaria (BG)", "Austria (AT)"].map(marketFlag), [TERRITORY_FLAGS.Bulgaria, TERRITORY_FLAGS.Austria]);
check("flag: sheet spellings the app names differently",
  ["Czechia (CZE)", "Turkey", "United Kingdom", "Korea (KOR)", "Georgia (CIS)"].map(marketFlag),
  [TERRITORY_FLAGS["Czech Republic"], TERRITORY_FLAGS["Türkiye"], TERRITORY_FLAGS.UK, TERRITORY_FLAGS.Korea, TERRITORY_FLAGS.Georgia]);

// ── Is a loaded film still in Drive? ──────────────────────────────────────────
{
  const loaded = (n) => ({ source: { clientId: "universal", filmKey: "disclosure day|motion" }, markets: Array.from({ length: n }, (_, i) => ({ name: `M${i}` })) });
  const drive = (n) => [{ key: "disclosure day|motion", markets: Array.from({ length: n }, () => ({})) }];
  check("its sheets are all gone", driveStaleness(loaded(40), []), { gone: true });
  check("most of its markets are gone", driveStaleness(loaded(40), drive(3)), { left: 3, had: 40 });
  check("still there", driveStaleness(loaded(40), drive(38)), null);
  check("a small film losing a market isn't flagged", driveStaleness(loaded(2), drive(1)), null);
  check("a dropped workbook has nothing to compare with", driveStaleness({ markets: [] }, drive(1)), null);
  check("Drive not listed yet: nothing claimed", driveStaleness(loaded(40), undefined), null);
  const studio = [{ key: "disclosure day|motion", markets: [{}] }, { key: "forgotten island|motion", markets: Array.from({ length: 44 }, () => ({})) }];
  check("already down to one market when it was loaded, beside a full film", driveStaleness(loaded(1), studio), { left: 1, typical: 44 });
  check("a studio whose films are all small isn't flagged", driveStaleness(loaded(1), [{ key: "disclosure day|motion", markets: [{}] }, { key: "x|motion", markets: [{}, {}] }]), null);
  const hyphened = { source: { clientId: "paramount", filmKey: "focker in-law|motion" }, markets: Array.from({ length: 67 }, (_, i) => ({ name: `M${i}` })) };
  check("a film saved under an older key is still found", driveStaleness(hyphened, [{ key: "focker in law|motion", markets: Array.from({ length: 67 }, () => ({})) }]), null);
}
check("same film whatever the punctuation", [sameFilm("focker in-law|motion", "focker in law|motion"), sameFilm("focker in law|motion", "focker in law|print"), sameFilm("", "")], [true, false, false]);

