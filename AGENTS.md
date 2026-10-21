# Repository Guidelines

Phaseo is an AI gateway and model catalogue: one API in front of many model providers, with live pricing, benchmarks, and usage-based billing. This file is for agents changing the code. Nested `AGENTS.md` files in `apps/*`, `packages/*`, and `supabase/` add rules for their area; read the one closest to the files you change. Treat these instructions as strong defaults: the maintainer's instructions override them, and if a rule here fights the task in front of you, say so plainly and get sign-off before breaking it.

## What We Never Compromise On
<!-- Draft written by an agent from MANIFESTO.md and maintainer feedback. Daniel to review the wording before merge. -->
Customers choose models and pay real money based on what Phaseo shows and charges. These hold for every change:

1. **The numbers are right.** Prices, model facts, usage, and spend come from a source and are read back after every change. If a fact is unknown, leave it unknown; never guess, infer from a similar model, or round in the customer's disfavour.
2. **Billing is exact and fair.** A request is charged once, for what was delivered, at the published price. Reservations, settlement, refunds, and ledger rows must be correct on every path: success, provider error, retry, fallback, client disconnect, and timeout. We never charge more than necessary.
3. **No silent behaviour.** Never drop a parameter, substitute a model or provider, downgrade a feature, or change cost without an explicit product policy and something the customer can see.
4. **Every provider is treated fairly.** Routing, ranking, and documentation follow price, quality, and reliability, never commercial deals.
5. **Every surface and language is first-class.** The API, nine SDKs, dashboard, CLI, MCP server, and docs in nine languages move together. A change that only works on the path you tested is not finished (see Hit Every Surface).
6. **Cost-aware engineering.** Infrastructure spend is real and the production database is small. Aggregate in the database, cache deliberately, keep payloads lean, and measure before and after.
7. **Customer data stays private.** Respect zero-data-retention settings, never log secrets or request content you were not asked to keep, and redact evidence.

## A Note from Daniel
<!-- Draft written by an agent for Daniel to rewrite in Daniel's own words before merge. -->
I care more about knowing why a change was made and what it actually achieved than about how much changed. Show me the evidence: the failure you saw, the number before and after, the page as a customer sees it. Prefer the smallest change that makes the right behaviour obvious, and do not add machinery because it looks impressive. If you are unsure, check the code or the data instead of guessing, and tell me what you could not verify.

## Words We Use
- **You**: the agent reading this file. **Maintainer**: Daniel and the Phaseo team, who you are working for.
- **Customer**: a person or company using Phaseo, through a **workspace**. **End user**: the customer's own user, optionally passed per request.
- **Organisation** (`lab` in the database, `v2_labs`): the company that makes a model. **Provider** (`v2_providers`): the service that serves it. A model has one route per provider that serves it (`v2_model_provider_routes`).
- The full glossary is `docs/internals/glossary.md`; the architecture overview is `docs/internals/overview.md`.

## Project Structure & Module Organization
- Monorepo managed by pnpm + turbo: `apps/web` (Next.js 16 App Router, React 19, Tailwind 4, shared UI in `src/components` and `src/components/ui`), `apps/api` (Cloudflare Workers + Hono), `apps/docs` (Mintlify site).
- SDKs: `packages/sdk/sdk-ts` TypeScript client (`src`, generated `src/oapi-gen`, builds to `dist`); `packages/sdk/sdk-py` Python client (`src`, tests in `packages/sdk/sdk-py/tests`).
- Shared tooling lives in `scripts/`, release metadata in `.changeset/`; the database owns catalog data. `packages/data/catalog/src/data` contains archived compatibility fixtures; daily public exports live under `packages/data/catalog/generated/database-v2`.

## Build, Test, and Development Commands
- Install: `pnpm install` (Node `^22.13.0 || >=24.0.0`, as in `package.json` `engines`).
- Dev servers: `pnpm dev` to run everything, or scope with `pnpm --filter @phaseo/web dev`, `pnpm --filter @phaseo/gateway-api dev`, `pnpm --filter @phaseo/docs dev`.
- Quality gates: `pnpm lint`, `pnpm typecheck`, `pnpm build`. Run the scoped equivalents for the packages you changed, not the whole monorepo (see Verifying).
- Archived fixture checks (only when fixtures or validators change): `pnpm validate:data`, `pnpm validate:pricing`, `pnpm validate:gateway`. These do not validate live catalogue data. Docs: `pnpm docs:links` then `pnpm docs:build`.
- Tests: `pnpm --filter @phaseo/web test`; Python SDK via `pnpm test:sdk-py` (`python -m pytest packages/sdk/sdk-py/tests`); TS SDK local compatibility suite via `pnpm --filter @phaseo/sdk test` and optional live smoke checks via `pnpm --filter @phaseo/sdk test:smoke` (full `pnpm test` runs the TS SDK local suite plus pytest).

## Safety Notes
Each of these has already caused damage here.

