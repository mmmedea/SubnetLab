-- Settings workspace hardening: align the persisted profile/preferences contract.
-- Safe to apply after the initial settings foundation migration.

alter table public.profiles
  add column if not exists role text;

alter table public.user_preferences
  add column if not exists default_ip_version text not null default 'ipv4',
  add column if not exists compact_mode boolean not null default false,
  add column if not exists email_notifications boolean not null default true,
  add column if not exists in_app_notifications boolean not null default true,
  add column if not exists theme text not null default 'dark';

alter table public.user_preferences
  drop constraint if exists user_preferences_default_ip_version_check,
  add constraint user_preferences_default_ip_version_check
    check (default_ip_version in ('ipv4', 'ipv6')),
  drop constraint if exists user_preferences_theme_check,
  add constraint user_preferences_theme_check
    check (theme in ('dark', 'light', 'system'));

alter table public.profiles enable row level security;
alter table public.user_preferences enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert to authenticated
  with check ((select auth.uid()) = id);

drop policy if exists preferences_select_own on public.user_preferences;
create policy preferences_select_own on public.user_preferences
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists preferences_insert_own on public.user_preferences;
create policy preferences_insert_own on public.user_preferences
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists preferences_update_own on public.user_preferences;
create policy preferences_update_own on public.user_preferences
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Provision settings rows for both new and existing Auth users. A duplicate
-- username must never prevent an Auth signup from completing.
create or replace function public.handle_new_auth_user_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, username, display_name, role, avatar_url)
  values (
    new.id,
    case
      when coalesce(new.raw_user_meta_data->>'username', new.raw_user_meta_data->>'user_name')
        ~ '^[A-Za-z0-9_]{3,32}$'
      then lower(coalesce(new.raw_user_meta_data->>'username', new.raw_user_meta_data->>'user_name'))
      else null
    end,
    nullif(coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'), ''),
    nullif(new.raw_user_meta_data->>'role', ''),
    nullif(new.raw_user_meta_data->>'avatar_url', '')
  )
  on conflict (id) do nothing;

  insert into public.user_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
exception
  when unique_violation then
    insert into public.profiles (id, display_name, role, avatar_url)
    values (
      new.id,
      nullif(coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'), ''),
      nullif(new.raw_user_meta_data->>'role', ''),
      nullif(new.raw_user_meta_data->>'avatar_url', '')
    )
    on conflict (id) do nothing;

    insert into public.user_preferences (user_id)
    values (new.id)
    on conflict (user_id) do nothing;
    return new;
end;
$$;

drop trigger if exists on_auth_user_created_settings on auth.users;
create trigger on_auth_user_created_settings
  after insert on auth.users
  for each row execute function public.handle_new_auth_user_settings();

insert into public.profiles (id)
select id from auth.users
on conflict (id) do nothing;

insert into public.user_preferences (user_id)
select id from auth.users
on conflict (user_id) do nothing;

revoke all on function public.handle_new_auth_user_settings() from public, anon, authenticated;
