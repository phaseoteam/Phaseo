# Model Discovery

This pipeline is designed to be extensible:

1. Add one provider script under `scripts/model-discovery/providers/*.ts`.
2. Export a default provider definition via `defineProvider(...)`.
3. The runner auto-discovers and executes all provider scripts.
4. Keep `scripts/model-discovery/providers/discovery-policy.ts` in sync with provider endpoint + active/inactive status.

Each successful provider run snapshots the live model payload into:

- `scripts/model-discovery/state/provider-model-snapshots.json`

On subsequent runs, the runner computes per-provider:

- added models
- removed models
- changed model payloads

The production provider watcher is `apps/api/src/pipeline/model-discovery` and runs in the Cloudflare Worker. The scripts in this directory are local/manual helpers, plus the separate Hugging Face GitHub Actions runner; the package scripts should not be treated as the production scheduler.

## Private upstream discovery

External upstream discovery checks model sources outside Phaseo, including provider `/models` APIs and watched Hugging Face organisations/models. Provider `/models` checks run from the Cloudflare Worker scheduled runner. Hugging Face checks run from GitHub Actions on an hourly schedule. Both can send Discord notifications. Provider model and pricing changes can dispatch `.github/workflows/provider-catalog-sync.yml`, which validates and creates or updates one batched ready-for-review pull request. The Worker requires `GITHUB_TOKEN` or `GH_TOKEN` with repository Contents write permission to send that repository dispatch.

The pricing pass diffs normalized price-bearing lines from official provider documentation against the previous snapshot stored in `model_discovery_pricing_pages`, so Discord alerts list the actual added and removed price lines instead of a generic page-level signal. The first successful run establishes a baseline; later changes dispatch only the affected catalog provider. The PR workflow updates exact catalog matches with simple standard pricing and leaves tiered or conditional pricing for review. Official pages whose provider model APIs already expose watched pricing (ElevenLabs, Together, xAI) are not separately page-monitored.

Provider `/models` state is stored as compact per-model watch snapshots (`model_discovery_seen_models.watch_snapshot`: context length, max completion tokens, normalized pricing details, and a pricing fingerprint) rather than raw provider payloads. Run summaries in `model_discovery_runs` persist only cross-run diff state such as fingerprints, cursors, and coverage baselines. As a result, persisted discovery rows no longer feed catalog enrichment; the catalog-sync workflow enriches exclusively from live provider fetches, and upstream changes reach the database as notifications for manual review.

Structured official-page adapters currently cover Anthropic, Cloudflare Workers AI, DeepSeek, Fireworks, Moonshot AI, OpenAI, Perplexity, StepFun, Voyage, Weights & Biases, Xiaomi, and Z.AI. Other configured official pages remain fingerprint-monitored until a provider-specific parser is added; they never fall back to a third-party catalog. The hourly workflow batch includes every configured official source and every persisted provider-discovery record.

The Cloudflare Worker watches routable provider feeds and does not treat OpenRouter as a routable provider. The separate catalogue synchronizer reads the public or authenticated catalogs used by models.dev, including OpenRouter, LLM Gateway, Vercel AI Gateway, ZenMux, FastRouter, Mara, NovitaAI, OrcaRouter, Pioneer, Requesty, Poe, CrossModel, OVHcloud, and the provider-owned W&B feed. Phaseo's catalogue watcher uses an explicit provider-module registry under `apps/web/scripts/catalogue/provider-sync/providers/`; each module owns its endpoint, optional credential, and response parsing while the shared runner owns provenance, canonical mapping, and pricing writes. The hourly catalog workflow checks direct feeds first, then uses the public provider-keyed models.dev catalogue only to fill missing simple pricing without overwriting direct rates. Conditional, tiered, stale, and credential-gated rows remain in the sync report for review. The workflow checks all configured provider sources in one run and reuses one batch branch and pull request; manual runs and repository dispatches can still limit the provider list.

See [AUTOMATION_COVERAGE.md](./AUTOMATION_COVERAGE.md) for source parity, credential requirements, automatic-PR safety boundaries, and the explicit manual pricing queue.

