# Phaseo observability

Grafana Cloud hosts compact logs, sampled traces, browser monitoring and five operational dashboards. Applications export directly over HTTPS; no collector server or Prometheus installation is required. The website runs on TanStack Start and Cloudflare, alongside the gateway and web API Workers.

The configured stack is <https://honestcushion71.grafana.net>. See [VALIDATION.md](VALIDATION.md) for verified state and remaining rollout checks.

## Configuration

Backend delivery requires `PLATFORM_TELEMETRY_ENABLED=true`, `GRAFANA_OTLP_ENDPOINT`, `GRAFANA_OTLP_AUTHORIZATION` and `PLATFORM_TRACE_SAMPLE_RATE=0.05`. Gateway and web API use `ENV`; the website uses `PHASEO_ENV`. Only staging/production environments send data. The OTLP Basic authorization is server-only.

The website server function returns only the public Faro URL, enabled flag, environment and session sample rate. Configure `PUBLIC_FARO_ENABLED=true`, `PUBLIC_FARO_URL` and `PUBLIC_FARO_SESSION_SAMPLE_RATE=0.1` on the Worker. Browser collection starts after analytics consent; withdrawal stops transport and removes instrumentation. Sampling covers whole sessions, including their errors. CI supplies `PUBLIC_RELEASE` for each build.

Production settings live in the Phaseo Infisical project:

| Source folder | Destinations |
| --- | --- |
| `/observability/backend` | `phaseo-gateway`, `phaseo-gateway-eu`, `phaseo-gateway-us`, `phaseo-web-api` |
| `/observability/web-worker` | `phaseo-web` (backend settings plus three public browser settings) |
| `/observability/web` | Previous Vercel website fallback (legacy browser variable names) |

All six dedicated auto-syncs succeeded and preserve unrelated destination settings. Development and staging were left unchanged. The old general Vercel sync points to a deleted project and remains untouched because its application settings differ. Gateway cron runs the jobs: `phaseo-jobs` is a telemetry service name, not a new Worker.

Copy [.env.example](.env.example) to the ignored `.env.local` for local provisioning. Never commit tokens or put them in public variables. Keep the Grafana account on Free.

## Provisioning and delivery verification

Create a Free stack, obtain its OpenTelemetry HTTPS endpoint and a stack-scoped ingest token with logs/traces write access. Create a separate Grafana service-account token for dashboard and alert management. Frontend Observability has a separate public collector URL; restrict its allowed origins to the actual websites.

```powershell
node observability/grafana/build.mjs
node observability/grafana/provision.mjs
node --env-file=observability/grafana/.env.local observability/grafana/provision.mjs --check
node --env-file=observability/grafana/.env.local observability/grafana/provision.mjs --apply
```

The first command regenerates JSON; the second prints a local plan without network calls. `--check` evaluates all dashboard and alert queries against Loki. Empty results establish syntax/access, not collection. `--apply` checks ownership and updates five dashboards and five paused alert rules. Reapplying replaces edits to owned resources; writes are sequential, so rerun after an interruption. `GRAFANA_ENVIRONMENT` chooses separate staging or production rule UIDs.

`--apply --frontend` creates the browser application if missing, using `GRAFANA_FRONTEND_ORIGINS` (comma-separated exact HTTPS origins). Existing application settings are preserved. The current app allows `https://phaseo.app` and `https://www.phaseo.app`; add the real staging origin before testing there.

```powershell
node --env-file=observability/grafana/.env.local observability/grafana/smoke.mjs --send
```

This sends a harmless log and matching trace without model calls. Query Loki for `{service_name="phaseo-observability-check"}`, find `telemetry.smoke`, then search its trace ID in Tempo. After deploying, verify real request summaries, a controlled staging cancellation/error and cron heartbeats before relying on alerts.

## Dashboards

