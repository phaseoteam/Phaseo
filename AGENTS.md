# Repository Guidelines

## Project Structure & Module Organization
- Monorepo managed by pnpm + turbo: `apps/web` (Next.js 15 App Router, Tailwind UI in `src/components` and `components/ui`), `apps/api` (Cloudflare Workers + Hono), `apps/docs` (Mintlify site).
- SDKs: `packages/sdk-ts` TypeScript client (`src`, generated `src/gen`, builds to `dist`); `packages/sdk-py` Python client (`src`, tests in `packages/sdk-py/tests`).
- Shared tooling lives in `scripts/`, release metadata in `.changeset/`; web data/benchmarks sit under `apps/web/src/data` with Jest cases nearby.

## Build, Test, and Development Commands
- Install: `pnpm install` (Node >=20).
- Dev servers: `pnpm dev` to run everything, or scope with `pnpm --filter @ai-stats/web dev`, `pnpm --filter @ai-stats/gateway-api dev`, `pnpm --filter @ai-stats/docs dev`.
- Quality gates: `pnpm lint`, `pnpm typecheck`, `pnpm build`.
- Data/doc checks: `pnpm validate:data`, `pnpm validate:pricing`, `pnpm validate:gateway`; docs via `pnpm docs:links` then `pnpm docs:build`.
- Tests: `pnpm --filter @ai-stats/web test`; Python SDK via `pnpm test:sdk-py` (`python -m pytest packages/sdk-py/tests`); TS SDK smoke check `pnpm --filter @ai-stats/ts-sdk test:smoke` (full `pnpm test` runs SDK placeholders plus pytest).

## Safety Notes
- Avoid bulk repo-wide search/replace or scripted mass edits; use targeted, file-scoped changes only.

## Coding Style & Naming Conventions
- TypeScript-first (ES modules, absolute imports `@/...` in the web app); Python for the SDK. Prefer named exports for shared utilities.
- Components use PascalCase; hooks `useX`; helpers/files camelCase. Keep shared UI pieces in `apps/web/src/components` before adding new primitives.
- Styling via Tailwind; keep globals lean. Follow lint output for spacing/quotes since no repo-wide formatter is enforced.

## Testing Guidelines
- Jest for `apps/web` with `*.test.ts(x)` or nearby `__tests__`; cover new logic and data validations with deterministic fixtures.
- Python SDK tests rely on pytest and `httpx.MockTransport`; keep async cases isolated.
- TS SDK lacks full coverage—add targeted unit or smoke tests when changing behavior.

## Commit & Pull Request Guidelines
- Commit subjects in history are short, descriptive, and scoped. Add a `.changeset` entry when shipping SDK/API/web changes that should version.
- Never commit directly to `main`. Always work on a branch, open a PR, and merge via the PR flow.
- PRs: describe intent and scope, list commands run (lint/typecheck/build/tests/validations), link issues, and include screenshots or notes for UI changes.
- When creating/editing PR descriptions via CLI/API, use real multiline Markdown (or a body file). Do not submit escaped newline text like `\n` in the final PR body.

## Security & Configuration Tips
- Never commit secrets; use `.env.local` per app. Required runtime keys are called out in `turbo.json` `globalEnv` and app READMEs.
- After OpenAPI edits, regenerate clients with `pnpm openapi:gen` so `src/gen` stays in sync before release.