See [OPENAI_GPT6_READINESS.md](./OPENAI_GPT6_READINESS.md) for the evidence,
automation coverage, and publication gates for a possible OpenAI GPT-6 launch.

Provider `/models` Discord alerts are filtered to provider model IDs already known in the database table `data_api_provider_models` (`provider_model_slug` and the `api_model_id` tail), regardless of `is_active_gateway` status. The internal pricing-rule monitor is disabled in production because it observes Phaseo-owned catalog edits; upstream provider and official pricing source monitors remain available. GitHub issue sync is intentionally not filtered by that allowlist: unknown upstream models are included in triage issues so newly exposed provider or Hugging Face models are not silently discarded.

Issue state is stored in `scripts/model-discovery/state/provider-change-issues.json`. Issue threads are grouped by source, provider/org, and action type so provider API and Hugging Face signals cannot collide.

## Internal Phaseo catalog discovery

Public Phaseo catalog additions are checked by the same Cloudflare Worker schedule as provider discovery. The Worker reads `v2_models`, keeps a database-backed cursor in `model_discovery_public_announcements`, silently baselines the existing catalog on first run, and leaves later public additions pending until the public Discord webhook accepts the embed. Failed deliveries remain pending for a later retry. These checks may send Discord notifications or write reports, but they do not create, update, comment on, close, label, or otherwise mutate GitHub issues.

The legacy file-based helper still reads `packages/data/catalog/src/data/models` for local/manual investigations. It is no longer the production source for public model announcements, and the old push-triggered `check-new-models.yml` workflow has been retired because the catalog is database-backed.

Providers marked inactive in `discovery-policy.ts` are skipped explicitly with an `Inactive by policy` reason. Use this for providers without a stable/public models endpoint.
Providers not present in `discovery-policy.ts` are also treated as inactive by default.

## Script entrypoints

- `scripts/model-discovery/run.ts`
  - Local/manual external upstream provider `/models` API discovery. The production scheduled equivalent lives in the Cloudflare Worker.
- `scripts/model-discovery/run-hf-private.ts`
  - Local/manual external upstream Hugging Face discovery. The production scheduled equivalent lives in `.github/workflows/huggingface-model-discovery.yml`.
- `scripts/model-discovery/run-internal-public.ts`
  - Local/manual file-based internal catalog discovery helper. Production public model announcements run from the Cloudflare Worker instead.
- `scripts/model-discovery/send-public-announcement-test.ts`
  - Local one-shot Discord smoke test for the public announcement formatter and webhook transport. It does not read `DISCORD_ROLE_ID`, does not access Supabase, and does not change announcement state.

To test the public Discord payload safely, create a webhook in a private Discord
test channel and put it in the ignored local file `apps/api/.dev.vars`:

```text
DISCORD_WEBHOOK_NEW_MODELS_PUBLIC_TEST=https://discord.com/api/webhooks/...
```

The test webhook must be separate from both the private operator webhook and the
eventual public production webhook. The command defaults to a dry run:

```bash
pnpm run data:test-public-model-announcement
pnpm run data:test-public-model-announcement -- --send
```

The `--send` form posts one sample public embed with empty user and role
mention lists. It never uses `DISCORD_ROLE_ID` and does not mark any database
announcement as delivered. Keep the webhook value out of chat, source files,
and committed environment files.

For a one-time integration test using the production-scoped public webhook
already stored in Infisical, inject the secret without printing it and opt into
that source explicitly:

```bash
infisical run --projectId=<project-id> --env=prod --path=/ -- pnpm run data:test-public-model-announcement -- --send --webhook-env DISCORD_WEBHOOK_NEW_MODELS_PUBLIC
```

This still sends the sample payload with empty user and role mention lists. It
does not read `DISCORD_ROLE_ID` or the private discovery webhook. Use this only
when the configured public webhook points to the intended test channel.

For the deployed primary Worker, the production value belongs in Infisical at
the `prod` environment and `/` path under the name
`DISCORD_WEBHOOK_NEW_MODELS_PUBLIC`. The API deployment workflow loads that
secret through Infisical OIDC and passes it to Wrangler as a temporary secrets
file. It is not stored in `wrangler.toml` or committed to Git.

## Local run

```bash
pnpm run data:check-new-models
```

