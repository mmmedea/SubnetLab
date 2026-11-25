delete from public.email_otp_verified_sessions s
using public.signup_otp_grants g
where g.consumed_at is not null
  and s.user_id = g.user_id
  and s.session_id = g.session_id;

drop trigger if exists mark_email_signup_otp_eligible on auth.users;
drop function if exists public.mark_email_signup_otp_eligible();
drop function if exists public.consume_signup_otp_grant(uuid, uuid, uuid);
drop function if exists public.create_signup_otp_grant(uuid, uuid);
drop table if exists public.signup_otp_grants;
drop table if exists public.signup_otp_eligibility;
