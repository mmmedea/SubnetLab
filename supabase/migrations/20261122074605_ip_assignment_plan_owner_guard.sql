create or replace function public.enforce_ip_assignment_plan_owner()
returns trigger language plpgsql security invoker set search_path=''
as $$
begin
  if new.plan_id is not null and not exists (
    select 1 from public.network_plans p where p.id=new.plan_id and p.user_id=new.user_id
  ) then
    raise exception 'IP assignment plan ownership mismatch' using errcode='42501';
  end if;
  return new;
end;
$$;
drop trigger if exists ip_assignments_plan_owner on public.ip_assignments;
create trigger ip_assignments_plan_owner before insert or update on public.ip_assignments
for each row execute function public.enforce_ip_assignment_plan_owner();
