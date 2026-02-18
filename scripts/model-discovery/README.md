# Model Discovery

This pipeline is designed to be extensible:

1. Add one provider script under `scripts/model-discovery/providers/*.ts`.
2. Export a default provider definition via `defineProvider(...)`.
3. The runner auto-discovers and executes all provider scripts.

Each successful provider run snapshots the live model payload into:

- `scripts/model-discovery/state/provider-model-snapshots.json`

On subsequent runs, the runner computes per-provider:

- added models
- removed models
- changed model payloads

Discord alerts are filtered to models from the database table `data_api_provider_models` (`provider_model_slug` and `api_model_id` tail). This includes entries regardless of `is_active_gateway` status.
If any filtered diff exists, the runner sends a Discord webhook notification.

## Local run

```bash
pnpm run data:check-new-models
```

## Environment variables

- `DISCORD_WEBHOOK_URL` (optional, but required for alerts)
- `DISCORD_USER_ID` (optional mention)
- `NEXT_PUBLIC_SUPABASE_URL` (required for DB allowlist)
- `SUPABASE_SERVICE_ROLE_KEY` (required for DB allowlist)
- Provider-specific API keys declared in each provider module.

For local runs, the runner also auto-loads env files (without overriding already-exported shell vars) in this order:

1. `dev.vars`
2. `.env.locals`
3. `.env.local`
4. `apps/api/dev.vars`
5. `apps/api/.env.locals`
6. `apps/api/.env.local`
7. `apps/web/dev.vars`
8. `apps/web/.env.locals`
9. `apps/web/.env.local`
10. `scripts/model-discovery/dev.vars`
11. `scripts/model-discovery/.env.locals`
12. `scripts/model-discovery/.env.local`

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
