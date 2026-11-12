-- Other names a film goes by. The clients' order sheets don't always name a
-- film the way its Wrike project does ("Angry Birds 3" for
-- Angry_Birds_3_Movie); Client Orders looks a sheet's name up here to find
-- the film in Wrike (src/lib/orderForms/wrikeFilm.js).
alter table public.films add column if not exists aliases text[] not null default '{}';
