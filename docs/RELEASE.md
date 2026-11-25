# SubnetLab release runbook

**Status:** Documented, not verified. No Production settings were changed, no Production SQL was run, and no release was performed.

## Release-specific values to confirm

- Production Branch: **[UNCONFIRMED — replace with `settings-system` or `main`]**
- Require Verified Commits: **[UNCONFIRMED]**
- Current Production deployment ID, commit SHA, and URL: **[RECORD BEFORE RELEASE]**
- Preview environment variable names and Preview Supabase project: **[UNCONFIRMED — verify names/project in Vercel; never copy values into this document]**
- Instant Rollback / promoting a previous Production deployment: **[UNCONFIRMED — check the project UI before relying on it]**

Do not infer the Production Branch or Preview database. The selected path must be confirmed by the project owner.

## Mandatory release gate

Do not run Production DML/DDL, merge PR #25, or deploy this release until the project owner explicitly replies. The read-only SELECT preflight requested for Production is allowed and makes no changes:

```text
APPROVE RELEASE 25
```

That approval is required for Production changes. It does not authorize rollback SQL; get separate explicit approval before running rollback SQL. Staging changes also require notice to the owner before applying.

## Pre-release checklist

- [ ] Confirm PR #24 is reviewed and merged. It changes only the CI workflow. If the Production Branch is `settings-system`, merging it may trigger a Production redeploy; capture the current deployment first and follow the release gate.
- [ ] Confirm PR #25 is open against `settings-system`, its current head checks pass, and the staging signup test and Windows visual comparison have passed.
- [ ] Confirm the PR #25 Preview URL is Ready and points to the STAGING Supabase project. Vercel project settings are authoritative; do not infer the database project from the hostname.
- [ ] Run the read-only preflight SELECTs in STAGING and PRODUCTION before any migration. PR #25 adds `docs/ops/signup-migration-preflight.sql`; [the file on that branch](https://github.com/mmmedea/SubnetLab/blob/fix/signup-single-verification-username-v2/docs/ops/signup-migration-preflight.sql) contains username violations, lower(username) duplicates, auth.users trigger definitions/order, function name collisions, and the two table row counts.
- [ ] In STAGING, resolve username violations by profile id as described in PR #25. Keep one row per duplicate lowercase username; manually change other rows to a user-chosen unique 3–20 character username or NULL. Never derive usernames from email or delete users.
- [ ] In PRODUCTION, run only the read-only SELECT preflight before approval. If it returns username violations or duplicate groups, record the profile ids and stop; do not run Production UPDATE/DDL until the exact approval phrase. After approval, resolve rows manually by id before applying the migrations.
- [ ] Confirm the read-only username queries return no violating rows and no duplicate groups in STAGING. Production must be clear before the migration is applied.
- [ ] Confirm Production Auth SMTP is still configured in the main Supabase project. Do not copy or expose credentials.
- [ ] Create a manual Production database backup before any Production write. On a trusted Windows machine with PostgreSQL client tools installed, keep the database URL in a protected process environment variable and run:

```powershell
pg_dump --format=custom --no-owner --no-acl --dbname="$env:SUBNETLAB_PROD_DATABASE_URL" --file="subnetlab-prod-before-release.dump"
if ($LASTEXITCODE -ne 0) { throw "Production backup failed" }
Get-Item .\subnetlab-prod-before-release.dump | Select-Object FullName, Length, LastWriteTime
Get-FileHash .\subnetlab-prod-before-release.dump -Algorithm SHA256
```

Do not print the database URL, paste it into chat, or store the dump in GitHub. Keep the backup in access-controlled storage and record its path and checksum in the release record. Confirm the dump is non-empty and readable before continuing.

- [ ] In Vercel, record the current Production deployment ID, commit SHA, URL, and creation time. Keep the previous Ready Production deployment available for promotion if the project provides that control. Do not assume Hobby exposes Instant Rollback; verify it first.
- [ ] Confirm the exact Production Branch and Require Verified Commits values. Replace the placeholders above and select the matching path below.

## Release order

The read-only preflight and backup are prerequisites. After the required approval, the **database migration is the first mutating Production release step**: it must precede merging/deploying the application code.

1. Record the current Production deployment and verify the backup.
2. Run the read-only Production preflight queries and resolve any username violations or duplicates. Re-run them until the username queries return no rows.
3. After the exact approval phrase, apply these Production migrations in order:

   1. `supabase/migrations/20261125120000_allow_first_signup_session_without_second_otp.sql`
   2. `supabase/migrations/20261125120500_enforce_username_3_20.sql`

   Apply through the Production Supabase SQL Editor only after approval. Do not apply a rollback file as part of the release.

