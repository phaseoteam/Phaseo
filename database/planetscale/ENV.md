# Environment, secrets and bindings for the PlanetScale + Better Auth cutover

This lists every variable, secret and binding each app needs, before and after the cutover. `CUTOVER.md` says when each one changes. Names were checked against the repo on 2026-11-03: `apps/*/wrangler.*`, `apps/*/.dev.vars.example`, `turbo.json` `globalEnv`, `apps/api/src/runtime/env.types.ts`, `apps/web-api/src/env.ts`, `apps/web/src/lib/db/*`, `apps/web/src/lib/auth/better-auth/*`, `apps/mobile/src/lib/config.ts` and `apps/mobile/app.config.ts`.

Legend:
- **Secret**: set it with `vercel env add`, `wrangler secret put` or EAS secrets. Never put it in `wrangler.toml`, `[vars]` or git.
- **Var**: plain configuration, fine in `wrangler.toml` `[vars]` or a Vercel plain env var.
- **Binding**: a Cloudflare resource declared in wrangler config. Its credentials live in the resource, not in the Worker.
- **Proposed**: no app code reads it yet in this branch. The name is a suggestion for the app owners.

## The two switches (every server app)

| Name | Values | Default | Kind | Notes |
|---|---|---|---|---|
| `DATABASE_PROVIDER` | `supabase` \| `planetscale` | `supabase` | Var | Picks the data client at the factory (`apps/web/src/lib/db/providers.ts`, `apps/web-api/src/data/providers.ts`, `apps/api/src/runtime/database.ts`). Unknown values throw. |
| `AUTH_PROVIDER` | `supabase` \| `better-auth` | `supabase` | Var | Picks who issues the user tokens the app accepts. `better-auth` throws unless `DATABASE_PROVIDER=planetscale`. |

Valid combinations: `supabase/supabase` (today), `planetscale/supabase` (shadow, and the first cutover step), and `planetscale/better-auth` (the end state). `supabase/better-auth` is rejected by the code.

## PlanetScale connection strings (shell, for the runbook only)

The scripts in `database/planetscale/scripts/` and the `psql` steps read these from the operator's shell. They are never app config.

| Name | What | Secret |
|---|---|---|
| `SUPABASE_DB_URL` / `SOURCE_DATABASE_URL` | Supabase **direct** connection, `postgresql://postgres:<pw>@db.<ref>.supabase.co:5432/postgres?sslrootcert=<prod-ca-2021.crt>`. The pooler (Supavisor) can't be used for replication or `pg_dump`. | yes |
| `PLANETSCALE_DIRECT_URL` / `TARGET_DATABASE_URL` | PlanetScale **direct** (5432) as the default role: `postgresql://postgres.<branch_id>:<pw>@<host>:5432/postgres?sslmode=verify-full&sslrootcert=system&sslnegotiation=direct`. Used for migrations, imports, sequence sync and replication. | yes |
| `PS_TOOLS_DIR` | Folder with `node_modules/pg` for the cutover scripts. Default on Windows: `E:/tmp/ps-db-deps`. | no |

`import-supabase-users.ts` reads `SUPABASE_DB_URL` and `PLANETSCALE_DIRECT_URL` (or `--target-url`).

## apps/web (Vercel project, Next.js)

