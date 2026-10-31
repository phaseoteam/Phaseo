# Incidents and status updates

What to do when production breaks: how bad it is, who acts, what to check first, what to tell customers, and what to write up afterwards. Tracked in PHA-237.

## Severity

| Level | Meaning | Examples | First public update |
| --- | --- | --- | --- |
| SEV1 | Most customers can't use the gateway, or money or keys are wrong. | `https://api.phaseo.app/v1/health` fails or every request returns `5xx`; customers are charged twice or charged for failed requests; keys leaked or usable by the wrong workspace. | Within 15 minutes |
| SEV2 | A real part of the product is broken, but there is a workaround or most traffic still works. | One provider is down and fallback works but is slower or dearer; one endpoint (for example images or batches) fails; one region (`phaseo-gateway-eu` or `-us`) fails; sign-in or top-ups fail. | Within 30 minutes |
| SEV3 | Little or no customer impact on API traffic. | A dashboard page shows wrong numbers; a docs page is broken; a single model route is down with others serving it. | Next working day, if at all |

- When unsure, pick the higher level. Lower it once you know more.
- Anything touching billing or API keys starts at SEV1 until you know how many workspaces it reached.
- SEV3 doesn't go on the status page. Fix it, and answer customers who ask through support. If several customers ask about the same SEV3, post it after all.
- The first-update targets apply around the clock where possible. One person runs Phaseo, so outside waking hours they depend on the incident.io page reaching the maintainer (see [Outage alerts](#outage-alerts)).

## Roles

Phaseo is run by one person today. The maintainer is the only contact: they lead the incident, fix the problem and write every customer update. There is no backup contact.

If a backup is added later, they need access to every service Phaseo runs on: GitHub, Vercel, Cloudflare, Supabase, incident.io, Stripe, PostHog, Axiom, Linear, Discord and X.

## First 15 minutes

1. **Confirm it's real.** Call `curl https://api.phaseo.app/v1/health`, load `https://phaseo.app`, and repeat the failing request yourself. A single failed request is not an incident; check its request ID first.
2. **Set the severity** using the table above. Start a running timeline (UTC times and what you did) in a Linear issue. If the observability bridge already opened one, use that.
3. **Post on the status page** for SEV1 and SEV2, using the "Investigating" template below. If an Instatus alert already posted one for the same component (see [Outage alerts](#outage-alerts)), update that post instead of creating a second one. The site footer reads from it, and the docs and Trust page link to it.
4. **Check what changed.** Look at the latest `deploy (…)` jobs of [CI](../../.github/workflows/ci.yml) on `main`, the latest production migration, and catalogue edits made today. Most incidents follow a change.
5. **Find the cause:**
   - Gateway errors and latency: Axiom, dataset set by `AXIOM_WIDE_DATASET` (sampled; see [axiom.ts](../../apps/api/src/observability/axiom.ts) and the `AXIOM_*_SAMPLE_RATE` settings in [wrangler.toml](../../apps/api/wrangler.toml)).
   - Worker logs: Cloudflare dashboard, Workers, then `phaseo-gateway`, `phaseo-gateway-eu`, `phaseo-gateway-us` or `phaseo-web-api`. Gateway logs are sampled at 10%; Web API logs at 100%. `pnpm exec wrangler tail <worker>` from `apps/api` or `apps/web-api` streams live logs.
   - Website errors: PostHog error tracking (EU, project 81404). Browser and server errors are captured only for visitors who accepted analytics cookies ([instrumentation.ts](../../apps/web/instrumentation.ts), [instrumentation-client.ts](../../apps/web/instrumentation-client.ts)), so a quiet PostHog doesn't mean the site is fine.
   - Upstream providers: `https://phaseo.app/api/_web/status/providers` summarises the public status feeds of the largest providers, then check the provider's own status page.
   - Database: Supabase dashboard for the production project. Check memory, swap and disk IO before blaming a query. Read-only queries only, one at a time, with a `limit`.
6. **Stop the damage:**
   - **Bad web deploy:** from `apps/web`, run `pnpm exec wrangler rollback --name phaseo-web` (or roll back in the Cloudflare dashboard under the `phaseo-web` Worker's Deployments). The next green CI run on `main` deploys again, so revert or fix the change at the source too.
   - **Bad Worker deploy:** from `apps/api`, run `pnpm exec wrangler rollback --config wrangler.toml`, then the same with `wrangler.eu.toml` and `wrangler.us.toml`. From `apps/web-api`, `pnpm exec wrangler rollback`. Check the [deploy scripts](../../apps/api/scripts/deploy-global.ps1) for any secret the rolled-back version still needs. Rollback doesn't undo Durable Object migrations: if the bad deploy added a `[[migrations]]` entry in `wrangler.toml`, rolling back past it can fail, so revert at the source instead.
   - **Bad migration:** there is no automatic rollback. Write a forward-fix migration and ship it through a pull request.
   - **Revert at the source:** revert the merge commit in a pull request. Merging it redeploys everything through CI. Running CI on `main` by hand with `deploy_production` set is not a quick redeploy: it does nothing unless the `ENABLE_PRODUCTION_DB_MIGRATIONS` variable is `true`, and when it is, it applies pending production migrations first and then redeploys every service (web, the three gateways, Web API, MCP, Slack agent and docs).
   - **Broken provider:** the gateway's circuit breaker already stops sending traffic to a provider route once its recent error rate reaches 50% ([health.config.ts](../../apps/api/src/pipeline/execute/health.config.ts)), and fallback picks another provider. To switch a route off by hand, untick "Gateway routing enabled" for that provider in the model's pricing editor at `/internal/data/models/edit/<model id>`. Switching a whole provider off means setting `routing_enabled = false` on its `v2_providers` row; there is no admin switch for that yet, so it is a production write that needs explicit approval. Saving a route doesn't purge the shared catalogue cache, so afterwards run the `catalogue` purge at `/internal/cache` and check that both the Web API catalogue and the gateway `models` purges report success.
   - **Key leak at a third-party platform:** use `/internal/key-incidents` to revoke or pause every key that workspaces recorded as stored there. It emails each affected workspace's owners and admins. If it returns `notification_enqueue_failed`, the keys were changed but no emails were queued: retry with the same request ID, which is safe, before closing the incident.

## Telling customers

- **Status page:** `https://status.phaseo.app`, hosted on incident.io. The site footer, the Trust page and the docs link to it; the footer shows its current state through `/api/_web/status` ([status.ts](../../apps/web-api/src/routes/public/status.ts)). The components shown include API health, Models API, Generations API, Homepage and Docs.
- **Updates:** post at least every 30 minutes for SEV1 and every hour for SEV2 while the incident is open, even if nothing has changed.
- **Email affected customers** when their own workspace was affected in a way they might not notice: wrong charges, failed batches or async jobs, revoked or paused keys, or data shown to the wrong workspace. For gateway traffic, find the affected workspaces from `v2_private_usage_15m` for the incident window (a rollup, so it is safe to query) rather than raw request tables. Failed batches and async jobs may never reach that rollup, so for those use `gateway_batch_requests` and `gateway_async_operations`, filtered by status and time window, with a `limit`. There is no bulk incident email tool; `/internal/key-incidents` covers only key leaks. Send these emails by hand from `support@phaseo.app`.
- **Status page subscribers:** customers who subscribe to `https://status.phaseo.app` get an email from incident.io for each published incident and update, if subscriber notifications are on in the status page's settings. This covers broad outages; it doesn't replace the emails above, which go only to the affected workspaces.
- **X (`https://x.com/phaseoteam`) and Discord (`https://discord.gg/aQyywCvgZ5`):** post a short note linking to the status page for SEV1, and for SEV2 lasting more than an hour.
- Never name or blame a provider or a person. Say what customers see and what they can do.

### Templates

**Investigating**
> We're looking into [higher error rates / failed requests / slow responses] on [the API / model or endpoint / the dashboard] since [HH:MM UTC]. [Requests may fail with 5xx errors. Retrying with backoff may help.] Next update by [HH:MM UTC].

**Identified**
> We've found the cause of [the problem] and are [rolling back a change / moving traffic to other providers / applying a fix]. [What customers can do in the meantime.] Next update by [HH:MM UTC].

**Monitoring**
> A fix is in place and [error rates / response times] are back to normal. We're watching to make sure it holds. Next update by [HH:MM UTC].

**Resolved**
> This is resolved. From [HH:MM] to [HH:MM UTC], [what customers saw, including roughly what share of requests]. [You were not charged for failed requests. / We will contact affected workspaces about credits.] We're sorry for the disruption and will share what we're changing to prevent it.

## Afterwards

Write a review for every SEV1 and SEV2 within five working days, as a Linear issue or a comment on the incident issue. Each follow-up becomes its own Linear issue.

```md
## What happened
One paragraph in plain language.

## Impact
- Duration: HH:MM to HH:MM UTC
- Requests affected: N (of M in the window)
- Workspaces affected: N (paying: N)
- Money: wrongly charged $X; credits or refunds given $Y

## Timeline (UTC)
- HH:MM Change shipped / problem started
- HH:MM First alert or report
- HH:MM Status page updated
- HH:MM Mitigated
- HH:MM Resolved

## Cause
What broke and why our checks didn't catch it. No blame.

## What changed
Fixes shipped, with pull request links, and follow-up issues with owners.
```

### Credits and refunds

How money goes back today:

- **Self-serve refunds:** a customer can refund a whole top-up within 24 hours if the credit from it hasn't been used ([refund route](../../apps/web/src/routes/api/stripe/refunds/request/index.ts)). This doesn't help after an incident that consumed credit.
- **Credit codes:** `/internal/credits` creates a promo code with an amount, a redemption limit and an expiry. Send the code to the affected workspace by email.
- **Ledger adjustments:** the credit ledger supports `grant`, `refund` and `adjustment` entries ([v2_credit_ledger.sql](../../supabase/schemas/public/tables/v2_credit_ledger.sql)), but there is no admin tool to add one to a single workspace, so use credit codes for now.
- **Card refunds** beyond the self-serve window go through the Stripe dashboard.

When Phaseo gives money back:

- **Wrong charges:** refund in full, whatever the amount.
- **Failed requests that were billed:** credit the amount billed.
- **Minimum credit:** $5. Round smaller amounts up to $5.
- **Long SEV1:** paying workspaces get a goodwill credit of at least $5. Set the amount per incident.
- **No credit** for slow responses, or for provider outages where fallback served the request.

## Tools and links

| What | Where |
| --- | --- |
| Status page (incident.io) | `https://status.phaseo.app` |
| Status summary used by the footer | `https://phaseo.app/api/_web/status`, source [status.ts](../../apps/web-api/src/routes/public/status.ts) |
| Upstream provider status | `https://phaseo.app/api/_web/status/providers` |
| Gateway health check | `https://api.phaseo.app/v1/health` |
| Customer-facing reliability guide | [reliability-and-status.mdx](../../apps/docs/v1/developers/reliability-and-status.mdx) |
| Gateway events | Axiom, `AXIOM_WIDE_DATASET`; [axiom.ts](../../apps/api/src/observability/axiom.ts) |
| Website errors | PostHog EU, project 81404 |
| Alerts to Linear | `POST /internal/observability-incidents` on the gateway turns PostHog and Axiom alerts into deduplicated Linear Triage issues (not yet tested end to end with a real alert from either); [observability-incidents.ts](../../apps/api/src/routes/internal/observability-incidents.ts), setup in the [API README](../../apps/api/README.md#observability-incident-triage) |
| Uptime monitors | Instatus, alerting through incident.io; see [Outage alerts](#outage-alerts) |
| Public probes | "Phaseo Health Pilot" workflow, run by hand; [health-pilot.yml](../../.github/workflows/health-pilot.yml). It creates no incidents. |
| Provider routing health | Circuit breaker settings in [health.config.ts](../../apps/api/src/pipeline/execute/health.config.ts); shared state in [routing-health-durable-object.ts](../../apps/api/src/core/routing-health-durable-object.ts) |
| Route switches | `/internal/data/models/edit/<model id>` |
| Cache purge | `/internal/cache` |
| Key leak response | `/internal/key-incidents` |
| Credit codes | `/internal/credits` |
| Deploys | [ci.yml](../../.github/workflows/ci.yml) `deploy (…)` jobs; Cloudflare for the web app and the other Workers |
| Discord webhooks | `DISCORD_SIGNUP_WEBHOOK_URL` (signups, deletions, Slack agent installs) and `DISCORD_BILLING_WEBHOOK_URL` (checkouts, purchases). Neither sends outage alerts; those come from incident.io. |
| Support | `support@phaseo.app`, `https://phaseo.app/help` |

## Outage alerts

Instatus runs the uptime monitors. When one fails, it sends an alert to incident.io through the "Instatus monitoring" alert route. incident.io opens a Triage incident and pages the "Phaseo Primary Escalation" path. Workflows then post an "Investigating" incident on the status page for the Models, Homepage and Docs components, with subscriber notifications switched off in those workflows, so these automatic posts don't email subscribers. When the monitor recovers, the route declines the incident, and the workflows are set to resolve the status page post (untested, see below). This is all configured in the Instatus and incident.io dashboards, not in the repo.

- A short blip still opens an incident and a public post. Check the monitor's other regions before treating it as real.
- If you resolve a status page post by hand, it records impact up to the moment you resolve it. Correct the start and end times afterwards.
- Not yet tested: whether a declined incident resolves its status page post automatically. incident.io documents that declined incidents are left out of workflows, so check the post after each blip and resolve it by hand if it is still open.
- The Instatus page `phaseo.instatus.com` still exists, but the site reads only `status.phaseo.app`.
