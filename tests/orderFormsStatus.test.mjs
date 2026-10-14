import { orderUrgency, marketSummary, fileTotals, sortMarkets } from "../src/lib/orderForms/status.js";

const TODAY = "2026-10-07";
// Every order has a delivery deadline: that is what makes a row an order.
const order = (status, deliveryDeadline = "2026-12-01", mediaApproved = "") => ({ status, deliveryDeadline, mediaApproved });
const market = (name, orders, unreadable = null, undated = 0) => ({ name, code: "", unreadable, orders, undated });

// ── Urgency ───────────────────────────────────────────────────────────────────
check("due today", orderUrgency(order("pending", "2026-10-07"), TODAY), "dueSoon");
check("due in 7 days", orderUrgency(order("pending", "2026-10-14"), TODAY), "dueSoon");
check("due in 8 days is not urgent", orderUrgency(order("pending", "2026-10-15"), TODAY), null);
check("yesterday is overdue", orderUrgency(order("unanswered", "2026-10-06"), TODAY), "overdue");
check("confirmed is never urgent", orderUrgency(order("confirmed", "2026-10-01"), TODAY), null);
check("month boundary", orderUrgency(order("pending", "2026-11-03"), "2026-10-28"), "dueSoon");

// ── Market status ─────────────────────────────────────────────────────────────
const s = (orders, unreadable, undated) => marketSummary(market("X", orders, unreadable, undated), TODAY);

check("no orders: not started", s([]).status, "notStarted");
check("orders in, none answered: unconfirmed", s([order("unanswered"), order("unanswered")]).status, "unconfirmed");
check("every order confirmed: confirmed", s([order("confirmed"), order("confirmed")]).status, "confirmed");
check("any pending: pending", s([order("confirmed"), order("pending")]).status, "pending");
// Kazakhstan on Street Fighter: 8 confirmed, 4 never answered.
check("some confirmed, some unanswered: pending, not confirmed",
  s([order("confirmed"), order("confirmed"), order("unanswered")]).status, "pending");
check("pending and unanswered: pending", s([order("pending"), order("unanswered")]).status, "pending");
check("unreadable", s([], "No header row found").status, "unreadable");
check("rows without a deadline are carried through", s([], null, 3).undated, 3);
check("a market with only undated rows has not started", s([], null, 3).status, "notStarted");

const mixed = s([
  order("confirmed", "2026-10-02", "Yes"),
  order("pending", "2026-10-20", "No"),
  order("pending", "2026-10-09", "approved"),
  order("unanswered"),
]);
check("counts", [mixed.total, mixed.confirmed, mixed.pending, mixed.unanswered], [4, 1, 2, 1]);
check("media approved count", mixed.mediaApproved, 2);
check("next deadline skips confirmed orders", mixed.nextDeadline, "2026-10-09");
check("market urgency", mixed.urgency, "dueSoon");

check("overdue outranks due soon",
  s([order("pending", "2026-10-09"), order("pending", "2026-10-01")]).urgency, "overdue");
check("all confirmed: earliest deadline, no urgency",
  [s([order("confirmed", "2026-10-20"), order("confirmed", "2026-10-02")]).nextDeadline,
   s([order("confirmed", "2026-10-02")]).urgency],
  ["2026-10-02", null]);

// ── File totals and default order ─────────────────────────────────────────────
const file = {
  markets: [
    market("Japan", []),
    market("Germany", [order("confirmed", "2026-10-30")]),
    market("Italy", [order("pending", "2026-11-20")]),
    market("France", [order("pending", "2026-10-09")]),
    market("Spain", [order("pending", "2026-10-01")]),
    market("Croatia", [order("unanswered", "2026-12-01")]),
    market("Broken", [], "No header row found"),
  ],
};
check("totals", fileTotals(file, TODAY), { markets: 7, orders: 5, confirmed: 1, requested: 0, pending: 3, unconfirmed: 1, due: 2, notStarted: 1 });

const sorted = sortMarkets(file.markets.map((m) => marketSummary(m, TODAY))).map((m) => m.name);
check("default order: urgent, pending, unconfirmed, confirmed, not started, unreadable",
  sorted, ["Spain", "France", "Italy", "Croatia", "Germany", "Japan", "Broken"]);

// ── Requests received ─────────────────────────────────────────────────────────
check("a request XYi hasn't ticked yet: the market is at request received",
  [s([order("requested"), order("confirmed")]).status, s([order("requested"), order("pending")]).status, s([order("requested")]).requested],
  ["requested", "requested", 1]);
