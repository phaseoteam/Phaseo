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

Discord alerts are filtered to models from the database table `data_api_provider_models` (`provider_model_slug` and `api_model_id` tail). This includes entries regardless of `is_active_gateway` status.
If any filtered diff exists, the runner sends a Discord webhook notification.

Providers marked inactive in `discovery-policy.ts` are skipped explicitly with an `Inactive by policy` reason. Use this for providers without a stable/public models endpoint.
Providers not present in `discovery-policy.ts` are also treated as inactive by default.

## Local run

```bash
pnpm run data:check-new-models
```

```bash
pnpm run data:check-new-models:test
```

## Environment variables

- `DISCORD_WEBHOOK_URL` (optional, but required for alerts)
- `DISCORD_USER_ID` (optional mention)
- `NEXT_PUBLIC_SUPABASE_URL` (required for DB allowlist)
- `SUPABASE_SERVICE_ROLE_KEY` (required for DB allowlist)
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
