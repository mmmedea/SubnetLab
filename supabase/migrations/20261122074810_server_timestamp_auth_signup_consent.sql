create or replace function public.handle_new_auth_user_settings()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  begin
    insert into public.profiles (id,username,display_name,avatar_url,terms_accepted_at,consented_at)
    values (
      new.id,
      nullif(lower(coalesce(new.raw_user_meta_data->>'username',new.raw_user_meta_data->>'user_name')),''),
      nullif(coalesce(new.raw_user_meta_data->>'full_name',new.raw_user_meta_data->>'name'),''),
      nullif(new.raw_user_meta_data->>'avatar_url',''),
      case when nullif(new.raw_user_meta_data->>'terms_accepted_at','') is not null then now() else null end,
      case when nullif(new.raw_user_meta_data->>'terms_accepted_at','') is not null then now() else null end
    ) on conflict (id) do nothing;
  exception when unique_violation then
    insert into public.profiles (id,display_name,avatar_url,terms_accepted_at,consented_at)
    values (
      new.id,
      nullif(coalesce(new.raw_user_meta_data->>'full_name',new.raw_user_meta_data->>'name'),''),
      nullif(new.raw_user_meta_data->>'avatar_url',''),
      case when nullif(new.raw_user_meta_data->>'terms_accepted_at','') is not null then now() else null end,
      case when nullif(new.raw_user_meta_data->>'terms_accepted_at','') is not null then now() else null end
    ) on conflict (id) do nothing;
  end;
  insert into public.user_preferences(user_id) values(new.id) on conflict(user_id) do nothing;
  return new;
end;
$$;
