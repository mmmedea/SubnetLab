do $preflight$
begin
  if exists (
    select 1
      from public.profiles
     where username is not null
       and username !~ '^[A-Za-z0-9_]{3,20}$'
  ) then
    raise exception 'Existing profile usernames need manual review before applying the 3–20 character rule.';
  end if;

  if exists (
    select lower(username)
      from public.profiles
     where username is not null
     group by lower(username)
    having count(*) > 1
  ) then
    raise exception 'Existing case-insensitive duplicate usernames need manual review before applying the unique index.';
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

-- Optional metadata-only backfill for an operator to review and run separately.
-- It never derives a username from an email address and is not executed by this migration.
-- with candidates as (
--   select p.id,
--          lower(coalesce(nullif(u.raw_user_meta_data->>'username', ''),
--                         nullif(u.raw_user_meta_data->>'user_name', ''))) as candidate,
--          row_number() over (
--            partition by lower(coalesce(nullif(u.raw_user_meta_data->>'username', ''),
--                                        nullif(u.raw_user_meta_data->>'user_name', '')))
--            order by p.id
--          ) as duplicate_rank
--     from public.profiles p
--     join auth.users u on u.id = p.id
--    where p.username is null
--      and coalesce(nullif(u.raw_user_meta_data->>'username', ''),
--                   nullif(u.raw_user_meta_data->>'user_name', '')) ~ '^[A-Za-z0-9_]{3,20}$'
-- ), available as (
--   select c.id, c.candidate
--     from candidates c
--    where c.duplicate_rank = 1
--      and not exists (
--        select 1 from public.profiles other
--         where other.id <> c.id and lower(other.username) = c.candidate
--      )
-- )
-- update public.profiles p
--    set username = available.candidate
--   from available
--  where p.id = available.id;

create or replace function public.handle_new_auth_user_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_username text := lower(coalesce(
    nullif(new.raw_user_meta_data->>'username', ''),
    nullif(new.raw_user_meta_data->>'user_name', '')
  ));
  v_provider text := coalesce(new.raw_app_meta_data->>'provider', '');
begin
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
