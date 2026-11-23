-- AAL2 alone is not enough for Google users: the local SubnetLab password
-- must also be set before any workspace data can be read or written.
drop policy if exists preferences_select_own on public.user_preferences;
drop policy if exists preferences_insert_own on public.user_preferences;
drop policy if exists preferences_update_own on public.user_preferences;
create policy preferences_select_own on public.user_preferences for select to authenticated
using ((select auth.uid())=user_id and (select auth.jwt()->>'aal')='aal2'
  and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.password_configured_at is not null));
create policy preferences_insert_own on public.user_preferences for insert to authenticated
with check ((select auth.uid())=user_id and (select auth.jwt()->>'aal')='aal2'
  and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.password_configured_at is not null));
create policy preferences_update_own on public.user_preferences for update to authenticated
using ((select auth.uid())=user_id and (select auth.jwt()->>'aal')='aal2'
  and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.password_configured_at is not null))
with check ((select auth.uid())=user_id and (select auth.jwt()->>'aal')='aal2'
  and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.password_configured_at is not null));

drop policy if exists "network plans owner" on public.network_plans;
create policy "network plans owner" on public.network_plans for all to authenticated
using ((select auth.uid())=user_id and (select auth.jwt()->>'aal')='aal2'
  and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.password_configured_at is not null))
with check ((select auth.uid())=user_id and (select auth.jwt()->>'aal')='aal2'
  and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.password_configured_at is not null));
drop policy if exists "allocations owner" on public.allocations;
create policy "allocations owner" on public.allocations for all to authenticated
using ((select auth.uid())=user_id and (select auth.jwt()->>'aal')='aal2'
  and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.password_configured_at is not null))
with check ((select auth.uid())=user_id and (select auth.jwt()->>'aal')='aal2'
  and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.password_configured_at is not null));
drop policy if exists "assignments owner" on public.ip_assignments;
create policy "assignments owner" on public.ip_assignments for all to authenticated
using ((select auth.uid())=user_id and (select auth.jwt()->>'aal')='aal2'
  and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.password_configured_at is not null))
with check ((select auth.uid())=user_id and (select auth.jwt()->>'aal')='aal2'
  and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.password_configured_at is not null));
drop policy if exists "attempts owner" on public.practice_attempts;
create policy "attempts owner" on public.practice_attempts for all to authenticated
using ((select auth.uid())=user_id and (select auth.jwt()->>'aal')='aal2'
  and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.password_configured_at is not null))
with check ((select auth.uid())=user_id and (select auth.jwt()->>'aal')='aal2'
  and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.password_configured_at is not null));

drop policy if exists "audit owner read" on public.auth_audit_log;
create policy "audit owner read" on public.auth_audit_log for select to authenticated
using ((select auth.uid())=user_id and (select auth.jwt()->>'aal')='aal2'
  and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.password_configured_at is not null));
drop policy if exists "audit owner insert" on public.auth_audit_log;
create policy "audit owner insert" on public.auth_audit_log for insert to authenticated
with check ((select auth.uid())=user_id and (select auth.jwt()->>'aal')='aal2'
  and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.password_configured_at is not null));

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles for insert to authenticated
with check ((select auth.uid())=id and (select auth.jwt()->>'aal')='aal2' and password_configured_at is not null);
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update to authenticated
using ((select auth.uid())=id and (select auth.jwt()->>'aal')='aal2' and password_configured_at is not null)
with check ((select auth.uid())=id and (select auth.jwt()->>'aal')='aal2' and password_configured_at is not null);

drop policy if exists avatars_insert_own_folder on storage.objects;
create policy avatars_insert_own_folder on storage.objects for insert to authenticated with check (
  bucket_id='avatars' and (storage.foldername(name))[1]=(select auth.uid())::text
  and (select auth.jwt()->>'aal')='aal2'
  and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.password_configured_at is not null)
);
drop policy if exists avatars_update_own_folder on storage.objects;
create policy avatars_update_own_folder on storage.objects for update to authenticated using (
  bucket_id='avatars' and (storage.foldername(name))[1]=(select auth.uid())::text
  and (select auth.jwt()->>'aal')='aal2'
  and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.password_configured_at is not null)
) with check (
  bucket_id='avatars' and (storage.foldername(name))[1]=(select auth.uid())::text
  and (select auth.jwt()->>'aal')='aal2'
  and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.password_configured_at is not null)
);
drop policy if exists avatars_delete_own_folder on storage.objects;
create policy avatars_delete_own_folder on storage.objects for delete to authenticated using (
  bucket_id='avatars' and (storage.foldername(name))[1]=(select auth.uid())::text
  and (select auth.jwt()->>'aal')='aal2'
  and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.password_configured_at is not null)
);
