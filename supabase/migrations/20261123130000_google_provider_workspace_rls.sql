-- Allow Google-provider sessions to use the UUID workspace without local password + email OTP.
-- Provider is read only from signed app_metadata, never user_metadata.
-- Ownership remains mandatory for every operation.

drop policy if exists "network plans owner" on public.network_plans;
create policy "network plans owner" on public.network_plans
for all to authenticated
using (
  (select auth.uid()) = user_id
  and (
    (select auth.jwt() -> 'app_metadata' ->> 'provider') = 'google'
    or (
      (select public.is_email_otp_session_verified())
      and exists (
        select 1 from public.profiles p
        where p.id = (select auth.uid())
          and p.password_configured_at is not null
      )
    )
  )
)
with check (
  (select auth.uid()) = user_id
  and (
    (select auth.jwt() -> 'app_metadata' ->> 'provider') = 'google'
    or (
      (select public.is_email_otp_session_verified())
      and exists (
        select 1 from public.profiles p
        where p.id = (select auth.uid())
          and p.password_configured_at is not null
      )
    )
  )
);

drop policy if exists "allocations owner" on public.allocations;
create policy "allocations owner" on public.allocations
for all to authenticated
using (
  (select auth.uid()) = user_id
  and (
    (select auth.jwt() -> 'app_metadata' ->> 'provider') = 'google'
    or (
      (select public.is_email_otp_session_verified())
      and exists (
        select 1 from public.profiles p
        where p.id = (select auth.uid())
          and p.password_configured_at is not null
      )
    )
  )
)
with check (
  (select auth.uid()) = user_id
  and (
    (select auth.jwt() -> 'app_metadata' ->> 'provider') = 'google'
    or (
      (select public.is_email_otp_session_verified())
      and exists (
        select 1 from public.profiles p
        where p.id = (select auth.uid())
          and p.password_configured_at is not null
      )
    )
  )
);

drop policy if exists "assignments owner" on public.ip_assignments;
create policy "assignments owner" on public.ip_assignments
for all to authenticated
using (
  (select auth.uid()) = user_id
  and (
    (select auth.jwt() -> 'app_metadata' ->> 'provider') = 'google'
    or (
      (select public.is_email_otp_session_verified())
      and exists (
        select 1 from public.profiles p
        where p.id = (select auth.uid())
          and p.password_configured_at is not null
      )
    )
  )
)
with check (
  (select auth.uid()) = user_id
  and (
    (select auth.jwt() -> 'app_metadata' ->> 'provider') = 'google'
    or (
      (select public.is_email_otp_session_verified())
      and exists (
        select 1 from public.profiles p
        where p.id = (select auth.uid())
          and p.password_configured_at is not null
      )
    )
  )
);

drop policy if exists "attempts owner" on public.practice_attempts;
create policy "attempts owner" on public.practice_attempts
for all to authenticated
using (
  (select auth.uid()) = user_id
  and (
    (select auth.jwt() -> 'app_metadata' ->> 'provider') = 'google'
    or (
      (select public.is_email_otp_session_verified())
      and exists (
        select 1 from public.profiles p
        where p.id = (select auth.uid())
          and p.password_configured_at is not null
      )
    )
  )
)
with check (
  (select auth.uid()) = user_id
  and (
    (select auth.jwt() -> 'app_metadata' ->> 'provider') = 'google'
    or (
      (select public.is_email_otp_session_verified())
      and exists (
        select 1 from public.profiles p
        where p.id = (select auth.uid())
          and p.password_configured_at is not null
      )
    )
  )
);
