# Phaseo observability

Grafana Cloud hosts compact logs, traces, browser monitoring and six operational dashboards. Applications export directly over HTTPS; no collector server or Prometheus installation is required. The website runs on TanStack Start and Cloudflare, alongside the gateway and web API Workers.

The configured stack is <https://honestcushion71.grafana.net>. See [VALIDATION.md](VALIDATION.md) for verified state and remaining rollout checks.

## Configuration

Backend delivery requires `PLATFORM_TELEMETRY_ENABLED=true`, `GRAFANA_OTLP_ENDPOINT`, `GRAFANA_OTLP_AUTHORIZATION` and `PLATFORM_TRACE_SAMPLE_RATE`. Gateway and web API use `ENV`; the website uses `PHASEO_ENV`. Only staging/production environments send data. The OTLP Basic authorization is server-only. The code defaults to 5% trace sampling; production can collect 100% (`1`) while ingestion remains comfortably below Free allowances.

The website server function returns only the public Faro URL, enabled flag, environment and session sample rate. Configure `PUBLIC_FARO_ENABLED=true`, `PUBLIC_FARO_URL` and `PUBLIC_FARO_SESSION_SAMPLE_RATE` on the Worker. The code defaults to 10%; `1` collects every consenting session. Browser collection starts after analytics consent; withdrawal stops transport and removes instrumentation. Sampling covers whole sessions, including their errors. CI supplies `PUBLIC_RELEASE` for each build.

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

