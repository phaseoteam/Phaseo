# Scheduled Worker cutover

`src/jobs.ts` and `wrangler.jobs.toml` prepare a scheduled-only `phaseo-jobs`
Worker. Its cron starts disabled. The gateway continues scheduling until an
explicit production cutover. This separates invocation metrics; it does not
by itself reduce total CPU.

The jobs Worker shares the existing KV and R2 resources and binds to the
gateway's existing Durable Objects through `script_name`. It creates no new
Durable Object storage or migrations. Secrets do not transfer between Workers.

The PR is based on current main and preserves its discovery configuration:
`MODEL_DISCOVERY_SHARDING_ENABLED=false` and `MODEL_DISCOVERY_CONCURRENCY=8`.
The original investigation checkout was older and always sharded; its gateway
configuration was not copied into this PR. Sharding changes remain separate
from provisioning the jobs Worker.

1. Validate with `pnpm --filter @phaseo/gateway-api build:jobs` and the scheduled
   and model-discovery tests. Review bindings and required secrets for each job.
2. Provision `phaseo-jobs` with `crons=[]`, supply its required secrets through
   the established secret-management process, and verify all bindings.
3. In the reconciled gateway configuration, set `crons=[]` and deploy that
   gateway change. Keep its scheduled export available during the transition.
4. Wait for Cloudflare's cron update to propagate (up to 15 minutes according
   to [Cloudflare's documentation](https://developers.cloudflare.com/workers/configuration/cron-triggers/)) and confirm the gateway no
   longer receives scheduled invocations before enabling the jobs cron.
5. Change the jobs configuration to `crons=["* * * * *"]`, deploy it, and
   verify scheduled execution, notification delivery, and outbox draining.
   Observe the two Workers separately over a full discovery cadence.
6. Remove the gateway's scheduled export/import in a follow-up after cutover.

Rollback: disable the jobs cron, confirm it has stopped, then restore the
gateway cron. Never enable both schedules simultaneously. The handoff can
delay maintenance; confirm delayed work is recovered from persisted outboxes
and reconciliation queues.

Pricing-page scraping still runs in the jobs Worker. Moving it to GitHub
Actions needs a separate change preserving notification deduplication and the
rule that pricing baselines advance only after notification delivery succeeds.
Likewise, reducing fingerprints to token prices alone would lose supported
non-token pricing alerts; the sort optimization preserves those alerts.
