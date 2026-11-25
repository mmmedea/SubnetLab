# SubnetLab release runbook

**Status:** Documented, not verified. No Production settings were changed, no Production SQL was run, and no release was performed.

## Release-specific values (as of 2026-11-25)

- Production Branch: **`main`**, shown in the owner's Vercel Environments screenshot.
- Current Production deployment: **`dpl_9C3vHoZS64A4XRVXLPr8f4RNPoHm`**, commit **`03a0cf9b5dfeef784f6e1bc1db1aa453a4b78de2`**, status READY, message **`feat: complete auth and settings release`** (owner-reported).
- The owner reports that deployment as branch **`settings-system`**, while the screenshot shows Production branch tracking **`main`**. The mechanism that produced deployment `dpl_9C3vHoZS64A4XRVXLPr8f4RNPoHm` from `settings-system` is **unknown** pending the owner's explanation. Keep these as separate facts.
- Require Verified Commits: **not verified**.
- Preview environment variable names only: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. No values are recorded here.
- Preview Supabase: **SubnetLab-Staging** (`pvqyaczfyanyklnabjmg`).
- Production Supabase: **SubnetLab** (`jfqgttbnmubhzaqzlzjo`).
- Preview and Production use the same Supabase project: **No**.
- Instant Rollback: **reported available**. A previous Production deployment is marked as a rollback candidate. Promotion availability is reported; the dashboard action itself was not tested.

The supplied screenshot shows Production tracking `main`, while the owner reports the current Production deployment was built from `settings-system`; how it was made remains unknown. The owner leans toward Path A, and this runbook recommends Path A for the reasons below. This is not authorization to change settings or merge code. Until the deployment mechanism is explained and the release gate is satisfied, treat every merge or push to `settings-system` as potentially Production-affecting. The connector could not independently read Vercel; the deployment and environment details above are owner-reported, except the branch-tracking value shown in the screenshot.

## Preflight evidence

The owner reports that the read-only preflight was run in both STAGING and PRODUCTION on 2026-11-25:

| Check | STAGING | PRODUCTION |
|---|---:|---:|
| Invalid username rows | 0 | 0 |
| Case-insensitive duplicate username groups | 0 | 0 |
| `email_otp_verified_sessions` rows | 1 | 1 |
| `auth_audit_log` rows | 0 | 0 |

The owner also reports reviewing the `auth.users` triggers. I independently read the current `handle_new_auth_user_settings()` definition through the connected Supabase read-only query in both projects: both definitions are identical, SECURITY DEFINER with an empty search_path. The existing `on_auth_user_created_settings` trigger calls that same function. The proposed migration replaces the function in place, retains profile and preference creation plus the display-name, role, and avatar assignments, and intentionally changes behavior: usernames outside 3–20 now raise an error instead of becoming NULL; duplicate usernames now reject signup instead of falling back to a profile without a username. New username writes preserve the submitted casing while the unique index remains case-insensitive on `lower(username)`. Neither migration rewrites or backfills existing usernames. The function body and trigger are not applied or changed in either database. These behavior changes must be included in staging verification.

Other reported triggers: `sync_auth_user_consent` and `sync_profile_password_configured`. No migration has been applied.

## Mandatory release gate

Do not run Production DML/DDL, merge PR #25, or deploy this release until the project owner explicitly replies. The read-only SELECT preflight requested for Production is allowed and makes no changes:

```text
APPROVE RELEASE 25
```

That approval is required for Production changes. It does not authorize rollback SQL; get separate explicit approval before running rollback SQL. Staging changes also require notice to the owner before applying.

## Pre-release checklist

- [ ] Do not merge or push to `settings-system` while the current Production deployment mechanism is unexplained. Treat that action as potentially Production-affecting. PR #24 changes only CI, but merging it to `settings-system` is still covered by this hold.
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

### Path A — change Production Branch to `settings-system` for release

**Recommended path; the owner currently leans A.** This limits the release to the branch intended for the application update. Path B would bring 325 commits and has current overlap with the non-mergeable #16 and #5 branches; #23 and #22 are already ancestors of `settings-system`. The current deployment's creation mechanism is still unknown, so this recommendation does not make pushes safe.

This path requires the exact `APPROVE RELEASE 25` before Production changes. No Vercel setting changes are authorized before that.