check("a request past its deadline is overdue", orderUrgency(order("requested", "2026-10-06"), TODAY), "overdue");

// ── Rows set aside ────────────────────────────────────────────────────────────
{
  const { applySetAside } = await import("../src/lib/orderForms/status.js");
  const { orderKey } = await import("../src/lib/orderForms/wrikeMatch.js");
  const o = (row) => ({ tab: "T", row, status: "pending", deliveryDeadline: "2026-12-01", xyi: { title: "A_B_C_D" } });
  const file = { markets: [{ name: "NZ", orders: [o(3), o(4), o(5)] }, { name: "AU", orders: [o(3)] }], ignored: { NZ: [orderKey(o(4))] } };
  const shown = applySetAside(file);
  check("a row set aside leaves the orders and is kept to one side", [shown.markets[0].orders.map((x) => x.row), shown.markets[0].setAside.map((x) => x.row)], [[3, 5], [4]]);
  check("it stops counting", marketSummary(shown.markets[0], "2026-10-12").total, 2);
  check("other markets are untouched, even with the same row", shown.markets[1].orders.length, 1);
  check("the file as read is not changed", file.markets[0].orders.length, 3);
  check("nothing set aside: the same file", applySetAside({ markets: [] }).markets, []);
}

// ── Across films, for the profile ─────────────────────────────────────────────
{
  const { ordersByMarket } = await import("../src/lib/orderForms/status.js");
  const o = (row, status, deliveryDeadline) => ({ tab: "T", row, status, deliveryDeadline, artwork: "Trio", xyi: { title: `A_B_C_${row}` } });
  const files = [
    { id: "f1", name: "Film One", kind: "print", loadedAt: "t", source: { clientId: "paramount" }, markets: [
      { name: "NZ", sheetUrl: "https://sheet", orders: [o(3, "requested", "2026-10-08"), o(4, "requested", "2026-10-15"), o(5, "requested", "2026-12-01"), o(6, "confirmed", "2026-10-01"), o(7, "requested", "2026-02-11"), o(8, "requested", "2026-12-02")] },
      { name: "Bad", unreadable: "x", orders: [] },
    ] },
    { id: "f2", name: "Film Two", kind: "motion", loadedAt: "t", markets: [{ name: "AU", orders: [o(3, "pending", "2026-12-05"), o(4, "pending", "2026-10-05")] }] },
    { id: "f3", name: "Wrapped", kind: "motion", loadedAt: "t", wrapped: true, markets: [{ name: "DE", orders: [o(3, "requested", "2026-08-01")] }] },
  ];
  // Row 8 is in Wrike already; row 3's task there is delivered.
  const matchFor = (file, market) => market.orders.map((order) =>
    file.id === "f1" && order.row === 8 ? { task: { id: "t8", status: "Active" } }
      : file.id === "f1" && order.row === 3 ? { task: { id: "t3", status: "Active", customStatusName: "Delivered" } }
      : null);
  const got = ordersByMarket(files, "2026-10-12", matchFor);
  const rows = (list) => got[list].map((g) => [g.film, g.market, g.orders.map((x) => x.row)]);

  check("overdue is markets, soonest first, and only the recent", rows("overdue"), [["Film Two", "AU", [4]]]);
  check("an order whose Wrike task is delivered isn't overdue, whatever the sheet says", got.overdue.some((g) => g.orders.some((x) => x.row === 3)), false);
  check("long overdue is its own list", rows("longOverdue"), [["Film One", "NZ", [7]]]);
  check("due this week", rows("dueSoon"), [["Film One", "NZ", [4]]]);
  check("to pick up: requested and not in Wrike yet", rows("requested"), [["Film One", "NZ", [5]]]);
  check("pending", rows("pending"), [["Film Two", "AU", [3]]]);
  check("a group knows what can be done with it", [got.dueSoon[0].canBrief, got.dueSoon[0].toBrief, got.dueSoon[0].sheetUrl, got.dueSoon[0].oldest, got.overdue[0].canBrief], [true, 1, "https://sheet", "2026-10-15", false]);
  check("a film marked as wrapping up is left out, but still listed", [got.films.map((f) => [f.film, f.wrapped, f.orders]), got.longOverdue.some((g) => g.film === "Wrapped")],
    [[["Film One", false, 6], ["Film Two", false, 2], ["Wrapped", true, 0]], false]);
  check("nothing loaded", ordersByMarket([], "2026-10-12").films, []);
  const noArt = ordersByMarket([{ id: "f", name: "F", kind: "print", loadedAt: "t", source: { clientId: "paramount" }, markets: [{ name: "NZ", orders: [{ ...o(4, "requested", "2026-10-15"), artwork: "" }] }] }], "2026-10-12");
  check("an order without its artwork isn't counted as ready to brief", noArt.dueSoon[0].toBrief, 0);
  check("and waits for its artwork instead", [noArt.toBrief.length, noArt.waitingArtwork[0].orders.length], [0, 1]);
  check("a briefable order is also listed to brief", got.toBrief[0].toBrief > 0, true);
}