The first command regenerates JSON; the second prints a local plan without network calls. `--check` evaluates log queries against Loki and usage queries against the `grafanacloud-usage` Prometheus datasource (`GRAFANA_USAGE_UID` can override its UID). Empty results establish syntax/access, not collection. `--apply` checks ownership and updates six dashboards and five paused alert rules. Use `--apply --dashboards-only` to preserve all existing alert rules and notification settings. Reapplying replaces edits to owned resources; writes are sequential, so rerun after an interruption. `GRAFANA_ENVIRONMENT` chooses separate staging or production rule UIDs.

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
| [Free tier](https://honestcushion71.grafana.net/d/phaseo-free-tier) | Permanent Free allowances, reported billable usage, ingestion pace and missing measurements |

Start with **Overview**, **production**, and **Last 1 hour**. Star this dashboard so it is easy to find again.

The overview groups cards by service, followed by traffic, failure and latency trends. Specialist pages put trends first, then health tables. Expand the record sections for individual requests, errors and trace links; detailed records remain available without filling the main view. Datasource controls are hidden, while environment and relevant search controls stay visible. The Free tier page uses bars scaled to the permanent allowances.

Amber **Deployments** markers show successful production deploy steps, with commit and workflow links. Toggle the overlay at the top of the dashboard and hover a marker for details. Gateway, Web and Jobs show relevant services; Overview and Telemetry show all recorded deployments. Instatus remains the external uptime source.

The `Grafana deployment markers` workflow runs after CI or the manual realtime deployment completes. It reads actual successful deploy steps and their completion timestamps, including successful components of a partially failed release. Skipped website builds, failed deploys and the Mintlify handoff are excluded. A stable run/attempt/job/step tag prevents duplicate markers on retry. Only trusted main-branch code runs with the repository's `GRAFANA_ANNOTATIONS_TOKEN`; its Grafana service account needs organization annotation create/read access. This uses native annotations, not log or trace ingestion, and cannot block a production deployment. New markers arrive when the upstream workflow finishes.

- **Service request health** puts received request counts, actionable failures, failure percentages and p95 timings on the same row. **Grouped failures** identifies recurring routes, error codes, website fingerprints and jobs. Counts describe events, not distinct incidents or affected users; no request traffic leaves the health table empty.
- On the specialist dashboards, use the route, provider/model or job search fields to narrow the tables and charts. Route and provider/model health tables include up to ten failing and ten busiest groups so low-volume failures stay visible. Provider percentages use attempts, which can recover through fallback. Request ID narrows gateway request records and lookups. Record tables show at most the newest 100 matches; trace links open Tempo, where sampling can leave the trace unavailable. Website error records expose redacted source frames; the release table counts captured errors without inventing an error-rate denominator.
- Read the top cards first: scheduler telemetry arriving, gateway requests/failures, web API requests/5xx, and failed jobs. The heartbeat uses the five minutes before the selected range ends; other cards count received events across the whole selected range. Click a card to investigate its service with the same environment and incident time.
- Compare the traffic and failure charts. Each point counts the preceding query interval, with a five-minute minimum. The interval grows on longer time ranges so short spikes between points remain counted. Compare points within the same range; a larger interval naturally contains more events. Gateway and web API traffic are separate populations. The latency charts show p95: 95% of received timings were at or below that duration. Small samples make percentiles unstable.
- Use the breakdowns to find affected outcomes, HTTP statuses, route templates and providers. A 4xx is a client rejection, and a failed provider attempt can be recovered by fallback. Neither automatically means an outage.
- Read **Recent actionable events** as a table of services, routes, jobs and error classifications. Other event tables show request outcomes, provider attempts, job runs and scheduler heartbeats, with durations formatted in milliseconds. Click a trace ID to investigate; use **Inspect matching logs** in the table menu for the original records with the same filters and time range. The gateway dashboard accepts a request ID. Sampling, privacy settings and delivery failures can leave a log without a retained trace. Browser diagnostics also depend on session sampling and consent.

The Free tier view uses organization-wide billing metrics across environments and stacks. Its fixed budgets deliberately ignore larger trial allowances. The 31-day pace is an estimate from available rate samples in the preceding 24 hours, not month-to-date ingestion or a guarantee about future traffic. Missing measurements stay unavailable. Yellow at 80% and red at 100% are dashboard thresholds only; they neither cap exporters nor send notifications. Check this view before and after raising sampling and keep the account on Free. Private source maps and external uptime checks require separate setup.

Zero failures describes received events; it does not establish uptime. Missing heartbeat telemetry can mean cron or export trouble. Empty latency or provider charts mean no matching events in that range. Use an external check or test the affected page/endpoint directly to establish availability. Compare incident timing with [recent deployments](https://github.com/phaseoteam/Phaseo/actions/workflows/ci.yml); after a fix or rollback, verify the affected behavior and the error trend.

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

Published Free allowances at implementation time are 50 GB/month each for logs and traces, 10,000 metric series, 50,000 frontend sessions and 14-day retention. Confirm current limits at <https://grafana.com/pricing/> and in the account usage screen. This integration creates no custom metric series, makes trace and browser sampling configurable, bounds payloads/timeouts, and does not retry exports. Browser collection is capped at 60 signals/minute per page; gateway attempt detail stops at 16 attempts. No console capture, replay, prompts, outputs, credentials, IPs or visitor/workspace identities are exported.

Sampling does not guarantee a monthly quota. Review usage daily during rollout. Staying on Free avoids a paid Grafana bill; exhaustion may stop ingestion. Existing platform CPU/network/invocation costs still apply. Customer Broadcast and Axiom behavior are preserved; retiring duplicate collection is a separate decision.

Backend logs are initially unsampled so request counts, error rates and latency distributions describe all received events. For capacity planning, assuming 2 KiB per ingested log gives about 2.05 GB per million events. A heartbeat every minute is 43,200 events, about 88.5 MB per 30 days; ten additional job events per minute add about 0.885 GB. Provider attempts and web API requests are separate events. These are illustrative volume assumptions, not measured billable usage; traces and browser sessions have separate allowances.

Before enabling notifications, use the stack's actual usage datasource to configure a quota alert at 80% of the verified monthly logs allowance (40 GB if the allowance is 50 GB). Check that it reads account-wide ingested bytes, including other senders, rather than the application's event count. That usage alert is not provisioned here because the account's usage metric and notification route have not been verified. If usage approaches the limit, disable collection through Infisical until a lower-volume policy and its dashboard calculations are reviewed.

To stop collection, set `PLATFORM_TELEMETRY_ENABLED=false` in the backend and website Infisical folders, and `PUBLIC_FARO_ENABLED=false` in the website folder. Sync applies backend changes; existing pages may retain public config until reload. Pause alerts while collection is intentionally off. No database migration is required. Export failures emit a static warning; a broken destination cannot report its own failures reliably. Export failures never retry customer requests or settlement.

## Local checks

```powershell
node --test packages/shared/observability/index.test.mjs packages/shared/observability/browser.test.mjs observability/grafana/definitions.test.mjs observability/grafana/build-web.test.mjs
pnpm --filter @phaseo/gateway-api exec vitest run src/observability/platform.test.ts src/observability/jobs.test.ts src/observability/events.test.ts src/scheduled/index.test.ts
pnpm --filter @phaseo/web-api exec vitest run src/observability.test.ts src/chat/proxy.test.ts
pnpm --filter @phaseo/web exec vitest run src/lib/grafana.test.ts src/lib/grafanaConfig.test.ts
```

Also run scoped lint/typechecks and production/Worker builds. [VALIDATION.md](VALIDATION.md) records actual results; previous checks in the obsolete Next.js checkout do not validate the current release.
