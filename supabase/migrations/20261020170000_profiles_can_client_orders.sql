-- Client Orders is granted per person, not by department: clients' orders for
-- unreleased films, so only the PMs who run them. The app offers the page (and
-- the Control Centre) by this flag, and the Worker's /api/orders refuses
-- anyone without it. Granted in Administration › People, by an administrator.

alter table public.profiles
  add column if not exists can_client_orders boolean not null default false;

comment on column public.profiles.can_client_orders is
  'When true, this member can open Client Orders and its Control Centre. Granted by an administrator.';

-- As 20261004180000_profiles_is_admin.sql, with Client Orders among the grants
-- only an administrator changes.
create or replace function public.guard_profile_grants()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  claims jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  checked boolean := claims is not null and coalesce(claims ->> 'role', '') <> 'service_role';
  grants_changed boolean;
begin
  if tg_op = 'INSERT' then
    grants_changed := new.is_admin or coalesce(new.can_debug_pull, false) or coalesce(new.can_client_orders, false);
  else
    grants_changed := new.is_admin is distinct from old.is_admin
      or new.can_debug_pull is distinct from old.can_debug_pull
      or new.can_client_orders is distinct from old.can_client_orders;
  end if;
  if grants_changed and checked and not caller_is_admin() then
    raise exception 'Debug Pull, Client Orders and Administration access are granted by an administrator';
  end if;

  if tg_op = 'UPDATE' and old.is_admin and old.left_at is null
     and (not new.is_admin or new.left_at is not null)
     and not exists (
       select 1 from profiles
       where is_admin and left_at is null and wrike_user_id <> old.wrike_user_id
     )
  then
    raise exception 'At least one administrator has to remain';
  end if;
  return new;
end;
$$;

-- James Crouch, Guillaume Rater, Eleanor Ridlington, Antonio Burgello.
update public.profiles
   set can_client_orders = true
 where wrike_user_id in ('KUAQL2NM', 'KUAQT4JC', 'KUAQUD7P', 'KUAWDLVN');
