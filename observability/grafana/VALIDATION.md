# Observability validation

## Investigation and notification follow-up, 10 November 2026

The installed dashboards have evolved beyond the original generated definitions below. `investigations.mjs --apply` enriched five existing dashboards in place and added `phaseo-investigation`, preserving their layouts and deployment annotations. A real web API trace ID returned one matching record; a blank lookup and a quoted/backslash lookup each returned zero. All three queries succeeded. Grafana's image renderer showed the real record as readable columns with a linked trace ID and no raw JSON. Link configuration and selected-time propagation were checked through API readback and focused tests; interactive hover/click behavior was not exercised.

The rendered check caught Grafana's JSON variable formatter leaving strings unquoted. The lookup now compares percent-encoded IDs with Loki `urlencode`, normalizing spaces, so user input cannot introduce query syntax. The new deployment annotation uses the installed `phaseo-deployment` and `environment:$environment` tags.

`node --test observability/grafana/definitions.test.mjs observability/grafana/investigations.test.mjs observability/grafana/notifications.test.mjs`: **18 passed**, zero failures/skips. `git diff --check`: passed. Notification tests cover production-only matching, preservation of unrelated policies, secure token readback before enabling rules, recovery messages, and failure/concurrent-edit paths. The existing incident.io **Grafana alerts** source was found through its **Manage connection** screen. The owned Grafana contact point, production route and rule investigation annotations were applied and read back successfully; the API requires a server-generated receiver name on creation. The incident.io source had zero routes, and creating its Slack route was interrupted by a stalled browser tab. Slack delivery and recovery delivery remain unverified; production and staging alert rules remain paused. Collection volume, sampling, retention and paid plans were not changed.

Release preparation on 6 November 2026, based on `f7a27db05011e8ff60581eccd7d48d578203220f` (current TanStack Start/Cloudflare application). The original dirty checkout was preserved; checks from its obsolete Next.js application are not used as release evidence.

## Cloud configuration

Stack: <https://honestcushion71.grafana.net>.

The initial rollout installed five dashboards in `phaseo-observability`, with 32 panels total. All 37 initial dashboard/alert LogQL expressions passed against the stack's Loki datasource. Those definitions were reapplied after adapting the server labels to Cloudflare. Five staging alerts remain paused. No contact points or notification policies were changed.

Frontend Observability application `phaseo-web` (ID 1418) allows `https://phaseo.app` and `https://www.phaseo.app`. Add an actual staging origin before testing there.

One harmless staging log and matching Tempo span were independently queried successfully for trace ID `5134345841d35406a5690d7c46661c0c`, service `phaseo-observability-check`. This verifies ingest credentials and query access, not deployed application instrumentation. No model calls were made.

Six dedicated production Infisical auto-syncs succeeded, with destination deletion disabled:

| Target | Source folder |
| --- | --- |
| Cloudflare `phaseo-gateway`, `phaseo-gateway-eu`, `phaseo-gateway-us`, `phaseo-web-api` | `/observability/backend` |
| Cloudflare `phaseo-web` | `/observability/web-worker` |
| Previous Vercel website fallback | `/observability/web` |

All source values were privately read back; all eight Vercel destination values also matched. The old general Vercel production sync still targets a deleted project and remains untouched. Temporary monitoring copies were removed from the original application folders, preserving their original settings. Development and staging were not changed. Gateway cron runs the scheduled jobs; no new Worker or schedule was created.

## Initial release checks