// ── Changes between reads ─────────────────────────────────────────────────────
{
  const { changeKeys, marketChanges, mergeChanges, fileChanges, changesNote } = await import("../src/lib/orderForms/status.js");
  const o = (title, status = "requested", deliveryDeadline = "2026-11-01", row = 1) => ({ tab: "T", row, status, deliveryDeadline, xyi: { title } });
  const before = { name: "NZ", orders: [o("F_A_B_NZ", "requested", "2026-11-01", 3), o("F_C_D_NZ", "requested", "2026-11-01", 4), o("F_E_F_NZ", "requested", "2026-11-01", 5)] };
  const after = { name: "NZ", orders: [
    o("F_A_B_NZ", "confirmed", "2026-11-01", 4), // confirmed, and moved down a row
    o("F_C_D_NZ", "requested", "2026-11-09", 5), // date moved
    o("F_G_H_NZ", "requested", "2026-11-01", 6), // new
  ] };
  const c = marketChanges(before, after);
  check("what changed, whatever rows the orders are on now", [c.added, c.confirmed, c.moved, c.removed], [["T|f_g_h_nz"], ["T|f_a_b_nz"], ["T|f_c_d_nz"], 1]);
  check("nothing changed", marketChanges(before, before), null);
  check("the same order twice is two orders", changeKeys([o("F_A_B_NZ"), o("F_A_B_NZ")]), ["T|f_a_b_nz", "T|f_a_b_nz#2"]);
  check("a second identical order added", marketChanges({ orders: [o("F_A_B_NZ")] }, { orders: [o("F_A_B_NZ"), o("F_A_B_NZ")] }).added, ["T|f_a_b_nz#2"]);
  check("said in a line", changesNote(c), "1 new · 1 confirmed · 1 date moved · 1 gone");
  check("unseen changes are kept under newer ones", mergeChanges(c, { added: ["x"], confirmed: [], moved: [], removed: 2 }).added.concat(mergeChanges(c, { added: ["x"], confirmed: [], moved: [], removed: 2 }).removed), ["T|f_g_h_nz", "x", 3]);
  const files = fileChanges({ markets: [before, { name: "AU", orders: [] }], changes: { AU: { added: ["old"], confirmed: [], moved: [], removed: 0 } } },
    { markets: [after, { name: "AU", orders: [] }, { name: "New", orders: [o("F_Z_Z_XX")] }, { name: "Bad", unreadable: "x", orders: [] }] });
  check("a film read again: changed markets, unseen ones kept, a new market all new", [Object.keys(files), files.AU.added, files.New.added], [["NZ", "AU", "New"], ["old"], ["T|f_z_z_xx"]]);
}

