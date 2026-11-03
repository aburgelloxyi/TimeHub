// Batches prepared on a market, and rows that look like one order twice.
import { takeOut, groupInto, addTo, renameBatch, disband, placeBatches, batchSizes, findDuplicates, batchColour, BATCH_COLOURS } from "../src/lib/orderForms/batches.js";
import { orderKey } from "../src/lib/orderForms/wrikeMatch.js";
import { artworkChosen } from "../src/lib/orderForms/artwork.js";

const order = (row, extra = {}) => ({ tab: "Bulgaria (BG)", row, xyi: { title: `FILM_INTL_${row}_BG` }, artwork: "Teaser", width: "1080", height: "1920", ...extra });
const orders = [order(10), order(11), order(12, { width: "1920", height: "1080" }), order(13)];
const k = (i) => orderKey(orders[i]);

// ── Grouping ─────────────────────────────────────────────────────────────────
const one = groupInto([], [k(0), k(1)], { name: " FILM - BG - Batch 1 ", due: "2026-11-20" });
check("a new batch holds its orders, its name tidied", [one.length, one[0].keys, one[0].name, one[0].due], [1, [k(0), k(1)], "FILM - BG - Batch 1", "2026-11-20"]);
const two = groupInto(one, [k(1), k(2)], { name: "Batch 2" });
check("an order moved to a new batch leaves its old one", [two[0].keys, two[1].keys], [[k(0)], [k(1), k(2)]]);
check("a batch left empty goes", takeOut(two, [k(0)]).map((b) => b.name), ["Batch 2"]);
const moved = addTo(two, two[0].id, [k(2), k(3)]);
check("adding to a batch keeps its place and takes the orders from others", [moved.map((b) => b.name), moved[0].keys, moved[1].keys], [["FILM - BG - Batch 1", "Batch 2"], [k(0), k(2), k(3)], [k(1)]]);
check("adding the only orders of the other batch keeps the target", addTo(one, one[0].id, [k(0)]).map((b) => b.keys), [[k(1), k(0)]]);
check("adding to a batch that isn't there changes nothing but the take-out", addTo(one, "nope", [k(0)]).map((b) => b.keys), [[k(1)]]);
check("renamed", renameBatch(one, one[0].id, { name: "X", due: "2026-12-01" })[0], { ...one[0], name: "X", due: "2026-12-01" });
check("disbanded", disband(two, two[0].id).length, 1);

// ── Against the market as it is now ──────────────────────────────────────────
const placed = placeBatches([...two, { id: "gone", name: "Old", keys: ["Bulgaria (BG)|99|x"] }], orders);
check("rows by batch, in sheet order, numbered and coloured", placed.batches.map((b) => [b.number, b.rows, b.colour]), [[1, [0], batchColour(0)], [2, [1, 2], batchColour(1)], [3, [], batchColour(2)]]);
check("which batch a row is in", [placed.byRow.get(2)?.name, placed.byRow.has(3)], ["Batch 2", false]);
check("a row that moved in the sheet isn't held by its old key", placed.batches[2].rows, []);
check("colours wrap round", batchColour(BATCH_COLOURS.length), BATCH_COLOURS[0]);
check("sizes at a glance, most first", batchSizes(orders, [0, 1, 2, 3]), [{ size: "1080x1920", n: 3 }, { size: "1920x1080", n: 1 }]);
check("a row with no size says so", batchSizes([{ width: "" }], [0]), [{ size: "no size", n: 1 }]);
check("a unit other than pixels is shown", batchSizes([{ width: "70", height: "100", unit: "cm" }], [0]), [{ size: "70x100 cm", n: 1 }]);

// ── Duplicates ───────────────────────────────────────────────────────────────
const dupes = findDuplicates(orders, "Bulgaria (BG)");
check("same artwork, country and size: each points at the others", [dupes.get(0), dupes.get(1), dupes.get(3)], [[1, 3], [0, 3], [0, 1]]);
check("another size isn't a duplicate", dupes.has(2), false);
check("another artwork isn't", findDuplicates([order(1), order(2, { artwork: "Main" })]).size, 0);
check("artwork compared without case or spacing", findDuplicates([order(1, { artwork: "Teaser  1" }), order(2, { artwork: "teaser 1" })]).size, 2);
check("two countries in one tab aren't duplicates", findDuplicates([order(1, { marketCode: "AR" }), order(2, { marketCode: "CL" })]).size, 0);
check("two lengths are two files", findDuplicates([order(1, { duration: "10" }), order(2, { duration: "15" })]).size, 0);
check("one length missing still matches", findDuplicates([order(1, { duration: "10" }), order(2)]).size, 2);
check("rows with no artwork or size aren't compared", findDuplicates([order(1, { artwork: "" }), order(2, { artwork: "" }), order(3, { width: "" }), order(4, { width: "" })]).size, 0);

// ── Artwork chosen, or a placeholder ─────────────────────────────────────────
check("placeholders aren't artwork", ["TBC", "tbc", "TBCStatic", "TBC Static", "TBC - Static", "TBA", "TBD", "to be confirmed", "N/A", "n/a", "none", "-", "?", "", "  "].filter(artworkChosen), []);
check("real artwork is", ["Teaser", "Main 1Sht", "CandleSmoke", "Nature", "Tbcats Payoff", "NA Teaser"].map(artworkChosen), [true, true, true, true, true, true]);
check("rows on a placeholder artwork aren't duplicates", findDuplicates([order(1, { artwork: "TBCStatic" }), order(2, { artwork: "TBCStatic" })]).size, 0);
