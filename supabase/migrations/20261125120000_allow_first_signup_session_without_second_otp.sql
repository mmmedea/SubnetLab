begin;

create table public.signup_otp_eligibility (
  user_id uuid primary key references auth.users(id) on delete cascade,
  eligible_at timestamptz not null default now(),
  consumed_at timestamptz
);

create table public.signup_otp_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '2 minutes'),
  consumed_at timestamptz,
  constraint signup_otp_grants_user_session_unique unique (user_id, session_id)
);

alter table public.signup_otp_eligibility enable row level security;
alter table public.signup_otp_grants enable row level security;
revoke all on table public.signup_otp_eligibility, public.signup_otp_grants
  from public, anon, authenticated;

create or replace function public.mark_email_signup_otp_eligible()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.raw_app_meta_data ->> 'provider' = 'email' then
    insert into public.signup_otp_eligibility (user_id)
    values (new.id)
    on conflict (user_id) do nothing;
  end if;
  return new;
exception
  when others then
    raise warning 'Signup OTP eligibility could not be recorded.';
    return new;
end;
$function$;

revoke all on function public.mark_email_signup_otp_eligible()
  from public, anon, authenticated;

drop trigger if exists mark_email_signup_otp_eligible on auth.users;
create trigger mark_email_signup_otp_eligible
  after insert on auth.users
  for each row execute function public.mark_email_signup_otp_eligible();

create or replace function public.create_signup_otp_grant(
  p_user_id uuid,
  p_session_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_eligibility public.signup_otp_eligibility%rowtype;
  v_auth_user auth.users%rowtype;
  v_grant_id uuid;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if p_user_id is null or p_session_id is null then
    raise exception 'Signup verification could not be completed.' using errcode = '22023';
  end if;

  select *
    into v_eligibility
    from public.signup_otp_eligibility
   where user_id = p_user_id
   for update;

  if not found or v_eligibility.consumed_at is not null then
    raise exception 'Signup verification could not be completed.' using errcode = '42501';
  end if;

  select *
    into v_auth_user
    from auth.users
   where id = p_user_id;

  -- Allow up to 30 seconds of clock skew between Auth and database timestamps.
  if not found
     or v_auth_user.raw_app_meta_data ->> 'provider' is distinct from 'email'
     or v_auth_user.email_confirmed_at is null
     or v_auth_user.email_confirmed_at < v_now - interval '5 minutes'
     or v_auth_user.email_confirmed_at > v_now + interval '30 seconds' then
    raise exception 'Signup verification could not be completed.' using errcode = '42501';
  end if;

  if exists (
    select 1
      from public.email_otp_verified_sessions s
     where s.user_id = p_user_id
  ) then
    raise exception 'Signup verification could not be completed.' using errcode = '42501';
  end if;

  if exists (
    select 1
      from public.signup_otp_grants g
     where g.user_id = p_user_id
       and g.session_id = p_session_id
  ) then
    raise exception 'Signup verification could not be completed.' using errcode = '23505';
  end if;

  insert into public.signup_otp_grants (user_id, session_id, expires_at)
  values (p_user_id, p_session_id, v_now + interval '2 minutes')
  returning id into v_grant_id;

  return v_grant_id;
end;
$function$;

create or replace function public.consume_signup_otp_grant(
  p_grant_id uuid,
  p_user_id uuid,
  p_session_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_grant public.signup_otp_grants%rowtype;
  v_eligibility public.signup_otp_eligibility%rowtype;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if p_grant_id is null or p_user_id is null or p_session_id is null then
    raise exception 'Signup verification could not be completed.' using errcode = '22023';
  end if;

  select *
    into v_grant
    from public.signup_otp_grants
   where id = p_grant_id
     and user_id = p_user_id
     and session_id = p_session_id
   for update;

  if not found
     or v_grant.consumed_at is not null
     or v_grant.expires_at <= v_now then
    raise exception 'Signup verification could not be completed.' using errcode = '42501';
  end if;

  select *
    into v_eligibility
    from public.signup_otp_eligibility
   where user_id = p_user_id
   for update;

  if not found or v_eligibility.consumed_at is not null then
    raise exception 'Signup verification could not be completed.' using errcode = '42501';
  end if;

  if exists (
    select 1
      from public.email_otp_verified_sessions s
     where s.user_id = p_user_id
  ) then
    raise exception 'Signup verification could not be completed.' using errcode = '42501';
  end if;

  update public.signup_otp_grants
     set consumed_at = v_now
   where id = p_grant_id;

  update public.signup_otp_eligibility
     set consumed_at = v_now
   where user_id = p_user_id;

  insert into public.email_otp_verified_sessions (user_id, session_id, verified_at, expires_at)
  values (p_user_id, p_session_id, v_now, v_now + interval '12 hours');

  insert into public.auth_audit_log (event, user_id)
  values ('signup_verified', p_user_id);

  return true;
end;
$function$;

revoke all on function public.create_signup_otp_grant(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.consume_signup_otp_grant(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.create_signup_otp_grant(uuid, uuid) to service_role;
grant execute on function public.consume_signup_otp_grant(uuid, uuid, uuid) to service_role;

commit;
