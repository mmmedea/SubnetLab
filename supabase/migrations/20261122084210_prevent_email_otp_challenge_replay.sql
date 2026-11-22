-- Prevent authenticated users from reopening a consumed email OTP challenge.
drop policy if exists email_otp_challenges_update_otp on public.email_otp_challenges;
create policy email_otp_challenges_update_otp on public.email_otp_challenges
for update to authenticated using (
 user_id=(select auth.uid()) and consumed_at is null
 and exists(select 1 from jsonb_array_elements(coalesce((select auth.jwt()->'amr'),'[]'::jsonb)) a where a->>'method' in ('otp','magiclink','email/signup'))
) with check (user_id=(select auth.uid()) and consumed_at is not null);