| Name | Before | After | Kind | Notes |
|---|---|---|---|---|
| `DATABASE_PROVIDER` | unset (= supabase) | `planetscale` | Var | Server-only. Changing it needs a redeploy. |
| `AUTH_PROVIDER` | unset (= supabase) | `better-auth` | Var | Flip it after `DATABASE_PROVIDER` (phase 4). |
| `PLANETSCALE_DATABASE_URL` | none | `postgresql://phaseo_app.<branch_id>:<pw>@<host>:6432/postgres?sslmode=verify-full` | **Secret** | PgBouncer port 6432. Read by both the data pool (`lib/db/server.ts`) and the Better Auth pool (`lib/auth/better-auth/database.ts`). The `ssl*` parameters are stripped and TLS is always verify-full. |
| `WEB_DATABASE_POOL_MAX` | none | `1` (default) | Var | Data pool size per serverless instance. |
| `AUTH_DATABASE_POOL_MAX` | none | `1` (default) | Var | Better Auth pool size per instance, so each instance holds up to 2 PgBouncer client connections. |
| `BETTER_AUTH_SECRET` | none | 32+ random bytes, base64 | **Secret** | Signs cookies and encrypts. Required in production. Rotating it logs everyone out. |
| `BETTER_AUTH_URL` | none | `https://phaseo.app` | Var | Canonical origin, and the JWT `iss`. Previews use `VERCEL_URL` automatically. |
| `BETTER_AUTH_TRUSTED_ORIGINS` | none | comma list, e.g. `https://www.phaseo.app` | Var | Extra origins beyond the canonical one. |
| `BETTER_AUTH_COOKIE_DOMAIN` | none | `phaseo.app` | Var | Set it only if cookies must be shared with subdomains (the web-api routes run on `phaseo.app` itself). |
| `BETTER_AUTH_GOOGLE_CLIENT_ID` / `_SECRET` | in Supabase Auth dashboard | same Google OAuth client, new redirect URI `https://phaseo.app/api/auth/callback/google` | ID: Var, secret: **Secret** | Add the redirect URI in Google Cloud Console before the auth flip. Both must be set together, or neither. |
| `BETTER_AUTH_GITHUB_CLIENT_ID` / `_SECRET` | in Supabase Auth | GitHub OAuth app, callback `https://phaseo.app/api/auth/callback/github` | as above | A GitHub OAuth app allows only one callback URL. Either create a new app, or switch the URL at the flip, which breaks Supabase GitHub sign-in at that moment. |
| `BETTER_AUTH_GITLAB_CLIENT_ID` / `_SECRET` | in Supabase Auth | GitLab app, callback `https://phaseo.app/api/auth/callback/gitlab` | as above | 1 user. |
| `PASSKEY_RP_ID` | n/a (Supabase used `phaseo.app`) | `phaseo.app` | Var | Must equal Supabase's RP ID, or imported passkeys stop verifying (see `import-supabase-users.ts`). |
| `AUTH_EMAIL_FROM` | Supabase SMTP template | e.g. `Phaseo <support@phaseo.app>` | Var | Falls back to `RESEND_FROM_EMAIL`. |
| `RESEND_API_KEY` | exists | unchanged | **Secret** | Better Auth now sends the verification, reset and magic-link emails. |
| `DISCORD_AUTH_SIGNUP_WEBHOOK_URL` | DB setting `app.settings.discord_signup_webhook_url` (pg_net) | Discord webhook URL | **Secret** | Read by `better-auth/signup.ts`. **Name mismatch:** `turbo.json` `globalEnv` lists `DISCORD_SIGNUP_WEBHOOK_URL`, not this name. Add the new name to `globalEnv`, or rename one of them (decision for the auth owner). |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | set | keep until phase 6 | Var (public) | Still read by `utils/supabase/*` and `lib/db/session.ts` while either switch can roll back. Remove only when Supabase is decommissioned. |
| `SUPABASE_SERVICE_ROLE_KEY` | set | keep until phase 6 | **Secret** | Rollback path. |
| `SUPABASE_FETCH_RETRIES`, `SUPABASE_FETCH_TIMEOUT_MS` | optional | keep until phase 6 | Var | Supabase admin client only. |
| `DATABASE_URL`, `DATABASE_PASSWORD` | in `turbo.json` `globalEnv` | unused by the new code | **Secret** | Leftovers in `globalEnv` (no read found under `apps/web/src`). Don't reuse these names for PlanetScale: `PLANETSCALE_DATABASE_URL` is the contract. |

