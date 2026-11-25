# Signup verification: staging procedure

This checklist is for **STAGING**. Do not apply either migration to Production from this checklist.

## Read-only preflight

Before applying anything, run every SELECT in `docs/ops/signup-migration-preflight.sql` separately in the Supabase SQL Editor for **STAGING and PRODUCTION**. The file checks usernames, case-insensitive duplicates, auth.users triggers, matching public functions, and row counts for the existing OTP session and auth audit tables. It does not modify data.

## Username migration behavior and manual cleanup

`20261125120500_enforce_username_3_20.sql` counts invalid username rows and lower(username) duplicate groups before making schema changes. If either count is nonzero, it raises an exception before changing the schema or any profile/auth.users rows. It does not use NOT VALID constraints, derive usernames from email addresses, or delete users. After cleanup, rerun the read-only preflight and then rerun the migration.

For each invalid username returned by query (a), inspect the profile by `profile_id` and manually choose either a compliant, unique 3–20 character username or NULL. Example for one row (replace the UUID with the returned profile id):

```sql
update public.profiles
set username = null
where id = '<profile-uuid>'::uuid;
```

For each duplicate group returned by query (b), manually select one profile id to keep its current username. For every other profile id in that group, run an individual UPDATE assigning a manually chosen name that is valid and unused under `lower(username)`, or set that row's username to NULL using the statement above. Then rerun query (b) until it returns no rows. Do not generate replacements from email addresses, automatically suffix names, or delete profiles/auth.users rows.

## Security behavior

The public verification route calls the existing service-role-only `public.consume_api_rate_limit` RPC using two separate SHA-256 keys: trusted client IP (8 requests per 15 minutes) and normalized email (10 requests per 15 minutes). The email key is shared across different IP addresses. The IP limiter uses `x-real-ip`, falling back to the first address in `x-vercel-forwarded-for`; it never parses `x-forwarded-for`. Limiter errors and malformed responses fail closed.

Accepted tradeoff: the per-email limit can delay a victim's signup confirmation for up to 15 minutes if an attacker exhausts that email's limit.

The new grant functions are SECURITY DEFINER with a fixed empty search path. EXECUTE is revoked from public, anon, and authenticated and granted only to service_role. Existing workspace RLS policies are unchanged. The function writes a short-lived grant and consumes it atomically with the verified-session row and `signup_verified` audit event.

`NEXT_PUBLIC_SIGNUP_VERIFICATION_MODE` is a build-time switch. It defaults to server verification. Set it to `legacy` only to restore the previous browser verification flow; changing it requires a redeploy. The server route also falls back to the existing email OTP screen if the grant functions are unavailable or reject a grant.

## Staging email delivery prerequisite

Supabase's default SMTP sends only to organization team members and is limited to 2 emails per hour. Use an organization team-member test address, or configure Brevo SMTP in STAGING before email-signup checks. Do not change Production SMTP as part of this staging checklist.

## Apply and verify in STAGING

Before applying a migration to STAGING, notify the project owner as required by the project release rules. Confirm the Ready Preview URL from PR #25's Vercel check/comment and confirm it uses the STAGING Supabase project. Never paste secret values into chat or logs.

1. Confirm the Preview environment has the server-only `SUPABASE_SERVICE_ROLE_KEY` configured.
2. If query (b) found duplicates, resolve them manually as described above. Resolve invalid values from query (a) before running the username migration.
3. Apply `supabase/migrations/20261125120000_allow_first_signup_session_without_second_otp.sql` in the STAGING SQL Editor.
4. Apply `supabase/migrations/20261125120500_enforce_username_3_20.sql` in the STAGING SQL Editor.
5. Verify `supabase/tests/signup_grant_test.sql` ends with `ROLLBACK;`, then run it in STAGING. It starts a transaction and creates only temporary test fixtures.
6. Confirm the trigger and function security properties with:

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

Expected: the trigger is present; both RPCs are SECURITY DEFINER with an empty search path; anon/authenticated cannot execute them; service_role can; RLS is enabled on both new tables. Rerun username preflight query (a) and (b) after cleanup to confirm no rows/groups remain.

## Staging acceptance checks

- [ ] Sign up using a project-owner-controlled email and username `Maricris_Test`. Complete the signup OTP and confirm the dashboard greeting displays the typed username exactly as `Maricris_Test`.
- [ ] Using a second project-owner-controlled test email, try the case-variant username `maricris_test`. Expect the existing message: `That username is already taken. Try another one.` Record the exact browser-visible error text verbatim below. Do not include email addresses, OTPs, or other account data.
  - Browser error text observed: **[pending staging test]**
  - If the browser shows `Database error saving new user`, report that exact text. Do not change the AuthForm mapping until the project owner reports the observed text.
  - Existing usernames must not be rewritten or backfilled to change their casing.

- [ ] Create a fresh email/password account with a unique username, enter the signup code once, and confirm it goes directly to `/dashboard`.
- [ ] Confirm the dashboard greeting preserves the signup username's typed case and the workspace header no longer shows the email.
- [ ] Confirm `profiles.password_configured_at` is populated by the existing trigger.
- [ ] Reuse the signup code and try an expired/unknown code; wrong, expired, and unknown code responses use the same generic message.
- [ ] Confirm the verification response includes `Cache-Control: no-store`.
- [ ] Sign out and sign in with password; confirm the normal email OTP is still required.
- [ ] Sign out and sign in with Google; confirm the normal email OTP is still required.
- [ ] Submit repeated bad codes and confirm the IP and email limits block requests; repeat from different IP fixtures to confirm the email limit is shared.
- [ ] Review Vercel function logs; confirm they contain no email, code, token, raw IP, or grant ID.
- [ ] Confirm an account created before the migration follows the normal OTP path once.

The local Windows visual comparison remains a manual gate: every route must stay at zero diff, with the approved dashboard greeting and workspace header email removal verified against the existing baseline.

## Rollback

For STAGING, first restore the legacy verification flow by setting `NEXT_PUBLIC_SIGNUP_VERIFICATION_MODE=legacy` in the Preview environment and redeploying. Then run `docs/ops/rollback-username-3-20.sql`, followed by `docs/ops/rollback-first-signup-session.sql`.

`rollback-first-signup-session.sql` deletes rows from `email_otp_verified_sessions` that were created by consumed signup grants, then removes the signup grant tables/functions and auth.users trigger. This session-row deletion requires explicit project-owner approval before running the rollback, including in STAGING. The username rollback restores the former 3–32 profile constraint and legacy auth-user trigger behavior without deleting or rewriting existing usernames. Existing mixed-case values remain unchanged; the restored trigger lowercases usernames only for future auth-user inserts. Production rollback SQL also requires separate explicit user approval.
