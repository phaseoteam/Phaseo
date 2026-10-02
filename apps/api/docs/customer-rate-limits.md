# Customer request limits

The inference router admits 25 authenticated requests per rolling 60 seconds for each `(workspaceId, userId)` by default. Free route dispatches are additionally limited to 100 requests per UTC day. These are independent of existing key spending limits and provider credential quotas.

The owner comes from authenticated key `created_by` or the OAuth user, never request metadata or an end-user attribution header. Ownerless keys use one shared workspace scope. Keys and regions cannot multiply the allowance for the same scope.

## Counters and configuration

One SQLite-backed `CustomerRateLimitDurableObject` coordinates each scope. Regional Workers bind to the main gateway's namespace. Counter decisions use synchronous SQL after loading configuration, making concurrent admission atomic. Counters survive restarts. There is no Supabase read or write in quota admission.

Overrides live in `GATEWAY_CACHE` at:

```text
customer-quota:v1:<workspace-uuid>:<user-uuid>
```

For ownerless keys the final segment is `workspace`. Values are JSON objects with either or both fields:

```json
{
  "requestsPerMinute": 250,
  "freeRequestsPerDay": 1000
}
```

Omitted fields use defaults. Values must be positive safe integers. Invalid configuration or a failed KV/coordinator read returns 503 rather than admitting unlimited traffic. Configuration reads are coalesced and cached in the coordinator for 60 seconds. KV propagation is eventually consistent; allow for KV caching plus the coordinator cache when changing a limit. These keys must only be managed by trusted operators; they are not user-editable workspace settings.

From `apps/api`, write a reviewed override file with Wrangler:

```sh
pnpm exec wrangler kv key put "customer-quota:v1:<workspace-uuid>:<user-uuid>" --binding GATEWAY_CACHE --path customer-limits.json --remote
```

Deleting the override restores defaults after cache propagation. Do not expire the counter state when changing limits; existing usage remains counted.

## Admission behavior

RPM admission happens before inference handlers, including file, batch, video/music job, realtime session, and polling endpoints. Management routes and preflight requests are excluded. Invalid credentials retain the route's authentication error behavior. Each HTTP request has a newly generated server admission ID; caller-provided request IDs cannot deduplicate counters. Matching collection/wildcard middleware admits a request once.

Admission prepares authentication without dispatching `last_used_at` or pepper-migration writes. The admitted handler reuses the validated identity within that same HTTP request and records usage once. `withRuntime` transfers this prepared result to its sanitized Request only when authorization, URL, and method match. Explicit authentication options continue to run independent checks. No cross-request identity cache is added; existing key, consent, membership, IP, and revocation checks are preserved.

RPD admission uses the selected pricing card and the existing `isFreePriceCard` rule: non-empty, explicitly free pricing with all-zero prices. It does not infer free access from a suffix. Text, images, audio, video, music, OCR, and parse share the IR execution check; standalone realtime session creation checks its selected card. Live voice sessions have their own combined paid pricing. Native provider batches use batch pricing and BYOK; they do not execute free gateway routes. Uploads and polling do not consume RPD.

Daily admission uses the server-owned billing ID to deduplicate fallback attempts within one pipeline request. It counts admitted attempts, not only successful completions. A daily quota rejection stops execution and does not silently switch to a paid route. Authenticated internal testing bypasses quotas. The counter's deduplication IDs never come from a public request header.

Responses retain the existing 429 error shape and `Retry-After` header. Reasons distinguish `customer_requests_per_minute` from `free_requests_per_day`. No new request fields or SDK models are required.

## Rollout and rollback

Deploy the main gateway first to register the `v4-customer-rate-limits` SQLite migration and namespace, then deploy regional gateways. Staging owns a separate namespace with its `v2-customer-rate-limits` migration. `CUSTOMER_RATE_LIMITS_ENABLED=true` enables enforcement; a missing binding while enabled returns 503. The flag is registered in the runtime binding snapshot.

For rollback, set `CUSTOMER_RATE_LIMITS_ENABLED=false` and redeploy. Keep the class/binding/migration history and stored counters so a later re-enable retains admitted usage. No Supabase migration or data repair is required. Existing `free_model_usage_daily` reporting is separate from these per-user/workspace enforcement counters and is not a counter source.
