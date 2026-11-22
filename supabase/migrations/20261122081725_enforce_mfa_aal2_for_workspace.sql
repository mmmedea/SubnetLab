-- Enforce MFA at the database boundary as well as in Next.js middleware.
-- Profile reads remain available during Google password setup; all workspace data requires AAL2.
drop policy if exists preferences_select_own on public.user_preferences;
drop policy if exists preferences_insert_own on public.user_preferences;
drop policy if exists preferences_update_own on public.user_preferences;
create policy preferences_select_own on public.user_preferences for select to authenticated
using ((select auth.uid())=user_id and (select auth.jwt()->>'aal')='aal2');
create policy preferences_insert_own on public.user_preferences for insert to authenticated
with check ((select auth.uid())=user_id and (select auth.jwt()->>'aal')='aal2');
create policy preferences_update_own on public.user_preferences for update to authenticated
using ((select auth.uid())=user_id and (select auth.jwt()->>'aal')='aal2')
with check ((select auth.uid())=user_id and (select auth.jwt()->>'aal')='aal2');

drop policy if exists "network plans owner" on public.network_plans;
create policy "network plans owner" on public.network_plans for all to authenticated
using ((select auth.uid())=user_id and (select auth.jwt()->>'aal')='aal2')
with check ((select auth.uid())=user_id and (select auth.jwt()->>'aal')='aal2');
drop policy if exists "allocations owner" on public.allocations;
create policy "allocations owner" on public.allocations for all to authenticated
using ((select auth.uid())=user_id and (select auth.jwt()->>'aal')='aal2')
with check ((select auth.uid())=user_id and (select auth.jwt()->>'aal')='aal2');
drop policy if exists "assignments owner" on public.ip_assignments;
create policy "assignments owner" on public.ip_assignments for all to authenticated
using ((select auth.uid())=user_id and (select auth.jwt()->>'aal')='aal2')
with check ((select auth.uid())=user_id and (select auth.jwt()->>'aal')='aal2');
drop policy if exists "attempts owner" on public.practice_attempts;
create policy "attempts owner" on public.practice_attempts for all to authenticated
using ((select auth.uid())=user_id and (select auth.jwt()->>'aal')='aal2')
with check ((select auth.uid())=user_id and (select auth.jwt()->>'aal')='aal2');
drop policy if exists "audit owner read" on public.auth_audit_log;
create policy "audit owner read" on public.auth_audit_log for select to authenticated
using ((select auth.uid())=user_id and (select auth.jwt()->>'aal')='aal2');

drop policy if exists avatars_insert_own_folder on storage.objects;
create policy avatars_insert_own_folder on storage.objects for insert to authenticated with check (
  bucket_id='avatars' and (storage.foldername(name))[1]=(select auth.uid())::text
  and (select auth.jwt()->>'aal')='aal2'
);
drop policy if exists avatars_update_own_folder on storage.objects;
create policy avatars_update_own_folder on storage.objects for update to authenticated using (
  bucket_id='avatars' and (storage.foldername(name))[1]=(select auth.uid())::text
  and (select auth.jwt()->>'aal')='aal2'
) with check (
  bucket_id='avatars' and (storage.foldername(name))[1]=(select auth.uid())::text
  and (select auth.jwt()->>'aal')='aal2'
);
drop policy if exists avatars_delete_own_folder on storage.objects;
create policy avatars_delete_own_folder on storage.objects for delete to authenticated using (
  bucket_id='avatars' and (storage.foldername(name))[1]=(select auth.uid())::text
  and (select auth.jwt()->>'aal')='aal2'
);

create or replace function public.record_auth_audit_event(p_event text)
returns void language plpgsql security definer set search_path=''
as $$
declare current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if (select auth.jwt()->>'aal') is distinct from 'aal2' then
    raise exception 'Phone verification required' using errcode='42501';
  end if;
  if p_event not in (
    'password_login','google_oauth_login','signup_verified','phone_mfa_verified',
    'profile_updated','avatar_updated','preferences_updated','password_changed',
    'email_change_requested','email_changed','other_sessions_signed_out',
    'account_exported','account_deletion_requested'
  ) then raise exception 'Unsupported audit event' using errcode='22023'; end if;
  insert into public.auth_audit_log(event,user_id) values(p_event,current_user_id);
end;
$$;
revoke all on function public.record_auth_audit_event(text) from public,anon;
grant execute on function public.record_auth_audit_event(text) to authenticated;