- Shared transport, browser redaction, dashboard/provisioning definitions and source-map file checks: **13 passed** (`node --test packages/shared/observability/index.test.mjs packages/shared/observability/browser.test.mjs observability/grafana/definitions.test.mjs observability/grafana/build-web.test.mjs`).
- Cloud query validation: **37 passed** (`provision.mjs --check` using the private local configuration).
- Gateway: **60 passed** across platform (5), jobs (1), events (27), scheduler (23) and Axiom (4) suites, using scoped Vitest runs with one worker. Scheduler fixtures log handled mock failures but all assertions pass.
- Web API: **13 passed** across telemetry (2), chat proxy (3), preview proxy/trace propagation (5), provider polling (2) and scheduled charges (1).
- Web: **6 passed** across browser consent (3), public runtime configuration (1) and server errors (2).
- **92 unique focused tests passed** in total. Repeat runs after fixes are not counted twice.
- `pnpm --filter @phaseo/gateway-api lint`: ESLint passed with 55 warnings; its first typecheck caught two integration fields that changed on main. Both were corrected; `pnpm --filter @phaseo/gateway-api typecheck` subsequently passed.
- `pnpm --filter @phaseo/web-api lint`: passed, including SDK build and typecheck, with five warnings.
- `pnpm --filter @phaseo/web lint`: passed with 833 warnings. `pnpm --filter @phaseo/web typecheck`: passed. Package-wide warning cleanup is outside this release.
- `pnpm --filter @phaseo/web build`: full client/server production build passed. Browser filesystem externalization and chunk-size warnings remain. The built client contains zero source maps.
- Gateway, both regional gateways and web API Wrangler dry-run builds passed (`build` and `build:regional`). Website `wrangler deploy --dry-run --config dist/server/wrangler.json` passed (7,153 KiB gzip upload).
- The built website ran in local workerd: `GET /privacy` returned **200**, rendered HTML included the runtime public Faro collector configuration, and no OTLP authorization setting was exposed. No browser collector requests or model calls were made. The temporary server was stopped.
- Staged diff was checked against both private Grafana credentials; neither is present.
- The initial release (#3579) and Cloudflare redirect-mode fix (#3581) are merged and deployed. The production CI run for `4beff8d12ebed859061f8ee20c961aa3abe5b24d` passed, and all five intended Workers retained their monitoring bindings.

## Review regressions

- The root-loader regression failed before the fix (`Network unavailable` rejected the loader), then passed after making monitoring configuration optional. Both rejection and successful configuration results are covered. All eight focused web monitoring/root tests passed.
- Local Loki 3.6.0 received OTLP fixtures with distinct trace/span metadata. Before grouping, the gateway p95 produced 20 series instead of one. After grouping, all five dashboard/provisioning/Loki tests passed: gateway duration p95 190.5 ms across 20 requests, web API p95 39 ms, first-token p95 38.1 ms, provider first-token p95 19.05 ms, and exactly two job series with p95 values 140 ms and 75 ms. Query limit is 1,000, and each run uses an isolated fixture environment.
- `pnpm --filter @phaseo/web typecheck`: passed after the root-loader fix.
- Scoped ESLint for `__root.tsx` and `-root.test.ts` passed without warnings. The full web production build passed again, with the existing externalization/chunk warnings and zero client source maps. All 37 Cloud queries validated again; all 32 installed panel queries match the corrected definitions, and five staging alerts remain paused. The temporary local Loki process was stopped.

## Rollout evidence still required

Production versions, a scheduler heartbeat, environment filtering, and matching request log/trace were verified after #3581 deployed. A harmless unmatched web API GET returned 404; its production log and one Tempo span were read back for trace `71a4e624b387c9566cecb19e4bb746d9`, with no model or database call. Website `/privacy` and gateway `/v1/health` returned 200; public Faro configuration was present and private Grafana credentials were absent from website HTML. Controlled errors/cancellation and browser consent collection still need staging verification. Browser sessions are sampled, so absence from an individual session is expected.

Job `completed` means its handler returned; internally caught failures are not inferred from arbitrary summaries. Web API scheduled provider polling and monthly charges explicitly include their known failed counts. Operational settlement/persistence hooks report independently.

Private source-map cloud upload/symbolication require a separate upload credential and are not enabled in standard deployment. Local recursive discovery and oversized-map rejection pass. Independent synthetic uptime checks are documented but not installed. Keep alerts paused until data and notification routing are verified. Check Grafana usage during rollout and keep the account on Free; sampling does not guarantee a monthly quota.
