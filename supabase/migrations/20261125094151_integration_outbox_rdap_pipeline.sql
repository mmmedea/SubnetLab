begin;

create table public.outbox_events (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  type text not null check (type = 'plan.saved'),
  payload jsonb not null check (pg_catalog.jsonb_typeof(payload) = 'object'),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'done', 'failed', 'skipped')),
  attempts integer not null default 0 check (attempts between 0 and 5),
  next_attempt_at timestamptz default pg_catalog.clock_timestamp(),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  processed_at timestamptz,
  last_error text,
  dedupe_key text not null unique
    check (dedupe_key ~ '^[A-Za-z0-9:_-]{1,128}$')
);

create index outbox_events_dispatch_idx
  on public.outbox_events (status, next_attempt_at, created_at);

create table public.rdap_cache (
  key text primary key check (char_length(key) between 1 and 64),
  response jsonb not null
    check (
      pg_catalog.jsonb_typeof(response) = 'object'
      and (response - array['owner_name', 'country', 'cidr', 'registry', 'timestamps']) = '{}'::jsonb
    ),
  fetched_at timestamptz not null default pg_catalog.clock_timestamp()
);

alter table public.outbox_events enable row level security;
alter table public.rdap_cache enable row level security;

-- These tables have no RLS policies. The service role is used only by server code.
revoke all on table public.outbox_events, public.rdap_cache
  from public, anon, authenticated;
grant select, insert, update, delete on table public.outbox_events, public.rdap_cache
  to service_role;

create function public.save_plan_with_outbox(
  p_user_id uuid,
  p_name text,
  p_cidr text,
  p_ip_version smallint,
  p_allocations jsonb,
  p_dedupe_key text,
  p_request_hash text,
  p_email_owner boolean
)
returns table (
  plan_id uuid,
  event_id uuid,
  plan_name text,
  cidr text,
  ip_version smallint,
  updated_at timestamptz,
  allocation_count integer,
  deduplicated boolean
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_name text := pg_catalog.btrim(coalesce(p_name, ''));
  v_plan public.network_plans%rowtype;
  v_event public.outbox_events%rowtype;
  v_allocation_count integer := 0;
  v_inserted integer := 0;
  v_existing_plan_id uuid;
  v_payload jsonb;
begin
  if p_user_id is null then
    raise exception using errcode = '22023', message = 'A plan owner is required.';
  end if;

  if p_ip_version is distinct from 4 then
    raise exception using errcode = '22023', message = 'Only IPv4 plans are supported by this save function.';
  end if;

  if pg_catalog.char_length(v_name) not between 1 and 100 then
    raise exception using errcode = '22023', message = 'Plan name must contain 1 to 100 characters.';
  end if;

  if p_cidr is null or pg_catalog.char_length(p_cidr) > 20 then
    raise exception using errcode = '22023', message = 'A valid IPv4 CIDR is required.';
  end if;

  if p_allocations is null or pg_catalog.jsonb_typeof(p_allocations) is distinct from 'array' then
    raise exception using errcode = '22023', message = 'Allocations must be a JSON array.';
  end if;

  if pg_catalog.jsonb_array_length(p_allocations) > 50 then
    raise exception using errcode = '22023', message = 'A plan may contain at most 50 allocations.';
  end if;

  if p_dedupe_key is null or p_dedupe_key !~ '^[A-Za-z0-9:_-]{1,128}$' then
    raise exception using errcode = '22023', message = 'A valid idempotency key is required.';
  end if;

  if p_request_hash is null or p_request_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'A valid request fingerprint is required.';
  end if;

  -- Serialize concurrent retries that use the same idempotency key.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_dedupe_key, 0));

  select e.*
    into v_event
    from public.outbox_events as e
   where e.dedupe_key = p_dedupe_key
   for update;

  if found then
    if v_event.type <> 'plan.saved'
       or v_event.payload ->> 'user_id' is distinct from p_user_id::text
       or v_event.payload ->> 'request_hash' is distinct from p_request_hash then
      raise exception using errcode = '22023', message = 'Idempotency key was already used for another request.';
    end if;

    v_existing_plan_id := nullif(v_event.payload ->> 'plan_id', '')::uuid;
    if v_existing_plan_id is null then
      raise exception using errcode = '23514', message = 'The saved event has no plan reference.';
    end if;

    select p.*
      into v_plan
      from public.network_plans as p
     where p.id = v_existing_plan_id;

    if not found then
      raise exception using errcode = '23503', message = 'The saved plan for this idempotency key no longer exists.';
    end if;

    select pg_catalog.count(*)::integer
      into v_allocation_count
      from public.allocations as a
     where a.plan_id = v_plan.id
       and a.user_id = p_user_id;

    return query
      select v_plan.id, v_event.id, v_plan.name, v_plan.cidr,
             v_plan.ip_version, v_plan.updated_at, v_allocation_count, true;
    return;
  end if;

  insert into public.network_plans (user_id, name, cidr, ip_version)
  values (p_user_id, v_name, p_cidr, p_ip_version)
  returning * into v_plan;

  insert into public.allocations (
    plan_id, user_id, segment, network, prefix, hosts, start_num, end_num, notes
  )
  select
    v_plan.id,
    p_user_id,
    a.segment,
    a.network,
    a.prefix,
    a.hosts,
    a.start_num,
    a.end_num,
    coalesce(a.notes, '')
  from pg_catalog.jsonb_to_recordset(p_allocations) as a(
    segment text,
    network text,
    prefix smallint,
    hosts numeric(39,0),
    start_num numeric(39,0),
    end_num numeric(39,0),
    notes text
  );

  get diagnostics v_inserted = row_count;
  v_allocation_count := v_inserted;

  v_payload := pg_catalog.jsonb_build_object(
    'plan_id', v_plan.id,
    'user_id', p_user_id,
    'cidr', v_plan.cidr,
    'email_owner', coalesce(p_email_owner, false),
    'request_hash', p_request_hash
  );

  insert into public.outbox_events (type, payload, dedupe_key)
  values ('plan.saved', v_payload, p_dedupe_key)
  returning * into v_event;

  return query
    select v_plan.id, v_event.id, v_plan.name, v_plan.cidr,
           v_plan.ip_version, v_plan.updated_at, v_allocation_count, false;
