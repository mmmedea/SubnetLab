-- SubnetLab account settings foundation
-- Extends Supabase Auth; does not introduce a second credential/session system.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  display_name text,
  bio text,
  avatar_url text,
  terms_accepted_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists username text;
alter table public.profiles add column if not exists display_name text;
alter table public.profiles add column if not exists bio text;
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists terms_accepted_at timestamptz;
alter table public.profiles add column if not exists updated_at timestamptz not null default now();

create unique index if not exists profiles_username_unique
  on public.profiles (lower(username)) where username is not null;

create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  theme text not null default 'dark' check (theme in ('dark', 'light', 'system')),
  email_notifications boolean not null default true,
  in_app_notifications boolean not null default true,
  compact_mode boolean not null default false,
  default_ip_version text not null default 'ipv4' check (default_ip_version in ('ipv4', 'ipv6')),
  monospace_font_size smallint not null default 14 check (monospace_font_size between 12 and 18),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.user_preferences enable row level security;

revoke all on public.profiles, public.user_preferences from anon;
revoke insert, update, delete on public.profiles from authenticated;
grant select on public.profiles to authenticated;
grant insert (id, username, display_name, bio, avatar_url, updated_at) on public.profiles to authenticated;
grant update (username, display_name, bio, avatar_url, updated_at) on public.profiles to authenticated;
grant select, insert, update, delete on public.user_preferences to authenticated;
grant all on public.profiles, public.user_preferences to service_role;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='user_preferences' and policyname='preferences_select_own') then
    create policy preferences_select_own on public.user_preferences for select to authenticated using ((select auth.uid()) = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='user_preferences' and policyname='preferences_insert_own') then
    create policy preferences_insert_own on public.user_preferences for insert to authenticated with check ((select auth.uid()) = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='user_preferences' and policyname='preferences_update_own') then
    create policy preferences_update_own on public.user_preferences for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

-- Backfill existing Auth users. Consent remains NULL unless signup explicitly supplied it.
insert into public.profiles (id, username, display_name, avatar_url, terms_accepted_at, consented_at)
select
  u.id,
  nullif(coalesce(u.raw_user_meta_data->>'username', u.raw_user_meta_data->>'user_name'), ''),
  nullif(coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name'), ''),
  nullif(u.raw_user_meta_data->>'avatar_url', ''),
  case
    when nullif(u.raw_user_meta_data->>'terms_accepted_at', '') is not null
      then (u.raw_user_meta_data->>'terms_accepted_at')::timestamptz
    else null
  end
from auth.users u
on conflict (id) do update set
  username = coalesce(public.profiles.username, excluded.username),
  display_name = coalesce(public.profiles.display_name, excluded.display_name),
  avatar_url = coalesce(public.profiles.avatar_url, excluded.avatar_url);

insert into public.user_preferences (user_id)
select id from auth.users
on conflict (user_id) do nothing;

create or replace function public.handle_new_auth_user_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    insert into public.profiles (id, username, display_name, avatar_url, terms_accepted_at, consented_at)
    values (
      new.id,
      nullif(lower(coalesce(new.raw_user_meta_data->>'username', new.raw_user_meta_data->>'user_name')), ''),
      nullif(coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'), ''),
      nullif(new.raw_user_meta_data->>'avatar_url', ''),
      case
        when nullif(new.raw_user_meta_data->>'terms_accepted_at', '') is not null
          then now()
        else null
      end,
      case
        when nullif(new.raw_user_meta_data->>'terms_accepted_at', '') is not null
          then now()
        else null
      end
    )
    on conflict (id) do nothing;
  exception when unique_violation then
    -- A username collision must not abort Supabase Auth signup.
    insert into public.profiles (id, display_name, avatar_url, terms_accepted_at, consented_at)
    values (
      new.id,
      nullif(coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'), ''),
      nullif(new.raw_user_meta_data->>'avatar_url', ''),
      case
        when nullif(new.raw_user_meta_data->>'terms_accepted_at', '') is not null
          then now()
        else null
      end,
      case
        when nullif(new.raw_user_meta_data->>'terms_accepted_at', '') is not null
          then now()
        else null
      end
    )
    on conflict (id) do nothing;
  end;

  insert into public.user_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_settings on auth.users;
create trigger on_auth_user_created_settings
  after insert on auth.users
  for each row execute procedure public.handle_new_auth_user_settings();

-- Public avatars are non-sensitive profile imagery. Upload/update/delete remain
-- restricted to the authenticated user's own first-level folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/png','image/jpeg','image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='avatars_read_public') then
    create policy avatars_read_public on storage.objects for select using (bucket_id = 'avatars');
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='avatars_insert_own_folder') then
    create policy avatars_insert_own_folder on storage.objects for insert to authenticated with check (
      bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text
    );
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='avatars_update_own_folder') then
    create policy avatars_update_own_folder on storage.objects for update to authenticated using (
      bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text
    ) with check (
      bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text
    );
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='avatars_delete_own_folder') then
    create policy avatars_delete_own_folder on storage.objects for delete to authenticated using (
      bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text
    );
  end if;
end $$;

-- Trigger functions are not intended as a callable public API.
revoke all on function public.handle_new_auth_user_settings() from public, anon, authenticated;
