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
import { supabase } from "../supabaseClient";

const norm = (s) => String(s || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const bareName = (market) => String(market || "").replace(/\s*\([^)]*\)\s*$/, "").trim();

// The film in Wrike. Its folder there isn't always punctuated the way the
// order sheets name it ("Focker In-Law" for "Focker In Law"), so when the name
// as given finds nothing, folders whose letters and digits are the same are
// tried.
const lettersOnly = (s) => String(s || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
function findFilm(byId, filmTitle) {
  const asGiven = findFilmLocation(byId, filmTitle);
  if (asGiven || !lettersOnly(filmTitle)) return asGiven;
  const spellings = [...new Set(Object.values(byId).filter((f) => lettersOnly(f.title) === lettersOnly(filmTitle)).map((f) => f.title))];
  for (const title of spellings) {
    const found = findFilmLocation(byId, title);
    if (found) return found;
  }
  return null;
}

const MARKETS_FOLDER = { motion: /_INTL_DIGITAL_Outdoor_Campaign_Markets$/i, print: /_INTL_PRINT_Outdoor_Campaign_Markets$/i };

// Pure. `byId` is the Wrike folder tree (fetchAllFolders). Returns
// { ok: false, reason } when the place for the folder can't be pinned down to
// exactly one, and otherwise where it goes, what it would be called, and the
// folder already there for this market if there is one.
export function planMarketFolder(byId, { filmTitle, kind, marketName }) {
  const location = findFilm(byId, filmTitle);
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

// The saved copy of Wrike's folder tree, which the Worker keeps current from
// Wrike's own notifications. null when it can't be read or looks incomplete.
// Held for a couple of minutes, so stepping through a film's markets reads it
// once and not once a market.
let savedTree = { at: 0, read: null };
const SAVED_FOR_MS = 2 * 60 * 1000;
function savedFolders() {
  if (!savedTree.read || Date.now() - savedTree.at > SAVED_FOR_MS) {
    savedTree = {
      at: Date.now(),
      read: supabase.from("wrike_sync_meta").select("folder_dictionary").eq("wrike_user_id", "shared").maybeSingle()
        .then(({ data }) => {
          const byId = data?.folder_dictionary;
          return byId && Object.keys(byId).length > 500 ? byId : null;
        })
        .catch(() => null),
    };
  }
  return savedTree.read;
}

// Whether a market already has its folder in Wrike, from the saved tree alone:
// quick enough to ask whenever a market is opened, so the page can show what
// the next step is before anything is clicked. "exists" comes with the folder
// and its link; "missing" means the place for it was found and it isn't there;
// "unknown" is everything else (no saved tree, film not found), where the page
// shouldn't claim either. It never writes, and "missing" is checked against
// Wrike itself before anything is created.
export async function checkMarketFolder(request) {
  const saved = await savedFolders();
  const plan = saved ? planMarketFolder(saved, request) : null;
  if (!plan?.ok) return { state: "unknown" };
  if (!plan.existing) return { state: "missing" };
  const permalink = await fetchFolderPermalink(plan.existing.id).catch(() => "");
  return { state: "exists", folder: { ...plan.existing, permalink } };
}

// Finds the market's place in Wrike and plans. Also says which custom field
// the Drive link would go in (`field`), or null when the account has none.
//
// The saved folder tree is tried first: it is one quick read, where listing
// every folder from Wrike takes several. Wrike itself is asked only when the
// saved tree doesn't show the market's folder, so a folder made moments ago is
// still found and never made twice.
export async function planMarketFolderLive(request) {
  const [saved, field] = await Promise.all([savedFolders(), discoverDriveLinkField().catch(() => null)]);
  let plan = saved ? planMarketFolder(saved, request) : null;
  if (!plan?.ok || !plan.existing) plan = planMarketFolder(await fetchAllFolders(), request);
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