4. Run the read-only preflight again. Confirm the username queries return no rows. Verify both new tables have RLS enabled, the grant functions are SECURITY DEFINER with an empty search path, only `service_role` can execute them, and row counts for `email_otp_verified_sessions` and `auth_audit_log` are consistent with the recorded pre-migration counts.
5. Merge the application code using the confirmed branch path below. Use GitHub **Squash and merge** only after approval. Do not merge PR #25 before the migration and post-migration checks pass.
6. Wait for the Production deployment to finish and confirm Vercel reports Ready for the expected commit. Do not manually deploy a different branch.
7. Run the smoke script below, then perform authenticated checks with the designated test account. Do not put credentials or OTPs in the script or release record.

### Path A — Production Branch is `settings-system`

After migration and verification, squash-merge PR #25 into `settings-system`. Vercel should deploy that branch automatically if Git integration is enabled. Verify the Production deployment commit matches the squashed PR commit.

### Path B — Production Branch is `main`

After migration and verification, squash-merge PR #25 into `settings-system` and verify its Preview/staging deployment. Then open a separate PR from `settings-system` to `main`. Merge that release PR only after the same explicit release approval and passing checks. Vercel should deploy `main` automatically. Verify the Production deployment commit matches the merged release commit.

**Selected path:** [UNCONFIRMED — fill in only after Production Branch is read from Vercel].

## Production smoke test script

Run in PowerShell on Windows after the Production deployment is Ready. It makes unauthenticated GET requests only and does not submit a signup, password, OTP, or other mutation.

```powershell
$BaseUrl = "https://subnetlab.vercel.app"
$PublicPaths = @("/", "/login", "/signup", "/terms", "/privacy")

foreach ($Path in $PublicPaths) {
  $Status = & curl.exe --silent --show-error --output NUL --write-out "%{http_code}" --max-time 20 "$BaseUrl$Path"
  if ($LASTEXITCODE -ne 0 -or $Status -ne "200") {
    throw "Smoke test failed for $Path (HTTP $Status)"
  }
  Write-Output "PASS $Path (HTTP $Status)"
}

$DashboardStatus = & curl.exe --silent --show-error --output NUL --write-out "%{http_code}" --max-time 20 "$BaseUrl/dashboard"
if ($LASTEXITCODE -ne 0 -or $DashboardStatus -notin @("301", "302", "303", "307", "308")) {
  throw "Expected unauthenticated /dashboard to redirect; got HTTP $DashboardStatus"
}

$DashboardHeaders = & curl.exe --silent --show-error --dump-header - --output NUL --max-time 20 "$BaseUrl/dashboard"
$LoginLocation = $DashboardHeaders | Where-Object { $_ -match '(?i)^location:' } | Select-Object -Last 1
if (-not $LoginLocation -or $LoginLocation -notmatch '/login') {
  throw "Expected /dashboard to redirect to /login"
}
Write-Output "PASS /dashboard redirects to /login"
```

After the script passes, use the authorized test account to verify sign-in, email OTP, dashboard access, and a read-only workspace page. For the new signup path, use a dedicated test email controlled by the project owner. Confirm the verification code is accepted once and the account reaches the dashboard without a second OTP. Do not use another person's email or expose account details.

## Rollback

If the deployment or smoke test fails:

1. Stop further release steps and record the failing URL, time, commit, and deployment ID without recording personal data or secrets.
2. Promote the previously recorded Ready Production deployment using Vercel's deployment controls if available. If the project does not show a promotion/Instant Rollback option, stop and use the Vercel dashboard's supported rollback process; do not guess a CLI command or deploy an unverified branch.
3. If the new signup verification flow is the issue, set `NEXT_PUBLIC_SIGNUP_VERIFICATION_MODE=legacy` for Production and redeploy the intended Production commit. This is a build-time switch; verify the resulting deployment before resuming signups.
4. Run Production rollback SQL only after separate explicit user approval, in reverse migration order: `docs/ops/rollback-username-3-20.sql`, then `docs/ops/rollback-first-signup-session.sql`.
5. Restore the database backup **last**, only if the owner explicitly approves it and after checking the impact of restoring post-release writes. A database restore can remove changes made after the backup.

## First 24 hours

- [ ] First hour: check Vercel deployment/function logs and Supabase Auth/database logs every 15 minutes.
- [ ] Hours 2–24: check at least hourly and record each check time.
- [ ] Watch for 5xx responses, signup/OTP verification failures, username uniqueness/constraint errors, auth trigger failures, and workspace authorization errors.
- [ ] Confirm no logs contain passwords, OTPs, access tokens, raw IPs, email addresses, or service credentials.
- [ ] If an incident occurs, pause release activity, preserve the deployment/commit identifiers, and follow the rollback sequence above.
- [ ] At 24 hours, record whether monitoring was clean and list unresolved issues.
