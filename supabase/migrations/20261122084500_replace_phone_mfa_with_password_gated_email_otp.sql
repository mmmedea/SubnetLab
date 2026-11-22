-- Replace phone MFA with a password-gated, session-bound email OTP step.
create table if not exists public.email_otp_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  password_session_id uuid not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  consumed_at timestamptz
);
create index if not exists email_otp_challenges_user_created_idx
  on public.email_otp_challenges(user_id, created_at desc);
create table if not exists public.email_otp_verified_sessions (
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null,
  verified_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '12 hours'),
  primary key(user_id, session_id)
);
alter table public.email_otp_challenges enable row level security;
alter table public.email_otp_verified_sessions enable row level security;
revoke all on public.email_otp_challenges, public.email_otp_verified_sessions from anon, authenticated;

create or replace function public.begin_email_otp_challenge()
returns uuid language plpgsql security definer set search_path=''
as $$
declare
  v_user uuid := (select auth.uid());
  v_session uuid := nullif((select auth.jwt()->>'session_id'),'')::uuid;
  v_amr jsonb := coalesce((select auth.jwt()->'amr'),'[]'::jsonb);
  v_id uuid;
begin
  if v_user is null or v_session is null then raise exception 'Sign in with your password first.' using errcode='42501'; end if;
  if not exists(select 1 from jsonb_array_elements(v_amr) a where a->>'method'='password') then
    raise exception 'A password sign-in is required before email verification.' using errcode='42501';
  end if;
  if not exists(select 1 from public.profiles p where p.id=v_user and p.password_configured_at is not null) then
    raise exception 'Set your SubnetLab password first.' using errcode='42501';
  end if;
  if not exists(select 1 from auth.users u where u.id=v_user and u.email_confirmed_at is not null and u.email is not null) then
    raise exception 'Confirm your email address before continuing.' using errcode='42501';
  end if;
  delete from public.email_otp_challenges where user_id=v_user and (expires_at<now() or consumed_at is not null);
  insert into public.email_otp_challenges(user_id,password_session_id) values(v_user,v_session) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.complete_email_otp_challenge(p_challenge_id uuid)
returns boolean language plpgsql security definer set search_path=''
as $$
declare
  v_user uuid := (select auth.uid());
  v_session uuid := nullif((select auth.jwt()->>'session_id'),'')::uuid;
  v_amr jsonb := coalesce((select auth.jwt()->'amr'),'[]'::jsonb);
  v_challenge public.email_otp_challenges%rowtype;
begin
  if v_user is null or v_session is null then raise exception 'Sign in again to verify your email.' using errcode='42501'; end if;
  if not exists(select 1 from jsonb_array_elements(v_amr) a where a->>'method' in ('otp','email/signup')) then
    raise exception 'The session was not created by an email OTP.' using errcode='42501';
  end if;
  select * into v_challenge from public.email_otp_challenges
    where id=p_challenge_id and user_id=v_user and consumed_at is null and expires_at>now()
    for update;
  if not found then raise exception 'This email verification request expired. Send a new code.' using errcode='22023'; end if;
  if v_challenge.password_session_id=v_session then
    raise exception 'A fresh email verification session is required.' using errcode='42501';
  end if;
  update public.email_otp_challenges set consumed_at=now() where id=p_challenge_id;
  insert into public.email_otp_verified_sessions(user_id,session_id,expires_at)
    values(v_user,v_session,now()+interval '12 hours')
    on conflict(user_id,session_id) do update set verified_at=now(),expires_at=excluded.expires_at;
  return true;
end;
$$;

create or replace function public.is_email_otp_session_verified()
returns boolean language sql stable security definer set search_path=''
as $$
  select exists(
    select 1 from public.email_otp_verified_sessions s
    where s.user_id=(select auth.uid())
      and s.session_id=nullif((select auth.jwt()->>'session_id'),'')::uuid
      and s.expires_at>now()
  );
$$;

revoke all on function public.begin_email_otp_challenge() from public,anon;
revoke all on function public.complete_email_otp_challenge(uuid) from public,anon;
revoke all on function public.is_email_otp_session_verified() from public,anon;
grant execute on function public.begin_email_otp_challenge() to authenticated;
grant execute on function public.complete_email_otp_challenge(uuid) to authenticated;
grant execute on function public.is_email_otp_session_verified() to authenticated;

-- Enforce both password setup and email OTP for every account-owned resource.
drop policy if exists preferences_select_own on public.user_preferences;
drop policy if exists preferences_insert_own on public.user_preferences;
drop policy if exists preferences_update_own on public.user_preferences;
create policy preferences_select_own on public.user_preferences for select to authenticated
using ((select auth.uid())=user_id and (select public.is_email_otp_session_verified())
 and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.password_configured_at is not null));
