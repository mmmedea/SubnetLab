create or replace function public.record_auth_audit_event(p_event text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode='42501';
  end if;
  if p_event not in (
    'password_login','google_oauth_login','signup_verified','phone_mfa_verified',
    'profile_updated','avatar_updated','preferences_updated','password_changed',
    'email_change_requested','email_changed','other_sessions_signed_out',
    'account_exported','account_deletion_requested'
  ) then
    raise exception 'Unsupported audit event' using errcode='22023';
  end if;
  insert into public.auth_audit_log(event,user_id) values (p_event,current_user_id);
end;
$$;
revoke all on function public.record_auth_audit_event(text) from public, anon;
grant execute on function public.record_auth_audit_event(text) to authenticated;