1. **Writing to production.** Do not write to the production database, Cloudflare, Stripe, R2, or any live service unless the maintainer asked for that specific change. Read-only diagnostics must stay light: the production database runs on a small compute tier, and a heavy query slows every customer. Never create API keys or spend credits to test something.
2. **Applying SQL outside migrations.** Production schema changes go only through committed, reviewed migrations. SQL applied directly to production without a matching migration file blocks every later deploy.
3. **Summing rows in application code.** PostgREST returns at most 1,000 rows by default, so totals computed in TypeScript are silently wrong once data grows. Aggregate in SQL or an RPC.
4. **Killing processes by name.** The development machine runs several agents and servers at once. Never `taskkill /IM`, `pkill -f`, or kill a PID you found by matching a name or path. Stop only the PIDs you started.
5. **Leaving processes running.** Stop every long-running process you start before you finish: dev servers (`pnpm dev`, `wrangler dev`, `next dev`), watch-mode test runners, and their child `workerd`/`esbuild` processes. Leftover servers pile up and exhaust memory on the shared machine. Prefer one-shot commands such as `vitest run`.
6. **Trusting a stale checkout.** A local checkout or worktree can be hundreds of commits behind. Before saying what `main` does, `git fetch` and read `origin/main`.
7. **Mass edits.** Avoid bulk repo-wide search/replace or scripted mass edits; use targeted, file-scoped changes only. Generated files are the exception: regenerate them with their script, never hand-edit them.
8. **Mismatched names across a boundary.** A database function took `p_team_id` while its callers passed `p_workspace_id`, and deprecation alerts silently never sent. When you rename or add a parameter, check every caller, and use `workspace` naming for new code.

## Hit Every Surface
The most common defect here is a change that works on the path you tested and is missing everywhere else. Before calling work done, walk this list and say in the PR which entries applied:

