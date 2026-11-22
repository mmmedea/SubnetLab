-- Allow the new email OTP audit event and retain historical phone events.
alter table public.auth_audit_log drop constraint if exists auth_audit_log_event_check;
alter table public.auth_audit_log add constraint auth_audit_log_event_check check (
 event in (
  'password_login','google_oauth_login','signup_verified','phone_mfa_verified','email_otp_verified',
  'profile_updated','avatar_updated','preferences_updated','password_changed',
  'email_change_requested','email_changed','other_sessions_signed_out',
  'account_exported','account_deletion_requested'
 )
);
-- Supabase may identify an email code session as either otp or magiclink,
-- depending on the configured email template.
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
 if not exists(select 1 from jsonb_array_elements(v_amr) a where a->>'method' in ('otp','magiclink','email/signup')) then
  raise exception 'The session was not created by an email OTP.' using errcode='42501';
 end if;
 select * into v_challenge from public.email_otp_challenges
  where id=p_challenge_id and user_id=v_user and consumed_at is null and expires_at>now()
  for update;
 if not found then raise exception 'This email verification request expired. Send a new code.' using errcode='22023'; end if;
 if v_challenge.password_session_id=v_session then raise exception 'A fresh email verification session is required.' using errcode='42501'; end if;
 update public.email_otp_challenges set consumed_at=now() where id=p_challenge_id;
 insert into public.email_otp_verified_sessions(user_id,session_id,expires_at)
  values(v_user,v_session,now()+interval '12 hours')
  on conflict(user_id,session_id) do update set verified_at=now(),expires_at=excluded.expires_at;
 return true;
end;
$$;
revoke all on function public.complete_email_otp_challenge(uuid) from public,anon;
grant execute on function public.complete_email_otp_challenge(uuid) to authenticated;
