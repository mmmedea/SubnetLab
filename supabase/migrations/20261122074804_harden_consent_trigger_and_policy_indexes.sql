drop function if exists public.record_user_consent();

create or replace function public.sync_auth_user_consent()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if nullif(new.raw_user_meta_data->>'terms_accepted_at','') is not null
     and new.raw_user_meta_data->>'terms_accepted_at' is distinct from old.raw_user_meta_data->>'terms_accepted_at' then
    update public.profiles set terms_accepted_at=now(),consented_at=now(),terms_version='v1',privacy_version='v1',updated_at=now()
    where id=new.id;
  end if;
  return new;
end;
$$;
revoke all on function public.sync_auth_user_consent() from public, anon, authenticated;
drop trigger if exists sync_auth_user_consent on auth.users;
create trigger sync_auth_user_consent after update of raw_user_meta_data on auth.users
for each row execute function public.sync_auth_user_consent();

drop policy if exists profiles_select_own on public.profiles;
drop policy if exists profiles_insert_own on public.profiles;
drop policy if exists profiles_update_own on public.profiles;
drop policy if exists preferences_select_own on public.user_preferences;
drop policy if exists preferences_insert_own on public.user_preferences;
drop policy if exists preferences_update_own on public.user_preferences;
create policy preferences_select_own on public.user_preferences for select to authenticated using ((select auth.uid())=user_id);
create policy preferences_insert_own on public.user_preferences for insert to authenticated with check ((select auth.uid())=user_id);
create policy preferences_update_own on public.user_preferences for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);

create index if not exists auth_audit_log_user_id_idx on public.auth_audit_log(user_id);
create index if not exists ip_assignments_plan_id_idx on public.ip_assignments(plan_id);
create index if not exists practice_attempts_user_id_idx on public.practice_attempts(user_id);
