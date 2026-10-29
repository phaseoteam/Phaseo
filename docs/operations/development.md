# Development

How to set up a checkout, run one app, and run the checks for what you changed. Repository rules live in the root [AGENTS.md](../../AGENTS.md) and in each app's own `AGENTS.md`.

## Prerequisites

- Node.js `^22.19.0` or `>=24.0.0`, from `engines` in the root [package.json](../../package.json). CI uses Node 22, and Node 24 for the AIMock matrix and publishing.
- pnpm 10.33.0, pinned by `packageManager`. Run `corepack enable` to use it.

Other toolchains are only needed for the matching SDK or check. Versions are the ones CI uses:

| Area | Toolchain |
| --- | --- |
| Python SDK | Python 3.10 or later (CI uses 3.12); `uv` is optional |
| Go SDK | Go 1.23; the Go Agent SDK needs 1.24 |
| C# SDK | .NET 8 SDK |
| Java SDK | JDK 17 and Maven |
| PHP and Ruby SDKs | PHP 8.2, Ruby 4.0 |
| Rust SDK | Rust with `clippy` and `rustfmt` |
| C++ SDK | `g++` with C++17 |
| `pnpm db:schema:*` | Docker or another local runtime for the Supabase CLI's shadow database |

## Install

```sh
pnpm install --frozen-lockfile
```

A cold install takes several minutes and a lot of memory. By default `pnpm-workspace.yaml` holds back dependency versions published less than seven days ago (`minimumReleaseAge`), so a brand-new release will not resolve yet. Packages listed in `minimumReleaseAgeExclude`, such as Next.js, Expo, React Native and Hono, skip the hold.

## Run one app

Start only the app you need. `pnpm dev` starts every workspace's dev server at once, including Mintlify, Expo and Electron.

| App | Command | Port |
| --- | --- | --- |
| Web (`apps/web`) | `pnpm --filter @phaseo/web dev` | 3100 |
| Web API Worker (`apps/web-api`) | `pnpm --filter @phaseo/web-api dev` | 8788 |
| Web and Web API together | `pnpm dev:cloudflare-web` | 3100 and 8788 |
| Gateway API (`apps/api`) | `pnpm --filter @phaseo/gateway-api dev` | Wrangler default, 8787 |
| MCP server (`apps/mcp`) | `pnpm --filter @phaseo/mcp dev` | Wrangler default, 8787 |
| Slack agent Worker (`apps/slack`) | `pnpm --filter @phaseo/slack-agent dev` | 8789 |
| Docs (`apps/docs`) | `pnpm --filter @phaseo/docs dev` | 3101 |

- Without `WEB_API_ORIGIN`, local `next dev` proxies `/api/_web`, `/api/account`, `/api/chat` and `/api/internal` to production (`apps/web/next.config.mjs`). Pages show live data, and anything you do while signed in, such as saving settings or sending a chat, happens on production. To use your local Web API Worker, set `WEB_API_ORIGIN=http://127.0.0.1:8788`; `pnpm dev:cloudflare-web` does this for you.
- The gateway and MCP Workers share a default port. To pick one, run Wrangler from `apps/api`: `pnpm exec wrangler dev --local --ip 127.0.0.1 --port 8795 --show-interactive-dev-session=false`.
- If an embedded browser reload-loops on the web app, open `http://localhost:3100` instead of `127.0.0.1`.
- For the desktop app, see [apps/desktop/README.md](../../apps/desktop/README.md), and for Factory, [apps/factory/README.md](../../apps/factory/README.md). The mobile app runs with `pnpm --filter @phaseo/mobile dev` (Expo).

## Environment files

Every file below is gitignored. Never commit one, and never use production credentials for local development.

- `apps/web/.env.local` for the web app. Variables shared across tasks are listed in `globalEnv` in [turbo.json](../../turbo.json).
- `.dev.vars` in `apps/api`, `apps/web-api`, `apps/mcp`, `apps/slack` and `apps/perf-upstream`, which `wrangler dev` reads. Start from the committed `.dev.vars.example` in `apps/api`, `apps/mcp`, `apps/slack` and `apps/perf-upstream`. The gateway's example lists only provider-specific values, not everything the Worker reads.
- Before sending requests to a local Worker, check which database and providers its `.dev.vars` points at. A local gateway with real credentials reads and writes that database and spends provider credit.

## Set up a fresh worktree

