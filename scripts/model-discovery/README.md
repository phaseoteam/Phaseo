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

Private upstream discovery checks model sources outside AI Stats, including provider `/models` APIs and watched Hugging Face organisations/models. These checks send private Discord notifications and can create or update GitHub triage issues when `GITHUB_TOKEN`/`GH_TOKEN` and `GITHUB_REPOSITORY` are available.

Provider `/models` Discord alerts are filtered to provider model IDs already known in the database table `data_api_provider_models` (`provider_model_slug` and the `api_model_id` tail), regardless of `is_active_gateway` status. GitHub issue sync is intentionally not filtered by that allowlist: unknown upstream models are included in triage issues so newly exposed provider or Hugging Face models are not silently discarded.

Issue state is stored in `scripts/model-discovery/state/provider-change-issues.json`. Issue threads are grouped by source, provider/org, and action type so provider API and Hugging Face signals cannot collide.

## Public AI Stats catalog discovery

Public AI Stats catalog discovery checks AI Stats-owned state such as database records, public model/catalog files, provider mapping data, and generated SDK/OpenAPI model surfaces. These checks may send Discord notifications or write reports, but they do not create, update, comment on, close, label, or otherwise mutate GitHub issues.

Internal model file checks read from `packages/data/catalog/src/data/models`.
Internal Discord alerts are sent as embed payloads when internal models are added or when lifecycle fields change:

- status
- announced date
- release date
- deprecation date
- retirement date
Already-announced model IDs are persisted to:

- `scripts/model-discovery/state/internal-announced-models.json`

This avoids duplicate notifications across runs while the GitHub Actions cache is retained.
Internal model IDs are also marked as announced before sending webhook payloads, preventing duplicate reposts on retry/rerun paths.

Providers marked inactive in `discovery-policy.ts` are skipped explicitly with an `Inactive by policy` reason. Use this for providers without a stable/public models endpoint.
Providers not present in `discovery-policy.ts` are also treated as inactive by default.

## Script entrypoints

- `scripts/model-discovery/run.ts`
  - Private upstream provider `/models` API discovery. Sends Discord notifications for known catalog-relevant changes and creates/updates GitHub triage issues for all upstream changes, including unknown models.
- `scripts/model-discovery/run-hf-private.ts`
  - Private upstream Hugging Face discovery. Sends private Discord notifications and creates/updates GitHub triage issues.
- `scripts/model-discovery/run-internal-public.ts`
  - Public AI Stats catalog/database discovery. Sends public/internal catalog notifications or reports only; it intentionally does not mutate GitHub issues.

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
- `DISCORD_ROLE_ID` (optional role mention)
- `DISCORD_ROLE_ID_DEV` (optional dev role mention for Hugging Face private notifications)
- `DISCORD_USER_ID` (optional mention)
- `DISCORD_MODEL_DISCOVERY_AVATAR_URL` (optional manual override when calling internal runner scripts with `--discord-avatar-url`)
- `GITHUB_TOKEN` or `GH_TOKEN` plus `GITHUB_REPOSITORY` (optional, enables automatic GitHub issues for private upstream provider and Hugging Face additions/changes/deletions)
- `MODEL_DISCOVERY_GITHUB_ISSUES=false` (optional, disables all private upstream GitHub issue sync)
- `MODEL_DISCOVERY_PROVIDER_GITHUB_ISSUES=false` (optional, disables provider `/models` API GitHub issue sync only)
- `MODEL_DISCOVERY_HF_GITHUB_ISSUES=false` (optional, disables Hugging Face GitHub issue sync only)
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
