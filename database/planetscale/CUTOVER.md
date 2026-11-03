# Cutover runbook: Supabase to PlanetScale Postgres + Better Auth

This runbook goes from PlanetScale sign-up to steady state, with a rollback for every phase. Read `README.md` (the design) and `SCHEMA-PORT.md` (the schema port) first. `ENV.md` has every variable and binding.

How to read it:
- Every step says **where** it runs: `[PS]` is PlanetScale, `[SB]` is Supabase prod, `[CF]` is Cloudflare, `[VC]` is Vercel, `[local]` is the operator's shell.
- Steps marked **OWNER** need the owner's explicit go-ahead at the time. Any step that drops, deletes or truncates says so and is never automatic. Nothing in this runbook deletes Supabase data.
- Writes on Supabase prod are kept to a minimum and listed: REPLICA IDENTITY on 3 tables (D11), the IPv4 add-on (D12), a publication, and in phase 4 a subscription, cron deactivation and disabled signups. Each one is reversible.
- The connection strings are shell variables only (`SUPABASE_DB_URL`, `PLANETSCALE_DIRECT_URL`; see ENV.md). The scripts never print them.

The August 2026 attempt was a hard switch, rolled back the next day over feared egress, and its data had to be reconciled by hand. This plan differs in three ways: egress is measured before the switch (phase 3), each app flips with an env var, and replication runs in **both directions** during and after the cutover, so a rollback is an env flip, not a reconciliation.

---

## Verified facts (checked 2026-11-03)

