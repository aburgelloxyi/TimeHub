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
  const { ordersNeedingAttention } = await import("../src/lib/orderForms/status.js");
  const o = (row, status, deliveryDeadline) => ({ tab: "T", row, status, deliveryDeadline, xyi: { title: "A_B_C_D" } });
  const files = [
    { id: "f1", name: "Film One", kind: "print", loadedAt: "2026-10-13T09:00:00Z", markets: [
      { name: "NZ", orders: [o(3, "requested", "2026-10-01"), o(4, "requested", "2026-10-15"), o(5, "requested", "2026-12-01"), o(6, "confirmed", "2026-10-01")] },
      { name: "Bad", unreadable: "x", orders: [] },
    ] },
    { id: "f2", name: "Film Two", kind: "motion", loadedAt: "2026-10-13T09:00:00Z", markets: [
      { name: "AU", orders: [o(3, "pending", "2026-12-05"), o(4, "pending", "2026-09-30")] },
    ] },
  ];
  const got = ordersNeedingAttention(files, "2026-10-12");
  check("overdue across films, soonest first", got.overdue.map((e) => [e.film, e.market, e.order.row]), [["Film Two", "AU", 4], ["Film One", "NZ", 3]]);
  check("due this week", got.dueSoon.map((e) => e.order.row), [4]);
  check("requests not picked up, without the ones already listed as late or due", got.requested.map((e) => e.order.row), [5]);
  check("pending", got.pending.map((e) => [e.film, e.order.row]), [["Film Two", 3]]);
  check("a line per film", got.films.map((f) => [f.film, f.orders, f.overdue, f.dueSoon, f.requested, f.pending]), [["Film One", 4, 1, 1, 1, 0], ["Film Two", 2, 1, 0, 0, 1]]);
  check("nothing loaded", ordersNeedingAttention([], "2026-10-12").films, []);
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