- **Entry points.** A capability in the dashboard is often also reachable through the API, SDKs, CLI (`packages/cli`), MCP server (`apps/mcp`), desktop and mobile apps, and scheduled jobs. Fixing one entry point is not fixing the feature.
- **Endpoints and protocols.** Request-handling changes usually apply to every endpoint family (Chat Completions, Responses, Anthropic Messages, embeddings, moderations, rerank, images, audio, realtime, video, music, OCR and parsing, files, batches, async operations) and to both streaming and non-streaming paths. Decide for each, even if the decision is "not supported", and reject unsupported input explicitly.
- **Providers.** Provider-shaped behaviour needs a decision per executor. Do not assume one provider's behaviour holds for all.
- **Public contract.** An API change means `apps/docs/openapi/v1/openapi.yaml`, then `pnpm openapi:gen` for all nine SDKs (TypeScript, Python, Go, C#, Java, PHP, Ruby, C++, Rust), the agent SDKs, guides and examples, and a changeset.
- **Languages.** Docs ship in nine languages (English plus `ar`, `de`, `es`, `fr`, `hi`, `ja`, `pt-BR`, `zh-Hans`). New OpenAPI descriptions need entries in `apps/docs/openapi/localized-copy.json`. Web copy lives in `apps/web/messages` for every locale, and help articles in `apps/web/src/content/help` have locale copies. English pages must stay English.
- **Data.** Catalogue changes reach the web app, gateway routing, OpenAPI enums (`pnpm openapi:sync-enums`), and public exports.
- **Billing.** Every new billable path needs a price, a reservation, settlement, a usage and ledger record, and a refund on failure.
- **Reverse states.** If you add a way in, add the way out and the way to see it: enable needs disable, opt-in needs opt-out, create needs delete.
- **Skills and docs.** The agent skills listed in `PUBLIC_SKILLS` in `apps/docs/scripts/sync-skills.mjs` are published from `.agents/skills` to the docs site. Check whether your change makes a skill, guide, or example wrong.

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
- Do not name competitor products in shipped UI copy, docs, feature copy, or code identifiers. Migration guides for customers moving to Phaseo are the exception.

## Taste
- Prefer the smallest change that makes the correct behaviour unsurprising. Do not keep complexity just because it exists, and do not add layers, options, or abstractions until there is a second real use for them.
- Keep provider quirks in the provider or executor layer, shared request flow in the pipeline, and UI components simple.
- Comments say why: a constraint, a provider quirk, or an invariant the code cannot show. Do not restate names, narrate steps, or record history; that belongs in the commit and PR.
- Inferred types over annotations, and no `any`.
- Customers notice a wrong number, a stale label, or a spinner that lies. Show real state, and say when data is missing or estimated.

## Verifying
- Use the smallest proof that the change works: the tests for the area you touched, plus lint and typecheck for the package you changed. The verification skill in `.agents/skills/verify-phaseo-change` lists the commands and evidence for each surface.
- Do not run monorepo-wide checks (`pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test:all`) unless asked; they exhaust the shared machine.
- Do not rely on CI to run your tests. It runs only a small part of the suites:
  - `apps/api`: CI runs lint, typecheck, a Wrangler dry-run build, the AIMock matrix, and one unit-test file. Run the unit tests for the directories you touched yourself: `pnpm --filter @phaseo/gateway-api exec vitest run src/<area>`.
  - `apps/web`: CI runs the i18n checks, four Jest files, and a compile-only build, with no typecheck or ESLint. Run `pnpm --filter @phaseo/web typecheck`, ESLint on the files you changed, and the Jest tests for the area you touched.
  - TypeScript and Python SDKs: CI builds and packs them but does not run their tests. Run `pnpm test:sdk-ts` or `pnpm test:sdk-py`.
  - `apps/web-api`, `apps/mcp`, the other seven SDKs' lifecycle tests, all agent SDK tests, and the docs checks do run in full.
- Some unit tests already fail on `main`, especially on Windows. Before blaming your change for a failure, run the same test against `origin/main`.
- Test behaviour a customer or caller can observe. Do not add tests that only mirror the implementation or assert that a callback was wired.
- Never make a test wait on sleeps or polling. Await the event, promise, or state that marks the milestone; a test that needs a timeout to pass is wrong.
- Backend behaviour changes ship with focused tests for that behaviour. Bug fixes include a test that fails before the fix.
- Collect the evidence the PR description needs while you work: the failure you saw, the numbers before and after, and the commands with their results.
- For UI changes, capture the before and after screenshots in one browser session and close it when done. Ask before driving the maintainer's own browser, desktop, or device simulators.

## Testing Guidelines
- Jest for `apps/web` with `*.test.ts(x)` or nearby `__tests__`; Playwright suites live in `apps/web/tests/e2e`. Cover new logic and data validations with deterministic fixtures.
- Python SDK tests rely on pytest and `httpx.MockTransport`; keep async cases isolated.
- TS SDK has local `vitest` compatibility coverage plus optional smoke checks; add targeted unit or smoke tests when changing behavior.

## Documentation
Most code changes do not need an internal documentation change; agents can read the code.
- `docs/internals/` is for architectural decisions and their reasons, constraints that span components, and traps that are hard to discover from the source. Before adding a paragraph, ask what a maintainer would get wrong without it. If reading the code answers the question, leave it out.
- Do not document every feature, list fields or methods, narrate control flow, keep file catalogues, or append PR summaries.
- When a documented decision or constraint changes, rewrite or remove the affected text. Do not append another account of the new behaviour.
- Customer-facing docs live in `apps/docs` (see `apps/docs/AGENTS.md`). Update the relevant guide when how to use a feature changes; a UI tweak does not need a docs entry.
- `docs/operations/` holds maintainer procedures: development setup, production access, and releases. `docs/README.md` indexes everything.

## Plans and Work Artifacts
- Do not commit implementation plans, research notes, audits, or agent scratch files. Keep working material outside the repository, or in the PR description if a reviewer needs it.
- Track active work in its GitHub issue or PR. A merged PR is the implementation record; do not keep a second checklist in the repository.

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

## Babysitting Pull Requests
- After each push, check CI and the comments newer than that push. Verify every bot finding against the source before acting on it.
- Fix real findings. Dismiss false positives with a written reason in the thread, then resolve it.
- Do not keep re-requesting bot reviews (for example `@codex review`) after fixing findings. Once the findings are addressed and checks are green on the latest commit, the PR is ready.
- Stay quiet when nothing is new. Stop when checks are green on the latest commit and no actionable review threads remain.

## Code Review Rules
Review bots, including Codex, read this section. Treat each of these as P1, not a style nit:
- An edited existing migration or replay baseline, or a schema change without a forward migration generated from `supabase/schemas`.
- Rows fetched through PostgREST or a Supabase client to count, sum, or average them in application code.
- A gateway path that can charge twice, charge for a failed or disconnected request, or skip settlement, the refund, or the usage record.
- A silently dropped request parameter, substituted model or provider, or downgraded feature without an explicit, visible policy.
- Logged secrets or API keys, logged request or response content for a zero-data-retention workspace, or an internal route that trusts a caller-supplied workspace ID without checking it.
- A public OpenAPI change without regenerated SDKs or the matching `apps/docs/openapi/localized-copy.json` entries.
- A database function or RPC whose parameter names do not match what its callers pass.
- A Mintlify endpoint page whose `openapi:` reference does not name its spec file.
- Hard-coded interface copy in `apps/web` instead of the message catalogues.
- Competitor product names in shipped UI, docs, or code naming, outside migration guides.

## Security & Configuration Tips
- Never commit secrets; use `.env.local` per app. Required runtime keys are called out in `turbo.json` `globalEnv` and app READMEs.
- After OpenAPI edits, regenerate clients with `pnpm openapi:gen` so generated SDK surfaces such as `src/oapi-gen` and `src/gen` stay in sync before release.
