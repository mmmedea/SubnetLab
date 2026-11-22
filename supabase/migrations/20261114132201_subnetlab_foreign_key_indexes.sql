-- Cover legacy foreign-key lookups used by the server-side custom-JWT API.
create index plans_user_updated on public.plans(user_id,updated_at desc);
create index ip_records_plan_id_idx on public.ip_records(plan_id);
create index ip_user_plan on public.ip_records(user_id,plan_id,status);
create index reservation_user_plan on public.reservations(user_id,plan_id);
create index reservations_plan_id_idx on public.reservations(plan_id);
