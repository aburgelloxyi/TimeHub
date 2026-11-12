// A market's folder in Wrike: the country folder inside a film's
// "…_INTL_DIGITAL_Outdoor_Campaign_Markets" (motion) or "…_INTL_PRINT_…"
// (print) job folder, or the "…_Outdoor_Campaign_Bespoke" one beside it, where
// that market's order tasks go.
//
// Same rule as wrikeCampaign.js: planning only reads and says exactly what
// would be made; creating happens after someone confirms that.

import {
  fetchAllFolders, collectSubtreeIds, discoverDriveLinkField,
  createFolderIn, setFolderField, fetchFolderPermalink, discoverJobNumberField,
} from "../wrikeCampaign";
import { marketFlag } from "../../components/orderForms/format";
import { supabase } from "../supabaseClient";
import { findFilm } from "./wrikeFilm";
import { filmAliases } from "../filmAliases";

const norm = (s) => String(s || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const bareName = (market) => String(market || "").replace(/\s*\([^)]*\)\s*$/, "").trim();

export { findFilm } from "./wrikeFilm";

const MARKETS_FOLDER = { motion: /_INTL_DIGITAL_Outdoor_Campaign_Markets$/i, print: /_INTL_PRINT_Outdoor_Campaign_Markets$/i };

// A film's Bespoke job folder sits beside its Markets one, in the same INTL
// folder as the other medium's pair. Print's is named with or without PRINT
// ("XY025922_INTL_Outdoor_Campaign_Bespoke"), and sometimes "Bespokes".
const BESPOKE_FOLDER = /_Outdoor_Campaign_Bespokes?$/i;
const bespokeFor = (kind, title) => BESPOKE_FOLDER.test(title) && /_DIGITAL_/i.test(title) === (kind !== "print");

export const HOME_LABEL = { markets: "Markets", bespoke: "Bespoke" };

// The market's folder in one job folder, found by name or, under another
// spelling ("Czech Republic" for "Czechia"), by its flag.
function marketIn(byId, jobFolder, marketName) {
  const bare = norm(bareName(marketName));
  const flag = marketFlag(marketName);
  const found = (jobFolder.childIds || [])
    .map((id) => byId[id])
    .find((f) => f && (norm(f.title) === bare || (flag && f.title.includes(flag))));
  return found ? { id: found.id, title: found.title } : null;
}

// Pure. `byId` is the Wrike folder tree (fetchAllFolders). A market's folder
// goes in the film's Markets job folder, or with `home: "bespoke"` in the
// Bespoke one beside it. Returns { ok: false, reason } when that place can't
// be pinned down to exactly one, and otherwise where it goes, what it would be
// called, and the folder already there for this market if there is one.
// `homes` says the same for both job folders (bespoke is null when the film
// has none), so the page can offer the other. `films` are the films with
// aliases (findFilm).
export function planMarketFolder(byId, { filmTitle, kind, marketName, films = [], home = "markets" }) {
  const location = findFilm(byId, filmTitle, films);
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
  const markets = parents[0];

  const besides = Object.values(byId).filter((f) => (f.childIds || []).includes(markets.id));
  const bespokes = [...new Map(besides
    .flatMap((f) => (f.childIds || []).map((id) => byId[id]))
    .filter((f) => f && bespokeFor(kind, f.title.trim()))
    .map((f) => [f.id, f])).values()];
  const bespoke = bespokes.length === 1 ? bespokes[0] : null;

  const homes = {
    markets: { parent: { id: markets.id, title: markets.title }, existing: marketIn(byId, markets, marketName) },
    bespoke: bespoke ? { parent: { id: bespoke.id, title: bespoke.title }, existing: marketIn(byId, bespoke, marketName) } : null,
  };
  if (home === "bespoke" && !bespoke) {
    return {
      ok: false,
      reason: bespokes.length
        ? `${location.filmProject.title} has ${bespokes.length} ${medium} Bespoke folders beside its Markets one (${bespokes.map((b) => b.title).join(", ")}), so it isn't clear which one to add to.`
        : `${location.filmProject.title} has no ${medium} "Outdoor_Campaign_Bespoke" folder beside ${markets.title} in Wrike.`,
    };
  }

  const bare = bareName(marketName);
  const flag = marketFlag(marketName);
  const chosen = homes[home === "bespoke" ? "bespoke" : "markets"];
  return {
    ok: true,
    film: location.filmProject.title,
    home: home === "bespoke" ? "bespoke" : "markets",
    parent: chosen.parent,
    title: flag ? `${bare} ${flag}` : bare,
    existing: chosen.existing,
    homes,
  };
}

