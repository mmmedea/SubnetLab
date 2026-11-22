-- Make the audit writer invoker-scoped. The table policy, not SECURITY DEFINER,
-- controls which account can create events.
alter table public.auth_audit_log drop constraint if exists auth_audit_log_event_check;
alter table public.auth_audit_log add constraint auth_audit_log_event_check check (
  event in (
    'password_login','google_oauth_login','signup_verified','phone_mfa_verified',
    'profile_updated','avatar_updated','preferences_updated','password_changed',
    'email_change_requested','email_changed','other_sessions_signed_out',
    'account_exported','account_deletion_requested'
  )
);
grant insert on public.auth_audit_log to authenticated;
drop policy if exists "audit owner insert" on public.auth_audit_log;
create policy "audit owner insert" on public.auth_audit_log for insert to authenticated
with check (
  (select auth.uid())=user_id
  and (select auth.jwt()->>'aal')='aal2'
);
create or replace function public.record_auth_audit_event(p_event text)
returns void
language plpgsql
security invoker
set search_path=''
as $$
declare current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if (select auth.jwt()->>'aal') is distinct from 'aal2' then
    raise exception 'Phone verification required' using errcode='42501';
  end if;
  insert into public.auth_audit_log(event,user_id) values(p_event,current_user_id);
end;
$$;
revoke all on function public.record_auth_audit_event(text) from public,anon;
grant execute on function public.record_auth_audit_event(text) to authenticated;
