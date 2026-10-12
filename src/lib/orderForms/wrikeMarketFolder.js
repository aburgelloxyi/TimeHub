// A market's folder in Wrike: the country folder inside a film's
// "…_INTL_DIGITAL_Outdoor_Campaign_Markets" (motion) or "…_INTL_PRINT_…"
// (print) folder, where that market's order tasks go.
//
// Same rule as wrikeCampaign.js: planning only reads and says exactly what
// would be made; creating happens after someone confirms that.

import {
  fetchAllFolders, findFilmLocation, collectSubtreeIds, discoverDriveLinkField,
  createFolderIn, setFolderField, fetchFolderPermalink,
} from "../wrikeCampaign";
import { marketFlag } from "../../components/orderForms/format";

const norm = (s) => String(s || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const bareName = (market) => String(market || "").replace(/\s*\([^)]*\)\s*$/, "").trim();

const MARKETS_FOLDER = { motion: /_INTL_DIGITAL_Outdoor_Campaign_Markets$/i, print: /_INTL_PRINT_Outdoor_Campaign_Markets$/i };

// Pure. `byId` is the Wrike folder tree (fetchAllFolders). Returns
// { ok: false, reason } when the place for the folder can't be pinned down to
// exactly one, and otherwise where it goes, what it would be called, and the
// folder already there for this market if there is one.
export function planMarketFolder(byId, { filmTitle, kind, marketName }) {
  const location = findFilmLocation(byId, filmTitle);
  if (!location) return { ok: false, reason: `No film called "${filmTitle}" was found in Wrike.` };

  const wanted = MARKETS_FOLDER[kind] || MARKETS_FOLDER.motion;
  const parents = [...collectSubtreeIds(byId, location.filmProject.id)]
    .map((id) => byId[id])
    .filter((f) => f && wanted.test(f.title.trim()));
  const medium = kind === "print" ? "Print" : "Digital";
  if (!parents.length) {
    return { ok: false, reason: `${location.filmProject.title} has no ${medium} "Outdoor_Campaign_Markets" folder in Wrike yet.` };
  }
  if (parents.length > 1) {
    return { ok: false, reason: `${location.filmProject.title} has ${parents.length} ${medium} "Outdoor_Campaign_Markets" folders in Wrike (${parents.map((p) => p.title).join(", ")}), so it isn't clear which one to add to.` };
  }

  const parent = parents[0];
  const bare = bareName(marketName);
  const flag = marketFlag(marketName);
  // Already there under another spelling ("Czech Republic" for "Czechia") still
  // carries the same flag.
  const existing = (parent.childIds || [])
    .map((id) => byId[id])
    .find((f) => f && (norm(f.title) === norm(bare) || (flag && f.title.includes(flag))));

  return {
    ok: true,
    film: location.filmProject.title,
    parent: { id: parent.id, title: parent.title },
    title: flag ? `${bare} ${flag}` : bare,
    existing: existing ? { id: existing.id, title: existing.title } : null,
  };
}

// Reads Wrike and plans. Also says which custom field the Drive link would go
// in (`field`), or null when the account has none.
export async function planMarketFolderLive(request) {
  const [byId, field] = await Promise.all([fetchAllFolders(), discoverDriveLinkField().catch(() => null)]);
  const plan = planMarketFolder(byId, request);
  if (plan.ok && plan.existing) plan.existing.permalink = await fetchFolderPermalink(plan.existing.id).catch(() => "");
  return { ...plan, field };
}

// Creates the planned folder and sets its Drive link field. `linked` is false
// when there is no such field, or setting it was refused (a field can exist
// and not apply to this part of Wrike); the folder is created either way.
export async function createMarketFolder(plan, driveUrl) {
  const folder = await createFolderIn(plan.parent.id, plan.title);
  let linked = false;
  if (folder.id && plan.field && driveUrl) {
    try {
      await setFolderField(folder.id, plan.field.id, driveUrl);
      linked = true;
    } catch {
      // The folder exists; the caller says the link didn't go on.
    }
  }
  return { ...folder, linked };
}
