import { searchIndex, searchOrders, groupHits } from "../src/lib/orderForms/search.js";

const order = (row, extra = {}) => ({ tab: "T", row, status: "requested", deliveryDeadline: "2026-10-20", artwork: "LieDetector", width: 1920, height: 1080, placement: "DOOH", xyi: { title: `FIL_INTL_LieDetector_DOOH_${row}_HR` }, ...extra });
const files = [
  { id: "fil", name: "Paramount · Focker In Law · Motion", kind: "motion", markets: [
    { name: "Croatia (HRV)", orders: [order(4), order(5, { artwork: "", deliveryDeadline: "2026-10-10" }), order(6, { status: "confirmed", siteName: "Zagreb Mall" })] },
  ] },
  { id: "ebzr", name: "Paramount · Ebenezer · Print", kind: "print", markets: [
    { name: "South Africa (RSA)", orders: [order(4, { width: 504, height: 238, xyi: { title: "EBZR_INTL_FOH_ZA" } })] },
  ] },
];
// Croatia's row 4 is in Wrike, on hold.
const matchFor = (file, market) => market.orders.map((o) => (file.id === "fil" && o.row === 4 ? { task: { id: "t", title: "x", customStatusName: "On hold" } } : null));
const index = searchIndex(files, "2026-10-14", matchFor);
const rows = (q) => searchOrders(index, q).hits.map((h) => `${h.fileId}:${h.order.row}`);

check("by film, market or code", [rows("focker"), rows("hrv"), rows("south africa")], [["fil:4", "fil:5", "fil:6"], ["fil:4", "fil:5", "fil:6"], ["ebzr:4"]]);
check("every word must be there", rows("croatia zagreb"), ["fil:6"]);
check("by size, however it's written", [rows("504x238"), rows("504 x 238").length], [["ebzr:4"], 1]);
check("by Wrike status", rows("on hold"), ["fil:4"]);
check("shortcuts", [rows("overdue"), rows("croatia waiting for artwork"), rows("in wrike"), rows("not in wrike").length, rows("confirmed")], [["fil:5"], ["fil:5"], ["fil:4"], 3, ["fil:6"]]);
check("a row", rows("croatia row 5"), ["fil:5"]);
check("what was understood is said", searchOrders(index, "Croatia to brief").shortcuts, ["to brief"]);
check("grouped by market, films in name order", groupHits(searchOrders(index, "liedetector").hits).map((g) => `${g.market}:${g.hits.length}`), ["South Africa (RSA):1", "Croatia (HRV):3"]);
check("nothing asked, nothing found", searchOrders(index, "  ").total, 0);
