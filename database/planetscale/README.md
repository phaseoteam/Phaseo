# PlanetScale Postgres + Better Auth migration

Branch `feat/planetscale-better-auth-20261102`. No PR yet, by the owner's choice. This branch is the cutover artefact: once a PlanetScale database exists, follow `CUTOVER.md`.

## Why this attempt differs from August 2026

Phaseo moved to PlanetScale + Drizzle + Better Auth on 2026-08-17 (#1698) and rolled back the next day (#1716). Nothing failed technically. The rollback happened because database egress on PlanetScale looked higher than under Supabase, and the owner feared a bigger bill. The data then had to be reconciled by hand because the cutover was a hard switch.

So this attempt:

1. **Measures egress before cutover, not after.** `CUTOVER.md` has an egress gate. The shadow run reports bytes per route against the plan's included transfer.
2. **Keeps a one-variable rollback.** Each app chooses its database through `DATABASE_PROVIDER=supabase|planetscale` at its client factory. Rolling back the data plane is an environment change plus a reverse sync, not a code revert.
3. **Keeps call sites unchanged.** August rewrote every query into Drizzle repositories (681 files, three days, and a merge-conflict magnet). Here, `@phaseo/db` provides a PostgREST-compatible client. It keeps the supabase-js `.from()` / `.rpc()` API but turns each request into SQL over Hyperdrive. That covers about 1,700 `.from()` and 340 `.rpc()` call sites with no edits. Hot paths can move to typed SQL later, one at a time, measured with Query Insights tags.
4. **Sizes for the real workload.** The plan is PS-20 (2 GiB), single node, in London (`aws-eu-west-2`), the same region as Supabase prod today. PS-5 (512 MiB) cannot hold the working set; Supabase's 1 GB Micro already failed in October.

## Target architecture

```
Browser / mobile / desktop / CLI
   │ cookies or Bearer (Better Auth session)       JWT (Better Auth jwt plugin, JWKS)
   ▼                                                ▼
apps/web (Vercel, Next)  ── Better Auth server ──  apps/api gateway (Worker)  apps/web-api (Worker)
   │ pg pool, max 1/instance                         │ Hyperdrive binding (cache disabled)
   └──────────────────────────────► PlanetScale Postgres 17, PS-20, aws-eu-west-2
                                     PgBouncer :6432 for app traffic, direct :5432 for migrations
```

- **Workers** reach Postgres only through Hyperdrive, with caching **disabled** for correctness (auth, billing, read-after-write).
  - Driver: `postgres` (postgres.js) with `prepare: true` (Cloudflare's guidance: Hyperdrive tracks prepared statements across its pool), `fetch_types: false`, `max: 5`.
  - One postgres.js client per invocation (`@phaseo/db/hyperdrive-scope`), closed with `ctx.waitUntil` only after the response body and every other `waitUntil` task finish, because billing and audit writes keep querying after the handler returns.
  - A second, cache-enabled Hyperdrive binding is allowed for public catalogue reads only (`HYPERDRIVE_CATALOGUE`, proposed; nothing reads it yet).
- **Vercel (Next)** uses a `pg` Pool capped at one connection per instance, through PgBouncer.
- **Query tags.** Every query carries a sqlcommenter tag (`/*app='gateway',route='…'*/`), appended at the end of the statement as PlanetScale's docs show, so Query Insights maps load and egress to code. `@phaseo/db` also emits a `QueryEvent` (`app, route, table, kind, rows, bytes, ms, status`) per query, which `scripts/egress-gate.mjs` reads.
- **Migrations** run over the direct connection with a separate migration role. `pg_strict` is on, so every UPDATE/DELETE needs a WHERE.

## Identity model (shared contract)

Better Auth tables live in the `auth` schema, so the 79 foreign keys to `auth.users(id)` keep working unchanged.

| Better Auth model | Table | Notes |
|---|---|---|
| user | `auth.users` | `id uuid` PK (Supabase ids preserved on import), `name`, `email` (unique, citext or lower-unique), `email_verified`, `image`, `created_at`, `updated_at`, plugin columns (`two_factor_enabled`, admin `role`/`banned`/`ban_reason`/`ban_expires`), legacy `raw_user_meta_data jsonb`, `raw_app_meta_data jsonb`, `last_sign_in_at` |
| session | `auth.sessions` | |
| account | `auth.accounts` | password hash (bcrypt from Supabase, scrypt for new) and OAuth links (google 137, github 15, gitlab 1) |
| verification | `auth.verifications` | |
| passkey | `auth.passkeys` | |
| twoFactor | `auth.two_factors` | Supabase TOTP secrets aren't portable; the 1 MFA user re-enrols |
| jwks | `auth.jwks` | for the API's JWT verification |
| ssoProvider | `auth.sso_providers` | 0 providers today |

Compatibility functions keep RLS policies and SQL working:
- `auth.uid()`, `auth.role()` and `auth.jwt()` read `request.jwt.claims`, the same way PostgREST sets it.
- Roles `anon`, `authenticated` and `service_role` exist as NOLOGIN roles. The compat client runs user-scoped requests inside a transaction with `set_config('request.jwt.claims', …, true)` and `set_config('role', 'authenticated', true)` (the transaction-local equivalent of `SET LOCAL ROLE`, usable as a bound parameter).
- The service path does not switch role, so the app login role itself needs BYPASSRLS (PlanetScale's default role has it) and must be able to `SET ROLE` to the three compat roles. See CUTOVER.md phase 1.7 and decision D1.
- PostgREST features the code doesn't use return HTTP 501 with code `PHASEO_DB_UNSUPPORTED` instead of guessing (`packages/data/db/POSTGREST-COVERAGE.md`).
- Workers verify Better Auth JWTs with `@phaseo/db/jwt` (JWKS cached per isolate, issuer/audience/expiry checked, asymmetric algorithms only), then confirm the session and user rows so sign-out and bans apply immediately.

## Switches

| Variable | Values | Default | Where |
|---|---|---|---|
| `DATABASE_PROVIDER` | `supabase`, `planetscale` | `supabase` | web, web-api, api |
| `AUTH_PROVIDER` | `supabase`, `better-auth` | `supabase` | web, web-api, api |

`AUTH_PROVIDER=better-auth` requires `DATABASE_PROVIDER=planetscale` (Better Auth's tables live there); an unknown value throws. With the defaults, every app behaves exactly as on main. `ENV.md` lists every variable per app.

Supabase-only pieces and their replacements:
- `pg_net` (only the Discord signup webhook in `handle_auth_user_created`) moves to a Better Auth `databaseHooks.user.create.after`.
- `index_advisor` is dropped. PlanetScale has its own Insights and `hypopg`.
- `pg_cron`'s 8 active jobs stay in pg_cron, which PlanetScale supports once it's enabled in the dashboard.
- Supabase Storage isn't used for user data; check this before cutover.

## Layout

| Path | What |
|---|---|
| `packages/data/db` | `@phaseo/db`: connections (Hyperdrive, Node), query tags, PostgREST-compat client, relationship metadata |
| `database/planetscale/migrations/0000_platform.sql` | schemas, roles, extensions, `auth.uid()` etc. |
| `database/planetscale/migrations/0001_auth.sql` | Better Auth tables in `auth` |
| `database/planetscale/migrations/0002_baseline.sql` | the current public/private/catalogue schema, minus Supabase-only parts |
| `database/planetscale/migrations/0003_cron.sql` | pg_cron jobs (applied after enabling pg_cron) |
| `database/planetscale/scripts/` | build/verify baseline, import users (`import-supabase-users.ts`), assess cutover, sequence sync, replication monitor, egress gate |
| `database/planetscale/CUTOVER.md` | the runbook, from sign-up to rollback, with decisions D1–D21 |
| `database/planetscale/ENV.md` | every env var, secret and binding per app |
| `database/planetscale/hyperdrive-bindings.example.toml` | wrangler snippets for both Workers |
| `database/planetscale/SCHEMA-PORT.md` | how 0002 was generated and what was changed from Supabase |
| `apps/web/src/lib/auth/better-auth/` | the Better Auth server, client and schema map; `MIGRATION-NOTES.md` is the work list for the auth call sites |
| `apps/web/src/lib/db/` | web's provider switch, pool and `getSessionUser()` seam |
| `apps/web-api/src/data/`, `apps/api/src/runtime/database.ts` | the Workers' provider switches |

## Not done on this branch

- The auth call sites (`supabase.auth.*`) in web, web-api, the gateway and mobile still call Supabase Auth. They throw under `DATABASE_PROVIDER=planetscale` with `AUTH_PROVIDER=better-auth`. `MIGRATION-NOTES.md` and the agents' lists are the work list.
- `apps/slack` and `apps/desktop` have no PlanetScale path.
- Phaseo's third-party OAuth server still relies on Supabase's OAuth server (13 registered clients).
- Nothing has run against real PlanetScale, Hyperdrive or Better Auth in production; all proof is local (PGlite, embedded Postgres 17, and Postgres 18).
