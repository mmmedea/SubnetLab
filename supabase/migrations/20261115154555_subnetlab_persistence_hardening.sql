-- SubnetLab Supabase persistence hardening
-- Remove legacy uniqueness that ignored address family and broke IPv4/IPv6 coexistence.
drop index if exists public.ip_active_unique;
drop index if exists public.reservation_unique;
-- Reuse the original query indexes and remove redundant copies.
drop index if exists public.plans_user_updated_idx;
drop index if exists public.ip_records_user_plan_idx;
drop index if exists public.reservations_user_plan_idx;
drop index if exists public.attempts_user_time;
drop index if exists public.practice_questions_user_id_idx;
-- Server-only custom JWT auth. Do not grant direct browser table access.
create unique index if not exists users_email_lower_unique on public.users (lower(email));
create unique index if not exists ip_records_active_address_unique
  on public.ip_records (user_id, family, address_int) where status = 'active';
create unique index if not exists reservations_address_unique
  on public.reservations (user_id, family, address_int);
create index if not exists attempts_user_created_idx on public.attempts (user_id, created_at desc);
create index if not exists practice_questions_user_created_idx on public.practice_questions (user_id, created_at desc);

alter table public.users enable row level security;
alter table public.plans enable row level security;
alter table public.ip_records enable row level security;
alter table public.reservations enable row level security;
alter table public.practice_questions enable row level security;
alter table public.attempts enable row level security;

revoke all on table public.users, public.plans, public.ip_records, public.reservations,
  public.practice_questions, public.attempts from anon, authenticated;
grant all on table public.users, public.plans, public.ip_records, public.reservations,
  public.practice_questions, public.attempts to service_role;
grant usage, select on all sequences in schema public to service_role;

create or replace function public.record_ipam(
  p_kind text, p_user_id bigint, p_plan_id bigint, p_network_cidr text,
  p_family smallint, p_address text, p_address_int numeric, p_label text, p_mac text default null
) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  result_row jsonb;
begin
  if p_kind not in ('record','reservation') then
    raise exception using errcode = '22023', message = 'Invalid IPAM record type';
  end if;
  if not exists (select 1 from public.plans where id = p_plan_id and user_id = p_user_id) then
    raise exception using errcode = '42501', message = 'Plan ownership check failed';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text || ':' || p_family::text || ':' || p_address_int::text, 0)
  );
  if exists (
    select 1 from public.ip_records
    where user_id = p_user_id and family = p_family and address_int = p_address_int and status = 'active'
    union all
    select 1 from public.reservations
    where user_id = p_user_id and family = p_family and address_int = p_address_int
  ) then
    raise exception using errcode = '23505', message = 'Address already assigned or reserved';
  end if;
  if p_kind = 'record' then
    insert into public.ip_records(user_id,plan_id,network_cidr,family,address,address_int,label,status)
    values(p_user_id,p_plan_id,p_network_cidr,p_family,p_address,p_address_int,p_label,'active')
    returning pg_catalog.to_jsonb(ip_records.*) into result_row;
  else
    if p_mac is null or p_mac !~ '^([0-9a-f]{2}:){5}[0-9a-f]{2}$' then
      raise exception using errcode = '22023', message = 'Invalid MAC address';
    end if;
    insert into public.reservations(user_id,plan_id,network_cidr,family,address,address_int,label,mac)
    values(p_user_id,p_plan_id,p_network_cidr,p_family,p_address,p_address_int,p_label,p_mac)
    returning pg_catalog.to_jsonb(reservations.*) into result_row;
  end if;
  return result_row;
end;
$$;

create or replace function public.update_plan_guarded(
  p_user_id bigint, p_plan_id bigint, p_name text, p_family smallint, p_base text, p_data_json text
) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  plan_row public.plans%rowtype;
begin
  select * into plan_row from public.plans
  where id = p_plan_id and user_id = p_user_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Plan not found';
  end if;
  if exists (select 1 from public.ip_records where user_id=p_user_id and plan_id=p_plan_id)
     or exists (select 1 from public.reservations where user_id=p_user_id and plan_id=p_plan_id) then
    if plan_row.family <> p_family
       or (plan_row.data_json::jsonb -> 'allocations') is distinct from (p_data_json::jsonb -> 'allocations') then
      raise exception using errcode = '23514', message = 'Plan changes would invalidate existing IPAM allocations';
    end if;
  end if;
  update public.plans
  set name=p_name, family=p_family, base=p_base, data_json=p_data_json, updated_at=pg_catalog.now()
  where id=p_plan_id and user_id=p_user_id
  returning * into plan_row;
  return pg_catalog.to_jsonb(plan_row);
end;
$$;

create or replace function public.record_practice_attempt(
  p_user_id bigint, p_question_id uuid, p_topic text, p_difficulty text, p_correct boolean
) returns boolean
language plpgsql
set search_path = ''
as $$
declare
  question_row public.practice_questions%rowtype;
begin
  select * into question_row from public.practice_questions
  where id = p_question_id and user_id = p_user_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Question not found';
  end if;
  if question_row.topic <> p_topic or question_row.difficulty <> p_difficulty then
    raise exception using errcode = '22023', message = 'Question metadata mismatch';
  end if;
  insert into public.attempts(user_id,question_id,topic,difficulty,correct)
  values(p_user_id,p_question_id,p_topic,p_difficulty,p_correct);
  delete from public.practice_questions where id = p_question_id and user_id = p_user_id;
  return true;
end;
$$;

revoke all on function public.record_ipam(text,bigint,bigint,text,smallint,text,numeric,text,text) from public, anon, authenticated;
revoke all on function public.record_practice_attempt(bigint,uuid,text,text,boolean) from public, anon, authenticated;
revoke all on function public.update_plan_guarded(bigint,bigint,text,smallint,text,text) from public, anon, authenticated;
grant execute on function public.record_ipam(text,bigint,bigint,text,smallint,text,numeric,text,text) to service_role;
grant execute on function public.record_practice_attempt(bigint,uuid,text,text,boolean) to service_role;
grant execute on function public.update_plan_guarded(bigint,bigint,text,smallint,text,text) to service_role;