Use one git worktree per task. A new worktree has no `node_modules`, build output, or env files.

1. Run `pnpm install --frozen-lockfile`.
2. Copy only the env files you need from your main checkout. Delete temporary copies when you finish.
3. Build the TypeScript SDK before running Web API tests, its dev server, or `tsc` directly: `pnpm --filter @phaseo/sdk build`. `pnpm --filter @phaseo/web-api typecheck` does this itself.
4. Generate Next's route types before running `tsc` on the web app directly: `pnpm --filter @phaseo/web exec next typegen`. Without them, `tsc` reports missing `PageProps` and `LayoutProps`. The `typecheck` script runs `next typegen` itself.
5. Type-check the web app with `pnpm --filter @phaseo/web typecheck`. `npx tsc` resolves an unrelated npm package.

Worktrees share the main clone's object store. Never run `git fetch --depth=<n>` in one: it writes `.git/shallow` and makes the main clone shallow too.

## What CI covers

[CI](../../.github/workflows/ci.yml) runs repository checks (shared registry copies, skills, a few catalogue and SQL tests, and type-checks for desktop, mobile and perf-upstream), OpenAPI lint, SDK generation for all nine languages, SDK package builds, lifecycle and Agent SDK tests, the CLI package and the Devtools build. The Apps jobs cover the gateway (`validate:api`, which is ESLint, `tsc` and a Wrangler dry run, plus one Vitest file, the provider simulator tests and the pricing simulator), docs validation, the web app (localisation checks, three Jest files, `pnpm --filter @phaseo/web typecheck` and a compile-only Next build), and the Web API, MCP and Slack agent Workers (lint or type-check, tests and a dry-run build). The gateway AIMock matrix is its own job, and a Factory job runs when `apps/factory` changes. Migrations get policy checks and the declarative schema workflow, and desktop changes get the "Desktop workspace" workflow.

CI does not run most gateway or web unit tests: it runs one of 816 gateway `src` test files and three of 429 web Jest files, and it has no web ESLint or Playwright step. The TypeScript and Python SDK test suites (`pnpm test:sdk-ts`, `pnpm test:sdk-py`) do not run in CI either. Run the tests for the code you touched. Do not run the repo-wide `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test:all` or `pnpm precommit`.

## Run scoped checks

### Gateway API

```sh
pnpm --filter @phaseo/gateway-api exec vitest run src/<path>
pnpm --filter @phaseo/gateway-api test:aimock --provider <id> --scenario <name>
pnpm --filter @phaseo/gateway-api lint
```

- Always pass a path under `src`. A bare `vitest run`, which `pnpm --filter @phaseo/gateway-api test` is, also collects `tests/integration/*.live.spec.ts`, which call real providers, and the slow executor matrix.
- AIMock runs `tests/aimock` against recorded provider contracts. `--provider` and `--scenario` take comma-separated lists. Never pass `--record`; recording contacts live providers.
- `pnpm test:provider-contracts` tests the in-process provider mock in `packages/testing/provider-mock`. Its [README](../../packages/testing/provider-mock/README.md) shows how to fault an upstream call in a test.
- `lint` runs ESLint and `tsc`.

### Web app and Web API

```sh
pnpm --filter @phaseo/web test --runTestsByPath <file>...
pnpm --filter @phaseo/web exec eslint <file>...
pnpm --filter @phaseo/web validate:i18n
pnpm --filter @phaseo/web exec playwright test tests/e2e/<spec> --project=chromium
pnpm --filter @phaseo/web-api test
```

- `validate:i18n` fails on stale generated files. After adding a key that a client `useTranslations` call reads, run `node scripts/validate-message-scopes.mjs --write-client-scopes` in `apps/web`. After changing a docs page's title, description or headings, run `pnpm --filter @phaseo/web docs:search:index`. Commit what they write.
- Playwright starts its own dev server unless one is already on `BASE_URL` (default `http://localhost:3100`). It defines five browser projects; choose with `--project`, for example `chromium` and `"Mobile Chrome"`.

### Database

```sh
pnpm db:schema:check
pnpm db:schema:smoke
node supabase/tests/<name>.test.mjs
node scripts/validate-supabase-migrations.mjs origin/main
```

