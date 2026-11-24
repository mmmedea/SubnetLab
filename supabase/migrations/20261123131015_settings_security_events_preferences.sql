-- Settings system foundation: security activity and preference fields.
-- User-visible event records contain only event type and timestamp.
-- Writes are server-only; authenticated users can read only their own events.

alter table public.user_preferences
  add column if not exists timezone text not null default 'UTC',
  add column if not exists language text not null default 'en';

alter table public.user_preferences
  add constraint user_preferences_theme_allowed
  check (theme in ('light', 'dark', 'system'));

alter table public.user_preferences
  add constraint user_preferences_timezone_length
  check (char_length(timezone) between 1 and 64);

alter table public.user_preferences
  add constraint user_preferences_language_length
  check (char_length(language) between 2 and 16);

create table public.security_events (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  event_type text not null check (
    event_type in (
      'login',
      'password_set',
      'password_changed',
      'sessions_revoked',
      'data_export',
      'preferences_changed',
      'account_deleted'
    )
  ),
  created_at timestamptz not null default now()
);

create index security_events_user_created_idx
  on public.security_events (user_id, created_at desc);

alter table public.security_events enable row level security;

revoke all on public.security_events from anon, authenticated;
grant select on public.security_events to authenticated;

create policy "security events owner read"
  on public.security_events
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- No authenticated INSERT, UPDATE, or DELETE policy is created.
-- Server routes write via the service-role client after explicit auth checks.