| Fact | Source |
|---|---|
| The default role is `NOSUPERUSER CREATEDB CREATEROLE INHERIT LOGIN REPLICATION BYPASSRLS` and inherits `pg_create_subscription`, `pg_read_all_data`, `pg_write_all_data` and others. PlanetScale never grants SUPERUSER. Don't run apps as the default role, because rotating its password means downtime. | [roles](https://planetscale.com/docs/postgres/connecting/roles), [compatibility](https://planetscale.com/docs/postgres/postgres-compatibility) |
| Usernames carry the branch id (`role.<branch_id>`). Roles made with SQL `CREATE ROLE` work, but they don't appear in the dashboard. New roles don't get CREATE on `public`. | [roles](https://planetscale.com/docs/postgres/connecting/roles) |
| CLI: `pscale role create <db> <branch> <name> --inherited-roles ...`, `pscale role default <db> <branch>` (shows the default role without rotating it), `pscale role reset-default`. | [roles](https://planetscale.com/docs/postgres/connecting/roles), [changelog](https://planetscale.com/changelog/cli-postgres-default-role) |
| PgBouncer is on **6432**, transaction mode only. Direct is **5432**. The host is the same for both. Use direct for DDL, `pg_dump` and long operations. PgBouncer defaults are `default_pool_size` 20 per user/db and `max_client_conn` 100. PgBouncer connections survive parameter changes and restarts; direct ones don't. SSL params in PlanetScale's examples: `sslmode=verify-full sslrootcert=system sslnegotiation=direct`. | [PgBouncer](https://planetscale.com/docs/postgres/connecting/pgbouncer), [parameters](https://planetscale.com/docs/postgres/cluster-configuration/parameters) |
| pg_cron and pg_stat_statements are enabled in **Clusters → Extensions** (restart), then `CREATE EXTENSION`. pgcrypto, pg_trgm, citext, uuid-ossp and moddatetime are created with SQL; moddatetime needs the default role. hypopg is preinstalled. `pg_strict` is always installed. pg_net and index_advisor aren't offered. Extensions aren't restored with backups or copied to new branches. | [extensions](https://planetscale.com/docs/postgres/extensions), [pg_cron](https://planetscale.com/docs/postgres/extensions/pg_cron.md) |
| pg_cron parameters include `cron.database_name` (default `postgres`), `cron.max_running_jobs` (default **1**, at most `max_worker_processes`) and `cron.launch_active_jobs`. | [pg_cron](https://planetscale.com/docs/postgres/extensions/pg_cron.md) |
| pg_strict has `require_where_on_update` / `require_where_on_delete` with values `off`/`warn`/`on`. They're set per role (dashboard or `ALTER ROLE ... SET`), per database, or per transaction (`SET LOCAL`). Changes apply to new connections only. Whether `WHERE true` passes isn't documented. | [pg_strict](https://planetscale.com/docs/postgres/extensions/pg_strict.md) |
| Importing from Supabase: logical replication over Supabase's **direct** connection on port 5432 (the pooled endpoints don't work), which needs the **IPv4 add-on** ("might incur downtime"). Set `statement_timeout = 0` on the Supabase replication role. Size PlanetScale's disk at ≥150% of the source. Raise `max_worker_processes` from 4 to ≥10. `max_sync_workers_per_subscription` defaults to 2. **Sequences aren't replicated.** Make no schema changes during the migration. | [Supabase import guide](https://planetscale.com/docs/postgres/imports/supabase) |
| Restart-required parameters include `max_worker_processes`, `max_connections`, `wal_level`, `max_logical_replication_workers`, `max_replication_slots`, `max_wal_senders` and `shared_preload_libraries`. CLI: `pscale branch parameters list <db> <branch>`. | [parameters](https://planetscale.com/docs/postgres/cluster-configuration/parameters) |
| Backups run every 12 h, are kept 2 days by default, with PITR to any point from the oldest backup to 5 minutes ago. A restore always creates a new branch. | [backups](https://planetscale.com/docs/postgres/backups) |
| Query Insights shows "Bytes returned" per query pattern (bytes sent to clients). Tags appear only in the *Notable queries* table (>1 s, >10k rows, or errors). There is no CSV export; data is reachable through the PlanetScale MCP server. | [Query Insights](https://planetscale.com/docs/postgres/monitoring/query-insights) |
| **PS-20 single node in aws-eu-west-2 costs $23/month** (HA $69) and includes a 10 GB volume and **100 GB/month egress**. PS-5 includes only 10 GB of egress. | PlanetScale's public price catalogue (`public.planetscale_prices`, queried 2026-11-03), [pricing](https://planetscale.com/docs/postgres/pricing) |
| Egress overage is **$0.06/GB**. Note: `api.planetscale.com/www/egress-rates?region=…` returned 0.06 for every region string, including a bogus one, so the region parameter may be ignored. Backups get 2× disk free, then $0.023/GB-month. | [pricing](https://planetscale.com/docs/postgres/pricing) |
| Hyperdrive: `--caching-disabled`, `--max-age`, `--swr`, `--origin-connection-limit` and `--sslmode`. Cached defaults are 60 s max_age and 15 s swr. Writes and volatile or stable functions are never cached, and writes don't invalidate the cache. Cloudflare recommends a second, cache-disabled config for fresh reads. Pooling is transaction mode, and SET only lasts a transaction. Local dev uses `localConnectionString` or `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_<BINDING>` (the env var wins); `--remote` uses the real config. | [query caching](https://developers.cloudflare.com/hyperdrive/configuration/query-caching/), [wrangler hyperdrive](https://developers.cloudflare.com/workers/wrangler/commands/hyperdrive/), [local dev](https://developers.cloudflare.com/hyperdrive/configuration/local-development/), [pooling](https://developers.cloudflare.com/hyperdrive/concepts/connection-pooling/) |

### Supabase prod facts (read-only catalog queries, 2026-11-03)

- PostgreSQL 17.6, `wal_level = logical`, `max_replication_slots = 10`, `max_slot_wal_keep_size = 2048` MB, `TimeZone = UTC`. The collation is **ICU `en-US`** (`datcollate en_US.UTF-8`).
- No replication slots exist. The only publication is `supabase_realtime`. There are no large objects, unlogged tables or materialized views in `public`/`private`/`catalogue_private`, 283 tables (including partitions) and 10 sequences in scope, and Supabase Storage holds 0 objects.
- **3 tables can't be replicated as they are** (no primary key, default replica identity): `public.v2_private_usage_15m` (gets DELETEs), `public.v2_private_usage_labels_15m` and `public.workspace_rate_limit_throttles_minute`. Their unique indexes include nullable columns, so `REPLICA IDENTITY USING INDEX` isn't allowed. See D11.
- `public.v2_request_routing_decisions` is 2.2 GB for 72 rows (`reltuples`). That is **heap** bloat (1.95 GB heap, 8 kB TOAST, 277 MB indexes), not TOAST bloat. The statistics were reset (`n_live_tup` 0), so autovacuum has no dead-tuple count to act on. The copy only moves live rows, so it will be tiny on PlanetScale. How to check is in Appendix E.
- Partitions: `gateway_requests` has 2026_03 to **2026_12** plus `_default`, and `gateway_upstream_requests` has 2026_07 to **2026_12** plus `_default`. The baseline (0002) stops at 2026_10.
- WAL: about **120 MB/day** (`pg_stat_wal`: 384 MB in 77 h), so the 2 GB slot cap gives roughly 2 weeks before a stalled slot is invalidated.
- Supabase role `postgres`: `BYPASSRLS`, `REPLICATION`, member of `pg_create_subscription`, `statement_timeout=0`. It can therefore own a reverse subscription.
- Role settings that PostgREST applies today: `authenticator` has `session_preload_libraries=safeupdate`, `statement_timeout=8s` and `lock_timeout=8s`; `authenticated` has `statement_timeout=8s`; `anon` has `statement_timeout=3s`. `safeupdate` rejects UPDATE/DELETE without WHERE, the same rule as pg_strict. So the app's PostgREST traffic already complies with pg_strict.
- pg_cron, last 35 days: `cleanup-dormant-enterprise-teams` failed 2 of 2 runs (`function cleanup_dormant_enterprise_teams() does not exist`). `activate-provider-catalog-releases`, `provider-health-refresh-queue` and `prune-completed-analytics-outbox` had 1–2% `job startup timeout` failures. `public-reporting-refresh-queue` had 41 lock timeouts.

---

## Owner decisions (settle these before the phase they gate)

Every item has a recommendation. **Bold** items block a phase.

| # | Decision | Recommendation | Gates |
|---|---|---|---|
| **D1** | **Role model.** Who owns the objects, and who the apps log in as. | The PlanetScale **default role** runs every migration, owns every object and schedules cron. The apps log in as **`phaseo_app`**, a SQL-created `LOGIN BYPASSRLS` role with `GRANT service_role TO phaseo_app WITH INHERIT TRUE, SET TRUE` and `GRANT anon, authenticated TO phaseo_app WITH INHERIT FALSE, SET TRUE`, plus DML on schema `auth` for Better Auth (phase 1.7). Why `service_role` must be **INHERIT TRUE**, not FALSE as SCHEMA-PORT drafted: the compat client's service path doesn't `SET ROLE`. It runs as the login role (`packages/data/db/src/client.ts`), so the login role needs service_role's privileges directly, and BYPASSRLS as its own attribute, because attributes are not inherited. Also tell the 0001 author: the comment "Better Auth connects as the application role that owns these tables" doesn't hold under this model, because the default role owns them and `phaseo_app` gets grants. | Phase 1 |
| D2 | `service_role` BYPASSRLS | The default role has BYPASSRLS and CREATEROLE, so 0000 should create `service_role` with BYPASSRLS. Verify in phase 1.5. If the 0000 warning appears anyway, ask PlanetScale support. | Phase 1 |
| D3 | Event trigger `ensure_rls` needs superuser | Accept that it's skipped (0000/0002 warn). Every table already enables RLS and the partition function adds it. Follow-up: a CI lint that fails a migration whose `CREATE TABLE` has no `ENABLE ROW LEVEL SECURITY`. | none |
| **D4** | **pg_strict and `refresh_public_monitor_weekly_usage()`** (`delete from public.public_monitor_weekly_usage;` with no WHERE, run by cron every 15 min) | **No code change.** Turn pg_strict `on` for `phaseo_app` (the same rule as Supabase's `safeupdate` on `authenticator` today) and `off` for the default role that runs cron (phase 1.2/1.7). The job then behaves exactly as on Supabase, where it runs as `postgres` without safeupdate. Check that `SHOW pg_strict.require_where_on_delete` is `off` as the default role. If the owner wants pg_strict everywhere instead, change the function on main to `delete ... where true` (unverified whether pg_strict accepts a constant predicate, so test it on PlanetScale first) or `ALTER FUNCTION ... SET pg_strict.require_where_on_delete = off`. | Phase 1 |
| D5 | Broken `cleanup-dormant-enterprise-teams` (verified failing on prod) | Keep 0003 as written (it calls the renamed no-op `cleanup_dormant_enterprise_workspaces()`). Don't touch the Supabase job; its cron is deactivated at cutover. Later, drop the job on both sides in a normal migration, since it does nothing. | none |
| D6 | `deleted_at` / `is_anonymous` on `auth.users` | **Resolved.** 0001 has both columns (lines 44–45) and the import writes them. | none |
| D7 | Public schema ACL (`COMMENT ON SCHEMA public`, `GRANT/REVOKE ... ON SCHEMA public`) needs ownership of the schema or the database | Run the rolled-back probe in phase 1.3. If it fails, remove the 11 `public/schema.sql` statements from the generator on main (defaults are equal on PG ≥15 apart from the explicit anon/authenticated/service_role grants, which must stay). 0002 runs in one transaction, so a failure leaves nothing behind. | Phase 1 |
| D8 | Collation (Supabase: ICU `en-US`, verified) | Check the PlanetScale database in phase 1.2. If it's `en_US` under either provider, accept it and don't create a second database: PlanetScale tooling, cron (`cron.database_name`) and branches assume `postgres`. Indexes are rebuilt on the target, so there's no corruption risk. The only visible effect is the ordering of punctuation and case in text sorts. Diff the two monitor RPCs (`get_monitor_model_rows`, `get_monitor_history_page`) between Supabase and PlanetScale in phase 3. Use `COLLATE "en-US-x-icu"` only if they differ in a way that matters. | Phase 3 |
| D9 | gateway partitions | Run `select public.ensure_gateway_requests_partitions(2);` after 0002, then the parity generator (Appendix C) so that every prod partition exists on PlanetScale **before** the copy. The function uses `now()` in the session time zone, so the database must be UTC (phase 1.2). | Phase 2 |
| D10 | Hyperdrive origin port and limits | Use **6432** (PgBouncer survives restarts and failovers, and matches the comments the app agents added to `wrangler.toml`), with `--origin-connection-limit 20` for the uncached config and 5 for the cached one. Check `show max_connections` on PS-20 and keep the sum of all pools under it. If prepared statements misbehave through two transaction poolers, move the uncached config to 5432 (`wrangler hyperdrive update <id> --origin-port 5432`). | Phase 3 |
| **D11** | **The 3 tables without replica identity** (they would make UPDATE/DELETE **fail on Supabase** once they are in the publication) | Ship a normal migration on main: `ALTER TABLE public.v2_private_usage_15m REPLICA IDENTITY FULL;` and the same for `v2_private_usage_labels_15m` and `workspace_rate_limit_throttles_minute` (all three are small: 5 MB, 98 kB, 80 kB). Apply it on Supabase through the usual migration flow, then regenerate 0002 (`build-baseline.mjs`). `assess-cutover.mjs` must then report 0 blockers. Adding primary keys is the alternative, but their unique keys include nullable columns. | **Phase 2** |
| **D12** | **Supabase IPv4 add-on** (direct connections are IPv6-only without it; PlanetScale's guide requires it; Supabase warns it "might incur downtime", and it's a paid add-on) | Enable it at a quiet hour before phase 2. Disable it in phase 6. | **Phase 2** |
| D13 | Old mobile and desktop builds use Supabase Auth directly (`apps/mobile/src/providers/AuthProvider.tsx`, `apps/desktop/src/main/phaseoLogin.ts`) | Before the auth flip, ship mobile and desktop builds that use Better Auth, choosing the provider at runtime from the server rather than baking it into the build. Either have the Workers accept both Supabase and Better Auth tokens for a transition window (app code; not in this branch), or force an update at the flip. Disable Supabase Auth signups at the auth flip, so no new identity is created where it can't be imported. | Phase 4 (auth) |
| D14 | Cutover style | **Rolling with bidirectional replication** (phase 4): no downtime, apps flip one at a time, and writes from either side reach the other. The alternative is a freeze window (maintenance mode, one-way only), which avoids even the small conflict risk but means downtime. Rolling is safe here because almost every key is a UUID (only 10 sequences, which jump +1,000,000 on PlanetScale before the first flip). | Phase 4 |
| D15 | Egress gate threshold | Projected ≤ **80 GB/month** (80% of the included 100 GB). For scale: overage is $0.06/GB, so a 200 GB month costs $6 extra. If the gate fails, the decision is about cost tolerance, not feasibility: fix the top routes first (phase 3.6). | Phase 4 |
| D16 | Cluster size for the copy | PS-20 has 1/4 vCPU, and the copy builds ~600 indexes. Either start at PS-40 ($39/month London single node, prorated) for phases 1–2 and resize to PS-20 before phase 3, so the shadow run uses the final size, or stay on PS-20 and accept a slower copy. Whether a single-node resize causes a brief outage is unverified; it happens before cutover either way. | Phase 0 |
| D17 | Schema freeze | No migrations on main from the start of phase 2 to the end of phase 4. If one can't wait: apply it on both sides, then `ALTER PUBLICATION ... ADD TABLE` and `ALTER SUBSCRIPTION ... REFRESH PUBLICATION` for new tables. | Phases 2–4 |
| **D18** | **`apps/slack` and `apps/desktop` also use Supabase** and have no PlanetScale path in this branch | Port `apps/slack` (service-role writes) before phase 4, or pause it during phase 4. While bidirectional replication runs, its Supabase writes still reach PlanetScale; after the forward subscription is disabled, they don't. Desktop: see D13. | Phase 4 |
| D19 | `DISCORD_AUTH_SIGNUP_WEBHOOK_URL` (read by `signup.ts`) vs `DISCORD_SIGNUP_WEBHOOK_URL` (in `turbo.json`) | Pick one name; ENV.md lists both. | Phase 4 (auth) |
| D20 | OAuth apps | Google: add the Better Auth redirect URI next to Supabase's. GitHub allows one callback per app, so create a second OAuth app for Better Auth, because switching the URL breaks Supabase GitHub sign-in at that moment. | Phase 4 (auth) |
| D21 | Decommission timing | At least **30 days** after the auth flip with no rollback, plus the checks in phase 6. Every destructive step stays manual. | Phase 6 |

---

## Tools ([local])

- `psql` **17**. It understands `sslrootcert=system` and `sslnegotiation=direct`. On Windows, install the PostgreSQL 17 client.
- `pscale` CLI: `pscale auth login`.
- `wrangler` (repo version), `vercel` CLI, Node 22.
- The cutover scripts need `pg`, which isn't a root dependency: `PS_TOOLS_DIR=E:/tmp/ps-db-deps` (or any folder with `node_modules/pg`).
- Shell variables (never commit them): `SUPABASE_DB_URL` (direct, `?sslrootcert=<path to Supabase prod-ca-2021.crt>` from Supabase → Database Settings → SSL) and `PLANETSCALE_DIRECT_URL` (default role, port 5432). The scripts also accept `SOURCE_DATABASE_URL` / `TARGET_DATABASE_URL`.

Scripts (all in `database/planetscale/scripts/`; each takes `--help`):

| Script | Does | Writes |
|---|---|---|
| `assess-cutover.mjs` | source pre-flight: sizes and bloat, replication blockers, sequences, extensions vs PlanetScale, large objects, unlogged and matviews, cron jobs and failures, slots, Supabase-only schemas, Storage, role settings, copy size. Exit 2 if there are blockers. | nothing (read-only session) |
| `sync-sequences.mjs` | sets each target sequence to source + margin, and never moves one backwards | target, only with `--apply` |
| `monitor-replication.mjs` | subscription state, per-table sync state, slot lag, row counts; `--watch`, `--check` (exit 3 unless READY) | nothing (both sessions read-only) |
| `egress-gate.mjs` | QueryEvent NDJSON / Insights CSV → bytes per route and table, monthly projection, PASS/FAIL | nothing (no database) |
| `import-supabase-users.ts` (auth agent) | Supabase Auth → Better Auth tables, idempotent, `--dry-run` | target |

Tests: `E:/tmp/ps-db-deps/node_modules/.bin/vitest run --root database/planetscale/scripts assess-cutover.test.mjs sync-sequences.test.mjs monitor-replication.test.mjs egress-gate.test.mjs`. They run against an embedded PostgreSQL 17 with `wal_level=logical`, using real logical replication between two databases (`PS_CUTOVER_PG_BIN` or `PS_CUTOVER_TEST_DATABASE_URL` to override).

---

## Phase 0: Sign up and create the database

1. **Sign up** at planetscale.com, create the organisation, and add a payment method (PS-20 is a paid size).
2. **Create the database** in the dashboard (recommended; the CLI's slugs for size and region are below but unverified):
   - New database → engine **Postgres** → name `phaseo`.
   - Region **AWS eu-west-2 (London)**, the same region as Supabase prod.
   - Cluster size **PS-20** (or PS-40 for the copy, D16), **single node** (no replicas). Architecture: either, at the same London price; PlanetScale's import guide suggests aarch64.
   - Storage: network-attached, minimum disk **≥ 12 GB** (150% of the 7.4 GB source, per PlanetScale's guide; the live copy will be smaller, see Appendix E). Leave autoscaling on.
   - PostgreSQL major version **17** (prod is 17.6). Don't take 18 for this cutover.

   CLI equivalent. Check the slugs first with `pscale size cluster list --engine postgresql` and `pscale region list`:
   ```sh
   pscale database create phaseo --engine postgresql --region aws-eu-west-2 --cluster-size PS_20 \
     --major-version 17 --min-storage 12884901888 --wait
   ```
3. **Default role.** From **Connect**, or `pscale role default phaseo main`, take the host, the branch id and the default role's credentials. Store them in the password manager only. Build `PLANETSCALE_DIRECT_URL`:
   `postgresql://postgres.<branch_id>:<pw>@<host>:5432/postgres?sslmode=verify-full&sslrootcert=system&sslnegotiation=direct`
4. **Extensions** (Clusters → branch `main` → **Extensions**): enable **pg_cron** (`cron.database_name = postgres`, `cron.max_running_jobs = 4`; the default of 1 would serialise three every-minute jobs, and Supabase already sees `job startup timeout`s) and **pg_stat_statements**. Click **Queue extension changes**.
5. **Parameters** (Clusters → **Parameters**; queue them with the extensions so there's a single restart):
   - `max_worker_processes` ≥ **10** (PlanetScale's import guide; pg_cron jobs and replication workers share it)
   - `max_logical_replication_workers` ≥ 6, `max_sync_workers_per_subscription` = 4
   - `max_replication_slots` ≥ 4 and `max_wal_senders` ≥ 4 (the reverse path in phase 4 needs a slot on PlanetScale)
   - `wal_level` = **logical**: check `pscale branch parameters list phaseo main`. The reverse replication needs it, and changing it later means another restart.

   Click **Apply changes**. The restart happens now, while nothing depends on the database.
6. **Backups:** keep the default schedule (every 12 h, kept 2 days, with PITR). Before phase 4, add a daily schedule with ≥ 14-day retention (it may cost extra; 2× disk is included).
7. Don't set IP restrictions: Vercel and Workers egress IPs aren't fixed.

**Rollback:** delete the PlanetScale database (OWNER; nothing else depends on it yet).

---

## Phase 1: Settings, roles, extensions, schema

All steps `[PS]` as the default role over `PLANETSCALE_DIRECT_URL` (port 5432).

1.1 **Connect and check:**
```sh
psql "$PLANETSCALE_DIRECT_URL" -c "select version(), current_user, current_setting('TimeZone'), current_setting('wal_level'), current_setting('max_connections')"
```

1.2 **Database settings and checks:**
```sql
ALTER DATABASE postgres SET timezone TO 'UTC';                          -- must be UTC (partition bounds, timestamptz text)
ALTER ROLE CURRENT_USER SET pg_strict.require_where_on_delete = 'off';  -- D4: the owner/cron role
ALTER ROLE CURRENT_USER SET pg_strict.require_where_on_update = 'off';
-- reconnect, then:
show timezone;                                   -- UTC
show pg_strict.require_where_on_delete;          -- off for this role
select datlocprovider, datcollate, datlocale from pg_database where datname = current_database();   -- D8
select rolname, rolbypassrls, rolcreaterole, rolreplication from pg_roles where rolname = current_user;
select nspowner::regrole as public_owner from pg_namespace where nspname = 'public';
select datdba::regrole as db_owner from pg_database where datname = current_database();
```
If `ALTER ROLE CURRENT_USER` is refused for the default role, set the pg_strict mode for the default role in the dashboard's role settings instead.

1.3 **Probe D7** (changes nothing):
```sql
begin;
comment on schema public is 'probe';
revoke create on schema public from public;
grant usage on schema public to pg_database_owner;
rollback;
```
If this errors, resolve D7 before 1.4.

1.4 **Apply 0000 → 0002** (each file in its own transaction; stop at the first error):
```sh
for f in 0000_platform 0001_auth 0002_baseline; do
  psql "$PLANETSCALE_DIRECT_URL" --single-transaction -v ON_ERROR_STOP=1 -f "database/planetscale/migrations/$f.sql" || break
done
```
Expected warnings: `ensure_rls` skipped (D3), and possibly optional-extension notes. hypopg is preinstalled by PlanetScale, and 0000 leaves it in whatever schema it is in. If `CREATE EXTENSION moddatetime` fails for lack of privilege, contact PlanetScale support: `public.users` has a moddatetime trigger. 0001 isn't idempotent, so run it once (or drop and recreate the scratch objects; OWNER).

1.5 **Verify roles and the schema:**
```sql
select rolname, rolbypassrls, rolcanlogin from pg_roles where rolname in ('anon','authenticated','service_role');  -- service_role: bypassrls = t (D2)
select count(*) from pg_tables where schemaname in ('public','private','catalogue_private');
select count(*) from pg_policies;              -- 370 (SCHEMA-PORT)
```
For a deeper check, `node database/planetscale/scripts/verify-baseline.mjs` runs the same checks against a local cluster.

1.6 **Partitions before any data** (D9):
```sql
select public.ensure_gateway_requests_partitions(2);
```
Then run Appendix C on `[SB]` and apply its output on `[PS]`, so every prod partition (through 2026_12 today) exists.

1.7 **App roles** (D1). Generate the passwords locally (`openssl rand -base64 36 | tr -d '/+='`) and store them in the password manager:
```sql
CREATE ROLE phaseo_app WITH LOGIN BYPASSRLS PASSWORD '<pw>' CONNECTION LIMIT 150;
GRANT service_role TO phaseo_app WITH INHERIT TRUE, SET TRUE;            -- service path runs as the login role
GRANT anon, authenticated TO phaseo_app WITH INHERIT FALSE, SET TRUE;    -- user path: SET LOCAL ROLE
GRANT USAGE ON SCHEMA auth TO phaseo_app;                                -- Better Auth's tables
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA auth TO phaseo_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA auth GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO phaseo_app;
-- Same limits PostgREST applies today (authenticator/authenticated: 8s/8s), plus the pg_strict rule safeupdate enforces:
ALTER ROLE phaseo_app SET statement_timeout = '8s';
ALTER ROLE phaseo_app SET lock_timeout = '8s';
ALTER ROLE phaseo_app SET idle_in_transaction_session_timeout = '30s';
ALTER ROLE phaseo_app SET timezone = 'UTC';
ALTER ROLE phaseo_app SET pg_strict.require_where_on_delete = 'on';
ALTER ROLE phaseo_app SET pg_strict.require_where_on_update = 'on';

-- Cached catalogue reads (Hyperdrive phaseo-planetscale-catalogue) and the phase 3 shadow run: read-only twins.
CREATE ROLE phaseo_catalogue WITH LOGIN BYPASSRLS PASSWORD '<pw2>' CONNECTION LIMIT 20;
CREATE ROLE phaseo_shadow    WITH LOGIN BYPASSRLS PASSWORD '<pw3>' CONNECTION LIMIT 40;
GRANT service_role TO phaseo_catalogue, phaseo_shadow WITH INHERIT TRUE, SET TRUE;
GRANT anon, authenticated TO phaseo_catalogue, phaseo_shadow WITH INHERIT FALSE, SET TRUE;
GRANT USAGE ON SCHEMA auth TO phaseo_shadow;
GRANT SELECT ON ALL TABLES IN SCHEMA auth TO phaseo_shadow;
ALTER ROLE phaseo_catalogue SET default_transaction_read_only = on;
ALTER ROLE phaseo_shadow    SET default_transaction_read_only = on;
ALTER ROLE phaseo_catalogue SET statement_timeout = '8s';
ALTER ROLE phaseo_shadow    SET statement_timeout = '8s';
```
Role settings apply at login, and both PgBouncer and Hyperdrive log in per server connection, so the timeouts hold for pooled traffic. `SET LOCAL ROLE authenticated` doesn't apply `authenticated`'s own settings, which is why they are on the login role.

Verify:
```sql
select m.member::regrole, m.roleid::regrole, m.inherit_option, m.set_option
  from pg_auth_members m where m.member::regrole::text like 'phaseo_%' order by 1, 2;
```
Then test through PgBouncer as the app role. Whether SQL-created roles can log in through PlanetScale's PgBouncer is unverified, so test it now. If they can't, create them from the dashboard (Settings → Roles → New role) instead and apply the `ALTER ROLE` / `GRANT` lines to them.
```sh
psql "postgresql://phaseo_app.<branch_id>:<pw>@<host>:6432/postgres?sslmode=verify-full&sslrootcert=system" <<'SQL'
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000000","role":"authenticated"}', true), set_config('role', 'authenticated', true);
select auth.uid(), current_user, current_setting('statement_timeout');
select count(*) from public.keys;   -- RLS applies: 0 rows for a nobody
rollback;
SQL
```

1.8 **Cron (0003)**: apply it with every job **inactive**, in the same transaction, so nothing runs against replicated tables before cutover:
```sh
psql "$PLANETSCALE_DIRECT_URL" --single-transaction -v ON_ERROR_STOP=1 \
  -f database/planetscale/migrations/0003_cron.sql \
  -c "select cron.alter_job(jobid, active := false) from cron.job"
psql "$PLANETSCALE_DIRECT_URL" -c "select jobname, schedule, active, username, database from cron.job order by 1"   # 8 rows, all active = f
```

1.9 **Workers prerequisite:** the app owners deploy `nodejs_compat` on every `apps/api` config (ENV.md) as a standalone change, and confirm it is healthy for a day.

1.10 **Hyperdrive configs** `[CF]`: create `phaseo-planetscale`, `phaseo-planetscale-catalogue` and `phaseo-planetscale-shadow` (commands in `hyperdrive-bindings.example.toml`). Creation fails if the credentials don't work, which is a free connectivity test.

1.11 **Auth import dry run:**
```sh
pnpm --filter @phaseo/web exec tsx ../../database/planetscale/scripts/import-supabase-users.ts --from-supabase --dry-run
```
Expect about 183 users, OAuth accounts (google 137, github 15, gitlab 1), and 1 MFA user flagged for re-enrolment.

**Rollback:** nothing on Supabase changed. To start over, drop and recreate the PlanetScale database (OWNER).

---

## Phase 2: Data copy (logical replication, Supabase → PlanetScale)

**Prerequisites:** D11 is merged and applied on Supabase, D12 is enabled, and D17 (schema freeze) has started.

2.1 **Assess the source** `[local → SB, read-only]`:
```sh
node database/planetscale/scripts/assess-cutover.mjs --deep-max-rows 0      # quick: no table scans
node database/planetscale/scripts/assess-cutover.mjs --json > assess.json   # off-peak: also measures live bytes (scans v2_request_routing_decisions' 1.95 GB heap)
```
Exit code 0 is required (no blockers). Review the warnings: extensions (`pg_net`, `index_advisor` and `supabase_vault` are expected and handled), the `cron` failures above, and schemas not copied (`auth` is imported, `vault`/`storage`/`realtime`/`net`/`cron`/`supabase_migrations` stay behind).

2.2 **Import the users first** `[PS]`, so foreign keys to `auth.users` resolve:
```sh
pnpm --filter @phaseo/web exec tsx ../../database/planetscale/scripts/import-supabase-users.ts --from-supabase
```
It's idempotent and is re-run in phase 4.

2.3 **Publication on Supabase** `[SB]`, as `postgres` over `SUPABASE_DB_URL`. OWNER: this creates a publication object on prod and changes no data. Check that every table is owned by the connecting role (publishing a table requires ownership):
```sql
select n.nspname, c.relname, c.relowner::regrole
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname in ('public','private','catalogue_private') and c.relkind in ('r','p')
   and c.relowner <> (select oid from pg_roles where rolname = current_user);   -- expect 0 rows
```
Create it. Partitioned tables are published through their root, so rows land in whatever partitions the target has:
```sql
select format('CREATE PUBLICATION replicate_to_planetscale FOR TABLE %s WITH (publish_via_partition_root = true)',
              string_agg(format('%I.%I', n.nspname, c.relname), ', ' order by n.nspname, c.relname))
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname in ('public','private','catalogue_private') and c.relkind in ('r','p') and not c.relispartition
\gexec
select count(*) from pg_publication_tables where pubname = 'replicate_to_planetscale';
```
Supabase's `postgres` role already has `statement_timeout=0`, as PlanetScale's guide requires, so no change is needed.

2.4 **Subscription on PlanetScale** `[PS]`, as the default role. It has BYPASSRLS, which is required because RLS is enabled on every table. The connection uses `sslmode=require`: the PlanetScale server can't read a local CA file. The password is stored in `pg_subscription`, which only the owner can read.
```sql
CREATE SUBSCRIPTION replicate_from_supabase
  CONNECTION 'host=db.xansbgjaduxypzsmjwct.supabase.co port=5432 dbname=postgres user=postgres password=<supabase-db-password> sslmode=require'
  PUBLICATION replicate_to_planetscale
  WITH (copy_data = true, binary = true, streaming = on);
```
This creates the slot `replicate_from_supabase` on Supabase. Rows arrive with `session_replication_role = replica`, so user triggers (including the signup trigger) and foreign-key checks don't fire on PlanetScale. That is correct for copied data.

2.5 **Monitor** `[local, read-only on both]`:
```sh
SOURCE_DATABASE_URL="$SUPABASE_DB_URL" TARGET_DATABASE_URL="$PLANETSCALE_DIRECT_URL" \
  node database/planetscale/scripts/monitor-replication.mjs --watch 60
```
It shows the state per table (queued → copying → catching up → ready), the slot lag and the WAL retained on Supabase. Troubleshooting, from PlanetScale's guide:
- No workers on PlanetScale: `select pid, backend_type, state from pg_stat_activity where backend_type like '%worker%';`. If none, check `max_worker_processes`.
- A table stuck in `copying`: `select pid, wait_event_type, wait_event, query from pg_stat_activity where wait_event is not null and backend_type like '%worker%';`
- Errors: `select * from pg_stat_subscription_stats;`, then the PlanetScale logs.
- The Supabase slot's `wal_status` going `extended` → `unreserved` means the subscriber is behind by close to 2 GB (~2 weeks at today's WAL rate). Act before it becomes `lost`, or the copy has to restart (and dropping and recreating needs OWNER approval).

2.6 **Verify once every table is `ready`:**
- `monitor-replication.mjs --counts exact --exact-max-rows 2000000`. Under live writes, small differences on hot tables are normal; a table that differs by a lot is not.
- Appendix A (orphans on `auth.users`) must be 0. If it isn't, users signed up after 2.2: re-run the import, which is idempotent.
- Appendix B checksums for `keys`, `wallets`, `credit_ledger`, `v2_credit_ledger`, `management_keys`, `workspaces` and `credit_grants`, taken at a quiet minute on both sides.
- `[PS]`: run `ANALYZE;` (fresh statistics before the shadow run) and `select pg_size_pretty(pg_database_size(current_database()));`. Expect well under the source's 7.4 GB.
- `[PS]`: `select pg_size_pretty(pg_total_relation_size('public.v2_request_routing_decisions'));` should be a few MB at most.
- D16: resize to PS-20 now if the copy ran on a bigger size.

Replication keeps running until phase 4. Check it daily.

**Rollback (phase 2):** stop the copy without touching Supabase data:
1. `[PS]` `ALTER SUBSCRIPTION replicate_from_supabase DISABLE;`
2. OWNER, destructive (removes the slot on Supabase; this is the step that frees its WAL): `[PS]` `DROP SUBSCRIPTION replicate_from_supabase;`
3. OWNER: `[SB]` `DROP PUBLICATION replicate_to_planetscale;`
Never leave a slot without a subscriber on Supabase: it holds up to 2 GB of WAL on Supabase's disk.

---

## Phase 3: Shadow run and egress gate

Goal: measure what the apps will read from PlanetScale before any production traffic moves, and measure it per route.

3.1 **Baseline from Supabase** (no setup): Supabase dashboard → Organization → Usage, egress for this project over the last 30 days. Whether it's broken down by service (database vs auth vs storage) is unverified. PostgREST returns the same JSON the compat client builds, so database egress there is a fair first estimate. If it's well under 80 GB/month, the gate will very likely pass.

3.2 **Shadow environment.** It's read-only by construction (`phaseo_shadow` has `default_transaction_read_only = on`), so it can't diverge from replication:
- `[CF]` web-api `env.staging` and `wrangler.staging.toml` (gateway) bind `HYPERDRIVE` → `phaseo-planetscale-shadow`, with `DATABASE_PROVIDER=planetscale` and `AUTH_PROVIDER=supabase`.
- `[VC]` A Preview deployment of a `cutover-shadow` branch with Preview-scoped env: `DATABASE_PROVIDER=planetscale`, `AUTH_PROVIDER=supabase`, `PLANETSCALE_DATABASE_URL=postgresql://phaseo_shadow.<branch_id>:<pw>@<host>:6432/postgres`. Previews are protected, so use the bypass token for the crawler.
- Writes fail with SQLSTATE 25006 in shadow. That's expected, and their response bytes are negligible. For a write-inclusive gateway test, restore the latest PlanetScale backup to a new branch and point staging at it with a read-write role (it costs a development branch).

3.3 **Collect QueryEvents.** The app owners wire `onQuery` to log one JSON line per query:
`onQuery: (e) => console.log(JSON.stringify({ msg: "db.query", ts: Date.now(), requestId, ...e }))`
- Workers: `wrangler tail phaseo-web-api --env staging --format json > web-api.ndjson` (and the same for `phaseo-gateway-staging`). egress-gate reads `wrangler tail` lines directly.
- Vercel: a log drain, or `vercel logs <deployment-url> --json > web.ndjson` (it reads a JSON string in `message`).

3.4 **Traffic.** Drive realistic traffic for a fixed window (e.g. 2 h):
- web: a Playwright crawl of the top routes by production page views (Vercel Analytics, last 30 days), weighted by those views.
- web-api / gateway: the same calls the web makes, plus the gateway's read endpoints (`/v1/models`, provider lists) with a staging key.
- While it runs, Query Insights shows bytes returned per query pattern. Tags appear only for notable queries, so QueryEvent is the per-route source and Insights is the cross-check.

3.5 **Run the gate:**
```sh
node database/planetscale/scripts/egress-gate.mjs \
  --events web.ndjson --events web-api.ndjson --events gateway.ndjson \
  --volumes volumes.json          # {"web /models": 410000, "web-api /api/_web/models": 900000, "gateway /v1/chat/completions": 12000000}
# optional cross-check from Insights over the same window:
node database/planetscale/scripts/egress-gate.mjs --insights insights.csv --insights-window-hours 2
```
`volumes.json` holds production requests per month for each `"<app> <route>"`, from Vercel Analytics and Cloudflare Workers analytics. Routes not listed are projected from the window (`--scale` if the shadow traffic was a known fraction of production). See the script header for the assumed Insights CSV columns (`bytes returned`, `count`, `tags`/`query`). PlanetScale has no CSV export, so the CSV is built by hand or through the PlanetScale MCP server.

3.6 **Gate:** PASS = projected ≤ 80 GB/month (D15), exit 0. On FAIL, work through "Large single results" and "By route" from the top:
- Paginate, or select fewer columns. The August monitor catalogue query was ~3.55 MB per call.
- Move public catalogue reads to `HYPERDRIVE_CATALOGUE`: cache hits don't reach PlanetScale. QueryEvent still counts them, so the projection is conservative.
- Cache at the edge (web-api already uses the Workers Cache for public responses).

Then re-run.

3.7 **Functional checks in shadow:** zero `PHASEO_DB_UNSUPPORTED` (501) responses in the logs; error rates and p95 latency comparable to Supabase; the D8 ordering diff for the two monitor RPCs; Hyperdrive connection counts within D10.

**Rollback (phase 3):** revert the preview and staging env vars and bindings to Supabase, then `[PS]` `ALTER ROLE phaseo_shadow NOLOGIN;` (reversible). Nothing in production changed.

---

## Phase 4: Cutover (rolling, bidirectional)

Pick a low-traffic hour and announce it. Expect the data flip to take about an hour and the auth flip about 30 minutes; they can be on different days. Keep `monitor-replication.mjs --watch 30` running for **both** directions in two terminals throughout.

### 4.0 Go / no-go

- [ ] Forward replication READY: `monitor-replication.mjs --check` exits 0, with no apply or sync errors since phase 2.
- [ ] Egress gate PASS (or the owner accepts the projected overage, D15).
- [ ] Shadow functional checks green (3.7). `nodejs_compat` has been live on all gateway configs for ≥ 1 day.
- [ ] D1–D4, D7–D11, D14 and D18 decided. For the auth flip also D13, D19 and D20, with the OAuth redirect URIs registered.
- [ ] `[PS]` manual backup taken (Backups → Create new backup). Supabase's latest daily backup exists.
- [ ] Rollback commands for this phase are at hand (phase 5), including the previous Worker version ids (`wrangler deployments list`) and the current Vercel production deployment.

### 4.1 Prepare the reverse path, before any app writes to PlanetScale

Apps will write to PlanetScale from 4.4 on, so the PlanetScale → Supabase slot must exist **before** that. Otherwise the first writes would never reach Supabase. `origin = none` on both subscriptions stops changes from looping (PostgreSQL 16+; both sides run 17).

```sql
-- [PS] forward subscription: from now on, only take changes that originated on Supabase
ALTER SUBSCRIPTION replicate_from_supabase SET (origin = none);

-- [PS] publication of the same tables (auth.* is NOT published: Supabase's auth schema is GoTrue's)
select format('CREATE PUBLICATION replicate_to_supabase FOR TABLE %s WITH (publish_via_partition_root = true)',
              string_agg(format('%I.%I', n.nspname, c.relname), ', ' order by n.nspname, c.relname))
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname in ('public','private','catalogue_private') and c.relkind in ('r','p') and not c.relispartition
\gexec
select pg_create_logical_replication_slot('replicate_from_planetscale', 'pgoutput');
```
```sql
-- [SB] OWNER: a subscription on prod. It copies no data (copy_data = false) and only applies changes made on PlanetScale.
CREATE SUBSCRIPTION replicate_from_planetscale
  CONNECTION 'host=<ps-host> port=5432 dbname=postgres user=postgres.<branch_id> password=<ps-default-role-password> sslmode=require'
  PUBLICATION replicate_to_supabase
  WITH (copy_data = false, create_slot = false, slot_name = 'replicate_from_planetscale', origin = none, streaming = on);
```
Check both directions:
```sh
node database/planetscale/scripts/monitor-replication.mjs --source "$PLANETSCALE_DIRECT_URL" --target "$SUPABASE_DB_URL" \
  --subscription replicate_from_planetscale --publication replicate_to_supabase --slot replicate_from_planetscale --counts none
```
Supabase's `postgres` role has BYPASSRLS and `pg_create_subscription` (verified), which the apply worker needs on RLS tables.

### 4.2 Users and sequences

```sh
pnpm --filter @phaseo/web exec tsx ../../database/planetscale/scripts/import-supabase-users.ts --from-supabase   # catch up new signups
SOURCE_DATABASE_URL="$SUPABASE_DB_URL" TARGET_DATABASE_URL="$PLANETSCALE_DIRECT_URL" \
  node database/planetscale/scripts/sync-sequences.mjs --margin 1000000            # dry run: read the plan
SOURCE_DATABASE_URL="$SUPABASE_DB_URL" TARGET_DATABASE_URL="$PLANETSCALE_DIRECT_URL" \
  node database/planetscale/scripts/sync-sequences.mjs --margin 1000000 --apply    # [PS] write
```
PlanetScale's sequences now sit 1,000,000 ahead. While both sides take writes, serial ids can't collide until Supabase has issued a million new ids, which is far more than the overlap window. Appendix A must report 0 orphans.

### 4.3 Order and timing

The order is **web-api → gateway → (cron switch) → web → slack**, with about 10 minutes of watching after each step. During the overlap, each app reads its own side, and bidirectional replication carries writes across in about a second. A brief stale read across apps is the accepted cost; an example is a key created in web-api that is invisible to the gateway for a moment.

### 4.4 web-api `[CF]`

Set `DATABASE_PROVIDER = "planetscale"` (`AUTH_PROVIDER` stays `supabase`) and the `[[hyperdrive]] HYPERDRIVE` binding in `apps/web-api/wrangler.toml` (production `[vars]` only; `env.staging` already points at shadow), then deploy:
```sh
cd apps/web-api && npx wrangler deploy
```
Check: sign in on phaseo.app (Supabase session); the Settings, Keys and Usage pages load; create and revoke a test key; Insights shows `app='web-api'` tags; no `PHASEO_DB_UNSUPPORTED`; error rate flat; the reverse subscription applies the test key to Supabase (`select ... from public.keys` on `[SB]`).

### 4.5 Gateway `[CF]`

Do all six configs in one go, in this order: `wrangler.staging.toml` (switch the binding from shadow to `phaseo-planetscale`), `wrangler.jobs.toml`, `wrangler.realtime.toml`, `wrangler.eu.toml`, `wrangler.us.toml`, then `wrangler.toml`:
```sh
cd apps/api && for c in wrangler.staging.toml wrangler.jobs.toml wrangler.realtime.toml wrangler.eu.toml wrangler.us.toml wrangler.toml; do npx wrangler deploy -c "$c" || break; done
```
Check: a real chat completion with a test key; the request row and credit charge exist on `[PS]` and appear on `[SB]` via reverse replication; spend-limit Durable Object decisions are normal; and Supabase's write rate drops (`select sum(n_tup_ins + n_tup_upd + n_tup_del) from pg_stat_user_tables;` twice, 5 minutes apart).

### 4.6 Cron switch, right after the gateway

Save the list first, because rollback re-activates exactly these:
```sql
-- [SB] OWNER: deactivate (reversible; this deletes nothing). Save the output.
select jobid, jobname from cron.job where active;
select cron.alter_job(jobid, active := false) from cron.job where active;
-- [PS]
select cron.alter_job(jobid, active := true) from cron.job;
select jobname, active from cron.job order by 1;
```
After 15 minutes, `select jobname, status, count(*) from cron.job_run_details where start_time > now() - interval '15 minutes' group by 1, 2;` on `[PS]` should show successes. `refresh-public-monitor-weekly-usage` proves D4.

### 4.7 web `[VC]`

Production env: `DATABASE_PROVIDER=planetscale`, `PLANETSCALE_DATABASE_URL` (the `phaseo_app` role on 6432), `WEB_DATABASE_POOL_MAX=1`. Keep `AUTH_PROVIDER` unset (supabase). Then redeploy production (`vercel --prod`, or redeploy the current production deployment so the env change applies).

Check: the public pages (models, providers, monitor, compare), the dashboard, a Stripe checkout webhook in test mode if available, and the web app's error rate.

### 4.8 slack (D18)

Flip it if it has been ported; otherwise pause it now (its Supabase writes would still replicate until 4.10, but not after).

### 4.9 Auth flip (same window or a later day)

1. Prerequisites: D13 builds released or the transition plan agreed; D19 and D20 done; `BETTER_AUTH_*`, `PASSKEY_RP_ID=phaseo.app` and `AUTH_EMAIL_FROM` set in Vercel Production (ENV.md).
2. `[SB]` OWNER: disable new signups in Supabase Auth (dashboard → Authentication → Sign In / Providers → "Allow new users to sign up" off). This is reversible.
3. Re-run `import-supabase-users.ts --from-supabase`. `auth.sessions` is still empty, so `--allow-live` isn't needed.
4. `[VC]` set `AUTH_PROVIDER=better-auth` on web and redeploy. Users sign in again, because Supabase sessions don't carry over.
5. `[CF]` set `AUTH_PROVIDER = "better-auth"` and `BETTER_AUTH_JWT_ISSUER = "https://phaseo.app"` on web-api and on all six gateway configs, then deploy in the same order as 4.4 and 4.5. Web goes first because the Workers need its JWKS (`https://phaseo.app/api/auth/jwks`).
6. Check: password sign-in for an imported user (bcrypt is verified, then rehashed with scrypt); Google, GitHub and GitLab sign-in; a passkey sign-in; the MFA user is asked to re-enrol; a new signup (creates `public.users` via the trigger and sends the Discord message); OAuth-based CLI login; API calls carrying a Better Auth JWT.

### 4.10 Stop forward replication, once Supabase has no app writers

Confirm with the write-rate query in 4.5 (only reverse-applied changes remain) and forward lag 0. Then:
```sql
-- [PS] keep it (disabled), don't drop it: it costs nothing on PlanetScale. Dropping it is a phase 6 decision.
ALTER SUBSCRIPTION replicate_from_supabase DISABLE;
```
The Supabase slot `replicate_from_supabase` now only accumulates WAL until its 2 GB cap invalidates it. That is harmless; drop it in phase 6.

### 4.11 After cutover

- Reverse replication is the safety net. Check it daily: `monitor-replication.mjs --source "$PLANETSCALE_DIRECT_URL" --target "$SUPABASE_DB_URL" --subscription replicate_from_planetscale --publication replicate_to_supabase --counts exact --exact-max-rows 1000000`. Exact counts should match at quiet moments, because Supabase receives every write.
- `[PS]` manual backup, and a longer retention schedule (phase 0.6).
- Watch the PlanetScale billing page for actual egress against the phase 3 projection over the first week.
- `[local]` re-run `egress-gate.mjs` on a day of production QueryEvents.

---

## Phase 5: Rollback

| From | What to do |
|---|---|
| Phases 0–1 | Nothing in production changed. Delete or keep the PlanetScale database (OWNER). |
| Phase 2 | See the rollback at the end of phase 2: disable, then drop the subscription (OWNER), then drop the publication on Supabase (OWNER). REPLICA IDENTITY FULL (D11) can stay; it's harmless. |
| Phase 3 | See the rollback at the end of phase 3. |
| Phase 4, some apps flipped | Reverse replication is live, so Supabase already has the PlanetScale writes. **Wait until the reverse lag is 0**, then, in reverse order: flip each app back (`DATABASE_PROVIDER=supabase`). For Workers, `npx wrangler rollback <previous-version-id>` (instant) or a redeploy with the old vars; for Vercel, Instant Rollback to the previous production deployment, or the env change and a redeploy. Cron: re-activate the saved Supabase job ids (`select cron.alter_job(<id>, active := true)` on `[SB]`) and deactivate them all on `[PS]`. Sequences, OWNER (writes Supabase): `sync-sequences.mjs --source "$PLANETSCALE_DIRECT_URL" --target "$SUPABASE_DB_URL" --margin 1000000 --apply`. If the forward subscription was already disabled (4.10), re-enable it (`ALTER SUBSCRIPTION replicate_from_supabase ENABLE`) only if its slot still exists; otherwise PlanetScale must be rebuilt from scratch (phase 2) before any later attempt. |
| Auth flip (4.9) | `AUTH_PROVIDER=supabase` on the Workers first, then web. Re-enable Supabase signups. Users created under Better Auth since the flip don't exist in GoTrue. List them on `[PS]` (`select id, email, created_at from auth.users where created_at > '<flip time>'`). The owner then either recreates them through the Supabase Admin API with the same id (`id` support in `auth.admin.createUser` is unverified) or asks them to sign up again. Their `public.*` rows already reached Supabase via reverse replication; apply doesn't check foreign keys, so those rows point at missing `auth.users` until then. Passwords changed under Better Auth (scrypt) can't move to GoTrue, so those users reset their password. Everyone signs in again. |
| Days later (forward disabled) | Same as "Phase 4, some apps flipped". It works for as long as reverse replication is healthy, which is why it's checked daily. If the reverse subscription stopped on an error: fix the cause and `ENABLE` it again (the slot on PlanetScale kept the changes). As a last resort, skip the failing transaction with `ALTER SUBSCRIPTION ... SKIP (lsn = ...)` (the privileges it needs on Supabase are unverified). |

A subscription stuck on an apply error, in either direction, stops all replication through it. `monitor-replication.mjs` shows the error counts. The usual cause during the overlap is the same unique key inserted on both sides. Remove the losing duplicate by hand (OWNER, it's a DELETE), and the apply worker resumes on its own.

---

## Phase 6: Steady state and Supabase decommission (owner decision; nothing here is automatic)

Proceed only when all of these hold (D21):
- [ ] ≥ 30 days since the auth flip with no rollback; reverse replication healthy throughout.
- [ ] Old mobile and desktop builds are below an agreed share of sessions (D13), or a forced update is in place.
- [ ] One PlanetScale restore test done: Backups → Restore to new branch, then run `monitor-replication.mjs --counts exact`-style counts against it, then delete the test branch (OWNER).
- [ ] Actual PlanetScale egress over a full billing period is within plan (D15).
- [ ] `apps/slack` and `apps/desktop` are off Supabase (D18).

Then, each step separately confirmed by the owner (**all destructive**):
1. Final export of Supabase: `pg_dump -Fc "$SUPABASE_DB_URL" -f phaseo-supabase-final.dump` (plus `--schema=auth` for GoTrue history). Store it encrypted in cold storage (R2) with a retention date.
2. `[SB]` `DROP SUBSCRIPTION replicate_from_planetscale;` and `[PS]` `DROP PUBLICATION replicate_to_supabase;` plus `select pg_drop_replication_slot('replicate_from_planetscale');`
3. `[PS]` `ALTER SUBSCRIPTION replicate_from_supabase SET (slot_name = NONE); DROP SUBSCRIPTION replicate_from_supabase;`, then `[SB]` `select pg_drop_replication_slot('replicate_from_supabase');` (if it still exists) and `DROP PUBLICATION replicate_to_planetscale;`
4. `[PS]` `DROP ROLE phaseo_shadow;` and `[CF]` delete the shadow Hyperdrive config.
5. Remove the `SUPABASE_*` env vars, the Supabase code paths and the `supabase` options of the two switches (code PRs).
6. Disable the Supabase IPv4 add-on; remove Supabase's OAuth redirect URIs; then pause the Supabase project. Deleting the project is a final, separate decision.

---

## Appendix A: orphan check on `auth.users` foreign keys (`[PS]`, read-only)

Rows that arrived by replication or COPY skip foreign-key checks. This lists any that point at a user who wasn't imported.
```sql
do $$
declare r record; n bigint;
begin
  for r in
    select con.conrelid::regclass as tbl, a.attname as col
      from pg_constraint con
      join pg_attribute a on a.attrelid = con.conrelid and a.attnum = con.conkey[1]
     where con.contype = 'f' and con.confrelid = 'auth.users'::regclass and cardinality(con.conkey) = 1
       and not exists (select 1 from pg_inherits i where i.inhrelid = con.conrelid)   -- partitions: checked via their parent
  loop
    execute format('select count(*) from %s t where t.%I is not null and not exists (select 1 from auth.users u where u.id = t.%I)', r.tbl, r.col, r.col) into n;
    if n > 0 then raise warning '% orphan row(s) in %.%', n, r.tbl, r.col; end if;
  end loop;
  raise notice 'orphan check done';
end $$;
```

## Appendix B: checksum of a table (run on both sides at a quiet minute; both must be UTC)

```sql
select count(*) as rows, md5(string_agg(md5(t::text), '' order by md5(t::text))) as digest from public.keys t;
```
Use it for small, critical tables only (keys, wallets, credit_ledger, v2_credit_ledger, management_keys, workspaces, credit_grants). It reads the whole table.

## Appendix C: partition parity (generate on `[SB]`, apply the output on `[PS]`)

```sql
select format('CREATE TABLE IF NOT EXISTS public.%I PARTITION OF public.%I %s; ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;',
              c.relname, p.relname, pg_get_expr(c.relpartbound, c.oid), c.relname)
  from pg_inherits i
  join pg_class c on c.oid = i.inhrelid
  join pg_class p on p.oid = i.inhparent
 where p.relnamespace = 'public'::regnamespace and p.relname in ('gateway_requests', 'gateway_upstream_requests')
 order by 1;
```
Then on `[PS]`, give every partition the deny policy that `ensure_gateway_requests_partitions()` adds:
```sql
do $$
declare r record;
begin
  for r in
    select c.relname from pg_inherits i join pg_class c on c.oid = i.inhrelid join pg_class p on p.oid = i.inhparent
     where p.relnamespace = 'public'::regnamespace and p.relname in ('gateway_requests', 'gateway_upstream_requests')
       and not exists (select 1 from pg_policy where polrelid = c.oid and polname = 'deny_direct_client_access')
  loop
    execute format('CREATE POLICY deny_direct_client_access ON public.%I AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)', r.relname);
  end loop;
end $$;
```
Do this before 2.4. A partition created after rows have landed in `_default` for its range fails.

## Appendix D: troubleshooting queries

```sql
-- [PS] per-table sync state
select srrelid::regclass, srsubstate from pg_subscription_rel order by 2, 1;
-- [PS] apply progress
select subname, received_lsn, latest_end_lsn, last_msg_receipt_time from pg_stat_subscription;
-- [SB] current position (caught up when it equals received_lsn)
select pg_current_wal_lsn();
-- either side: slot health
select slot_name, active, wal_status, pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)) as retained from pg_replication_slots;
```

## Appendix E: checking bloat on `v2_request_routing_decisions`

The catalog numbers above already show heap bloat (1.95 GB heap for 72 estimated rows). To measure the live size exactly (one sequential read of the 1.95 GB heap; run it off-peak):
```sql
select count(*) as live_rows,
       pg_size_pretty(sum(pg_column_size(t.*))) as live_bytes,
       pg_size_pretty(pg_relation_size('public.v2_request_routing_decisions')) as heap,
       pg_size_pretty(pg_total_relation_size('public.v2_request_routing_decisions')) as total
  from public.v2_request_routing_decisions t;
```
Or run `assess-cutover.mjs` without `--deep-max-rows 0`: it measures every big table with few rows that way and reports `disk/live`. Nothing needs fixing on Supabase for the cutover, because COPY only reads live rows. A `VACUUM FULL` would shrink it on Supabase but takes an exclusive lock, and isn't needed.