- Read [supabase/AGENTS.md](../../supabase/AGENTS.md) before schema work. Without a local runtime, `db:schema:*` cannot run; CI's "Declarative schema verification" workflow is then the only equivalence check, so say so in the PR.
- Many `supabase/tests/*.test.mjs` files run SQL in PGlite, a root dev dependency. Without a full install, install `@electric-sql/pglite@0.5.8` into a temporary directory that has its own `package.json`, then set `PGLITE_MODULE` to the file URL of its `dist/index.js`.
- The migration history tests are `node --test scripts/declarative-replay-history.test.mjs scripts/prepare-production-migrations.test.mjs scripts/validate-supabase-migrations.test.mjs`.

### SDKs and CLI

```sh
pnpm test:sdk-ts
pnpm test:sdk-py
pnpm test:sdk-go
pnpm test:agent-sdk-go
pnpm openapi:gen:go
```

- Each script exists per language. `test:sdk-*` covers `ts`, `py`, `go`, `csharp`, `java`, `php`, `ruby`, `rust` and `cpp`; `test:agent-sdk-*` covers the same list without `cpp`; `openapi:gen:*` covers all nine.

- `test:sdk-py` uses `uv` when it is installed. Otherwise create a virtual environment, run `pip install pytest -e "packages/sdk/sdk-py[realtime]"` in it, and set `PHASEO_PYTHON` to its interpreter.
- `pnpm openapi:gen` regenerates all nine SDKs and is slow; use one language while iterating. Making an OpenAPI field optional changes typed SDKs (Go turns it into a pointer), so run that language's tests.
- `pnpm test` in `packages/cli/phaseo` first runs `sync:capabilities`, which can rewrite `src/generated/meta.ts`. Revert it unless you meant to change it.
- Go tests can leave an untracked `packages/sdk/go.work.sum`. Delete it.

### Docs

These run without Mintlify:

```sh
pnpm --filter @phaseo/docs openapi:locales:check
pnpm --filter @phaseo/docs validate:locales
pnpm --filter @phaseo/docs translation:freshness:check
pnpm --filter @phaseo/docs skills:check
pnpm docs:public-safety
```

Translated pages and localised OpenAPI copy follow [apps/docs/TRANSLATION_WORKFLOW.md](../../apps/docs/TRANSLATION_WORKFLOW.md). `pnpm docs:links` and `pnpm docs:build` also run the pinned Mintlify CLI.

## Preview the docs

`pnpm --filter @phaseo/docs dev` serves the docs on port 3101. English pages are under `/v1/` and translations under `/<locale>/v1/`.

On Windows the pinned Mintlify CLI cannot load `sharp`, so `dev`, `docs:links` and `docs:build` fail locally. Install the current CLI into a temporary directory that has its own `package.json` (`npm install mint@latest`), then run it from `apps/docs`:

```sh
node <tmp>/node_modules/mint/index.js dev --port 3111 --no-open
node <tmp>/node_modules/mint/index.js broken-links
node <tmp>/node_modules/mint/index.js validate
```

- The preview needs about 3 GB of memory. Open one locale at a time.
- Restart it after navigation changes in `docs.json`; CSS changes hot-reload. Stop it before bulk MDX edits, which make it reprocess every page.
- Open Graph images (`/_mintlify/api/og`) are not served locally.

## Windows

- Some gateway `src` tests and web Jest suites fail on Windows on `main` too. Before blaming your change, commit it, run `git checkout origin/main -- <dir>`, run the same tests, then restore with `git checkout HEAD -- <dir>`.
- `sed -i` in Git Bash rewrites CRLF files as LF. Check a file with `git ls-files --eol <path>` and edit CRLF files with a tool that keeps line endings.

## Keep resource use down

Several agents and people may share one development machine. On Windows the commit limit (RAM plus page file) runs out before free RAM does, and then new processes fail to start.

- Prefer one-shot commands such as `vitest run` to watch mode.
- Run few heavy processes at once: one install, one dev server, one test run.
- Stop every server you start before you finish, by the PID you started. Stopping the shell does not always stop `next dev` or `wrangler dev` children (`node`, `workerd`, `esbuild`), which keep the port. On Windows, find the owner with `Get-NetTCPConnection -LocalPort <port>` and stop it with `taskkill /PID <pid> /T /F`.
- Before starting something heavy on Windows, check headroom with `Get-CimInstance Win32_PerfFormattedData_PerfOS_Memory | Select-Object CommitLimit, CommittedBytes`.
- Do not run monorepo-wide builds or test runs. Run the checks for the packages you changed (see [What CI covers](#what-ci-covers)).
