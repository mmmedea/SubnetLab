-- Refuse to change the schema while current usernames violate the new rule.
-- This preflight changes no profile or auth.users rows.
do $preflight$
declare
  v_invalid_username_rows bigint;
  v_duplicate_username_groups bigint;
begin
  select count(*)
    into v_invalid_username_rows
    from public.profiles
   where username is not null
     and username !~ '^[A-Za-z0-9_]{3,20}$';

  select count(*)
    into v_duplicate_username_groups
    from (
      select lower(username)
        from public.profiles
       where username is not null
       group by lower(username)
      having count(*) > 1
    ) as duplicates;

  if v_invalid_username_rows > 0 or v_duplicate_username_groups > 0 then
    raise exception using
      errcode = '23514',
      message = pg_catalog.format(
        'Username migration stopped before schema changes: %s invalid username row(s), %s case-insensitive duplicate group(s).',
        v_invalid_username_rows,
        v_duplicate_username_groups
      ),
      hint = 'Run docs/ops/signup-migration-preflight.sql. By profile id, manually set invalid usernames to NULL or a manually chosen valid unique name. For each duplicate group, choose one row to keep and manually change the others to unique names or NULL. Do not derive usernames from emails or delete users, then rerun this migration.';
  end if;
end;
$preflight$;

alter table public.profiles
  drop constraint if exists profiles_username_check,
  add constraint profiles_username_check
    check (username is null or username ~ '^[A-Za-z0-9_]{3,20}$');

create unique index profiles_username_lower_unique
  on public.profiles (lower(username))
  where username is not null;

create or replace function public.handle_new_auth_user_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_username text;
  v_provider text;
begin
  v_username := lower(coalesce(
    nullif(new.raw_user_meta_data->>'username', ''),
    nullif(new.raw_user_meta_data->>'user_name', '')
  ));
  v_provider := coalesce(new.raw_app_meta_data->>'provider', '');

  if v_username is not null and v_username !~ '^[A-Za-z0-9_]{3,20}$' then
    raise exception 'Username must be 3–20 characters using letters, numbers, or underscores.'
      using errcode = '22023';
  end if;

  if v_provider = 'email' and v_username is null then
    raise exception 'Username must be 3–20 characters using letters, numbers, or underscores.'
      using errcode = '22023';
  end if;

  insert into public.profiles (id, username, display_name, role, avatar_url)
  values (
    new.id,
    v_username,
    nullif(coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'), ''),
    'student',
    nullif(new.raw_user_meta_data->>'avatar_url', '')
  )
  on conflict (id) do nothing;

  insert into public.user_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
exception
  when unique_violation then
    raise exception 'That username is already taken.' using errcode = '23505';
end;
$function$;

revoke all on function public.handle_new_auth_user_settings() from public, anon, authenticated;
