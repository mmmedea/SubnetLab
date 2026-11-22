-- Require a local password for Google-authenticated accounts before workspace access.
-- The timestamp is server-maintained and is not writable by authenticated clients.
alter table public.profiles add column if not exists password_configured_at timestamptz;

update public.profiles p
set password_configured_at = coalesce(p.password_configured_at, now())
from auth.users u
where u.id = p.id
  and coalesce(u.encrypted_password, '') <> '';

create or replace function public.sync_profile_password_configured()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(new.encrypted_password, '') <> '' then
    update public.profiles
    set password_configured_at = coalesce(password_configured_at, now())
    where id = new.id;
  end if;
  return new;
end;
$$;

revoke all on function public.sync_profile_password_configured() from public, anon, authenticated;
drop trigger if exists sync_profile_password_configured on auth.users;
create trigger sync_profile_password_configured
after insert or update of encrypted_password on auth.users
for each row execute function public.sync_profile_password_configured();
