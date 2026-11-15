-- Persistent, distributed API rate limiting for serverless deployments.
-- Only the trusted server-side service role can execute the counter RPC.
create table if not exists public.api_rate_limits (
  key_hash text primary key,
  window_started_at timestamptz not null,
  request_count integer not null check (request_count > 0),
  expires_at timestamptz not null
);

create index if not exists api_rate_limits_expires_at_idx
  on public.api_rate_limits (expires_at);

alter table public.api_rate_limits enable row level security;
revoke all on table public.api_rate_limits from public, anon, authenticated;

create or replace function public.consume_api_rate_limit(
  p_key_hash text,
  p_limit integer,
  p_window_seconds integer
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_count integer;
  v_expires timestamptz;
begin
  if p_key_hash is null or length(p_key_hash) <> 64
     or p_limit < 1 or p_limit > 100000
     or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception using errcode = '22023', message = 'Invalid rate limit parameters';
  end if;

  insert into public.api_rate_limits(key_hash, window_started_at, request_count, expires_at)
  values (p_key_hash, v_now, 1, v_now + pg_catalog.make_interval(secs => p_window_seconds))
  on conflict (key_hash) do update
  set window_started_at = case
        when public.api_rate_limits.expires_at <= v_now then v_now
        else public.api_rate_limits.window_started_at end,
      request_count = case
        when public.api_rate_limits.expires_at <= v_now then 1
        else public.api_rate_limits.request_count + 1 end,
      expires_at = case
        when public.api_rate_limits.expires_at <= v_now then v_now + pg_catalog.make_interval(secs => p_window_seconds)
        else public.api_rate_limits.expires_at end
  returning request_count, expires_at into v_count, v_expires;

  -- Opportunistic bounded cleanup prevents expired keys from accumulating.
  if mod(extract(epoch from v_now)::bigint, 100) = 0 then
    delete from public.api_rate_limits
    where key_hash in (
      select key_hash from public.api_rate_limits
      where expires_at < v_now - interval '1 day'
      order by expires_at
      limit 500
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'allowed', v_count <= p_limit,
    'limit', p_limit,
    'remaining', greatest(p_limit - v_count, 0),
    'retry_after', case when v_count <= p_limit then 0
      else greatest(1, ceil(extract(epoch from (v_expires - v_now)))) end,
    'reset_at', ceil(extract(epoch from v_expires))
  );
end;
$$;

revoke all on function public.consume_api_rate_limit(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_api_rate_limit(text, integer, integer)
  to service_role;
