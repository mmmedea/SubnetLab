alter table public.profiles alter column consented_at drop default;
alter table public.profiles alter column consented_at drop not null;
update public.profiles set consented_at=terms_accepted_at;
