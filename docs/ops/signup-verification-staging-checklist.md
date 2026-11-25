# Signup verification: staging procedure

This checklist is for **STAGING only**. Do not apply either migration to Production.

## Security behavior

The public verification route calls the existing service-role-only `public.consume_api_rate_limit` RPC using two separate SHA-256 keys: trusted client IP (8 requests per 15 minutes) and normalized email (10 requests per 15 minutes). The email key is shared across different IP addresses. The IP limiter uses `x-real-ip`, falling back to the first address in `x-vercel-forwarded-for`; it never parses `x-forwarded-for`. Limiter errors and malformed responses fail closed.

Accepted tradeoff: the per-email limit can delay a victim's signup confirmation for up to 15 minutes if an attacker exhausts that email's limit.

The new grant functions are SECURITY DEFINER with a fixed empty search path. EXECUTE is revoked from public, anon, and authenticated and granted only to service_role. Existing workspace RLS policies are unchanged. The function writes a short-lived grant and consumes it atomically with the verified-session row and `signup_verified` audit event.

`NEXT_PUBLIC_SIGNUP_VERIFICATION_MODE` is a build-time switch. It defaults to server verification. Set it to `legacy` only to restore the previous browser verification flow; changing it requires a redeploy. The server route also falls back to the existing email OTP screen if the grant functions are unavailable or reject a grant.

## Apply and verify in STAGING

1. Confirm the Preview deployment points to the STAGING Supabase project. Confirm the Preview environment has the existing server-only `SUPABASE_SERVICE_ROLE_KEY` variable configured; never paste its value into chat or logs.
2. Apply `supabase/migrations/20261125120000_allow_first_signup_session_without_second_otp.sql` in the STAGING SQL Editor.
3. Apply `supabase/migrations/20261125120500_enforce_username_3_20.sql` in the STAGING SQL Editor. Its preflight stops without changing usernames if existing values violate the new length/character rule or collide case-insensitively.
4. Run `supabase/tests/signup_grant_test.sql` in STAGING. It starts a transaction and ends with ROLLBACK; it creates only temporary test fixtures.
5. Confirm the trigger and function security properties with:

```sql
select t.tgname
from pg_trigger t
where t.tgrelid = 'auth.users'::regclass
  and t.tgname = 'mark_email_signup_otp_eligible'
  and not t.tgisinternal;

select p.proname,
       p.prosecdef as security_definer,
       p.proconfig as function_settings,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute,
       has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('create_signup_otp_grant', 'consume_signup_otp_grant');

select c.relname, c.relrowsecurity
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('signup_otp_eligibility', 'signup_otp_grants');
```

Expected: the trigger is present; both RPCs are SECURITY DEFINER with an empty search path; anon/authenticated cannot execute them; service_role can; RLS is enabled on both new tables.

## Staging acceptance checks

- [ ] Create a fresh email/password account with a unique username, enter the signup code once, and confirm it goes directly to `/dashboard`.
- [ ] Confirm the dashboard greeting uses the signup username and the workspace header no longer shows the email.
- [ ] Confirm `profiles.password_configured_at` is populated by the existing trigger.
- [ ] Reuse the signup code and try an expired/unknown code; wrong, expired, and unknown code responses use the same generic message.
- [ ] Confirm the verification response includes `Cache-Control: no-store`.
- [ ] Sign out and sign in with password; confirm the normal email OTP is still required.
- [ ] Sign out and sign in with Google; confirm the normal email OTP is still required.
- [ ] Submit repeated bad codes and confirm the IP and email limits block requests; repeat from different IP fixtures to confirm the email limit is shared.
- [ ] Review Vercel function logs; confirm they contain no email, code, token, raw IP, or grant ID.
- [ ] Confirm an account created before the migration follows the normal OTP path once.

The Vercel Preview URL and the project it uses must be taken from the PR checks or comments and verified before running these checks. The local Windows visual comparison is user-run: every route should remain at zero diff except for the approved dashboard greeting and shared workspace header email removal.

## Rollback

1. Set `NEXT_PUBLIC_SIGNUP_VERIFICATION_MODE=legacy` in the STAGING Preview environment and redeploy first.
2. Run `docs/ops/rollback-username-3-20.sql`.
3. Run `docs/ops/rollback-first-signup-session.sql`.

The grant rollback removes only verified-session rows created by consumed signup grants, then removes the signup grant tables/functions and auth.users trigger. The username rollback restores the former 3–32 profile constraint and auth-user trigger behavior. No Production SQL has been applied.
