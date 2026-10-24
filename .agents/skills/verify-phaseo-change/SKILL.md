---
name: verify-phaseo-change
description: Produces the verification and before-and-after evidence that a Phaseo pull request description needs, for gateway, web, database, docs, SDK, catalogue and performance changes in this monorepo. Use when a change is ready to prove, before opening or updating a pull request. Internal to Phaseo maintainers and their agents; not for people building on Phaseo.
metadata:
  internal: true
---

# Verify a Phaseo change

Prove that a change works and show what it achieved, so a reviewer can trust
the pull request without re-running everything. Read the pull request rules in
the root [AGENTS.md](../../../AGENTS.md) first and use its section names. The
evidence has two parts:

- **Before and after:** the benefit, measured the same way both times, side by side.
- **Verification:** each command you ran with its result, the behaviour you
  exercised, and what you did not verify and why.

## Ground rules

- No production writes, new API keys, or credit spend. Follow
  [Working safely against production](../../../docs/operations/production-access.md).
- Run scoped checks only. [Development](../../../docs/operations/development.md)
  has the commands per area and the fresh-worktree setup.
- Capture the "before" state before you change code, or on the base commit:
  `git stash`, measure, `git stash pop`; or commit, `git checkout origin/main -- <paths>`,
  measure, `git checkout HEAD -- <paths>`.
- Record each command and its result as you go: the exact command, pass and
  fail counts, and relevant output. A command without a result is not evidence.
- A failure that also happens on `origin/main` is pre-existing. Show both runs.
- Stop every server you start, by its PID, before you finish.
- Redact keys, tokens, emails and customer data from output and screenshots.
- Never claim a check you did not run. Report skipped and failing tests as such.

## Gateway and API

1. Run the focused tests: `pnpm --filter @phaseo/gateway-api exec vitest run src/<path>`.
   Never run the bare `test` script; it collects live provider specs.
2. Show provider-facing behaviour with mocks:
   - AIMock: `pnpm --filter @phaseo/gateway-api test:aimock --provider <id> --scenario <name>`.
     Never pass `--record`.
   - Provider mock: register a fault with `ProviderMockServer`, send a unique
     `X-Test-Id`, and assert on `mock.getRequests()`. See
     [the provider mock README](../../../packages/testing/provider-mock/README.md).
3. For a real request and response, run a local Worker. First check what
   `apps/api/.dev.vars` points at: a local gateway with real credentials reads and
   writes that database and spends provider credit. If it does, stay with the mocks.
   From `apps/api`, start it in the background and note its PID:

   ```sh
   pnpm exec wrangler dev --local --ip 127.0.0.1 --port 8795 --show-interactive-dev-session=false
   ```

   Wait for `curl --retry-all-errors --retry 30 --retry-delay 2 -fsS http://127.0.0.1:8795/v1/health`,
   which needs no key. Send the request, then stop the server and its child
   `workerd` process.
4. Evidence: the request (key redacted), the status, the headers that matter,
   and the response fields that changed, before and after. For streams, show
   the event order and the terminal event.

## Web app

1. Run the affected Jest suites:
   `pnpm --filter @phaseo/web test --runTestsByPath <file>...`. CI runs only a few
   web suites, so this run is often the only one.
2. Type-check after `pnpm --filter @phaseo/web exec next typegen`, lint the
   changed files with `pnpm --filter @phaseo/web exec eslint <file>...`, and run
   `pnpm --filter @phaseo/web validate:i18n` when copy or messages change.
3. Run `pnpm --filter @phaseo/web dev` (port 3100). It reads public data from
   production unless `WEB_API_ORIGIN` points at a local Web API Worker. Never sign
   in to a production account to test.
4. Take screenshots of the same route, data and theme before and after, at a
   desktop width (1280 or 1440 px) and a phone width (390 px). Use the browser
   tool available to you, or a Playwright run such as
   `pnpm --filter @phaseo/web exec playwright test tests/e2e/<spec> --project=chromium --project="Mobile Chrome"`.
5. Vercel previews need a Vercel login and block sign-in. For signed-in screens,
   render the real components with fixture data on a temporary local route, and
   delete it before committing.
6. Attach screenshots to the pull request in two columns. Do not commit them.
   Stop the dev server by PID; `next dev` leaves a child process on the port.