1. Complete the Production read-only preflight, backup, and deployment record.
2. Apply the two Production migrations in the order above only after the exact approval, then run the post-migration verification queries.
3. On release day, after those database checks pass and before merging PR #25, change Vercel's Production Branch from `main` to `settings-system`.
4. Confirm that the Production environment still uses the Production Supabase project and Production variables. Do not promote the Preview build.
5. Merge PR #25 into `settings-system`, then verify the resulting Production deployment is Ready for the expected commit and run the smoke tests.

The owner reports that the current Production deployment was built from `settings-system` despite the screenshot showing Production tracking `main`. Until that mechanism is explained, any merge to `settings-system` is treated as potentially Production-affecting.

### Path B — merge `settings-system` into `main`

This path also requires the owner to choose B and send `APPROVE RELEASE 25`. After the Production database migrations and post-migration queries pass, create a separate PR from `settings-system` to `main`. GitHub's comparison on 2026-11-25 reports `settings-system` is **325 commits ahead** of `main`; this path would bring that branch's full history and tree, not only the signup change.

#### Expected overlap with the four open PRs

This is a read-only comparison of current branch ancestry and changed paths, not a test merge. The open PRs below were not changed or closed.

- **#23 — Next.js network cockpit/settings:** its head `8dc015f` is an ancestor of `settings-system`, which is two commits beyond it in the current graph. No separate content conflict is predicted from that ancestry, but the proposed PR would include the same Next.js/settings work and may overlap or make #23 redundant.
- **#22 — preview UI redesign:** its head `2617154` is also an ancestor of `settings-system`. No separate content conflict is predicted from the current graph; the redesign changes are already in the branch that Path B would merge. PR #22 remains untouched.
- **#16 — collapsible sidebar:** the branches have diverged and the PR currently reports non-mergeable. Both change `public/app.js`, `public/index.html`, and `public/overrides.css`. These are expected conflict hotspots.
- **#5 — Express entrypoint:** the branches have diverged and the PR currently reports non-mergeable. The main conflict hotspot is `vercel.json`: PR #5 adds Express/static build and routing configuration, while `settings-system` changes Vercel configuration for the Next.js app. PR #5 also adds a default export in `src/server/index.js`; no corresponding edit to that file appears in the `settings-system` comparison. Review the legacy route behavior if Path B is selected.

Do not close, retarget, or otherwise change PRs #23, #22, #16, or #5 as part of this runbook.

### Preview deployment warning

A promoted Preview deployment remains a Preview build using Preview environment variables, including the Staging Supabase target. **Do not promote a Preview deployment to Production.** Build Production from the selected Git release path with the Production environment.

**Recommendation:** **Path A.** Execution path remains unconfirmed until the owner explains how the current `settings-system` deployment was made and sends the required release approval. Path B remains an available alternative.

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
2. Promote the previously recorded Ready Production deployment using Vercel's deployment controls if available. Promote only a known Production deployment. Never promote a Preview deployment: it was built with Preview variables and targets Staging. If the project does not show a promotion/Instant Rollback option, stop and use the Vercel dashboard's supported rollback process; do not guess a CLI command or deploy an unverified branch.
3. If the new signup verification flow is the issue, set `NEXT_PUBLIC_SIGNUP_VERIFICATION_MODE=legacy` for Production and redeploy the intended Production commit. This is a build-time switch; verify the resulting deployment before resuming signups.
4. Run Production rollback SQL only after separate explicit user approval, in reverse migration order: `docs/ops/rollback-username-3-20.sql`, then `docs/ops/rollback-first-signup-session.sql`. The username rollback does not rewrite existing profiles; stored mixed-case usernames remain unchanged, while the restored legacy trigger lowercases usernames only for future auth-user inserts.
5. Restore the database backup **last**, only if the owner explicitly approves it and after checking the impact of restoring post-release writes. A database restore can remove changes made after the backup.

## First 24 hours

- [ ] First hour: check Vercel deployment/function logs and Supabase Auth/database logs every 15 minutes.
- [ ] Hours 2–24: check at least hourly and record each check time.
- [ ] Watch for 5xx responses, signup/OTP verification failures, username uniqueness/constraint errors, auth trigger failures, and workspace authorization errors.
- [ ] Confirm no logs contain passwords, OTPs, access tokens, raw IPs, email addresses, or service credentials.
- [ ] If an incident occurs, pause release activity, preserve the deployment/commit identifiers, and follow the rollback sequence above.
- [ ] At 24 hours, record whether monitoring was clean and list unresolved issues.