| Dashboard | Purpose |
| --- | --- |
| [Overview](https://honestcushion71.grafana.net/d/phaseo-overview) | Request health, latency and telemetry arrival |
| [Gateway and providers](https://honestcushion71.grafana.net/d/phaseo-gateway) | Provider failures, fallbacks and first-token timings |
| [Web experience](https://honestcushion71.grafana.net/d/phaseo-web) | Web API failures, captured server errors and a link to browser monitoring |
| [Jobs and settlement](https://honestcushion71.grafana.net/d/phaseo-jobs) | Handler outcomes and operational failure hooks |
| [Telemetry health](https://honestcushion71.grafana.net/d/phaseo-telemetry) | Heartbeats, persistence failures and truncated attempt detail |

Use the environment dropdown and time picker. The gateway dashboard accepts a request ID. Expand a log line for its request/trace IDs, route, outcome and timings; search retained trace IDs in Tempo. Five-percent trace sampling means most logs have no stored trace. Browser diagnostics also depend on session sampling and consent.

HTTP 200 does not establish successful generation: gateway terminal summaries distinguish logical failure and cancellation. Web API timing ends at response headers and marks SSE responses `started`; it does not consume streams. Website monitoring captures server errors, without a request denominator or automatic database spans. Job `completed` means a handler returned; internally handled failures are not inferred from arbitrary job summaries. Operational hooks report known settlement/persistence errors separately. No backlog age is inferred. Counts describe received events, not exactly-once delivery or financial truth; reconcile billing in Supabase.

Events use allowlisted JSON and the standard Loki `service_name` resource label. Request IDs, model/provider IDs and release IDs are not custom index labels.

## Alerts and uptime

Five paused rules cover actionable gateway failures (>5%, at least 20 requests in ten minutes), missing scheduler telemetry, job exceptions, settlement failures and web errors. Quiet request traffic is healthy; a missing heartbeat is separate. Query failures use Grafana's Error state.

Once telemetry and notification routing are verified, configure **Alerting > Contact points** and its notification policy, then unpause the desired rules. Provisioning does not create contacts or send messages. `--apply --enable-alerts` explicitly activates owned rules; applying without that flag pauses them again.

Independent uptime checks are optional and not installed. Two HTTP checks (homepage and gateway `/v1/health`), one nearby probe and five-minute intervals consume about 17,280 executions per 30-day month. Check the Free allowance before enabling them. Use public GET routes without model calls.

## Private source maps

Ordinary builds produce no browser maps. Optionally configure `FARO_SOURCEMAP_ENDPOINT`, `FARO_SOURCEMAP_APP_ID`, `FARO_SOURCEMAP_STACK_ID`, `FARO_SOURCEMAP_API_KEY` and a unique `PUBLIC_RELEASE`, then run:

```powershell
pnpm --filter @phaseo/web build:observability
```

The wrapper runs Vite with hidden maps, uploads recursively through the pinned official Faro CLI, and removes all maps under `dist/client` in a finally block. It rejects maps above 30 MB before upload. The upload key is withheld from the build subprocess. Deploy that exact successful artifact; rebuilding changes mappings. The upload bundle ID matches Faro's release. Do not enable `PHASEO_PRIVATE_SOURCEMAPS` in ordinary builds. cURL is required. Cloud upload and symbolication need separate verification and are not enabled in the standard release workflow.

## Costs and rollback

Published Free allowances at implementation time are 50 GB/month each for logs and traces, 10,000 metric series, 50,000 frontend sessions and 14-day retention. Confirm current limits at <https://grafana.com/pricing/> and in the account usage screen. This integration creates no custom metric series, samples traces at 5% and browser sessions at 10%, bounds payloads/timeouts, and does not retry exports. Browser collection is capped at 60 signals/minute per page; gateway attempt detail stops at 16 attempts. No console capture, replay, prompts, outputs, credentials, IPs or visitor/workspace identities are exported.

Sampling does not guarantee a monthly quota. Review usage daily during rollout. Staying on Free avoids a paid Grafana bill; exhaustion may stop ingestion. Existing platform CPU/network/invocation costs still apply. Customer Broadcast and Axiom behavior are preserved; retiring duplicate collection is a separate decision.

To stop collection, set `PLATFORM_TELEMETRY_ENABLED=false` in the backend and website Infisical folders, and `PUBLIC_FARO_ENABLED=false` in the website folder. Sync applies backend changes; existing pages may retain public config until reload. Pause alerts while collection is intentionally off. No database migration is required. Export failures emit a static warning; a broken destination cannot report its own failures reliably. Export failures never retry customer requests or settlement.

## Local checks

```powershell
node --test packages/shared/observability/index.test.mjs packages/shared/observability/browser.test.mjs observability/grafana/definitions.test.mjs observability/grafana/build-web.test.mjs
pnpm --filter @phaseo/gateway-api exec vitest run src/observability/platform.test.ts src/observability/jobs.test.ts src/observability/events.test.ts src/scheduled/index.test.ts
pnpm --filter @phaseo/web-api exec vitest run src/observability.test.ts src/chat/proxy.test.ts
pnpm --filter @phaseo/web exec vitest run src/lib/grafana.test.ts src/lib/grafanaConfig.test.ts
```

Also run scoped lint/typechecks and production/Worker builds. [VALIDATION.md](VALIDATION.md) records actual results; previous checks in the obsolete Next.js checkout do not validate the current release.
