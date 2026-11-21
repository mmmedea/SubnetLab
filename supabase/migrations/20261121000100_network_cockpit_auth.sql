-- Supabase Auth-owned schema. Existing legacy tables and accounts are intentionally untouched.
create extension if not exists btree_gist with schema extensions;
create table if not exists public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 username text not null unique check(username ~ '^[A-Za-z0-9_]{3,30}$'),
 display_name text not null check(char_length(display_name) between 1 and 80),
 role text not null check(role in ('student','network_admin','instructor')),
 terms_version text not null, privacy_version text not null,
 consented_at timestamptz not null default now(), created_at timestamptz not null default now()
);
create table if not exists public.plans (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 name text not null check(char_length(name) between 1 and 100), cidr text not null,
 ip_version smallint not null check(ip_version in (4,6)), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.allocations (
 id uuid primary key default gen_random_uuid(), plan_id uuid not null references public.plans(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade, segment text not null,
 network text not null, prefix smallint not null check(prefix between 0 and 128),
 hosts numeric(39,0) not null check(hosts>=0), start_num numeric(39,0) not null,
 end_num numeric(39,0) not null, notes text not null default '', check(start_num<=end_num),
 exclude using gist(plan_id with =,numrange(start_num,end_num,'[]') with &&)
);
create table if not exists public.ip_assignments (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 plan_id uuid references public.plans(id) on delete set null, address text not null, label text not null,
 status text not null check(status in ('assigned','reserved','available','retired')), notes text not null default '',
 created_at timestamptz not null default now()
);
create table if not exists public.practice_attempts (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 topic text not null, question jsonb not null, correct boolean not null, time_ms integer not null check(time_ms>=0),
 created_at timestamptz not null default now()
);
create table if not exists public.auth_audit_log (
 id bigint generated always as identity primary key, event text not null,
 user_id uuid references auth.users(id) on delete set null, ip_hash text, created_at timestamptz not null default now()
);
create index if not exists plans_user_updated_idx on public.plans(user_id,updated_at desc);
create index if not exists allocations_user_plan_idx on public.allocations(user_id,plan_id);
create index if not exists assignments_user_plan_idx on public.ip_assignments(user_id,plan_id);
create index if not exists attempts_user_created_idx on public.practice_attempts(user_id,created_at desc);
alter table public.profiles enable row level security;
alter table public.plans enable row level security;
alter table public.allocations enable row level security;
alter table public.ip_assignments enable row level security;
alter table public.practice_attempts enable row level security;
alter table public.auth_audit_log enable row level security;
create policy "profiles owner" on public.profiles for all to authenticated using((select auth.uid())=id) with check((select auth.uid())=id);
create policy "plans owner" on public.plans for all to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
create policy "allocations owner" on public.allocations for all to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
create policy "assignments owner" on public.ip_assignments for all to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
create policy "attempts owner" on public.practice_attempts for all to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
create policy "audit owner read" on public.auth_audit_log for select to authenticated using((select auth.uid())=user_id);
create or replace function public.enforce_allocation_plan_owner() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.plans p where p.id=new.plan_id and p.user_id=new.user_id) then
  raise exception 'Allocation plan ownership mismatch' using errcode='42501';
 end if;
 return new;
end $$;
drop trigger if exists allocations_plan_owner on public.allocations;
create trigger allocations_plan_owner before insert or update on public.allocations for each row execute function public.enforce_allocation_plan_owner();
