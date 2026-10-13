-- Patches the saved copy of Wrike's folder tree (wrike_sync_meta.folder_dictionary,
-- the row named "shared") between its daily refreshes: drops some folders and
-- adds or replaces others. The Worker calls it when Wrike's webhook reports a
-- folder created, renamed, moved or deleted.
--
-- One statement, so two deliveries arriving together can't each write back a
-- copy that is missing the other's change. The tree is about a megabyte; doing
-- this in the database means the Worker never has to download it to change it.
--
-- Only the service role may call it.

create or replace function public.patch_wrike_folders(p_upsert jsonb, p_remove text[])
returns void
language sql
set search_path = ''
as $$
  update public.wrike_sync_meta
     set folder_dictionary = (folder_dictionary - coalesce(p_remove, '{}'::text[])) || coalesce(p_upsert, '{}'::jsonb)
   where wrike_user_id = 'shared'
     and folder_dictionary is not null;
$$;

revoke all on function public.patch_wrike_folders(jsonb, text[]) from public, anon, authenticated;
grant execute on function public.patch_wrike_folders(jsonb, text[]) to service_role;
