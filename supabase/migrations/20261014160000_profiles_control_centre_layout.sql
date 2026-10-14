-- A PM's Control Centre layout: which sections they see, in what order
-- ([{ id, on }], see src/lib/orderForms/controlLayout.js). Null until they
-- change it, which means the default.
alter table public.profiles add column if not exists control_centre_layout jsonb;