create policy preferences_insert_own on public.user_preferences for insert to authenticated
with check ((select auth.uid())=user_id and (select public.is_email_otp_session_verified())
 and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.password_configured_at is not null));
create policy preferences_update_own on public.user_preferences for update to authenticated
using ((select auth.uid())=user_id and (select public.is_email_otp_session_verified())
 and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.password_configured_at is not null))
with check ((select auth.uid())=user_id and (select public.is_email_otp_session_verified())
 and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.password_configured_at is not null));

drop policy if exists "network plans owner" on public.network_plans;
create policy "network plans owner" on public.network_plans for all to authenticated
using ((select auth.uid())=user_id and (select public.is_email_otp_session_verified())
 and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.password_configured_at is not null))
with check ((select auth.uid())=user_id and (select public.is_email_otp_session_verified())
 and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.password_configured_at is not null));
drop policy if exists "allocations owner" on public.allocations;
create policy "allocations owner" on public.allocations for all to authenticated
using ((select auth.uid())=user_id and (select public.is_email_otp_session_verified())
 and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.password_configured_at is not null))
with check ((select auth.uid())=user_id and (select public.is_email_otp_session_verified())
 and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.password_configured_at is not null));
drop policy if exists "assignments owner" on public.ip_assignments;
create policy "assignments owner" on public.ip_assignments for all to authenticated
using ((select auth.uid())=user_id and (select public.is_email_otp_session_verified())
 and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.password_configured_at is not null))
with check ((select auth.uid())=user_id and (select public.is_email_otp_session_verified())
 and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.password_configured_at is not null));
drop policy if exists "attempts owner" on public.practice_attempts;
create policy "attempts owner" on public.practice_attempts for all to authenticated
using ((select auth.uid())=user_id and (select public.is_email_otp_session_verified())
 and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.password_configured_at is not null))
with check ((select auth.uid())=user_id and (select public.is_email_otp_session_verified())
 and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.password_configured_at is not null));

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles for insert to authenticated
with check ((select auth.uid())=id and (select public.is_email_otp_session_verified()) and password_configured_at is not null);
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update to authenticated
using ((select auth.uid())=id and (select public.is_email_otp_session_verified()) and password_configured_at is not null)
with check ((select auth.uid())=id and (select public.is_email_otp_session_verified()) and password_configured_at is not null);

drop policy if exists "audit owner read" on public.auth_audit_log;
create policy "audit owner read" on public.auth_audit_log for select to authenticated
using ((select auth.uid())=user_id and (select public.is_email_otp_session_verified())
 and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.password_configured_at is not null));
drop policy if exists "audit owner insert" on public.auth_audit_log;
create policy "audit owner insert" on public.auth_audit_log for insert to authenticated
with check ((select auth.uid())=user_id and (select public.is_email_otp_session_verified())
 and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.password_configured_at is not null));

drop policy if exists avatars_insert_own_folder on storage.objects;
create policy avatars_insert_own_folder on storage.objects for insert to authenticated with check (
 bucket_id='avatars' and (storage.foldername(name))[1]=(select auth.uid())::text
 and (select public.is_email_otp_session_verified())
 and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.password_configured_at is not null));
drop policy if exists avatars_update_own_folder on storage.objects;
create policy avatars_update_own_folder on storage.objects for update to authenticated using (
 bucket_id='avatars' and (storage.foldername(name))[1]=(select auth.uid())::text
 and (select public.is_email_otp_session_verified())
 and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.password_configured_at is not null))
with check (
 bucket_id='avatars' and (storage.foldername(name))[1]=(select auth.uid())::text
 and (select public.is_email_otp_session_verified())
 and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.password_configured_at is not null));
drop policy if exists avatars_delete_own_folder on storage.objects;
create policy avatars_delete_own_folder on storage.objects for delete to authenticated using (
 bucket_id='avatars' and (storage.foldername(name))[1]=(select auth.uid())::text
 and (select public.is_email_otp_session_verified())
 and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.password_configured_at is not null));

create or replace function public.record_auth_audit_event(p_event text)
returns void language plpgsql security invoker set search_path=''
as $$
declare current_user_id uuid := (select auth.uid());
begin
 if current_user_id is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if not (select public.is_email_otp_session_verified()) then raise exception 'Email OTP verification required' using errcode='42501'; end if;
 insert into public.auth_audit_log(event,user_id) values(p_event,current_user_id);
end;
$$;
