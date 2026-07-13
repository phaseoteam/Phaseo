# Repository Guidelines

## Project Structure & Module Organization
- Monorepo managed by pnpm + turbo: `apps/web` (Next.js 15 App Router, Tailwind UI in `src/components` and `components/ui`), `apps/api` (Cloudflare Workers + Hono), `apps/docs` (Mintlify site).
- SDKs: `packages/sdk/sdk-ts` TypeScript client (`src`, generated `src/oapi-gen`, builds to `dist`); `packages/sdk/sdk-py` Python client (`src`, tests in `packages/sdk/sdk-py/tests`).
- Shared tooling lives in `scripts/`, release metadata in `.changeset/`; canonical data/benchmarks sit under `packages/data/catalog/src/data` with Jest cases nearby.

## Build, Test, and Development Commands
- Install: `pnpm install` (Node >=22).
- Dev servers: `pnpm dev` to run everything, or scope with `pnpm --filter @phaseo/web dev`, `pnpm --filter @phaseo/gateway-api dev`, `pnpm --filter @phaseo/docs dev`.
- Quality gates: `pnpm lint`, `pnpm typecheck`, `pnpm build`.
- Data/doc checks: `pnpm validate:data`, `pnpm validate:pricing`, `pnpm validate:gateway`; docs via `pnpm docs:links` then `pnpm docs:build`.
- Tests: `pnpm --filter @phaseo/web test`; Python SDK via `pnpm test:sdk-py` (`python -m pytest packages/sdk/sdk-py/tests`); TS SDK local compatibility suite via `pnpm --filter @phaseo/sdk test` and optional live smoke checks via `pnpm --filter @phaseo/sdk test:smoke` (full `pnpm test` runs the TS SDK local suite plus pytest).

## Safety Notes
- Avoid bulk repo-wide search/replace or scripted mass edits; use targeted, file-scoped changes only.

## Coding Style & Naming Conventions
- TypeScript-first (ES modules, absolute imports `@/...` in the web app); Python for the SDK. Prefer named exports for shared utilities.
- Components use PascalCase; hooks `useX`; helpers/files camelCase. Keep shared UI pieces in `apps/web/src/components` before adding new primitives.
- Styling via Tailwind; keep globals lean. Follow lint output for spacing/quotes since no repo-wide formatter is enforced.

## Testing Guidelines
- Jest for `apps/web` with `*.test.ts(x)` or nearby `__tests__`; cover new logic and data validations with deterministic fixtures.
- Python SDK tests rely on pytest and `httpx.MockTransport`; keep async cases isolated.
- TS SDK has local `vitest` compatibility coverage plus optional smoke checks; add targeted unit or smoke tests when changing behavior.

## Commit & Pull Request Guidelines
- Commit subjects in history are short, descriptive, and scoped. Add a `.changeset` entry when shipping SDK/API/web changes that should version.
- Never commit directly to `main`. Always work on a branch, open a PR, and merge via the PR flow.
- When preparing PRs, always use a branch name that has not already been merged. Do not reuse previously merged branch names.
- Never enable PR auto-merge (for example `gh pr merge --auto`) unless the user has explicitly approved auto-merge for that PR.
- Before merging a PR, make sure all actionable review comments and unresolved review threads are either fixed and resolved or explicitly confirmed as outdated/non-blocking. Do not treat green CI alone as sufficient if unresolved review-thread state is still blocking merge.
- PRs: describe intent and scope, list commands run (lint/typecheck/build/tests/validations), link issues, and include screenshots or notes for UI changes.
- When creating/editing PR descriptions via CLI/API, use real multiline Markdown (or a body file). Do not submit escaped newline text like `\n` in the final PR body.

## Security & Configuration Tips
- Never commit secrets; use `.env.local` per app. Required runtime keys are called out in `turbo.json` `globalEnv` and app READMEs.
- After OpenAPI edits, regenerate clients with `pnpm openapi:gen` so generated SDK surfaces such as `src/oapi-gen` and `src/gen` stay in sync before release.
