-- Scope the email OTP tables to the authenticated owner and keep RPCs invoker-scoped.
create policy email_otp_challenges_select_own on public.email_otp_challenges
for select to authenticated using (
 user_id=(select auth.uid())
 and exists(select 1 from jsonb_array_elements(coalesce((select auth.jwt()->'amr'),'[]'::jsonb)) a where a->>'method' in ('password','otp','magiclink','email/signup'))
);
create policy email_otp_challenges_insert_password on public.email_otp_challenges
for insert to authenticated with check (
 user_id=(select auth.uid())
 and password_session_id=nullif((select auth.jwt()->>'session_id'),'')::uuid
 and exists(select 1 from jsonb_array_elements(coalesce((select auth.jwt()->'amr'),'[]'::jsonb)) a where a->>'method'='password')
 and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.password_configured_at is not null)
);
create policy email_otp_challenges_update_otp on public.email_otp_challenges
for update to authenticated using (
 user_id=(select auth.uid()) and consumed_at is null
 and exists(select 1 from jsonb_array_elements(coalesce((select auth.jwt()->'amr'),'[]'::jsonb)) a where a->>'method' in ('otp','magiclink','email/signup'))
) with check (user_id=(select auth.uid()));
create policy email_otp_challenges_delete_password on public.email_otp_challenges
for delete to authenticated using (
 user_id=(select auth.uid())
 and exists(select 1 from jsonb_array_elements(coalesce((select auth.jwt()->'amr'),'[]'::jsonb)) a where a->>'method'='password')
);
create policy email_otp_verified_sessions_select_current on public.email_otp_verified_sessions
for select to authenticated using (
 user_id=(select auth.uid())
 and session_id=nullif((select auth.jwt()->>'session_id'),'')::uuid
 and expires_at>now()
);
create policy email_otp_verified_sessions_insert_after_challenge on public.email_otp_verified_sessions
for insert to authenticated with check (
 user_id=(select auth.uid())
 and session_id=nullif((select auth.jwt()->>'session_id'),'')::uuid
 and expires_at<=now()+interval '12 hours'
 and expires_at>now()
 and exists(select 1 from jsonb_array_elements(coalesce((select auth.jwt()->'amr'),'[]'::jsonb)) a where a->>'method' in ('otp','magiclink','email/signup'))
 and exists(select 1 from public.email_otp_challenges c
  where c.user_id=(select auth.uid()) and c.consumed_at is null and c.expires_at>now()
   and c.password_session_id<>nullif((select auth.jwt()->>'session_id'),'')::uuid)
);
grant select,insert,delete on public.email_otp_challenges to authenticated;
grant select on public.email_otp_verified_sessions to authenticated;
revoke update on public.email_otp_challenges from authenticated;
grant update(consumed_at) on public.email_otp_challenges to authenticated;
grant insert on public.email_otp_verified_sessions to authenticated;

create or replace function public.begin_email_otp_challenge()
returns uuid language plpgsql security invoker set search_path=''
as $$
declare v_id uuid;
begin
 if (select auth.uid()) is null or nullif((select auth.jwt()->>'session_id'),'') is null then
  raise exception 'Sign in with your password first.' using errcode='42501';
 end if;
 if not exists(select 1 from jsonb_array_elements(coalesce((select auth.jwt()->'amr'),'[]'::jsonb)) a where a->>'method'='password') then
  raise exception 'A password sign-in is required before email verification.' using errcode='42501';
 end if;
 if not exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.password_configured_at is not null) then
  raise exception 'Set your SubnetLab password first.' using errcode='42501';
 end if;
 delete from public.email_otp_challenges where user_id=(select auth.uid()) and (expires_at<now() or consumed_at is not null);
 insert into public.email_otp_challenges(user_id,password_session_id)
 values((select auth.uid()),nullif((select auth.jwt()->>'session_id'),'')::uuid) returning id into v_id;
 return v_id;
end;
$$;
create or replace function public.complete_email_otp_challenge(p_challenge_id uuid)
returns boolean language plpgsql security invoker set search_path=''
as $$
declare v_challenge public.email_otp_challenges%rowtype; v_session uuid:=nullif((select auth.jwt()->>'session_id'),'')::uuid;
begin
 if (select auth.uid()) is null or v_session is null then raise exception 'Sign in again to verify your email.' using errcode='42501'; end if;
 if not exists(select 1 from jsonb_array_elements(coalesce((select auth.jwt()->'amr'),'[]'::jsonb)) a where a->>'method' in ('otp','magiclink','email/signup')) then
  raise exception 'The session was not created by an email OTP.' using errcode='42501';
 end if;
 select * into v_challenge from public.email_otp_challenges
  where id=p_challenge_id and user_id=(select auth.uid()) and consumed_at is null and expires_at>now()
  for update;
 if not found then raise exception 'This email verification request expired. Send a new code.' using errcode='22023'; end if;
 if v_challenge.password_session_id=v_session then raise exception 'A fresh email verification session is required.' using errcode='42501'; end if;
 insert into public.email_otp_verified_sessions(user_id,session_id,expires_at)
 values((select auth.uid()),v_session,now()+interval '12 hours')
 on conflict(user_id,session_id) do nothing;
 update public.email_otp_challenges set consumed_at=now() where id=p_challenge_id;
 return true;
end;
$$;
create or replace function public.is_email_otp_session_verified()
returns boolean language sql stable security invoker set search_path=''
as $$
 select exists(select 1 from public.email_otp_verified_sessions s
  where s.user_id=(select auth.uid())
   and s.session_id=nullif((select auth.jwt()->>'session_id'),'')::uuid
   and s.expires_at>now());
$$;
revoke all on function public.begin_email_otp_challenge() from public,anon;
revoke all on function public.complete_email_otp_challenge(uuid) from public,anon;
revoke all on function public.is_email_otp_session_verified() from public,anon;
grant execute on function public.begin_email_otp_challenge() to authenticated;
grant execute on function public.complete_email_otp_challenge(uuid) to authenticated;
grant execute on function public.is_email_otp_session_verified() to authenticated;
