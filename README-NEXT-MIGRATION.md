# SubnetLab Next.js migration (preview only)

This branch starts the App Router migration while retaining the legacy Express implementation and its existing tables. The new UI uses Supabase Auth and a separate UUID-owned schema.

## Required Vercel preview environment
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY

Never expose a service-role key or Turnstile secret to the browser.

## Supabase setup before testing signup
1. Review and apply supabase/migrations/20261121000100_network_cockpit_auth.sql in a non-production Supabase project first.
2. Configure email OTP templates and allowed redirect URLs for the preview deployment.
3. Configure Google OAuth in Supabase before enabling Google sign-in.
4. Add server-side Turnstile verification and durable rate limiting before opening public registration.

## Explicitly not complete yet
- Legacy custom-JWT users are not migrated. Existing tables are not deleted.
- Turnstile server verification and durable per-IP/per-email rate limits are not yet wired into auth.
- Profile onboarding, consent recording, auth audit writes, session revocation UI, and full reset-password completion remain to be implemented.
- IPAM persistence, plan sharing, network tree split/merge, full IPv6 calculator UI, topic heatmap, and full Playwright/RLS isolation suite remain incomplete.
- Do not merge or switch production to this branch until the missing controls are implemented and tested.
