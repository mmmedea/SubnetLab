-- Keep the application challenge window aligned with Supabase's default
-- one-hour email OTP validity so inbox delays do not strand a valid code.
alter table public.email_otp_challenges
 alter column expires_at set default (now() + interval '1 hour');
