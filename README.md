# SubnetLab

SubnetLab is a full-stack subnet planning and learning workspace for networking students, junior network administrators, and small offices. It combines IPv4 VLSM, IPv6 prefix allocation, IP address management, DHCP reservations, Cisco-style examples, and server-checked practice with personal progress analytics.

SubnetLab provides a focused workspace for network planning and learning. The interface uses a responsive workspace layout, accessible allocation tables, light/dark themes, and a public product introduction before sign-in.

## Prerequisites

- Node.js 22 or newer and npm
- macOS, Linux, or Windows with a supported `better-sqlite3` build toolchain if no prebuilt binary is available

## Install and configure

```sh
npm install
cp .env.example .env
```

Set `JWT_SECRET` in `.env` to a private random value of at least 32 characters. For example, generate one with `openssl rand -base64 48` and paste the output into your local `.env`. Do not commit `.env` or production secrets.

The default database is `./data/subnetlab.sqlite`. SQLite creates this file and its parent directory when the server starts. To explicitly initialize the schema:

```sh
npm run db:init
```

## Run

```sh
npm run dev       # development with Node watch mode
npm start         # production-style server
```

The app listens on `http://localhost:3000` by default. Set `PORT`, `APP_ORIGIN`, and `COOKIE_SECURE=true` to match the deployed site and HTTPS configuration. Production deployments must use HTTPS and `COOKIE_SECURE=true`.

## Deployment note for Vercel

**Do not use the current SQLite-backed Vercel deployment for real user accounts or durable data.** Vercel function filesystems are ephemeral, and the current app opens SQLite on the local filesystem. The Vercel preview can verify the interface and server startup, but it is not a persistent production data store.


This repository currently uses SQLite through `better-sqlite3`. A local SQLite file is suitable for development and for hosts with a persistent disk, but Vercel serverless function filesystems are ephemeral and must not be treated as durable storage. Do not use the default `./data/subnetlab.sqlite` path for production user data on Vercel. Before relying on a Vercel deployment for real accounts, migrate the persistence layer to a managed database (for example, PostgreSQL) and configure backups, connection pooling, and production secrets. The current application has not yet been migrated to PostgreSQL.

## Publish with Render

