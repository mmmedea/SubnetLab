# SubnetLab Next.js migration

This branch introduces the Next.js App Router workspace while retaining the legacy Express implementation and its existing bigint-keyed database records.

## Database status

The Supabase production project has received two additive migrations:
- `network_cockpit_auth_compatible`: creates UUID-owned profiles, network plans, VLSM allocations, IP assignments, practice attempts, and an auth audit table.
- `settings_profiles_preferences_storage`: creates account preferences, profile provisioning for Supabase Auth users, and the avatars bucket.

The new workspace uses `public.network_plans`. The legacy `public.plans` table remains unchanged because it uses bigint IDs and has existing foreign-key relationships. Existing legacy users, plans, IP records, reservations, and practice attempts were not deleted or converted.

All new account/workspace tables have RLS enabled and owner-scoped policies. Anonymous access is revoked from the new tables. Existing legacy tables remain separate and are not exposed to the new Supabase Auth identity model.

## Required Supabase and Vercel configuration

- Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for Preview and Production. The project has a publishable-key fallback in `utils/supabase/config.ts`, but deployment environment variables should be authoritative.
- Configure Supabase email templates to send six-digit OTP codes for signup.
- Add the preview and production app URLs to Supabase Auth's allowed redirect URLs.
- Configure the Google OAuth provider and its callback URL before enabling Google sign-in.
- Configure Supabase Auth rate limits and CAPTCHA protection before opening public registration.
- Set `SUPABASE_SERVICE_ROLE_KEY` as a server-only Vercel environment variable to enable account deletion. Never prefix it with `NEXT_PUBLIC_` or expose it to browser code.
- Confirm SMTP delivery with a real signup and password-recovery test. The code handles provider errors, but delivery cannot be proven from repository tests.

## Implemented in this branch

- Supabase password login, email OTP signup and verification, Google OAuth PKCE, protected workspace routes, and safe post-auth redirects.
- Password recovery request and password-reset completion.
- Profile editing, avatar upload/removal, account email/password changes, preference persistence, data export, other-session sign-out, and server-side account deletion.
- Persisted IPv4 network plans and VLSM allocations.
- IP address inventory CRUD with status updates and plan linking.
- Persisted subnetting practice attempts and progress summaries.
- CI workflow for dependency installation, TypeScript checking, tests, and Next.js production build.

## Remaining verification / known limits

- Legacy custom-JWT users are not automatically mapped to Supabase Auth users. Existing legacy accounts and data remain intact.
- Application-owned durable per-IP/per-email auth rate limiting and Turnstile server verification are not implemented. Configure Supabase Auth's own limits and CAPTCHA before public registration.
- Auth audit table is created, but application audit writes are not yet wired.
- The current practice set is a small starter question bank; it is not yet an adaptive curriculum.
- Full IPv6 calculation UI, network tree split/merge, plan sharing, and automated browser/RLS-isolation test coverage remain incomplete.
- Test actual OTP email delivery, Google sign-in, password recovery, account deletion, and avatar operations against the deployed preview before merging or switching production traffic.
