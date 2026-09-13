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

## Private upstream discovery

External upstream discovery checks model sources outside Phaseo, including provider `/models` APIs and watched Hugging Face organisations/models. Provider `/models` checks run from the Cloudflare Worker scheduled runner. Hugging Face checks run from GitHub Actions on an hourly schedule. Both can send Discord notifications. Provider model and pricing changes can dispatch `.github/workflows/provider-catalog-sync.yml`, which validates and creates or updates one batched ready-for-review pull request. The Worker requires `GITHUB_TOKEN` or `GH_TOKEN` with repository Contents write permission to send that repository dispatch.

The pricing pass diffs normalized price-bearing lines from official provider documentation against the previous snapshot stored in `model_discovery_pricing_pages`, so Discord alerts list the actual added and removed price lines instead of a generic page-level signal. The first successful run establishes a baseline; later changes dispatch only the affected catalog provider. The PR workflow updates exact catalog matches with simple standard pricing and leaves tiered or conditional pricing for review. Official pages whose provider model APIs already expose watched pricing (ElevenLabs, Together, xAI) are not separately page-monitored.

Provider `/models` state is stored as compact per-model watch snapshots (`model_discovery_seen_models.watch_snapshot`: context length, max completion tokens, normalized pricing details, and a pricing fingerprint) rather than raw provider payloads. Run summaries in `model_discovery_runs` persist only cross-run diff state such as fingerprints, cursors, and coverage baselines. As a result, persisted discovery rows no longer feed catalog enrichment; the catalog-sync workflow enriches exclusively from live provider fetches, and upstream changes reach the database as notifications for manual review.

Structured official-page adapters currently cover Anthropic, Cloudflare Workers AI, DeepSeek, Fireworks, Moonshot AI, OpenAI, Perplexity, StepFun, Voyage, Weights & Biases, Xiaomi, and Z.AI. Other configured official pages remain fingerprint-monitored until a provider-specific parser is added; they never fall back to a third-party catalog. The hourly workflow batch includes every configured official source and every persisted provider-discovery record.

The Worker also watches the public or authenticated catalogs used by models.dev, including OpenRouter, LLM Gateway, Vercel AI Gateway, ZenMux, FastRouter, Mara, NovitaAI, OrcaRouter, Pioneer, Requesty, Poe, CrossModel, OVHcloud, and the provider-owned W&B feed. Phaseo's catalogue watcher uses an explicit provider-module registry under `apps/web/scripts/catalogue/provider-sync/providers/`; each module owns its endpoint, optional credential, and response parsing while the shared runner owns provenance, canonical mapping, and pricing writes. The hourly catalog workflow checks direct feeds first, then uses the public provider-keyed models.dev catalogue only to fill missing simple pricing without overwriting direct rates. Conditional, tiered, stale, and credential-gated rows remain in the sync report for review. The workflow checks all configured provider sources in one run and reuses one batch branch and pull request; manual runs and repository dispatches can still limit the provider list.

See [AUTOMATION_COVERAGE.md](./AUTOMATION_COVERAGE.md) for source parity, credential requirements, automatic-PR safety boundaries, and the explicit manual pricing queue.

See [OPENAI_GPT6_READINESS.md](./OPENAI_GPT6_READINESS.md) for the evidence,
automation coverage, and publication gates for a possible OpenAI GPT-6 launch.

Provider `/models` Discord alerts are filtered to provider model IDs already known in the database table `data_api_provider_models` (`provider_model_slug` and the `api_model_id` tail), regardless of `is_active_gateway` status. The internal pricing-rule monitor is disabled in production because it observes Phaseo-owned catalog edits; upstream provider and official pricing source monitors remain available. GitHub issue sync is intentionally not filtered by that allowlist: unknown upstream models are included in triage issues so newly exposed provider or Hugging Face models are not silently discarded.

Issue state is stored in `scripts/model-discovery/state/provider-change-issues.json`. Issue threads are grouped by source, provider/org, and action type so provider API and Hugging Face signals cannot collide.

## Internal Phaseo catalog discovery

Public Phaseo catalog discovery checks Phaseo-owned state such as database records, public model/catalog files, provider mapping data, and generated SDK/OpenAPI model surfaces. These checks may send Discord notifications or write reports, but they do not create, update, comment on, close, label, or otherwise mutate GitHub issues.

Internal model file checks read from `packages/data/catalog/src/data/models`.
Internal Discord alerts are sent as embed payloads only when internal models are added. Lifecycle/status edits are recorded in the discovery report but do not send Discord notifications.
Already-announced model IDs are persisted to:

- `scripts/model-discovery/state/internal-announced-models.json`

This avoids duplicate notifications across runs while the GitHub Actions cache is retained.
The legacy script state files under `scripts/model-discovery/state` are still useful for local/manual runs.

Providers marked inactive in `discovery-policy.ts` are skipped explicitly with an `Inactive by policy` reason. Use this for providers without a stable/public models endpoint.
Providers not present in `discovery-policy.ts` are also treated as inactive by default.

## Script entrypoints

- `scripts/model-discovery/run.ts`
  - Local/manual external upstream provider `/models` API discovery. The production scheduled equivalent lives in the Cloudflare Worker.
- `scripts/model-discovery/run-hf-private.ts`
  - Local/manual external upstream Hugging Face discovery. The production scheduled equivalent lives in `.github/workflows/huggingface-model-discovery.yml`.
- `scripts/model-discovery/run-internal-public.ts`
  - Local/manual internal catalog/database discovery helper. Production runs from `.github/workflows/check-new-models.yml` on pushes to `main`.

## Local run

```bash
pnpm run data:check-new-models
```

```bash
pnpm run data:check-new-models:test
```

## Environment variables

- `DISCORD_WEBHOOK_NEW_MODELS_PUBLIC` (public webhook URL for internal website model additions)
- `DISCORD_WEBHOOK_URL` (private/default webhook URL for provider and Hugging Face tracking alerts)
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
