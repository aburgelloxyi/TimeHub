const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
const { isManager, rememberAccess, canUseClientOrders } = await import("../src/lib/access.js");
const { pageIdsFor, hasOrdersToday } = await import("../src/lib/departments.js");

check("access: before the profile is read, the fallback list decides", [isManager("KUAWDLVN"), isManager("X1")], [true, false]);
rememberAccess("X1", { department: "Motion" });
check("access: a profile without is_admin changes nothing", isManager("X1"), false);
rememberAccess("X1", { is_admin: true, left_at: null });
check("access: is_admin grants it", isManager("X1"), true);
check("access: the cache is for that person only", isManager("KUAWDLVN"), true);
rememberAccess("KUAWDLVN", { is_admin: false });
check("access: unticking removes it", isManager("KUAWDLVN"), false);
rememberAccess("X1", { is_admin: true, left_at: "2026-10-01T00:00:00Z" });
check("access: a leaver loses it", isManager("X1"), false);

// Client Orders, granted per person.
check("client orders: unknown before the profile is read, so the department decides", [canUseClientOrders("PM1"), pageIdsFor("PM", "PM1").includes("orderforms")], [undefined, true]);
rememberAccess("PM1", { is_admin: false, can_client_orders: false });
check("client orders: a PM without the grant loses the page and the Control Centre", [pageIdsFor("PM", "PM1").includes("orderforms"), hasOrdersToday("PM", "PM1")], [false, false]);
rememberAccess("PM1", { is_admin: false, can_client_orders: true });
check("client orders: with it, both", [pageIdsFor("PM", "PM1").includes("orderforms"), hasOrdersToday("PM", "PM1")], [true, true]);
rememberAccess("AD1", { is_admin: true, can_client_orders: false });
check("client orders: being an admin isn't enough", [pageIdsFor("Operations", "AD1").includes("management"), pageIdsFor("Operations", "AD1").includes("orderforms")], [true, false]);
rememberAccess("PM1", { is_admin: false, can_client_orders: true, left_at: "2026-10-01T00:00:00Z" });
check("client orders: a leaver loses it", canUseClientOrders("PM1"), false);
