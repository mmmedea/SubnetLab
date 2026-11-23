-- Roll back Settings system foundation.
-- Drops the activity log and removes the two preference columns/constraints.

drop policy if exists "security events owner read" on public.security_events;
drop table if exists public.security_events;

alter table public.user_preferences
  drop constraint if exists user_preferences_theme_allowed,
  drop constraint if exists user_preferences_timezone_length,
  drop constraint if exists user_preferences_language_length,
  drop column if exists timezone,
  drop column if exists language;
