# Repository Guidelines

## Project Structure & Module Organization
- Monorepo managed by pnpm + turbo: `apps/web` (Next.js 16 App Router, React 19, Tailwind 4, shared UI in `src/components` and `src/components/ui`), `apps/api` (Cloudflare Workers + Hono), `apps/docs` (Mintlify site).
- SDKs: `packages/sdk/sdk-ts` TypeScript client (`src`, generated `src/oapi-gen`, builds to `dist`); `packages/sdk/sdk-py` Python client (`src`, tests in `packages/sdk/sdk-py/tests`).
- Shared tooling lives in `scripts/`, release metadata in `.changeset/`; the database owns catalog data. `packages/data/catalog/src/data` contains archived compatibility fixtures; daily public exports live under `packages/data/catalog/generated/database-v2`.

## Build, Test, and Development Commands
- Install: `pnpm install` (Node >=22.12.0).
- Dev servers: `pnpm dev` to run everything, or scope with `pnpm --filter @phaseo/web dev`, `pnpm --filter @phaseo/gateway-api dev`, `pnpm --filter @phaseo/docs dev`.
- Quality gates: `pnpm lint`, `pnpm typecheck`, `pnpm build`.
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
- PR titles use a conventional commit prefix and say, in plain language, what is different now: `fix(web): model pages no longer time out on cold starts`, not `fix(web): update model page query and caching`. Squash merges use the title as the commit subject on `main`.
- Never commit directly to `main`. Always work on a branch, open a PR, and merge via the PR flow.
- When preparing PRs, always use a branch name that has not already been merged. Do not reuse previously merged branch names.
- Never enable PR auto-merge (for example `gh pr merge --auto`) unless the user has explicitly approved auto-merge for that PR.
- Before merging a PR, make sure all actionable review comments and unresolved review threads are either fixed and resolved or explicitly confirmed as outdated/non-blocking. Do not treat green CI alone as sufficient if unresolved review-thread state is still blocking merge.
- PRs: link issues and write the description in the structure below (see Pull Request Descriptions).
- When creating/editing PR descriptions via CLI/API, use real multiline Markdown (or a body file). Do not submit escaped newline text like `\n` in the final PR body.

## Pull Request Descriptions
Every PR opened by an agent must have these five sections, in this order, and end with a model line, with no exceptions. The only thing allowed after it is a footer the harness adds automatically, such as `🤖 Generated with …`. Human-authored PRs should follow them too; `.github/PULL_REQUEST_TEMPLATE.md` has a heading for each. A reviewer should be able to see what changed, why, and what it achieved without re-investigating.

### What changed
A short list of the behaviour, data, or files that changed.

### Why
The evidence that led to the change, not just a description of it:
- Bugs: the observed failure, such as error output, logs, a failing request and response, a screenshot, or a test that fails on `main`.
- Data and catalogue changes: the source showing the current value is wrong or missing (provider docs, pricing page, or changelog link) and a readback of the current row.
- Performance or cost: the before measurement and where it came from (query, dashboard, usage export).
- Features, refactors, and docs: the request or decision behind the change (issue, user instruction) and what was wrong or missing before.
- If the reason comes from reading code rather than observing the problem, say so. Never present an inferred problem as confirmed.

### How
The approach taken, the key files or components, and any trade-off or alternative you rejected.

### Before and after
The benefit of the change, shown side by side in a table so it can be read at a glance. Measure before and after the same way (same command, environment, and sample size) and say how you measured. For example:

| Metric | Before | After | Change |
| --- | --- | --- | --- |
| Gateway worker startup (`wrangler dev` to ready, median of 5 runs) | 4.8 s | 2.1 s | −56% |
| `/models` page payload | 1.9 MB | 640 KB | −66% |

- Pick the metrics the change is meant to move: startup time, latency, bundle or payload size, query time, memory, cost per day, error rate, or test results.
- UI: before and after screenshots in two table columns. Include a phone width when layout changes.
- Bug fixes: the failing output before and the passing output after.
- If there is no measurable benefit (for example a wording change), say so and show the before and after content instead.

### Verification
- Each command you ran with its result, for example `pnpm --filter @phaseo/gateway-api test -- batch` → 48 passed. Paste the relevant output for failures or anything surprising. A command without a result is not proof.
- Evidence that fits the area: a real request and response for API/gateway changes (local server, preview, or AIMock test); `pnpm db:schema:check` output and a readback query for database changes; the rendered page (local preview or Vercel preview link) and `pnpm docs:links` for docs.
- What you did not verify and why (missing credentials, needs production traffic, known Windows-only failure, only checkable after deploy). Never claim a check you did not run. Report skipped or failing tests as skipped or failing, with output.
- Green CI supports the verification but does not replace it; it rarely exercises the changed behaviour directly.

### Model line
End the description with one line naming the model, its reasoning effort, and the harness that did the work, in exactly this format:

```
Model: Claude Opus 5.5 (medium effort) · Harness: Claude Code in T3 Code
```

- Use the model's display name and the effort the session actually ran at. If you cannot tell the effort, write `(effort unknown)` rather than guessing.
- If more than one model did substantial work, such as a delegated implementation or a follow-up fix, give each one its own line in the same format and add what it did, for example `… · Harness: Codex in T3 Code (review fixes)`.
- Put it after the five sections. It is the last line you write; an automatic harness footer, if there is one, follows it and nothing else does.

Across all sections, redact keys, tokens, emails, and customer data from output and screenshots. Do not write to production, create API keys, or spend credits to produce evidence unless the user asked for it.

## Security & Configuration Tips
- Never commit secrets; use `.env.local` per app. Required runtime keys are called out in `turbo.json` `globalEnv` and app READMEs.
- After OpenAPI edits, regenerate clients with `pnpm openapi:gen` so generated SDK surfaces such as `src/oapi-gen` and `src/gen` stay in sync before release.
