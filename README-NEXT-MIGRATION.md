# SubnetLab Next.js migration

This branch introduces the Next.js App Router workspace while retaining the legacy Express implementation and its existing bigint-keyed database records.

## Database status

The Supabase production project has received the additive migrations recorded in `supabase/migrations/` (including schema compatibility, settings/storage, ownership guards, profile column privileges, and consent-trigger hardening):
- `network_cockpit_auth_compatible`: creates UUID-owned profiles, network plans, VLSM allocations, IP assignments, practice attempts, and an auth audit table.
- `settings_profiles_preferences_storage`: creates account preferences, profile provisioning for Supabase Auth users, and the avatars bucket.

The new workspace uses `public.network_plans`. The legacy `public.plans` table remains unchanged because it uses bigint IDs and has existing foreign-key relationships. Existing legacy users, plans, IP records, reservations, and practice attempts were not deleted or converted.

All new account/workspace tables have RLS enabled and owner-scoped policies. Anonymous access is revoked from the new tables. Existing legacy tables remain separate and are not exposed to the new Supabase Auth identity model.

## Required Supabase and Vercel configuration

- Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for Preview and Production. The project has a publishable-key fallback in `utils/supabase/config.ts`, but deployment environment variables should be authoritative.
- Configure Supabase email templates to send six-digit OTP codes for signup and email changes.
- Enable Supabase Auth Phone MFA and configure an SMS provider (or Send SMS Hook). Phone MFA uses the same messaging provider configuration as phone login. SMS delivery cannot work until this is configured and tested with a real phone number.
- Keep Phone MFA verification enabled and use a six-digit code. The Supabase Auth provider controls OTP expiry and rate limits.
- Add the preview and production app URLs to Supabase Auth's allowed redirect URLs.
- Configure the Google OAuth provider and its callback URL before enabling Google sign-in.
- Configure Supabase Auth rate limits and CAPTCHA protection before opening public registration.
- Enable leaked-password protection in Supabase Auth. The database advisor currently reports this setting is disabled.
- Set `SUPABASE_SERVICE_ROLE_KEY` as a server-only Vercel environment variable to enable account deletion. Never prefix it with `NEXT_PUBLIC_` or expose it to browser code.
- Confirm SMTP delivery with a real signup and password-recovery test. The code handles provider errors, but delivery cannot be proven from repository tests.

## Implemented in this branch

- Supabase password login, email OTP signup and verification, Google OAuth PKCE, and safe post-auth redirects.
- Google sign-in is not a passwordless bypass: Google OAuth returns to a SubnetLab password setup/check step, then requires verified phone MFA before workspace access.
- Email/password login and signup also require phone MFA. Phone verification uses Supabase Auth Phone MFA with six-digit SMS challenges, resend, paste, and auto-advance support.
- Middleware, Settings APIs, Storage writes, and workspace RLS policies require both a server-confirmed SubnetLab password and AAL2 with a verified phone factor. Profile reads needed for Google password setup remain available to the account owner before AAL2.
- Password recovery request and password-reset completion.
- Profile editing, avatar upload/removal, email-change OTP confirmation, password re-authentication, phone MFA status/challenge, persistent preferences, full JSON/CSV export, other-session sign-out, recent security activity, and server-side account deletion.
- Persisted IPv4 network plans and VLSM allocations.
- IP address inventory CRUD with status updates and plan linking.
- Persisted subnetting practice attempts and progress summaries.
- CI workflow for dependency installation, TypeScript checking, tests, and Next.js production build.

## Remaining verification / known limits

- Legacy custom-JWT users are not automatically mapped to Supabase Auth users. Existing legacy accounts and data remain intact.
- Application-owned durable per-IP/per-email auth rate limiting and Turnstile server verification are not implemented. Configure Supabase Auth's own limits and CAPTCHA before public registration.
- Auth audit writes are wired for successful password/Google sign-in after MFA, profile/avatar changes, preferences, exports, other-session sign-out, and account deletion.
- The current practice set is a small starter question bank; it is not yet an adaptive curriculum.
- Full IPv6 calculation UI, network tree split/merge, plan sharing, and automated browser/RLS-isolation test coverage remain incomplete.
- Test actual OTP email delivery, Google sign-in, password recovery, account deletion, and avatar operations against the deployed preview before merging or switching production traffic.
