-- Evaluate JWT claims once per statement in the email OTP RLS policies.
drop policy if exists email_otp_challenges_select_own on public.email_otp_challenges;
create policy email_otp_challenges_select_own on public.email_otp_challenges
for select to authenticated using (
 user_id=(select auth.uid())
 and exists(select 1 from jsonb_array_elements(coalesce(((select auth.jwt())->'amr'),'[]'::jsonb)) a where a->>'method' in ('password','otp','magiclink','email/signup'))
);
drop policy if exists email_otp_challenges_insert_password on public.email_otp_challenges;
create policy email_otp_challenges_insert_password on public.email_otp_challenges
for insert to authenticated with check (
 user_id=(select auth.uid())
 and password_session_id=nullif(((select auth.jwt())->>'session_id'),'')::uuid
 and exists(select 1 from jsonb_array_elements(coalesce(((select auth.jwt())->'amr'),'[]'::jsonb)) a where a->>'method'='password')
 and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.password_configured_at is not null)
);
drop policy if exists email_otp_challenges_update_otp on public.email_otp_challenges;
create policy email_otp_challenges_update_otp on public.email_otp_challenges
for update to authenticated using (
 user_id=(select auth.uid()) and consumed_at is null
 and exists(select 1 from jsonb_array_elements(coalesce(((select auth.jwt())->'amr'),'[]'::jsonb)) a where a->>'method' in ('otp','magiclink','email/signup'))
) with check (user_id=(select auth.uid()) and consumed_at is not null);
drop policy if exists email_otp_challenges_delete_password on public.email_otp_challenges;
create policy email_otp_challenges_delete_password on public.email_otp_challenges
for delete to authenticated using (
 user_id=(select auth.uid())
 and exists(select 1 from jsonb_array_elements(coalesce(((select auth.jwt())->'amr'),'[]'::jsonb)) a where a->>'method'='password')
);
drop policy if exists email_otp_verified_sessions_select_current on public.email_otp_verified_sessions;
create policy email_otp_verified_sessions_select_current on public.email_otp_verified_sessions
for select to authenticated using (
 user_id=(select auth.uid())
 and session_id=nullif(((select auth.jwt())->>'session_id'),'')::uuid
 and expires_at>now()
);
drop policy if exists email_otp_verified_sessions_insert_after_challenge on public.email_otp_verified_sessions;
create policy email_otp_verified_sessions_insert_after_challenge on public.email_otp_verified_sessions
for insert to authenticated with check (
 user_id=(select auth.uid())
 and session_id=nullif(((select auth.jwt())->>'session_id'),'')::uuid
 and expires_at<=now()+interval '12 hours'
 and expires_at>now()
 and exists(select 1 from jsonb_array_elements(coalesce(((select auth.jwt())->'amr'),'[]'::jsonb)) a where a->>'method' in ('otp','magiclink','email/signup'))
 and exists(select 1 from public.email_otp_challenges c
  where c.user_id=(select auth.uid()) and c.consumed_at is null and c.expires_at>now()
   and c.password_session_id<>nullif(((select auth.jwt())->>'session_id'),'')::uuid)
);
