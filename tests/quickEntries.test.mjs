import { quickEntries } from "../src/utils/quickEntries.js";

const r = (job, category, territory, workDate, description = "") => ({ jobNumber: job, category, territory, workDate, projectDescription: description });
const rows = [
  r("XY1, Ebenezer", "Animation", "ZA", "2026-10-13", "batch 1"),
  r("XY1, Ebenezer", "Animation", "ZA", "2026-10-09", "older"),
  r("XY1, Ebenezer", "Animation", "ZA", "2026-10-02"),
  r("XY2, Street Fighter", "Edit", "AT", "2026-10-12"),
  r("XY2, Street Fighter", "Edit", "AT", "2026-10-05"),
  r("XY3, FID", "Versioning", "IT", "2026-10-14"),
  r("XY4, Heart of the Beast", "Admin", "", "2026-09-20"),
  r("XY4, Heart of the Beast", "Admin", "", "2026-09-21"),
  r("XY4, Heart of the Beast", "Admin", "", "2026-09-22"),
  r("XY4, Heart of the Beast", "Admin", "", "2026-09-23"),
  r("", "Meeting", "", "2026-10-14"),
];
const { recent, frequent } = quickEntries(rows, [], 2);
check("recent: the latest distinct entries", recent.map((e) => e.jobNumber), ["XY3, FID", "XY1, Ebenezer"]);
check("an entry carries its latest description", recent[1].projectDescription, "batch 1");
check("most used: the most made, not already in recent", frequent.map((e) => `${e.jobNumber}:${e.uses}`), ["XY4, Heart of the Beast:4", "XY2, Street Fighter:2"]);
check("nothing already on the day, and no rows without a job",
  quickEntries(rows, [r("xy3, fid ", "versioning", "IT")], 3).recent.map((e) => e.jobNumber), ["XY1, Ebenezer", "XY2, Street Fighter", "XY4, Heart of the Beast"]);
check("made once is recent, never most used", quickEntries([r("XY9", "Edit", "FR", "2026-10-01")]).frequent, []);
