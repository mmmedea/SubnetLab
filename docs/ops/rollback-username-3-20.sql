-- Restore the former 3–32 character username rule and trigger behavior.
-- This restores the schema only; it does not delete or rewrite profiles or users.

drop index if exists public.profiles_username_lower_unique;

alter table public.profiles
  drop constraint if exists profiles_username_check,
  add constraint profiles_username_check
    check (username is null or username ~ '^[A-Za-z0-9_]{3,32}$');

create or replace function public.handle_new_auth_user_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
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
    insert into public.profiles (id, display_name, role, avatar_url)
    values (
      new.id,
      nullif(coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'), ''),
      'student',
      nullif(new.raw_user_meta_data->>'avatar_url', '')
    )
    on conflict (id) do nothing;

    insert into public.user_preferences (user_id)
    values (new.id)
    on conflict (user_id) do nothing;
    return new;
end;
$function$;