## Database

1. Run `pnpm db:schema:check` and quote its result. Without a local runtime, say
   that CI's "Declarative schema verification" workflow is the equivalence check.
2. Run the SQL tests that cover the change: `node supabase/tests/<name>.test.mjs`
   (PGlite), plus the `supabase/tests/*.sql` smoke files CI replays.
3. Run `node scripts/validate-supabase-migrations.mjs origin/main` for new migrations.
4. For an RPC that replaces client-side aggregation, show it returns the same
   totals as the old path on the same fixture data.
5. Readback: after deploy, and only with the maintainer's approval, a read-only
   query showing the new state (the function, column, policy or row). Otherwise
   list the readback under what you did not verify.

## Docs

1. Run the checks that need no Mintlify: `pnpm --filter @phaseo/docs openapi:locales:check`,
   `validate:locales`, `translation:freshness:check`, `skills:check`, and
   `pnpm docs:public-safety`. Run `pnpm --filter @phaseo/web docs:search:index`
   after title, description or heading changes.
2. Run `pnpm docs:links`, or `mint broken-links` with the current CLI on Windows.
3. Preview the page locally (see Development) and screenshot it in English and
   in one translated locale it affects. Add Arabic when layout changes, to check
   right-to-left.
4. Before and after: the rendered page, or the changed text side by side.
5. After merge, load `https://phaseo.app/docs/v1/<page>?cb=<n>` to confirm it is live.

## SDKs

1. Regenerate the touched language: `pnpm openapi:gen:<language>`. Show
   `git diff --stat` so reviewers see only the intended generated changes.
2. Run its tests: `pnpm test:sdk-<language>`, and `pnpm test:agent-sdk-<language>`
   when the Agent SDK depends on the change.
3. For the TypeScript SDK, also run `pnpm packages:pack:ts`. Run
   `pnpm sdk:check-version-literals` when versions change.
4. Evidence: the generated signature or type before and after, and a test that
   calls the changed operation through a mock transport.
5. Do not run smoke or live SDK tests unless the maintainer asks.

## Catalogue data

1. Before: a read-only query of the affected rows, and the source showing the
   current value is wrong (provider docs, pricing page or changelog link).
2. Make the targeted change only when the maintainer asks.
3. After: run the same query and show the changed fields in a
   Field | Before | After table.
4. Check the public surface, such as the model page or `phaseo api get /v1/models --json`
   through the maintainer's CLI session. Caches can delay it.
5. `pnpm validate:data` and its siblings check archived fixtures, not live data.

## Performance

1. Pick the metric the change is meant to move: latency, startup time, payload
   or bundle size, query time, memory, CPU, or cost.
2. Measure before and after with the same command, environment, data and
   sample size. Discard warm-up runs. Take at least 5 runs (more when the
   network is involved) and report the median and the run count.
3. Alternate before and after runs when you can, so drift affects both.
4. Useful measurements:
   - Startup: time from launch to the first successful `/v1/health`, median of 5.
   - Payload: `curl -s -o /dev/null -w '%{size_download} %{time_total}\n' -H 'Accept-Encoding: br' <url>`,
     both raw and compressed.
   - Query time: `explain (analyze, buffers)` on a local or PGlite database.
     On production, use only `explain` without `analyze`, and only with approval.
   - Gateway latency: `apps/api/scripts/benchmark-real-gateway.ts` sends real
     inference through a local gateway, so it spends credit. Run it only when asked.
     [gateway-performance-20260905.md](../../../apps/api/docs/gateway-performance-20260905.md)
     shows a complete write-up.
5. Say what small local samples cannot show, such as production p95 latency.

## Write it up

```markdown
## Before and after

Measured with `<command>` on <environment>, median of <N> runs after <W> warm-up runs.

| Metric | Before | After | Change |
| --- | --- | --- | --- |
| <metric> | <value> | <value> | <percentage> |

## Verification

- `pnpm --filter @phaseo/gateway-api exec vitest run src/<path>` → 48 passed
- `curl -sS http://127.0.0.1:8795/v1/<path>` → 200; `<field>` now present (output below)
- Not verified: <check>, because <reason>.
```

If there is no measurable benefit, say so and show the before and after content
instead. For a bug fix, show the failing output before and the passing output after.