`turbo.json` `globalEnv` has to gain `DATABASE_PROVIDER`, `AUTH_PROVIDER`, `PLANETSCALE_DATABASE_URL`, `WEB_DATABASE_POOL_MAX`, `AUTH_DATABASE_POOL_MAX`, `BETTER_AUTH_*`, `PASSKEY_RP_ID`, `AUTH_EMAIL_FROM` and `DISCORD_AUTH_SIGNUP_WEBHOOK_URL`, or Turbo's cache will ignore changes to them (that is the app agents' edit, not this file's).

## apps/web-api (Worker `phaseo-web-api`, plus `env.staging` for PR previews)

| Name | Before | After | Kind | Notes |
|---|---|---|---|---|
| `DATABASE_PROVIDER` | unset | `planetscale` | Var | `[vars]` and `[env.staging.vars]` (vars are not inherited). |
| `AUTH_PROVIDER` | unset | `better-auth` (after the web flip) | Var | |
| `HYPERDRIVE` | none | `[[hyperdrive]]` → config `phaseo-planetscale` (caching disabled) | Binding | Required when `DATABASE_PROVIDER=planetscale`. The scope factory throws without it. |
| `HYPERDRIVE_CATALOGUE` | none | `[[hyperdrive]]` → config `phaseo-planetscale-catalogue` (cached) | Binding, **Proposed** | Only for public catalogue reads; see `hyperdrive-bindings.example.toml`. |
| `BETTER_AUTH_JWT_ISSUER` | none | `https://phaseo.app` | Var | Or `BETTER_AUTH_URL`. `requireUser` refuses Better Auth tokens without one. |
| `BETTER_AUTH_JWKS_URL` | none | default `<issuer>/api/auth/jwks` | Var | Set it only to override. |
| `BETTER_AUTH_JWT_AUDIENCE` | none | default `phaseo` | Var | Must match `PHASEO_JWT_AUDIENCE` in `better-auth/options.ts`. |
| `SUPABASE_URL` | `[vars]` | keep until phase 6 | Var | Rollback path. |
| `SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | secrets/vars | keep until phase 6 | Var | |
| `SUPABASE_SERVICE_ROLE_KEY` | secret | keep until phase 6 | **Secret** | |
| compatibility flag `nodejs_compat` | present | present | config | postgres.js needs it. |

Local dev (`.dev.vars` / shell): set `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` (and `..._HYPERDRIVE_CATALOGUE`) to a local Postgres. These env vars take precedence over `localConnectionString` in the config.

## apps/api (gateway Workers)

The same variables apply to every config that runs the gateway code. All six currently set `SUPABASE_URL`: `wrangler.toml` (`phaseo-gateway`), `wrangler.eu.toml` (`phaseo-gateway-eu`), `wrangler.us.toml` (`phaseo-gateway-us`), `wrangler.jobs.toml` (`phaseo-jobs`), `wrangler.realtime.toml` (`phaseo-realtime`) and `wrangler.staging.toml` (`phaseo-gateway-staging`).

| Name | Before | After | Kind | Notes |
|---|---|---|---|---|
| `DATABASE_PROVIDER` | unset | `planetscale` | Var | Read in `src/runtime/database.ts` (what `getSupabaseAdmin()` talks to). |
| `AUTH_PROVIDER` | unset | `better-auth` (after the web flip) | Var | Person tokens (`getSupabaseActor`, OAuth service). API keys are not affected. |
| `HYPERDRIVE` | none | `[[hyperdrive]]` → `phaseo-planetscale` | Binding | In each of the six configs. Staging binds the shadow config during phase 3. |
| `HYPERDRIVE_CATALOGUE` | none | `[[hyperdrive]]` → `phaseo-planetscale-catalogue` | Binding, **Proposed** | |
| `BETTER_AUTH_JWT_ISSUER` / `BETTER_AUTH_URL` / `BETTER_AUTH_JWKS_URL` / `BETTER_AUTH_JWT_AUDIENCE` | none | as for web-api | Var | |
| `SUPABASE_URL` | `[vars]` in all six | keep until phase 6 | Var | |
| `SUPABASE_SERVICE_ROLE_KEY` | secret in all six | keep until phase 6 | **Secret** | |
| compatibility flags | `nodejs_als` (no `nodejs_compat`) | `nodejs_compat` | config | **Required** for postgres.js. Ship it as its own deploy before the cutover. |

## apps/mobile (Expo; values are baked into the build)

The mobile app still talks to Supabase Auth directly (`src/providers/AuthProvider.tsx` uses `supabase.auth.*`). It has no Better Auth client in this branch, and no direct table access (`.from()` is used only on arrays). Its data goes through the web-api and gateway, so `DATABASE_PROVIDER` doesn't apply to it.

| Name | Before | After | Kind | Notes |
|---|---|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | set (or `extra.supabaseUrl`) | keep for old builds; drop from new builds once they use Better Auth | public | Falls back to `NEXT_PUBLIC_SUPABASE_URL` from the web `.env` locally. |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` | set | as above | public | |
| `EXPO_PUBLIC_PHASEO_ORIGIN` | `https://phaseo.app` | unchanged | public | The Better Auth base URL (`<origin>/api/auth`) for the new build. |
| `EXPO_PUBLIC_PHASEO_API_ORIGIN` | set | unchanged | public | |
| `EXPO_PUBLIC_AUTH_PROVIDER` | none | `better-auth` | public, **Proposed** | Only needed if one build has to support both providers. Better: decide at runtime from a server config endpoint (decision D13 in `CUTOVER.md`). |