// ── What the rest of the team did ─────────────────────────────────────────────
{
  const { teamNews } = await import("../src/lib/orderForms/status.js");
  const o = (title, status = "requested") => ({ tab: "T", row: 1, status, deliveryDeadline: "2026-11-01", xyi: { title } });
  const film = (over = {}) => ({ id: "f", name: "Paramount · Focker In Law · Print", loadedAt: "t1", markets: [{ name: "Slovakia (SVK)", orders: [o("F_A_B_SK")] }, { name: "Austria (AT)", orders: [] }], ...over });
  const keeley = { id: "K", name: "Keeley Jones" };
  const texts = (before, after, me = "ME") => teamNews(before, after, me).map((n) => n.text);

  const refreshed = film({ loadedAt: "t2", loadedBy: keeley, markets: [{ name: "Slovakia (SVK)", orders: [o("F_A_B_SK", "confirmed"), o("F_C_D_SK")] }, { name: "Austria (AT)", orders: [] }] });
  check("someone else's refresh, and what it found", texts([film()], [refreshed]), ["Keeley Jones refreshed Paramount · Focker In Law · Print: Slovakia (SVK), 1 new · 1 confirmed."]);
  check("it points at the one market that changed", teamNews([film()], [refreshed], "ME")[0].market, "Slovakia (SVK)");
  check("my own refresh from another tab isn't news", texts([film()], [refreshed], "K"), []);
  check("a refresh that found nothing new isn't news", texts([film()], [film({ loadedAt: "t2", loadedBy: keeley })]), []);
  check("several markets are counted, not listed",
    texts([film()], [film({ loadedAt: "t2", loadedBy: keeley, markets: [{ name: "Slovakia (SVK)", orders: [] }, { name: "Austria (AT)", orders: [o("F_Z_Z_AT")] }] })]),
    ["Keeley Jones refreshed Paramount · Focker In Law · Print: 2 markets changed."]);

  check("orders briefed and rows set aside by someone else",
    texts([film({ ignored: { "Austria (AT)": ["a", "b"] } })], [film({ decidedBy: keeley, briefed: { "Slovakia (SVK)": { k1: {}, k2: {} } }, ignored: { "Austria (AT)": ["a"] } })]),
    ["Keeley Jones briefed 2 orders into Wrike for Slovakia (SVK) (Paramount · Focker In Law · Print).", "Keeley Jones brought 1 row back in Austria (AT) (Paramount · Focker In Law · Print)."]);
  check("my own decisions aren't news", texts([film()], [film({ decidedBy: { id: "ME" }, ignored: { "Austria (AT)": ["a"] } })]), []);

  check("a film someone loaded, and one that was removed",
    texts([film()], [film({ id: "g", name: "Universal · Forgotten Island · Motion", loadedBy: keeley })]),
    ["Keeley Jones loaded Universal · Forgotten Island · Motion.", "Paramount · Focker In Law · Print was removed from Client Orders."]);
  check("nothing happened", texts([film()], [film()]), []);
}

// Delivered markets.
{
  const { taskDelivered, marketDelivery } = await import("../src/lib/orderForms/status.js");
  check("what counts as delivered", [
    { customStatusName: "Delivered" }, { status: "Completed", customStatusName: "Approved" }, { customStatusName: "Delivering" },
    { customStatusName: "Prep for Delivery" }, { customStatusName: "On hold" }, null,
  ].map(taskDelivered), [true, true, false, false, false, false]);
  const t = (name) => ({ task: { customStatusName: name } });
  check("a market is delivered once every order is",
    [marketDelivery([t("Delivered"), t("Delivered")], 2), marketDelivery([t("Delivered"), null], 2), marketDelivery([], 0)],
    [{ delivered: 2, done: true }, { delivered: 1, done: false }, { delivered: 0, done: false }]);
  check("a cancelled order doesn't hold its market open, but a market of nothing but cancelled ones isn't delivered",
    [marketDelivery([t("Delivered"), t("Cancelled")], 2).done, marketDelivery([t("Cancelled")], 1).done], [true, false]);
}

// The Control Centre keeps orders whose work is still going out.
{
  const { ordersByMarket } = await import("../src/lib/orderForms/status.js");
  const o = (row) => ({ tab: "T", row, status: "requested", deliveryDeadline: "2026-10-15", artwork: "A", xyi: { title: `A_B_${row}` } });
  const file = { id: "f", name: "F", kind: "motion", loadedAt: "t", source: { clientId: "paramount" }, markets: [{ name: "NZ", orders: [o(1), o(2), o(3), o(4)] }] };
  const statuses = ["Delivering", "Prep for delivery", "Delivered", "Cancelled"];
  const got = ordersByMarket([file], "2026-10-12", (f, m) => m.orders.map((_, i) => ({ task: { customStatusName: statuses[i] } })));
  check("delivering and prep for delivery still count; delivered and cancelled don't", got.dueSoon[0].orders.map((x) => x.row), [1, 2]);
}

// A whole film delivered.
{
  const { filmDelivered } = await import("../src/lib/orderForms/status.js");
  const o = (row) => ({ tab: "T", row, status: "confirmed", xyi: { title: `A_${row}` } });
  const film = { id: "f", markets: [{ name: "NZ", orders: [o(1), o(2)] }, { name: "AU", orders: [o(3)] }, { name: "FJ", orders: [] }] };
  const says = (statuses) => (file, m) => m.orders.map((x) => ({ task: { customStatusName: statuses[x.row] } }));
  check("a film is delivered when every market with orders is",
    [filmDelivered(film, says({ 1: "Delivered", 2: "Delivered", 3: "Delivered" })), filmDelivered(film, says({ 1: "Delivered", 2: "Delivering", 3: "Delivered" })), filmDelivered({ id: "e", markets: [] }, says({}))],
    [true, false, false]);
}
