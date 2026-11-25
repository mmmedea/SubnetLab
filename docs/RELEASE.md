# SubnetLab release runbook

**Status:** Documented, not verified. No Production settings were changed, no Production SQL was run, and no release was performed.

## Release-specific values (as of 2026-11-25)

- Production Branch: **`main`**, shown in the owner's Vercel Environments screenshot.
- Current Production deployment: **`dpl_9C3vHoZS64A4XRVXLPr8f4RNPoHm`**, commit **`03a0cf9b5dfeef784f6e1bc1db1aa453a4b78de2`**, status READY, message **`feat: complete auth and settings release`** (owner-reported).
- The owner reports that deployment as branch **`settings-system`**, while the screenshot shows Production branch tracking **`main`**. Keep these as separate facts and confirm the deployment's originating ref in Vercel before release.
- Require Verified Commits: **not verified**.
- Preview environment variable names only: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. No values are recorded here.
- Preview Supabase: **SubnetLab-Staging** (`pvqyaczfyanyklnabjmg`).
- Production Supabase: **SubnetLab** (`jfqgttbnmubhzaqzlzjo`).
- Preview and Production use the same Supabase project: **No**.
- Instant Rollback: **reported available**. A previous Production deployment is marked as a rollback candidate. Promotion availability is reported; the dashboard action itself was not tested.

The Production Branch is confirmed as `main`, so use Path B below. The connector could not independently read these Vercel settings; the deployment and environment details above are owner-reported, except the Production branch value shown in the supplied screenshot.

## Preflight evidence

The owner reports that the read-only preflight was run in both STAGING and PRODUCTION on 2026-11-25:

| Check | STAGING | PRODUCTION |
|---|---:|---:|
| Invalid username rows | 0 | 0 |
| Case-insensitive duplicate username groups | 0 | 0 |
| `email_otp_verified_sessions` rows | 1 | 1 |
| `auth_audit_log` rows | 0 | 0 |

The owner also reports reviewing the `auth.users` triggers. I independently read the current `handle_new_auth_user_settings()` definition through the connected Supabase read-only query in both projects: both definitions are identical, SECURITY DEFINER with an empty search_path. The existing `on_auth_user_created_settings` trigger calls that same function. The proposed migration replaces the function in place, retains profile and preference creation plus the display-name, role, and avatar assignments, and intentionally changes behavior: usernames outside 3–20 now raise an error instead of becoming NULL; duplicate usernames now reject signup instead of falling back to a profile without a username. The function body and trigger are not applied or changed in either database. This behavior change is part of the signup requirement and must be included in staging verification.

Other reported triggers: `sync_auth_user_consent` and `sync_profile_password_configured`. No migration has been applied.

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

- [ ] Before release, recheck the current Production deployment ID, commit SHA, URL, and creation time; the values above are owner-reported on 2026-11-25. Confirm the originating ref because the reported deployment branch (`settings-system`) differs from the Production branch-tracking setting (`main`).
- [ ] Require Verified Commits is still unverified; check it in Vercel before selecting a release commit.
- [ ] The owner reports that a previous Production deployment is a rollback candidate and Instant Rollback is available. Verify the promotion action in Vercel before relying on it.

## Release order

The read-only preflight and backup are prerequisites. After the required approval, resolve any reported username rows by profile id. Then apply the schema migrations before merging or deploying application code. If no username cleanup is needed, the schema migration is the first Production write.

1. Record the current Production deployment and verify the backup.
2. Run the read-only Production preflight queries. If they show invalid usernames or duplicate groups, stop before any write until the exact approval phrase.
3. After approval, manually correct only the reported profile ids: set invalid names to NULL or manually chosen valid names; for each duplicate group, keep one selected profile and manually change the others to unique names or NULL. Never derive from email or delete users. Rerun the username queries until they return no rows.
4. Apply these Production migrations in order:

   1. `supabase/migrations/20261125120000_allow_first_signup_session_without_second_otp.sql`
   2. `supabase/migrations/20261125120500_enforce_username_3_20.sql`

   Apply through the Production Supabase SQL Editor only after approval. Do not apply a rollback file as part of the release.

5. Run the read-only preflight again. Confirm the username queries return no rows. Verify both new tables have RLS enabled, the grant functions are SECURITY DEFINER with an empty search path, only `service_role` can execute them, and row counts for `email_otp_verified_sessions` and `auth_audit_log` are consistent with the recorded pre-migration counts.
6. Merge the application code using the confirmed branch path below. Use GitHub **Squash and merge** only after approval. Do not merge PR #25 before the migration and post-migration checks pass.
7. Wait for the Production deployment to finish and confirm Vercel reports Ready for the expected commit. Do not manually deploy a different branch.
8. Run the smoke script below, then perform authenticated checks with the designated test account. Do not put credentials or OTPs in the script or release record.

### Path A — Production Branch is `settings-system`

After migration and verification, squash-merge PR #25 into `settings-system`. Vercel should deploy that branch automatically if Git integration is enabled. Verify the Production deployment commit matches the squashed PR commit.

### Path B — Production Branch is `main`

After migration and verification, squash-merge PR #25 into `settings-system` and verify its Preview/staging deployment. Then open a separate PR from `settings-system` to `main`. Merge that release PR only after the same explicit release approval and passing checks. Vercel should deploy `main` automatically. Verify the Production deployment commit matches the merged release commit.

**Selected path:** **Path B — Production Branch is `main`**, confirmed by the owner's screenshot on 2026-11-25.

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
