-- Supabase Auth-owned schema. Legacy bigint-keyed tables remain untouched.
create extension if not exists btree_gist with schema extensions;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique check (username is null or username ~ '^[A-Za-z0-9_]{3,32}$'),
  display_name text,
  role text not null default 'student' check (role in ('student','network_admin','instructor')),
  terms_version text not null default 'v1',
  privacy_version text not null default 'v1',
  consented_at timestamptz,
  bio text,
  avatar_url text,
  terms_accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Keep the new UUID-based workspace model separate from legacy public.plans (bigint IDs).
create table if not exists public.network_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  cidr text not null,
  ip_version smallint not null check (ip_version in (4,6)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.allocations (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.network_plans(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  segment text not null,
  network text not null,
  prefix smallint not null check (prefix between 0 and 128),
  hosts numeric(39,0) not null check (hosts >= 0),
  start_num numeric(39,0) not null,
  end_num numeric(39,0) not null,
  notes text not null default '',
  check (start_num <= end_num),
  exclude using gist (plan_id with =, numrange(start_num,end_num,'[]') with &&)
);

create table if not exists public.ip_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id uuid references public.network_plans(id) on delete set null,
  address text not null,
  label text not null,
  status text not null check (status in ('assigned','reserved','available','retired')),
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.practice_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  topic text not null,
  question jsonb not null,
  correct boolean not null,
  time_ms integer not null check (time_ms >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.auth_audit_log (
  id bigint generated always as identity primary key,
  event text not null,
  user_id uuid references auth.users(id) on delete set null,
  ip_hash text,
  created_at timestamptz not null default now()
);

create index if not exists network_plans_user_updated_idx on public.network_plans(user_id,updated_at desc);
create index if not exists allocations_user_plan_idx on public.allocations(user_id,plan_id);
create index if not exists assignments_user_plan_idx on public.ip_assignments(user_id,plan_id);
create unique index if not exists assignments_user_address_unique on public.ip_assignments(user_id,address);
create index if not exists attempts_user_created_idx on public.practice_attempts(user_id,created_at desc);

alter table public.profiles enable row level security;
alter table public.network_plans enable row level security;
alter table public.allocations enable row level security;
alter table public.ip_assignments enable row level security;
alter table public.practice_attempts enable row level security;
alter table public.auth_audit_log enable row level security;

revoke all on public.profiles, public.network_plans, public.allocations, public.ip_assignments, public.practice_attempts, public.auth_audit_log from anon;
grant select on public.profiles to authenticated;
grant insert (id,username,display_name,bio,avatar_url,updated_at) on public.profiles to authenticated;
grant update (username,display_name,bio,avatar_url,updated_at) on public.profiles to authenticated;
grant select,insert,update,delete on public.network_plans, public.allocations, public.ip_assignments, public.practice_attempts to authenticated;
grant select on public.auth_audit_log to authenticated;
grant all on public.profiles, public.network_plans, public.allocations, public.ip_assignments, public.practice_attempts, public.auth_audit_log to service_role;

create policy "profiles owner" on public.profiles for all to authenticated using ((select auth.uid())=id) with check ((select auth.uid())=id);
create policy "network plans owner" on public.network_plans for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy "allocations owner" on public.allocations for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy "assignments owner" on public.ip_assignments for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy "attempts owner" on public.practice_attempts for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy "audit owner read" on public.auth_audit_log for select to authenticated using ((select auth.uid())=user_id);

create or replace function public.enforce_allocation_plan_owner()
returns trigger
language plpgsql
security invoker
set search_path=''
as $$
begin
  if not exists (
    select 1 from public.network_plans p
    where p.id=new.plan_id and p.user_id=new.user_id
  ) then
    raise exception 'Allocation plan ownership mismatch' using errcode='42501';
  end if;
  return new;
end;
$$;

drop trigger if exists allocations_plan_owner on public.allocations;
create trigger allocations_plan_owner
before insert or update on public.allocations
for each row execute function public.enforce_allocation_plan_owner();
create or replace function public.enforce_ip_assignment_plan_owner()
returns trigger
language plpgsql
security invoker
set search_path=''
as $$
begin
  if new.plan_id is not null and not exists (
    select 1 from public.network_plans p
    where p.id=new.plan_id and p.user_id=new.user_id
  ) then
    raise exception 'IP assignment plan ownership mismatch' using errcode='42501';
  end if;
  return new;
end;
$$;

drop trigger if exists ip_assignments_plan_owner on public.ip_assignments;
create trigger ip_assignments_plan_owner
before insert or update on public.ip_assignments
for each row execute function public.enforce_ip_assignment_plan_owner();
create or replace function public.record_user_consent()
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode='42501';
  end if;
  update public.profiles
  set terms_accepted_at=now(), consented_at=now(),
      terms_version='v1', privacy_version='v1', updated_at=now()
  where id=current_user_id;
  if not found then
    raise exception 'Profile not found' using errcode='P0002';
  end if;
end;
$$;
revoke all on function public.record_user_consent() from public, anon;
grant execute on function public.record_user_consent() to authenticated;
