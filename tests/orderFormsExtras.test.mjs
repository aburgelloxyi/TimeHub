// Domestic and Launch reads: the sheets' shapes, invented here (the real ones
// are clients' unreleased material).
import { parseDomestic, sheetDate, sheetText, domesticItems, domesticVenues } from "../src/lib/orderForms/domestic.js";
import { parseLaunch, latestReplies, checkImport, marketKey } from "../src/lib/orderForms/launch.js";
import { sameFilmName, extraFilm, extraSummary, isOrderFile } from "../src/lib/orderForms/extras.js";

// ── Domestic ─────────────────────────────────────────────────────────────────

const item = (venue, what, size, site) => {
  const r = Array(22).fill("");
  Object.assign(r, { 0: "O", 1: 101, 3: venue, 4: "Springfield", 5: "IL", 6: what, 7: "Vinyl", 13: "ONLY IN CINEMAS", 14: 46339, 16: "AFTER LAUNCH", 20: size, 21: site });
  return r;
};
const domesticTab = [
  ["WRIKE"],
  ["", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "WIDTH", "HEIGHT"],
  [...Array(17).fill(""), "#VALUE!", "#VALUE!", "#VALUE!", "#VALUE!", "Banner_"],
  item("Grand 8", "Lobby banner", "100x40", "Banner_Grand_8"),
  item("Grand 8", "Lightbox", "50x70", "Lightbox_Grand_8"),
  item("Plaza 3", "Floor decal", "#VALUE!", "Decal_Plaza_3"),
  [],
  ["FilmCode:", "abcd"],
  ["Type:", "Teaser"],
];
const dom = parseDomestic({ Template: [["WRIKE"], ["Studio"]], "Copy of Template": domesticTab }, "Domestic.xlsx", new Date("2026-11-03T12:00:00Z"));

check("domestic: read from the tab with a film code", [dom.section, dom.filmCode, dom.domestic.tabs.length, dom.domestic.tabs[0].type], ["domestic", "ABCD", 1, "Teaser"]);
check("domestic: template rows without a venue are skipped", domesticItems(dom).map((i) => i.item), ["Lobby banner", "Lightbox", "Floor decal"]);
check("domestic: items counted by venue", domesticVenues(dom), 2);
check("domestic: day numbers become dates", domesticItems(dom)[0].date, "2026-11-13");
check("domestic: the Wrike task the sheet would name", domesticItems(dom)[0].task, "ABCD_DOM_Teaser_100x40_Banner_Grand_8");
check("domestic: no task while the size can't be worked out", [domesticItems(dom)[2].size, domesticItems(dom)[2].task], ["", ""]);
check("domestic: the store's markets list is there, empty", dom.markets, []);
check("not a domestic sheet: no film code", parseDomestic({ Sheet1: [["a", "b"]] }, "x.xlsx"), null);
check("formula errors aren't text", [sheetText("#VALUE!"), sheetText("#N/A"), sheetText(" two  words ")], ["", "", "two words"]);
check("text that isn't a date stays itself", sheetDate("ASAP"), "ASAP");

// ── Launch ───────────────────────────────────────────────────────────────────

const form = [
  ["Timestamp", "Your market", "Your Required Formats", "IN CINEMAS SOON", "A NIGHT TO REMEMBER", "Literal or not?", "Include Socials?"],
  [46295.5, "Ruritania", "Digital One Sheet, Instagram (1080x1350)", "SOON IN CINEMAS (R)", "A NIGHT (R)", "Literal", "@rur"],
  [46295.6, "Belgium - French", "Digital One Sheet", "AU CINÉMA", "UNE NUIT", "Literal", ""],
  [46297.5, "Ruritania", "Digital One Sheet, Instagram (1080x1350), Print One Sheet", "FROM 26 NOV (R)", "A NIGHT (R)", "Literal", "@rur"],
  [46297.6, "Belgium-French", "Digital One Sheet", "AU CINÉMA", "UNE NUIT", "Literal", ""],
];
const importTab = [
  ["Filmcode", "ABCD", "", "Key", "Title", "Workflow", "Custom Status", "End Date", "Description", "HO", "Market", "Country", "Department", "Launch", "Reporting", "Format", "Quote"],
  ["Artwork", "NightOut", "", 1, "ABCD_INTL_2025x3000_Online_Teaser_NightOut_RU", "", "", "", "", "", "", "RU", "", "", "", "Digital Mech"],
  ["", "", "", 2, "ABCD_INTL_1080x1350_Insta_Teaser_NightOut_RU", "", "", "", "", "", "", "RU", "", "", "", "Instas"],
  ["", "", "", 3, "ABCD_INTL_Print_Teaser_NightOut_CMYK_RU", "", "", "", "", "", "", "BE_FR", "", "", "", "Digital Mech"],
];
const launch = parseLaunch(
  { "Form responses 1": form, Wrike_Import: importTab },
  "ABCD _ Paramount - NIGHT OUT - Launch Order Form (Responses).xlsx",
);

check("launch: film, studio and artwork from the name", [launch.section, launch.filmCode, launch.studio, launch.launch.artwork], ["launches", "ABCD", "paramount", "Night Out"]);
check("launch: one answer per market, however it's spelled", launch.launch.markets.map((m) => m.market), ["Belgium-French", "Ruritania"]);
check("launch: the newest answer counts", launch.launch.markets[1].lines[0].text, "FROM 26 NOV (R)");
check("launch: and says what it changed", launch.launch.markets[1].changed, ["formats", "IN CINEMAS SOON"]);
check("launch: an identical second answer changes nothing", [launch.launch.markets[0].replaced, launch.launch.markets[0].changed], [1, []]);
check("launch: the form's questions are the artwork's lines", launch.launch.markets[1].lines.map((l) => l.asked), ["IN CINEMAS SOON", "A NIGHT TO REMEMBER"]);
check("launch: pieces are the newest answers' formats", launch.launch.pieces, 4);
check("launch: replies counted as sent", launch.launch.replies, 4);
check("launch: import rows whose country or format disagree with the title",
  [launch.launch.import.tasks, launch.launch.import.offCountry, launch.launch.import.offFormat], [3, 1, 1]);
check("not a launch form: no responses tab", parseLaunch({ Sheet1: [["a"]] }, "x.xlsx"), null);
check("market names compared without spacing or case", marketKey("Belgium - French") === marketKey("BELGIUM-french"), true);
check("latest replies sort by market", latestReplies([{ market: "B", at: "1", formats: [], lines: [] }, { market: "A", at: "1", formats: [], lines: [] }]).map((m) => m.market), ["A", "B"]);
check("an import tab without the columns isn't checked", checkImport([["x"]], "ABCD"), null);

// ── Finding the film ─────────────────────────────────────────────────────────

check("a film named by the start of its title", sameFilmName("Ebenezer", "Ebenezer: A Christmas Carol"), true);
check("but not by a few letters", sameFilmName("Ebe", "Ebenezer"), false);
check("different films stay apart", sameFilmName("Forgotten Island", "Ebenezer"), false);
check("the code's name when the Canvas knows it", extraFilm({ filmCode: "ABCD" }, { ABCD: "Night Out" }), "Night Out");
check("else the code", extraFilm({ filmCode: "ABCD" }, {}), "ABCD");
check("the drawer's figures", [extraSummary(dom), extraSummary(launch)], [{ count: 3, detail: "2 venues" }, { count: 2, detail: "4 pieces" }]);
check("order forms and the rest told apart", [isOrderFile({ markets: [] }), isOrderFile(dom), isOrderFile(launch)], [true, false, false]);