Builds already in users' hands keep sending Supabase JWTs until they update. See `CUTOVER.md` decision D13.

## Apps outside the requested four that also use Supabase

These need a PlanetScale path, or must be accepted as stopping at decommission. No code for them exists in this branch.

| App | What it reads | Impact |
|---|---|---|
| `apps/slack` (Worker `phaseo-slack-agent`) | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (secrets in `wrangler.jsonc`) | Keeps writing to Supabase after the cutover. Those writes reach PlanetScale only while the forward subscription runs. Once it is disabled (CUTOVER.md 4.10), they stay on Supabase. Flip it with the others, or pause it during phase 4 (decision D18). |
| `apps/desktop` (Electron) | `PHASEO_SUPABASE_URL`, `PHASEO_SUPABASE_PUBLISHABLE_KEY` (defaults hard-coded in `src/main/phaseoLogin.ts`) | Supabase Auth login, so it has the same problem as old mobile builds (D13). |
| `apps/api/tools/provider-simulator`, integration tests | `SUPABASE_*` | Dev tooling only. |

## PlanetScale roles (created in phase 1)

| Role | Login | Used by | Attributes and grants | Credentials stored in |
|---|---|---|---|---|
| `postgres` (default role) | yes | migrations, imports, replication, pg_cron | Near-superuser: `NOSUPERUSER CREATEDB CREATEROLE REPLICATION BYPASSRLS` (PlanetScale docs). Owns every object. | Operator password manager only |
| `phaseo_app` | yes | web (data + Better Auth), web-api, gateway (Hyperdrive `phaseo-planetscale`) | `BYPASSRLS`; `GRANT service_role ... WITH INHERIT TRUE, SET TRUE`; `GRANT anon, authenticated ... WITH INHERIT FALSE, SET TRUE`; DML on schema `auth`; `statement_timeout 8s`, `lock_timeout 8s`, pg_strict on | Vercel secret `PLANETSCALE_DATABASE_URL`, Hyperdrive config |
| `phaseo_catalogue` | yes | Hyperdrive `phaseo-planetscale-catalogue` | like `phaseo_app`, plus `default_transaction_read_only = on` | Hyperdrive config |
| `phaseo_shadow` | yes | phase 3 shadow previews only | like `phaseo_app`, plus `default_transaction_read_only = on` | Hyperdrive shadow config, preview env |

The SQL is in `CUTOVER.md` phase 1.
