# SubnetLab Next.js migration

This branch introduces the Next.js App Router workspace while retaining the legacy Express implementation and its existing bigint-keyed database records.

## Database status

Supabase Preview and Production are separate projects. Preview currently contains the latest workspace RLS and Settings migrations, including the password-plus-email-OTP policy correction and security activity/preferences foundation. Before a Production deployment, compare its migration history with `supabase/migrations/` and apply missing migrations in order; keep the Production SMTP configuration in the main Supabase project.

The foundational migrations recorded in `supabase/migrations/` (including schema compatibility, settings/storage, ownership guards, profile column privileges, and consent-trigger hardening):
- `network_cockpit_auth_compatible`: creates UUID-owned profiles, network plans, VLSM allocations, IP assignments, practice attempts, and an auth audit table.
- `settings_profiles_preferences_storage`: creates account preferences, profile provisioning for Supabase Auth users, and the avatars bucket.

The new workspace uses `public.network_plans`. The legacy `public.plans` table remains unchanged because it uses bigint IDs and has existing foreign-key relationships. Existing legacy users, plans, IP records, reservations, and practice attempts were not deleted or converted.

All new account/workspace tables have RLS enabled and owner-scoped policies. Anonymous access is revoked from the new tables. Existing legacy tables remain separate and are not exposed to the new Supabase Auth identity model.

## Required Supabase and Vercel configuration

- Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for Preview and Production. The project has a publishable-key fallback in `utils/supabase/config.ts`, but deployment environment variables should be authoritative.
- Configure Supabase email templates to send six-digit OTP codes for signup and email changes.
- Configure the Supabase Auth **Magic Link** email template to send the six-digit `{{ .Token }}` value (not only a clickable link). The app uses Supabase email OTP for the second sign-in step. Email OTP expiration and resend limits are controlled by Supabase Auth.
- Keep email OTP enabled and configure custom SMTP if you need reliable production delivery and higher sending limits. Test signup confirmation, sign-in OTP, password recovery, and email-change confirmation with real inboxes.
- Add the preview and production app URLs to Supabase Auth's allowed redirect URLs.
- Configure the Google OAuth provider and its callback URL before enabling Google sign-in.
- Configure Supabase Auth rate limits and CAPTCHA protection before opening public registration.
- Enable leaked-password protection in Supabase Auth. The database advisor currently reports this setting is disabled.
- Set `SUPABASE_SERVICE_ROLE_KEY` as a server-only Vercel environment variable to enable account deletion. Never prefix it with `NEXT_PUBLIC_` or expose it to browser code.
- Confirm the Magic Link template contains `{{ .Token }}` and SMTP delivery works with real signup, password-gated sign-in OTP, password recovery, and email-change tests. The code handles provider errors, but delivery cannot be proven from repository tests.

## Implemented in this branch

- Supabase password login, email OTP signup and verification, Google OAuth PKCE, and safe post-auth redirects.
- Google sign-in is not a passwordless bypass: Google OAuth returns to a SubnetLab password setup/check step, then requires a password-gated email OTP before workspace access.
- Email/password login and signup also require a fresh six-digit email OTP after password verification. Email OTP challenges are tied to the password-authenticated session, then verified against a new OTP session. Direct passwordless OTP sessions without a password challenge cannot access workspace data.
- Middleware, Settings APIs, Storage writes, and workspace RLS policies require both a server-confirmed SubnetLab password and a database-recorded email-OTP-verified session. The OTP challenge is created only from a password-authenticated session, and the resulting verification is bound to the new Supabase session ID. Profile reads needed for Google password setup remain available to the account owner before email verification.
- Password recovery request and password-reset completion.
- Profile editing, avatar upload/removal, email-change OTP confirmation, password re-authentication, email OTP session status, persistent preferences, full JSON/CSV export, other-session sign-out, recent security activity, and server-side account deletion.
- Persisted IPv4 network plans and VLSM allocations.
- IP address inventory CRUD with status updates and plan linking.
- Persisted subnetting practice attempts and progress summaries.
- CI workflow for dependency installation, TypeScript checking, tests, and Next.js production build.

## Remaining verification / known limits

- Legacy custom-JWT users are not automatically mapped to Supabase Auth users. Existing legacy accounts and data remain intact.
- Application-owned durable per-IP/per-email auth rate limiting and Turnstile server verification are not implemented. Configure Supabase Auth's own limits and CAPTCHA before public registration.
- Security activity records cover verified sign-ins, password setup/changes, session revocation, preference changes, and exports. The separate auth audit log continues to record profile/avatar changes and account deletion requests.
- The current practice set is a small starter question bank; it is not yet an adaptive curriculum.
- Full IPv6 calculation UI, network tree split/merge, plan sharing, and automated browser/RLS-isolation test coverage remain incomplete.
- Test actual OTP email delivery, Google sign-in, password recovery, account deletion, and avatar operations against the deployed preview before merging or switching production traffic.
