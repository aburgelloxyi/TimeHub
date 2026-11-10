import {
  parseJobLabel, buildJobLabel, relabelJob, missingInfo, monthApplies, filterJobs, sortJobs,
} from "../src/lib/jobBook.js";

// Reading a label
check("canonical label",
  parseJobLabel("Ebenezer : XY026043, INT - Teaser Titles"),
  { film: "Ebenezer", code: "XY026043", description: "INT - Teaser Titles" });
check("film with its own colon",
  parseJobLabel("Jackass: Best and Last : XY025793, Main Quad").film,
  "Jackass: Best and Last");
check("bare code",
  parseJobLabel("XY025091"), { film: "", code: "XY025091", description: "" });
check("code keeps a delivery suffix",
  parseJobLabel("The Odyssey : XY025953_LUG_D6, ODY - LUG D6 UK PRE").code, "XY025953_LUG_D6");
check("free-text job has no code",
  parseJobLabel("Studio Management").code, null);

// Building one
check("film and description", buildJobLabel({ film: "Digger", code: "XY026051", description: "Main Quad" }),
  "Digger : XY026051, Main Quad");
check("no film", buildJobLabel({ film: "", code: "XY026051", description: "Main Quad" }), "XY026051, Main Quad");
check("no description", buildJobLabel({ film: "Digger", code: "XY026051", description: "" }), "Digger : XY026051");

// Relabelling changes only what the patch names
const row = { job_number: "Paw Patrol : XY025995, INTL Markets", film_title: "Old", project_description: null };
check("new description keeps the label's film, not the column's",
  relabelJob(row, { project_description: "INTL Masters" }), "Paw Patrol : XY025995, INTL Masters");
check("new film keeps the label's description, though the column is empty",
  relabelJob(row, { film_title: "Paw Patrol The Dino Movie" }), "Paw Patrol The Dino Movie : XY025995, INTL Markets");
check("clearing the description",
  relabelJob(row, { project_description: null }), "Paw Patrol : XY025995");
check("free-text label is left alone",
  relabelJob({ job_number: "Studio Management" }, { film_title: "X" }), "Studio Management");

// What's missing
check("stub row", missingInfo({ job_number: "XY025091" }), ["client", "start date", "film"]);
check("film in the label counts",
  missingInfo({ job_number: "Digger : XY026051", client: "Warner Bros", start_date: "2026-07-22" }), []);
check("free-text job isn't asked for a film",
  missingInfo({ job_number: "Studio Management", client: "XYi Internal", start_date: "2026-01-01" }), []);

// Filters
const jobs = [
  { id: 1, job_number: "Ebenezer : XY026043, INT - Teaser Titles", client: "Paramount Pictures", start_date: "2026-06-12", status: "Active" },
  { id: 2, job_number: "Digger : XY026051, Main Quad", client: "Warner Bros", start_date: "2026-07-22" },
  { id: 3, job_number: "XY025091", client: null, start_date: null },
];
const ids = (f) => filterJobs(jobs, f).map((j) => j.id);
check("browsing a month",              ids({ month: "2026-07" }), [2]);
check("a search looks in every month", ids({ month: "2026-07", search: "eben titles" }), [1]);
check("undated only",                  ids({ month: "2026-07", undated: true }), [3]);
check("needs attention ignores month", ids({ month: "2026-07", attention: true }), [3]);
check("status, blank counts as Inactive", ids({ status: "Inactive" }), [2, 3]);
check("studio from the client",        ids({ studio: "Warner" }), [2]);
check("no client is Other",            ids({ studio: "Other" }), [3]);
check("month applies to a plain browse", monthApplies({ month: "2026-07" }), true);
check("month doesn't apply while searching", monthApplies({ month: "2026-07", search: "x" }), false);

// Sort
const order = (key, dir) => sortJobs(jobs, key, dir).map((j) => j.id);
check("newest first, undated last",  order("date", "desc"), [2, 1, 3]);
check("oldest first, undated still last", order("date", "asc"), [1, 2, 3]);
check("by code",                     order("job_number", "asc"), [3, 1, 2]);
check("by client, empty last",       order("client", "asc"), [1, 2, 3]);
