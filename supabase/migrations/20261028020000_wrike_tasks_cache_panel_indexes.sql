-- The Toolbox panel's Active Jobs asks the task cache for one person's
-- Active and Deferred tasks (worker/index.js, handlePanelJobs). Without these
-- every ask read the whole table, task data and all, and the panels on the
-- Motion machines ask all day: enough to run the database out of disk IO.

create index if not exists wrike_tasks_cache_status_idx
  on public.wrike_tasks_cache ((task_data ->> 'status'));

-- PostgREST's cs. filter is jsonb @>, which jsonb_path_ops indexes.
create index if not exists wrike_tasks_cache_responsible_idx
  on public.wrike_tasks_cache using gin ((task_data -> 'responsibleIds') jsonb_path_ops);