// The saved copy of Wrike's folder tree, which the Worker keeps current from
// Wrike's own notifications. null when it can't be read or looks incomplete.
// Held for a couple of minutes, so stepping through a film's markets reads it
// once and not once a market.
let savedTree = { at: 0, read: null };
const SAVED_FOR_MS = 2 * 60 * 1000;
export function savedFolders() {
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
// the next step is before anything is clicked. A market can have a folder in
// the Markets job folder, the Bespoke one, or both: `folders` lists them, each
// with its `home` and link, Markets first, and `folder` is the first.
// "exists" means at least one; "missing" means the place for it was found and
// it isn't there; "unknown" is everything else (no saved tree, film not
// found), where the page shouldn't claim either. `bespoke` says whether the
// film has a Bespoke folder to offer. It never writes, and "missing" is
// checked against Wrike itself before anything is created.
export async function checkMarketFolder(request) {
  const [saved, films] = await Promise.all([savedFolders(), filmAliases()]);
  const plan = saved ? planMarketFolder(saved, { ...request, films, home: "markets" }) : null;
  if (!plan?.ok) return { state: "unknown" };
  const bespoke = !!plan.homes.bespoke;
  const found = ["markets", "bespoke"]
    .map((home) => plan.homes[home]?.existing && { ...plan.homes[home].existing, home })
    .filter(Boolean);
  if (!found.length) return { state: "missing", folders: [], bespoke };
  // The saved copy can still hold a folder that has been moved or deleted
  // since; one Wrike can't give a link for is left out.
  const linked = await Promise.all(found.map(async (f) => ({ ...f, permalink: await fetchFolderPermalink(f.id).catch(() => "") })));
  const folders = linked.filter((f) => f.permalink);
  if (!folders.length) return { state: "unknown", bespoke };
  return { state: "exists", folder: folders[0], folders, bespoke };
}

// Finds the market's place in Wrike and plans. Also says which custom field
// the Drive link would go in (`field`), or null when the account has none.
//
// The saved folder tree is tried first: it is one quick read, where listing
// every folder from Wrike takes several. Wrike itself is asked only when the
// saved tree doesn't show the market's folder, so a folder made moments ago is
// still found and never made twice.
export async function planMarketFolderLive(given) {
  const [saved, field, films] = await Promise.all([savedFolders(), discoverDriveLinkField().catch(() => null), filmAliases()]);
  const request = { ...given, films };
  let plan = saved ? planMarketFolder(saved, request) : null;
  if (!plan?.ok || !plan.existing) plan = planMarketFolder(await fetchAllFolders(), request);
  if (plan.ok && plan.existing) plan.existing.permalink = await fetchFolderPermalink(plan.existing.id).catch(() => "");
  return { ...plan, field };
}

// Creates the planned folder, sets its Drive link field, and gives it its job
// folder's Job Number (the job folder's title, which is what that field
// holds). Wrike's cascade from the job folder does the same, but not for a
// folder moved in later, and setting it here doesn't depend on the cascade
// being on. `linked` and `numbered` are false when there is no such field, or
// it was refused; the folder is created either way.
export async function createMarketFolder(plan, driveUrl) {
  const folder = await createFolderIn(plan.parent.id, plan.title);
  const put = async (field, value) => {
    if (!folder.id || !field || !value) return false;
    try {
      await setFolderField(folder.id, field.id, value);
      return true;
    } catch {
      return false;
    }
  };
  const jobField = await discoverJobNumberField().catch(() => null);
  const [linked, numbered] = await Promise.all([put(plan.field, driveUrl), put(jobField, plan.parent.title)]);
  return { ...folder, linked, numbered };
}
