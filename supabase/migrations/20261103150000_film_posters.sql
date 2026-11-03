-- Client Orders: the picture on a film's card, chosen by pasting an image URL,
-- the same way a Canvas board's cover is chosen. Kept apart from order_films
-- because that table is rewritten from the Drive imports and would lose it.
create table if not exists public.film_posters (
  id integer primary key default 1,
  posters jsonb not null default '{}'::jsonb
);

alter table public.film_posters enable row level security;

create policy "anon all" on public.film_posters
  as permissive for all to authenticated using (true) with check (true);

insert into public.film_posters (id) values (1) on conflict (id) do nothing;
