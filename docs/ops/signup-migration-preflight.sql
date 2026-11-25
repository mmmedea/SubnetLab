-- Username casing is preserved by the migration; uniqueness remains case-insensitive via lower(username).
-- Neither migration rewrites existing usernames. These queries only report current rows.
-- READ ONLY. For the staging checklist, run these queries in STAGING only.
-- Production use is gated by the exact APPROVE RELEASE 25 approval; do not
-- run any Production SQL before that approval. This file contains SELECTs only.

-- (a) Usernames that do not satisfy the proposed 3–20 rule.
-- This includes too-short, too-long, and non-alphanumeric/underscore values.
select
  id as profile_id,
  username,
  char_length(username) as username_characters
from public.profiles
where username is not null
  and username !~ '^[A-Za-z0-9_]{3,20}$'
order by lower(username), id;

-- (b) Case-insensitive duplicate usernames that would block the unique index.
select
  lower(username) as normalized_username,
  count(*) as duplicate_count,
  array_agg(id order by id) as profile_ids,
  array_agg(username order by id) as current_usernames
from public.profiles
where username is not null
group by lower(username)
having count(*) > 1
order by lower(username);

-- (c) Existing auth.users triggers. PostgreSQL orders triggers with the same
-- timing/event alphabetically by trigger name; the result is sorted that way.
select
  t.tgname as trigger_name,
  pg_get_triggerdef(t.oid, true) as trigger_definition,
  t.tgenabled as enabled_state,
  t.tgisinternal as is_internal
from pg_trigger t
where t.tgrelid = 'auth.users'::regclass
order by t.tgname, t.oid;

-- (d) Existing functions using names created/replaced by the migrations.
-- handle_new_auth_user_settings() is intentionally replaced by the username migration.
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as identity_arguments,
  pg_get_function_result(p.oid) as result_type,
  p.prosecdef as security_definer,
  p.proconfig as function_settings
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'mark_email_signup_otp_eligible',
    'create_signup_otp_grant',
    'consume_signup_otp_grant',
    'handle_new_auth_user_settings'
  )
order by p.proname, identity_arguments;

-- (e) Row counts only; no session or audit rows are returned.
select 'email_otp_verified_sessions' as table_name, count(*) as row_count
from public.email_otp_verified_sessions
union all
select 'auth_audit_log' as table_name, count(*) as row_count
from public.auth_audit_log;
