// What changing a film in the Films list means for the jobs filed under it.
// A job points at its film by title, and repeats the title in its label, so a
// rename that stops at the Films list leaves those jobs belonging to no film.
import { supabase, selectAll } from "../../lib/supabaseClient";
import { relabelJob } from "../../lib/jobBook";

export const jobsForFilm = (title) =>
  selectAll("jobs", "id, job_number, film_title", (q) => q.eq("film_title", title));

// Moves a film's jobs to its new title and rebuilds each label to match.
// Returns how many were renamed and how many the database refused.
export async function renameFilmOnJobs(jobs, newTitle) {
  let renamed = 0;
  let failed = 0;
  for (let i = 0; i < jobs.length; i += 8) {
    const results = await Promise.all(jobs.slice(i, i + 8).map((j) =>
      supabase.from("jobs")
        .update({ film_title: newTitle, job_number: relabelJob(j, { film_title: newTitle }) })
        .eq("id", j.id)));
    results.forEach((r) => (r.error ? failed++ : renamed++));
  }
  return { renamed, failed };
}
