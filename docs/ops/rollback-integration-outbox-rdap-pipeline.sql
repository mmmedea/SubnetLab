begin;

-- Removes only the integration pipeline objects and their outbox/cache rows.
-- Do not run this in Staging or Production without the project owner's approval.
drop function if exists public.finish_outbox_event(uuid, integer, text, text);
drop function if exists public.claim_outbox_events(integer);
drop function if exists public.save_plan_with_outbox(uuid, text, text, smallint, jsonb, text, text, boolean);

drop table if exists public.rdap_cache;
drop table if exists public.outbox_events;

commit;