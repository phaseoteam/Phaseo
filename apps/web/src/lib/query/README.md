# Web data freshness

| Data | Client freshness | Visible polling | Shared API cache |
| --- | --- | --- | --- |
| Public catalogue, pricing, performance | 15 minutes | 15 minutes | 15 minutes |
| Public provider header, list, models and updates | 15 minutes where queried | Only where a client query is mounted | 15 minutes |
| Private/account data | 5 minutes | 5 minutes | `private, no-store` |

Public query defaults also cover search and status; explicitly non-polling queries remain non-polling. Inactive public entries are retained for 15 minutes. Model overview, benchmark and timeline data keep their longer server policies; unrelated reference datasets are unchanged.

The Worker policy in `apps/web-api/src/cache/publicLiveData.ts` does not add stale-while-revalidate or stale-if-error time to these public API entries. Once expired, the next request must revalidate; there is no scheduled background database refresh without traffic. Existing purge tags remain attached. The browser's HTTP cache and Next fetch cache are bypassed by the public fetch helper; TanStack Query owns browser-memory reuse.

`query.refetch()` and `queryClient.invalidateQueries({ queryKey })` bypass client freshness. Invalidation refetches active queries and marks inactive queries stale for their next use. These calls do not purge Cloudflare. Public writes that need read-your-own-writes must also use authorized server cache invalidation. Provider catalogue saves currently invalidate private account queries, not the shared public edge cache.

Fifteen minutes is a revalidation cadence, not a hard maximum displayed-data age: a newly fetched response can already have aged at the edge, hidden/offline tabs delay polling, and server-rendered-only sections update on the next navigation/refresh. Signed-in merged catalogues retain five-minute private refreshes; their anonymous public API portion still uses the fifteen-minute edge policy. Manual actions, new query keys and retries may request sooner.

No changes here affect gateway routing decisions, provider health checks, inference execution, or billing enforcement; these are website display-cache policies.
