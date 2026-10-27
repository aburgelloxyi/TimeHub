-- How long a client's billable blocks are, in minutes.
--
-- The Billable view in Project/Time rounds each week's block up to a whole
-- increment of this size. It lives on the client because Paramount and
-- Universal bill differently, and because a new client's increment has to be
-- changeable from Administration rather than in code.
alter table public.clients
  add column if not exists increment_minutes integer not null default 30
  check (increment_minutes > 0 and increment_minutes <= 240);
