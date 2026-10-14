-- A merged timesheet entry keeps the rows it was made from, so it can be split
-- back into them ("Unmerge" on the timesheet). Each part is one market's row as
-- it was: market, time, add. time, notes, timelog ids, task, and the rest the
-- grid shows. Null on every entry that isn't a merge, and on entries merged
-- before this column existed, which therefore can't be unmerged.

alter table public.tasks add column merged_from jsonb;