```bash
pnpm run data:check-new-models:test
```

## Environment variables

- `DISCORD_WEBHOOK_NEW_MODELS_PUBLIC` (public webhook URL for database catalog additions)
- `DISCORD_WEBHOOK_NEW_MODELS_PUBLIC_TEST` (local-only test webhook used by the no-mention smoke-test command; never a production binding)
- `DISCORD_WEBHOOK_URL` (private/default webhook URL for provider and Hugging Face tracking alerts)
- `MODEL_DISCOVERY_SLACK_WEBHOOK_URL` (optional Slack incoming webhook for private discovery alerts)
- `MODEL_DISCOVERY_REVIEW_URL` (optional deep link for the internal discovery queue; defaults to `https://phaseo.app/settings/internal/model-discovery`)
- `MODEL_UPDATES_NOTIFICATIONS_DISABLED` (set to `true` or `1` to keep public announcement rows pending without sending)
- `MODEL_DISCOVERY_ENABLED` (Cloudflare Worker kill switch; defaults to enabled)
- `MODEL_DISCOVERY_SHARDING_ENABLED` (defaults to enabled for compatibility; production is configured for one all-provider invocation)
- `MODEL_DISCOVERY_CONCURRENCY` (bounded provider-request concurrency; production defaults to `8`)
- `DISCORD_PUBLIC_MODEL_DISCOVERY_AVATAR_URL` (optional public bot avatar override; defaults to `https://phaseo.app/png_logo_light.png`)
- `DISCORD_PRIVATE_MODEL_DISCOVERY_AVATAR_URL` (optional private bot avatar override; defaults to `https://phaseo.app/png_logo_dark.png`)
- `DISCORD_MODEL_DISCOVERY_AVATAR_URL` (legacy fallback avatar override when calling internal runner scripts with `--discord-avatar-url`)
- Watched Hugging Face orgs for the GitHub Actions scheduled runner are currently passed in `.github/workflows/huggingface-model-discovery.yml`
- `HF_TOKEN` (optional Hugging Face token for orgs/models that require authenticated API access)
- `GITHUB_TOKEN` or `GH_TOKEN` (enables provider-catalog repository dispatches; also enables legacy issue sync when `MODEL_DISCOVERY_ISSUE_SYNC_ENABLED=true`)
- `NEXT_PUBLIC_SUPABASE_URL` (required for known provider model DB allowlist)
- `SUPABASE_SERVICE_ROLE_KEY` (required for known provider model DB allowlist)
- Provider-specific API keys declared in each provider module.

For local runs, the runner also auto-loads env files (without overriding already-exported shell vars) in this order:

1. `dev.env`
2. `.env`
3. `.dev.vars`
4. `dev.vars`
5. `.env.locals`
6. `.env.local`
7. `apps/api/.dev.vars`
8. `apps/api/dev.vars`
9. `apps/api/.env.locals`
10. `apps/api/.env.local`
11. `apps/api/.env`
12. `apps/web/.dev.vars`
13. `apps/web/dev.vars`
14. `apps/web/.env.locals`
15. `apps/web/.env.local`
16. `apps/web/.env`
17. `scripts/model-discovery/.dev.vars`
18. `scripts/model-discovery/dev.vars`
19. `scripts/model-discovery/dev.env`
20. `scripts/model-discovery/.env.locals`
21. `scripts/model-discovery/.env.local`
22. `scripts/model-discovery/.env`

## Adding a provider

Create `scripts/model-discovery/providers/<provider>.ts`:

```ts
import { asArray, asRecord, defineProvider, fetchJson, normalizeModelEntries } from "./_shared";

export default defineProvider({
    id: "example",
    name: "Example",
    requiredEnv: ["EXAMPLE_API_KEY"],
    async fetchModels() {
        const payload = await fetchJson({
            url: "https://api.example.com/v1/models",
            init: {
                headers: {
                    Authorization: `Bearer ${process.env.EXAMPLE_API_KEY}`,
                },
            },
        });

        const data = asArray(asRecord(payload)?.data);
        return normalizeModelEntries(data, (item) => (typeof item.id === "string" ? item.id : null));
    },
});
```
