// ── Access control ────────────────────────────────────────────────────────────
// Its own tiny module, not part of Management.jsx, because App and the Rail
// need it at startup and Administration is lazy-loaded.
//
// Who may open Administration is profiles.is_admin, ticked in Administration ›
// People. The database enforces it (the profiles_write policy and the
// guard_profile_grants trigger); this only decides what the app offers.
//
// Client Orders is its own grant, profiles.can_client_orders, ticked there
// too; the Worker's /api/orders is what enforces it.
//
// Both flags are cached per person so the menu is right on the first frame.
// MANAGEMENT_IDS is the answer only until the signed-in person's profile has
// been read with the is_admin column in it.
const ADMIN_CACHE_KEY = "xyi_is_admin";

export const MANAGEMENT_IDS = [
  "KUAWDLVN", // Antonio Burgello
  "KUAQT4JC", // Guillaume Rater
  "KUAQGSEW", // Ben Gladwyn
];

function cached(wrikeUserId) {
  try {
    const saved = JSON.parse(localStorage.getItem(ADMIN_CACHE_KEY) || "null");
    return saved?.uid === wrikeUserId ? saved : {};
  } catch {
    return {};
  }
}

// Called with the signed-in person's profile row (read with select *).
export function rememberAccess(wrikeUserId, profile) {
  if (!wrikeUserId || !profile || !("is_admin" in profile)) return;
  const here = !profile.left_at;
  localStorage.setItem(ADMIN_CACHE_KEY, JSON.stringify({
    uid: wrikeUserId,
    admin: !!profile.is_admin && here,
    orders: !!profile.can_client_orders && here,
  }));
}

export const isManager = (wrikeUserId) => {
  const { admin } = cached(wrikeUserId);
  return admin !== undefined ? admin : MANAGEMENT_IDS.includes(wrikeUserId);
};

// Whether this person has Client Orders: true or false once their profile has
// been read, undefined before (the page is then offered as by department, and
// the Worker still refuses anyone without the grant).
export const canUseClientOrders = (wrikeUserId) => cached(wrikeUserId).orders;

// The pages a manager has whatever their department: Administration, and the
// Job Book and Order Forms, which are otherwise the Project Managers' alone.
// Order Forms (Client Orders) is then only for those granted it.
// Listed in the order they lead the menu; a work-in-progress page is moved to
// the end instead (see pageIdsFor).
export const MANAGER_PAGE_IDS = ["management", "jobbook", "orderforms"];