SubnetLab is an Express web service, so deploy it as a Node web service rather than a static site. These steps use Render as an example; see the [Render Express guide](https://render.com/docs/deploy-node-express-app) for current dashboard details.

1. Push this project to a GitHub repository. Do not commit `.env`, `node_modules/`, or `data/`.
2. In Render, create a **Web Service** connected to the repository. Use `npm install` as the build command and `npm start` as the start command.
3. After the service is created, note its HTTPS URL and set these environment variables in the Render service settings:

   | Variable | Value |
   | --- | --- |
   | `APP_ORIGIN` | The exact public origin, such as `https://subnetlab-example.onrender.com` |
   | `COOKIE_SECURE` | `true` |
   | `JWT_SECRET` | A private random value of at least 32 characters. Generate one locally with `openssl rand -base64 48`; do not paste it into GitHub. |
   | `DB_PATH` | `/var/data/subnetlab.sqlite` |

   Render supplies `PORT` to the app; leave it managed by the host unless your service settings require otherwise.
4. Attach a persistent disk mounted at `/var/data`. SQLite stores all accounts, plans, IPAM records, reservations, and attempts in this file. Only files under the disk mount persist across restarts and deploys. Render's free web services do not support persistent disks, so use a plan that does if the site must retain user data. See [Render persistent disks](https://render.com/docs/disks).
5. Save the settings and deploy. Open the public HTTPS URL and create an account to use the site.

The service must listen on the host-provided port and be reachable by the hosting provider. Configure `APP_ORIGIN` to exactly match the deployed origin so browser requests and secure session cookies work correctly. Back up the SQLite database before significant upgrades or maintenance.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm start` | Start the Express server |
| `npm run dev` | Restart on source changes |
| `npm run db:init` | Create the SQLite schema if missing |
| `npm test` | Run networking and API tests |
| `npm run check` | Check server and browser JavaScript syntax |

## Features

- **Dashboard:** persisted saved-plan count, active assignments, reservations, attempts, accuracy, and recent activity. Empty values remain empty instead of suggesting sample data.
- **IPv4 VLSM:** validates CIDR and named host requirements, sorts largest first, aligns each allocation to its block boundary, and returns the full subnet table. `/31` is treated as two usable point-to-point addresses; `/32` is one host route/address. Any exhaustion rejects the whole computation.
- **IPv6 planner:** accepts IPv6 CIDRs, canonicalizes them, and allocates sequential prefixes using `BigInt`. Choose subnet prefix and count; `/48` to `/64` planning is supported.
- **IPAM:** assign and release addresses, search records, and create/remove MAC-based reservations. Each address is validated against a selected allocation, and duplicates are rejected across active assignments and reservations.
- **Address map:** visual allocation blocks are paired with a semantic table that exposes the actual values.
- **Configuration:** saved IPv4 plans produce copyable Cisco IOS-style interface and DHCP examples; IPv6 plans produce interface examples. They are labeled as illustrative and are never sent to network equipment.
- **Practice and progress:** random network-address, mask, and host-count questions are answered and scored on the server. Attempts and topic results are private to the account.
- **Reports:** plan allocation tables export as escaped CSV and can be printed with a simplified print stylesheet.

## API overview

All endpoints are versioned under `/api/v1` and return `{ "data": ... }` on success or `{ "error": { "message": ... } }` on failure.

| Endpoint | Purpose |
| --- | --- |
| `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` | Create account, sign in/out, retrieve current account |
| `GET /dashboard` | Current-account totals and recent activity |
| `GET /plans`, `POST /plans/compute`, `POST /plans`, `GET/PUT/DELETE /plans/:id` | Compute and manage saved plans |
| `GET /plans/:id/config`, `GET /plans/:id/export.csv` | Generated examples and allocation export |
| `GET /ipam`, `POST /ipam/records`, `POST /ipam/records/:id/release`, `DELETE /ipam/records/:id`, `GET /ipam/export.csv?planId=:id` | List, assign, release, remove, and export records |
| `POST /ipam/reservations`, `DELETE /ipam/reservations/:id` | Create and remove DHCP reservations |
| `GET /practice/next`, `POST /practice/answer` | Generate and check a practice question |
| `GET /analytics/me` | Personal attempt totals, topic accuracy, and recent history |

## Authentication and data protection

Passwords are hashed with bcrypt. Login uses a signed HS256 JWT in an eight-hour, HttpOnly, SameSite=Strict cookie. Mutating API requests check the `Origin` header when supplied; CORS is restricted to `APP_ORIGIN`. Authentication and practice endpoints are rate-limited. SQL queries use bound parameters, all account-owned reads and writes include the authenticated user ID, and SQLite foreign keys and unique indexes enforce referential integrity and active-address uniqueness. The app has no public account-ID input and ignores user IDs in request payloads.

Bearer tokens are accepted for non-browser clients; browser sessions should use the HttpOnly cookie. For production, deploy behind HTTPS, set `COOKIE_SECURE=true`, choose a strong secret, and configure `APP_ORIGIN` to the exact public origin.

## Tests

```sh
npm test
npm run check
```

Tests cover unsigned IPv4 conversion, CIDR and `/31`/`/32` boundaries, VLSM ordering and exhaustion, IPv6 canonicalization and BigInt allocation, account isolation, duplicate IPAM rejection, and server-side practice scoring.

## Assumptions and limitations

- IPv4 host needs use traditional network/broadcast subtraction for prefixes `/0` through `/30`; `/31` follows RFC 3021 point-to-point semantics; `/32` represents one address.
- A host requirement of one is represented as a `/32`; a requirement of two uses a `/31` where it fits.
- IPv4 base addresses with host bits set are normalized to their containing network before planning.
- IPv6 planning allocates consecutive equal-size subnets from the canonical base. IPv4-embedded IPv6 syntax and scoped zone identifiers are intentionally rejected.
- The Cisco output uses the first usable address as an example gateway and generated VLAN numbers start at 1. Review device interface names, VLAN IDs, DHCP exclusions, gateway conventions, DNS, and platform syntax before use.
- Analytics show aggregate attempts by topic, the latest 30 attempts, and daily accuracy for days with saved attempts in the last 14 days. There is no fabricated time-series sample data.
- The reference images did not specify visual behavior for every state; accessibility and responsive behavior are implemented using semantic controls, visible focus, table representations, and a mobile navigation toggle.
