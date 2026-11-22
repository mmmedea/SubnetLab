# SubnetLab Next.js migration (preview only)

This branch starts the App Router migration while retaining the legacy Express implementation and its existing tables. The new UI uses Supabase Auth and a separate UUID-owned schema.

## Required Vercel preview environment
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (preferred; legacy anon key is supported only for compatibility)

Never expose a service-role key or Turnstile secret to the browser.

## Supabase setup before testing signup
1. Review and apply supabase/migrations/20261121000100_network_cockpit_auth.sql in a non-production Supabase project first.
2. Configure email OTP templates and allowed redirect URLs for the preview deployment.
3. Configure Google OAuth in Supabase before enabling Google sign-in.
4. Configure Supabase Auth rate limits and CAPTCHA protection in the Supabase Auth dashboard before opening public registration. Supabase Auth performs password hashing, email verification, token issuance, PKCE code exchange, and cookie-backed session handling through `@supabase/ssr`; do not build a parallel password table or custom JWT store.

## Explicitly not complete yet
- Legacy custom-JWT users are not migrated. Existing tables are not deleted.
- Application-owned durable per-IP/per-email rate limiting and Turnstile verification are not implemented in this branch. Supabase Auth has provider-level rate limits; configure them and CAPTCHA in the Supabase dashboard before public launch.
- Profile onboarding, consent recording, auth audit writes, session revocation UI, and full reset-password completion remain to be implemented.
- IPAM persistence, plan sharing, network tree split/merge, full IPv6 calculator UI, topic heatmap, and full Playwright/RLS isolation suite remain incomplete.
- Do not merge or switch production to this branch until the missing controls are implemented and tested.
