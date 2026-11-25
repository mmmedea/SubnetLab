begin;

do $test$
declare
  v_grant uuid;
  v_failed boolean;
  v_first_user uuid := '00000000-0000-4000-8000-000000000001';
  v_duplicate_user uuid := '00000000-0000-4000-8000-000000000002';
  v_wrong_user uuid := '00000000-0000-4000-8000-000000000003';
  v_expired_user uuid := '00000000-0000-4000-8000-000000000004';
  v_no_eligibility_user uuid := '00000000-0000-4000-8000-000000000005';
  v_existing_session_user uuid := '00000000-0000-4000-8000-000000000006';
  v_clock_skew_user uuid := '00000000-0000-4000-8000-000000000007';
  v_first_session uuid := '10000000-0000-4000-8000-000000000001';
  v_duplicate_session uuid := '10000000-0000-4000-8000-000000000002';
  v_wrong_session uuid := '10000000-0000-4000-8000-000000000003';
  v_expired_session uuid := '10000000-0000-4000-8000-000000000004';
  v_existing_session uuid := '10000000-0000-4000-8000-000000000006';
  v_no_eligibility_session uuid := '10000000-0000-4000-8000-000000000005';
  v_clock_skew_session uuid := '10000000-0000-4000-8000-000000000007';
  v_expired_grant uuid;
begin
  insert into auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values
    (v_first_user, 'authenticated', 'authenticated', 'signup-test-1@example.invalid',
     'test-fixture-hash', now(), '{"provider":"email","providers":["email"]}'::jsonb,
     '{"username":"signup_test_1"}'::jsonb, now(), now()),
    (v_duplicate_user, 'authenticated', 'authenticated', 'signup-test-2@example.invalid',
     'test-fixture-hash', now(), '{"provider":"email","providers":["email"]}'::jsonb,
     '{"username":"signup_test_2"}'::jsonb, now(), now()),
    (v_wrong_user, 'authenticated', 'authenticated', 'signup-test-3@example.invalid',
     'test-fixture-hash', now(), '{"provider":"email","providers":["email"]}'::jsonb,
     '{"username":"signup_test_3"}'::jsonb, now(), now()),
    (v_expired_user, 'authenticated', 'authenticated', 'signup-test-4@example.invalid',
     'test-fixture-hash', now(), '{"provider":"email","providers":["email"]}'::jsonb,
     '{"username":"signup_test_4"}'::jsonb, now(), now()),
    (v_no_eligibility_user, 'authenticated', 'authenticated', 'signup-test-5@example.invalid',
     '', now(), '{"provider":"google","providers":["google"]}'::jsonb,
     '{"full_name":"Test Person"}'::jsonb, now(), now()),
    (v_existing_session_user, 'authenticated', 'authenticated', 'signup-test-6@example.invalid',
     'test-fixture-hash', now(), '{"provider":"email","providers":["email"]}'::jsonb,
     '{"username":"signup_test_6"}'::jsonb, now(), now()),
    (v_clock_skew_user, 'authenticated', 'authenticated', 'signup-test-7@example.invalid',
     'test-fixture-hash', now(), '{"provider":"email","providers":["email"]}'::jsonb,
     '{"username":"signup_test_7"}'::jsonb, now(), now());

  if not exists (
    select 1 from public.signup_otp_eligibility where user_id = v_first_user
  ) then
    raise exception 'The email signup eligibility trigger did not run.';
  end if;

  if not exists (
    select 1 from public.signup_otp_eligibility where user_id = v_clock_skew_user
  ) then
    raise exception 'The clock-skew email signup eligibility trigger did not run.';
  end if;

  update auth.users
     set email_confirmed_at = pg_catalog.clock_timestamp() + interval '60 seconds'
   where id = v_clock_skew_user;

  v_failed := false;
  begin
    perform public.create_signup_otp_grant(v_clock_skew_user, v_clock_skew_session);
  exception when others then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'A confirmation timestamp more than 30 seconds in the future was accepted.';
  end if;

  update auth.users
     set email_confirmed_at = pg_catalog.clock_timestamp() + interval '15 seconds'
   where id = v_first_user;

  v_grant := public.create_signup_otp_grant(v_first_user, v_first_session);

  v_failed := false;
  begin
    perform public.create_signup_otp_grant(v_first_user, v_first_session);
  exception when others then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'Duplicate user/session grant creation unexpectedly succeeded.';
  end if;

  if public.consume_signup_otp_grant(v_grant, v_first_user, v_first_session) is distinct from true then
    raise exception 'The first grant consumption did not succeed.';
  end if;

  if not exists (
    select 1 from public.email_otp_verified_sessions
     where user_id = v_first_user and session_id = v_first_session
       and expires_at > now()
  ) then
    raise exception 'The verified session was not recorded.';
  end if;

  if not exists (
    select 1 from public.auth_audit_log
     where user_id = v_first_user and event = 'signup_verified'
  ) then
    raise exception 'The signup_verified audit event was not recorded.';
  end if;

  v_failed := false;
  begin
    perform public.consume_signup_otp_grant(v_grant, v_first_user, v_first_session);
  exception when others then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'A consumed grant was reused successfully.';
  end if;

  v_grant := public.create_signup_otp_grant(v_duplicate_user, v_duplicate_session);
  v_failed := false;
  begin
    perform public.consume_signup_otp_grant(v_grant, v_wrong_user, v_wrong_session);
  exception when others then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'A grant was consumed by the wrong user/session.';
  end if;
  if exists (
    select 1 from public.signup_otp_grants
     where id = v_grant and consumed_at is not null
  ) then
    raise exception 'Wrong-user consumption changed the grant.';
  end if;

  v_expired_grant := public.create_signup_otp_grant(v_expired_user, v_expired_session);
  update public.signup_otp_grants
     set expires_at = now() - interval '1 minute'
   where id = v_expired_grant;
  v_failed := false;
  begin
    perform public.consume_signup_otp_grant(v_expired_grant, v_expired_user, v_expired_session);
  exception when others then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'An expired grant was consumed successfully.';
  end if;

  insert into public.email_otp_verified_sessions (user_id, session_id, expires_at)
  values (v_existing_session_user, v_existing_session, now() + interval '12 hours');
  v_failed := false;
  begin
    perform public.create_signup_otp_grant(v_existing_session_user, v_existing_session);
  exception when others then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'A user with an existing verified session received a signup grant.';
  end if;

  v_failed := false;
  begin
    perform public.create_signup_otp_grant(v_no_eligibility_user, v_no_eligibility_session);
  exception when others then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'A user without email signup eligibility received a grant.';
  end if;

  if has_function_privilege('anon', 'public.create_signup_otp_grant(uuid,uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.create_signup_otp_grant(uuid,uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.consume_signup_otp_grant(uuid,uuid,uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.consume_signup_otp_grant(uuid,uuid,uuid)', 'EXECUTE') then
    raise exception 'anon or authenticated can execute a service-role-only signup grant function.';
  end if;
end;
$test$;

rollback;
