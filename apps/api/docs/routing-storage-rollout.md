# Routing explanation storage

Full candidate scores, scoring inputs, and routing snapshots live in one private
R2 JSON object per request revision. Postgres retains the request, usage meters,
costs, attempts, pricing lines, and a checksum-addressed object reference in
`gateway_requests.detail_metadata.routing_archive`. Candidate and trace tables
remain available for fallback writes when R2 is unavailable. Request-detail
reads authorize through the existing user-scoped RPC before accessing R2, check
workspace/request ownership and checksum, and restore the existing UI fields.
These objects contain routing metadata, not prompts or completions. Existing
account deletion purges their `workspaces/<workspace>/` prefix.

## Rollout

1. Apply the generated forward migration through the reviewed deployment flow.
2. Deploy the web API with the private `phaseo-gateway-io-logs` bucket binding;
   staging uses `phaseo-gateway-io-logs-preview`. Verify legacy details first.
3. Deploy gateway writers. Confirm a new request has a reference, no relational
   candidate rows, and the same request explanation and accounting values.
4. After all old writers have drained, enable the historical transfer on the
   production jobs Worker by setting `GATEWAY_ROUTING_ARCHIVE_BACKFILL_CUTOFF`
   to a fixed UTC timestamp. Leave it unset in staging, regional/performance
   Workers, and ordinary deployment configuration. Each five-minute jobs tick
   transfers at most 25 requests sequentially; increase cadence only after
   measuring SQL latency and disk IO. At that initial rate, 163,000 requests
   would take roughly 23 days, so this is deliberately a gradual migration.
5. Monitor `routing_archive_backfill_completed` / `routing_archive_backfill_failed`,
   database bytes by table/index/TOAST, request-detail reads, and accounting
   checks. The cursor is stored in the jobs Worker's KV namespace and keyed by
   cutoff. Pause by unsetting the cutoff. A failed upload, verification, changed
   source, or SQL commit does not advance the cursor or remove SQL diagnostics.
   Repeating a committed transfer is idempotent. A completed cutoff stops scanning.

The transfer removes only routing snapshots, routing diagnostics, candidate
rows, and routing trace rows. It keeps request facts, usage, ledger/wallet state,
pricing, billing metadata, and historical aggregate rows. It does not shorten
the customer-visible history window or delete accounting records.

## Space reclamation

The October 7 inventory measured 5.72 GiB of database data: 2.03 GiB in routing
decisions, 0.17 GiB in routing traces, and 1.63 GiB in September/October request
tables. Their TOAST storage alone was 1.13 GiB, largely routing JSON in sampled
metadata. Moving these explanations makes a reduction near half plausible;
the exact saving depends on retained metadata, fallback writes, and physical
reclamation. Do not treat sampled JSON size as a guaranteed disk saving.

Normal VACUUM makes deleted space reusable and sometimes truncates empty tail
pages; it does not generally shrink all existing files. Measure again after
the transfer. Plan a separately approved maintenance window for any table
rewrite needed to return space to the filesystem. Do not run a blanket
`VACUUM FULL`: it takes exclusive locks, needs temporary disk headroom, and can
interrupt admission/billing reads of gateway request partitions. Compact the
now-small routing tables first if necessary, then assess partition rewrites
individually. No rewrite or production backfill runs as part of schema replay.

## Rollback

Unset the historical cutoff to stop transfers. Gateway writers can roll back
to full SQL diagnostics, but keep the R2-aware web API deployed: historical
explanations already transferred remain in R2. Restoring an older reader would
require a bounded reverse transfer from verified R2 objects first. Objects use
immutable content hashes, so retrying or updating a request cannot overwrite
an explanation referenced by another revision. Failed writes may leave
unreferenced objects; they remain under the workspace deletion prefix.
