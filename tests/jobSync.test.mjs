import { indexBook, whyDifferent, correctionPatch, reconcile, pending, filmsToAdd, copyHealth, changedSinceCopy } from "../src/lib/jobSync.js";
import { findStudioFolders } from "../src/lib/wrikeCampaign.js";

const cand = (over = {}) => ({
  code: "XY026051", jobNumber: "Digger : XY026051, INT - Main Quad", filmTitle: "Digger",
  projectDescription: "INT - Main Quad", client: "Warner Bros International", archived: false, ...over,
});

// One code, several rows: the most complete is the one judged
const idx = indexBook([
  { id: 1, job_number: "XY026051" },
  { id: 2, job_number: "Digger : XY026051, INT - Main Quad" },
]);
check("the filed row is judged, not the stub", idx.byCode.XY026051.id, 2);
check("the stub is an extra", idx.extras.XY026051.map((r) => r.id), [1]);

// Why a row disagrees
check("agrees", whyDifferent({ job_number: "Digger : XY026051, Main Quad", client: "Warner Bros" }, cand()), []);
check("filed under another film",
  whyDifferent({ job_number: "2026 : XY026051, Main Quad", client: "Warner Bros" }, cand()), ["film"]);
check("folder name left in the code",
  whyDifferent({ job_number: "Digger : XY026051_MAIN_QUAD", client: "Warner Bros" }, cand()), ["label"]);
check("describes different work",
  whyDifferent({ job_number: "Digger : XY026051, French Canada Assets", client: "Warner Bros" }, cand()), ["description"]);
check("no client", whyDifferent({ job_number: "Digger : XY026051, Main Quad", client: null }, cand()), ["client"]);
check("another studio's client",
  whyDifferent({ job_number: "Digger : XY026051, Main Quad", client: "Sony Pictures" }, cand()), ["client"]);
check("a scan with no real film has nothing better to offer",
  whyDifferent({ job_number: "Digger : XY026051, Main Quad" }, cand({ filmTitle: "2026" })), []);

// What a correction writes
check("client-only fault sets only the client",
  correctionPatch({ job_number: "Digger : XY026051, INT - Main Quad", client: null }, cand()),
  { client: "Warner Bros International" });
check("anything else rewrites the row to Wrike's",
  Object.keys(correctionPatch({ job_number: "2026 : XY026051, Main Quad", client: "Warner Bros" }, cand())),
  ["job_number", "film_title", "client", "project_description"]);

// The whole comparison
const book = [
  { id: 1, job_number: "XY026051" },
  { id: 2, job_number: "Digger : XY026051, INT - Main Quad", client: "Warner Bros" },
  { id: 3, job_number: "2026 : XY025091, NM Packshots", client: "Universal Pictures" },
];
const scan = [
  cand(),
  cand({ code: "XY025091", jobNumber: "The History of Sound : XY025091, NM - Packshots", filmTitle: "The History of Sound", projectDescription: "NM - Packshots", client: "Universal Pictures New media" }),
  cand({ code: "XY026060", jobNumber: "Digger : XY026060, INT - Titles", projectDescription: "INT - Titles" }),
  cand({ code: "XY020001", jobNumber: "Old Film : XY020001, INT - Titles", filmTitle: "Old Film", archived: true }),
];
const r = reconcile(scan, book);
check("new jobs are the codes the book lacks", r.newJobs.map((c) => c.code), ["XY026060", "XY020001"]);
check("the mis-filmed row is a correction", r.corrections.map((x) => [x.code, x.reasons]), [["XY025091", ["film"]]]);
check("the stub beside a filed row is spare", r.redundant.map((x) => x.row.id), [1]);

const p = pending(r, new Set(["XY025091"]));
check("archived jobs aren't waiting", p.newJobs.map((c) => c.code), ["XY026060"]);
check("a kept job isn't waiting", p.corrections.length, 0);
check("unless archived ones are asked for", pending(r, new Set(), false).newJobs.length, 2);

