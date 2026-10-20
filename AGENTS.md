# Repository Guidelines

## Project Structure & Module Organization
- Monorepo managed by pnpm + turbo: `apps/web` (Next.js 16 App Router, React 19, Tailwind 4, shared UI in `src/components` and `src/components/ui`), `apps/api` (Cloudflare Workers + Hono), `apps/docs` (Mintlify site).
- SDKs: `packages/sdk/sdk-ts` TypeScript client (`src`, generated `src/oapi-gen`, builds to `dist`); `packages/sdk/sdk-py` Python client (`src`, tests in `packages/sdk/sdk-py/tests`).
- Shared tooling lives in `scripts/`, release metadata in `.changeset/`; the database owns catalog data. `packages/data/catalog/src/data` contains archived compatibility fixtures; daily public exports live under `packages/data/catalog/generated/database-v2`.

## Build, Test, and Development Commands
- Install: `pnpm install` (Node ^22.19.0 or >=24).
- Dev servers: `pnpm dev` to run everything, or scope with `pnpm --filter @phaseo/web dev`, `pnpm --filter @phaseo/gateway-api dev`, `pnpm --filter @phaseo/docs dev`.
- Quality gates: `pnpm lint`, `pnpm typecheck`, `pnpm build`.
- TypeScript: `tsc` is TypeScript 7 (`@typescript/native`); the `typescript` package is the TypeScript 6 API (`@typescript/typescript6`, bin `tsc6`) kept for typescript-eslint and scripts that import the compiler. Both come from the `catalog:` in `pnpm-workspace.yaml`. tsconfigs can't use `baseUrl`, `ignoreDeprecations` or `moduleResolution: node`.
- Archived fixture checks (only when fixtures or validators change): `pnpm validate:data`, `pnpm validate:pricing`, `pnpm validate:gateway`. These do not validate live catalogue data. Docs: `pnpm docs:links` then `pnpm docs:build`.
- Tests: `pnpm --filter @phaseo/web test`; Python SDK via `pnpm test:sdk-py` (`python -m pytest packages/sdk/sdk-py/tests`); TS SDK local compatibility suite via `pnpm --filter @phaseo/sdk test` and optional live smoke checks via `pnpm --filter @phaseo/sdk test:smoke` (full `pnpm test` runs the TS SDK local suite plus pytest).

## Safety Notes
- Avoid bulk repo-wide search/replace or scripted mass edits; use targeted, file-scoped changes only.
- Stop every long-running process you start before you finish: dev servers (`pnpm dev`, `wrangler dev`, `next dev`), watch-mode test runners, and their child `workerd`/`esbuild` processes. Leftover servers from earlier sessions pile up and exhaust memory on the shared development machine. Prefer one-shot commands such as `vitest run`.

## Database Schema Changes
- Desired database definitions live in `supabase/schemas/`. Read `supabase/AGENTS.md` and `supabase/DECLARATIVE-SCHEMAS.md` before schema work.
- Edit the declarative SQL, generate a forward migration with `pnpm db:schema:sync -- -f descriptive_change_name`, and commit both together. Review generated SQL before deployment.
- Verify with `pnpm db:schema:check` and relevant SQL tests; `pnpm db:schema:smoke` exercises disposable replay and an incremental migration. Use the pinned replay tooling rather than raw `db diff`, declarative `sync`, or root `db reset`.
- Existing migrations and the frozen replay baseline are immutable. Never apply `supabase/baseline/schema.sql` to production or repair remote migration history as part of ordinary schema work.
- Supabase owns catalogue records. Catalogue data changes use targeted database operations and readback; schema changes follow the declarative workflow.

## Coding Style & Naming Conventions
- TypeScript-first (ES modules, absolute imports `@/...` in the web app); Python for the SDK. Prefer named exports for shared utilities.
- Components use PascalCase; hooks `useX`; helpers/files camelCase. Keep shared UI pieces in `apps/web/src/components` before adding new primitives.
- Styling via Tailwind; keep globals lean. Follow lint output for spacing/quotes since no repo-wide formatter is enforced.

## Testing Guidelines
- Jest for `apps/web` with `*.test.ts(x)` or nearby `__tests__`; Playwright suites live in `apps/web/tests/e2e`. Cover new logic and data validations with deterministic fixtures.
- Python SDK tests rely on pytest and `httpx.MockTransport`; keep async cases isolated.
- TS SDK has local `vitest` compatibility coverage plus optional smoke checks; add targeted unit or smoke tests when changing behavior.

## Commit & Pull Request Guidelines
- Commit subjects in history are short, descriptive, and scoped. Add a `.changeset` entry when shipping SDK/API/web changes that should version.
- Never commit directly to `main`. Always work on a branch, open a PR, and merge via the PR flow.
- When preparing PRs, always use a branch name that has not already been merged. Do not reuse previously merged branch names.
- Never enable PR auto-merge (for example `gh pr merge --auto`) unless the user has explicitly approved auto-merge for that PR.
- Before merging a PR, make sure all actionable review comments and unresolved review threads are either fixed and resolved or explicitly confirmed as outdated/non-blocking. Do not treat green CI alone as sufficient if unresolved review-thread state is still blocking merge.
- PRs: describe intent and scope, link issues, and fill in the `## Proof` section (see Proof in Pull Requests below).
- When creating/editing PR descriptions via CLI/API, use real multiline Markdown (or a body file). Do not submit escaped newline text like `\n` in the final PR body.

## Proof in Pull Requests
Every PR description needs a `## Proof` section showing that the change works, not just that it was written. A reviewer should be able to trust the claim without re-running everything.
- List each command you ran with its result, for example `pnpm --filter @phaseo/gateway-api test -- batch` → 48 passed. Paste the relevant output for failures or anything surprising. A command without a result is not proof.
- Show the behaviour the PR changes, with evidence that fits the change:
  - UI: screenshots or a short recording of the changed screen, before and after. Include a phone width when layout changes.
  - API/gateway: a real request and response against a local server, preview, or AIMock test, highlighting the status or fields that changed.
  - Database: `pnpm db:schema:check` output and a readback query showing the new state.
  - Docs: the rendered page (local preview or Vercel preview link) and `pnpm docs:links`.
  - Bug fixes: a test or reproduction that fails before the fix and passes after it.
- State what you did not verify and why (missing credentials, needs production traffic, known Windows-only failure, only checkable after deploy). Never claim a check you did not run. Report skipped or failing tests as skipped or failing, with output.
- Green CI supports the proof but does not replace it; it rarely exercises the changed behaviour directly.
- Redact keys, tokens, emails, and customer data from output and screenshots. Do not write to production, create API keys, or spend credits to produce proof unless the user asked for it.

## Security & Configuration Tips
- Never commit secrets; use `.env.local` per app. Required runtime keys are called out in `turbo.json` `globalEnv` and app READMEs.
- After OpenAPI edits, regenerate clients with `pnpm openapi:gen` so generated SDK surfaces such as `src/oapi-gen` and `src/gen` stay in sync before release.
