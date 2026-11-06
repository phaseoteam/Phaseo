# Observability validation

Release preparation on 6 November 2026, based on `f7a27db05011e8ff60581eccd7d48d578203220f` (current TanStack Start/Cloudflare application). The original dirty checkout was preserved; checks from its obsolete Next.js application are not used as release evidence.

## Cloud configuration

Stack: <https://honestcushion71.grafana.net>.

All five dashboards were installed and read back from `phaseo-observability`, with 32 panels total. All 37 dashboard/alert LogQL expressions passed against the stack's Loki datasource. The current definitions were reapplied after adapting the server labels to Cloudflare. Five staging alerts remain paused. No contact points or notification policies were changed.

Frontend Observability application `phaseo-web` (ID 1418) allows `https://phaseo.app` and `https://www.phaseo.app`. Add an actual staging origin before testing there.

One harmless staging log and matching Tempo span were independently queried successfully for trace ID `5134345841d35406a5690d7c46661c0c`, service `phaseo-observability-check`. This verifies ingest credentials and query access, not deployed application instrumentation. No model calls were made.

Six dedicated production Infisical auto-syncs succeeded, with destination deletion disabled:

| Target | Source folder |
| --- | --- |
| Cloudflare `phaseo-gateway`, `phaseo-gateway-eu`, `phaseo-gateway-us`, `phaseo-web-api` | `/observability/backend` |
| Cloudflare `phaseo-web` | `/observability/web-worker` |
| Previous Vercel website fallback | `/observability/web` |

All source values were privately read back; all eight Vercel destination values also matched. The old general Vercel production sync still targets a deleted project and remains untouched. Temporary monitoring copies were removed from the original application folders, preserving their original settings. Development and staging were not changed. Gateway cron runs the scheduled jobs; no new Worker or schedule was created.

## Current release checks

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
- Deployment is pending PR checks/review and merge.

## Rollout evidence still required

Verify the deployed web, gateway and web API versions and a live scheduler heartbeat. Verify request summaries, environment filtering and retained trace correlation without paid model calls. Controlled errors/cancellation and browser consent collection should be exercised in staging. Browser sessions are sampled, so absence from an individual session is expected.

Job `completed` means its handler returned; internally caught failures are not inferred from arbitrary summaries. Web API scheduled provider polling and monthly charges explicitly include their known failed counts. Operational settlement/persistence hooks report independently.

Private source-map cloud upload/symbolication require a separate upload credential and are not enabled in standard deployment. Local recursive discovery and oversized-map rejection pass. Independent synthetic uptime checks are documented but not installed. Keep alerts paused until data and notification routing are verified. Check Grafana usage during rollout and keep the account on Free; sampling does not guarantee a monthly quota.
