revoke insert, update, delete on public.profiles from authenticated;
grant select on public.profiles to authenticated;
grant insert (id, username, display_name, bio, avatar_url, updated_at) on public.profiles to authenticated;
grant update (username, display_name, bio, avatar_url, updated_at) on public.profiles to authenticated;

create or replace function public.record_user_consent()
returns void language plpgsql security definer set search_path=''
as $$
declare current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then raise exception 'Authentication required' using errcode='42501'; end if;
  update public.profiles set terms_accepted_at=now(),consented_at=now(),terms_version='v1',privacy_version='v1',updated_at=now()
  where id=current_user_id;
  if not found then raise exception 'Profile not found' using errcode='P0002'; end if;
end;
$$;
revoke all on function public.record_user_consent() from public, anon;
grant execute on function public.record_user_consent() to authenticated;
