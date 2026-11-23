-- Keep account metadata readable during the Google password setup step,
-- but require AAL2 for all profile writes.
drop policy if exists "profiles owner" on public.profiles;
drop policy if exists profiles_select_own on public.profiles;
drop policy if exists profiles_insert_own on public.profiles;
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_select_own on public.profiles for select to authenticated
using ((select auth.uid())=id);
create policy profiles_insert_own on public.profiles for insert to authenticated
with check ((select auth.uid())=id and (select auth.jwt()->>'aal')='aal2');
create policy profiles_update_own on public.profiles for update to authenticated
using ((select auth.uid())=id and (select auth.jwt()->>'aal')='aal2')
with check ((select auth.uid())=id and (select auth.jwt()->>'aal')='aal2');