end;
$function$;

create function public.claim_outbox_events(p_limit integer)
returns setof public.outbox_events
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if p_limit is null or p_limit < 1 or p_limit > 25 then
    raise exception using errcode = '22023', message = 'Claim limit must be between 1 and 25.';
  end if;

  -- A worker that exhausted all five leases and crashed becomes terminal.
  update public.outbox_events as e
     set status = 'failed',
         next_attempt_at = null,
         processed_at = v_now,
         last_error = 'retry_limit_exceeded'
   where e.status = 'processing'
     and e.attempts >= 5
     and e.next_attempt_at is not null
     and e.next_attempt_at <= v_now;

  return query
  with ready as (
    select e.id
      from public.outbox_events as e
     where e.attempts < 5
       and (
         (e.status in ('pending', 'failed')
          and e.next_attempt_at is not null
          and e.next_attempt_at <= v_now)
         or
         (e.status = 'processing'
          and e.next_attempt_at is not null
          and e.next_attempt_at <= v_now)
       )
     order by e.next_attempt_at, e.created_at, e.id
     for update skip locked
     limit p_limit
  )
  update public.outbox_events as e
     set status = 'processing',
         attempts = e.attempts + 1,
         next_attempt_at = v_now + interval '5 minutes',
         processed_at = null,
         last_error = null
    from ready
   where e.id = ready.id
  returning e.*;
end;
$function$;

create function public.finish_outbox_event(
  p_event_id uuid,
  p_claim_attempt integer,
  p_result text,
  p_error_code text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_error text := nullif(p_error_code, '');
begin
  if p_result is null or p_result not in ('done', 'failed', 'skipped') then
    raise exception using errcode = '22023', message = 'Invalid outbox result.';
  end if;

  if p_claim_attempt is null or p_claim_attempt < 1 or p_claim_attempt > 5 then
    raise exception using errcode = '22023', message = 'Invalid outbox claim attempt.';
  end if;

  if v_error is not null and v_error !~ '^[a-z][a-z0-9_]{0,63}$' then
    raise exception using errcode = '22023', message = 'Error details must be a non-sensitive code.';
  end if;

  update public.outbox_events as e
     set status = p_result,
         next_attempt_at = case
           when p_result = 'failed' and e.attempts < 5
             then v_now + pg_catalog.make_interval(
               secs => least(
                 300,
                 15 * pg_catalog.power(2::double precision, greatest(e.attempts - 1, 0)::double precision)::integer
               )
             )
           else null
         end,
         processed_at = case
           when p_result = 'failed' and e.attempts < 5 then null
           else v_now
         end,
         last_error = v_error
   where e.id = p_event_id
     and e.status = 'processing'
     and e.attempts = p_claim_attempt;

  if not found then
    raise exception using errcode = '40001', message = 'Outbox claim is stale or no longer processing.';
  end if;
end;
$function$;

revoke all on function public.save_plan_with_outbox(uuid, text, text, smallint, jsonb, text, text, boolean)
  from public, anon, authenticated;
revoke all on function public.claim_outbox_events(integer)
  from public, anon, authenticated;
revoke all on function public.finish_outbox_event(uuid, integer, text, text)
  from public, anon, authenticated;

grant execute on function public.save_plan_with_outbox(uuid, text, text, smallint, jsonb, text, text, boolean)
  to service_role;
grant execute on function public.claim_outbox_events(integer)
  to service_role;
grant execute on function public.finish_outbox_event(uuid, integer, text, text)
  to service_role;

commit;