// Films follow jobs
check("only films the list lacks, once each, with a studio",
  filmsToAdd(scan, ["digger", "Some Other Film"]),
  [{ title: "The History of Sound", studio: "Universal" }, { title: "Old Film", studio: "Warner" }]);
check("underscores and case don't make a film new",
  filmsToAdd([cand({ filmTitle: "Paw Patrol The Dino Movie" })], ["paw_patrol_the_dino_movie"]), []);
check("a year or a bare code isn't a film",
  filmsToAdd([cand({ filmTitle: "2026" }), cand({ filmTitle: "ZAL" }), cand({ filmTitle: "Old" })], []), []);

// Trusting the saved copy. Tuesday 10 Nov 2026, 11:00 and Sunday 8 Nov, 11:00.
const tue = new Date(2026, 10, 10, 11, 0);
const sun = new Date(2026, 10, 8, 11, 0);
const hoursBefore = (d, h) => new Date(d.getTime() - h * 3600e3).toISOString();
check("read today, updates flowing", copyHealth({ treeAt: hoursBefore(tue, 5), lastEventAt: hoursBefore(tue, 0.1) }, tue), "ok");
check("no full read for two days", copyHealth({ treeAt: hoursBefore(tue, 48), lastEventAt: hoursBefore(tue, 0.1) }, tue), "old");
check("never read", copyHealth({ treeAt: null, lastEventAt: hoursBefore(tue, 0.1) }, tue), "old");
check("webhook silent in working hours", copyHealth({ treeAt: hoursBefore(tue, 5), lastEventAt: hoursBefore(tue, 3) }, tue), "quiet");
check("silence at the weekend is normal", copyHealth({ treeAt: hoursBefore(sun, 20), lastEventAt: hoursBefore(sun, 30) }, sun), "ok");
check("couldn't read the last update: not held against it", copyHealth({ treeAt: hoursBefore(tue, 5), lastEventAt: undefined }, tue), "ok");

const chosen = [
  { code: "XY1", folderId: "a", folderTitle: "XY000001_Titles" },
  { code: "XY2", folderId: "b", folderTitle: "XY000002_Quad" },
  { code: "XY3", folderId: "c", folderTitle: "XY000003_Banners" },
  { code: "XY4", folderId: "d", folderTitle: "XY000004_Social" },
];
check("renamed or binned folders are caught; unanswered ones aren't accused",
  changedSinceCopy(chosen, {
    a: { title: "XY000001_Titles", gone: false },
    b: { title: "XY000002_Main_Quad", gone: false },
    c: { title: "XY000003_Banners", gone: true },
  }), ["XY2", "XY3"]);

// A studio's folders, regional ones included
const tree = {
  root: { id: "root", title: "Studio", childIds: ["u", "uk", "nm", "tpl", "s", "arc", "hk"] },
  arc:  { id: "arc", title: "Universal_UK_Archive", childIds: [] },
  hk:   { id: "hk", title: "1. Universal_House_Keeping", childIds: [] },
  u:    { id: "u", title: "UNIVERSAL", childIds: ["film"] },
  uk:   { id: "uk", title: "UNIVERSAL UK", childIds: [] },
  nm:   { id: "nm", title: "UNIVERSAL - NEW MEDIA", childIds: [] },
  tpl:  { id: "tpl", title: "_Universal_MASTER_TEMPLATES", childIds: [] },
  s:    { id: "s", title: "SONY", childIds: [] },
  film: { id: "film", title: "Minions", childIds: ["inner"] },
  inner:{ id: "inner", title: "Universal_Deliveries", childIds: [] },
};
check("regional folders count; templates, archives, house-keeping and inner folders don't",
  findStudioFolders(tree, "Universal").map((f) => f.title),
  ["UNIVERSAL", "UNIVERSAL - NEW MEDIA", "UNIVERSAL UK"]);
check("another studio", findStudioFolders(tree, "Sony").map((f) => f.title), ["SONY"]);
check("a studio with no folder", findStudioFolders(tree, "Netflix"), []);
