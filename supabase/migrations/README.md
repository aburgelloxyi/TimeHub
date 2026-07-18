# Incremental migrations

`../schema.sql` is the consolidated, byte-reviewable **baseline** — apply it to a
fresh project to reproduce the full current schema (tables, constraints,
functions, triggers, RLS, policies, storage buckets). It is what Option B in
`../MIGRATION.md` uses.

The files here are **incremental change scripts**, each named
`<version>_<name>.sql` to match the version recorded in the project's Supabase
migration ledger (`supabase_migrations.schema_migrations`). They document *how*
the live database changed over time, in apply order.

Two things `schema.sql` deliberately leaves out (its header scopes it to
standard auto-enabled extensions only), so they live **only** here:

- **Realtime publication membership** — `alter publication supabase_realtime
  add table …`.
- **`pg_cron` jobs** — e.g. `board_now_cleanup`. `pg_cron` is not enabled by
  default on a fresh project, so running it from `schema.sql` would break the
  rebuild.

A native Supabase **project transfer** (Option A in `../MIGRATION.md`, the
recommended path) carries publication membership and cron jobs across
automatically. For an Option B **recreate**, apply `schema.sql`, then re-run the
`alter publication …` and `cron.schedule(…)` statements from the relevant files
here once `pg_cron` is enabled.

> Historical note: only the `board_now` migrations are captured as files so far.
> Earlier changes were folded straight into `schema.sql`; this folder was
> started when the working-now feature landed.
