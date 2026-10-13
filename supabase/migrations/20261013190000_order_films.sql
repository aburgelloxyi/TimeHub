-- Client Orders, shared between the PMs: one row per film loaded, holding
-- what was read from the markets' order sheets and what the PMs have decided
-- about it (rows set aside, Wrike tasks matched by hand).
--
-- These are clients' order details for unreleased films. Row-level security
-- is on and there are no policies, so the public key and signed-in browsers
-- can read nothing here. The Worker reads and writes it with the service key,
-- after checking the caller is a PM or an administrator (/api/orders).

create table public.order_films (
  key text primary key,
  data jsonb not null,
  loaded_at timestamp with time zone not null,
  loaded_by text,
  updated_at timestamp with time zone not null default now()
);

alter table public.order_films enable row level security;
