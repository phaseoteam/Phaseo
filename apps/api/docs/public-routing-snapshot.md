# Public routing snapshot

The source is `gateway_fetch_public_catalog`. It projects active public model
routes, capability parameters, price rules, residency/data policies and provider
cancellation policy. Workspace settings, BYOK keys and balances are not public
catalogue data. The runtime schema enumerates these fields, strips unrelated
display metadata, and rejects private-key/workspace material before projection.

The v2 cache envelope contains a SHA-256 content revision and an owned, deeply
frozen projection. Revision canonicalization sorts object keys, preserves array
order and excludes the independent source lease (`checkedAt`/`expiresAt`). An
unchanged publication therefore keeps its content revision without extending a
previous copy's lease. No object read extends its absolute deadline. Price and
route activation/expiry boundaries are already incorporated by the source RPC.

The constructor rejects payloads whose conservative UTF-16 retained-string size
exceeds 256 KB. The source parser preserves existing JSONB capability forms,
price conditions, time windows, free prices, availability restrictions and
cancellation evidence. Public projection does not authorize a request.

This layer tightens the source boundary. The subsequent Cache API layer replaces
the existing catalogue KV transport; this schema change alone does not reduce
the three recurring workspace/key KV reads measured in the baseline.

## Previous layer staging validation

Bounded L1 deployment `ffe77ae0-2248-496c-9f31-ecec15e00b7a`, source `ea510e9da`:
six successful zero-cost Poolside Laguna XS 2.1 Chat requests from LHR. Fresh-key
dispatch overhead 673 ms; five warm samples 5, 6, 6, 7, 8 ms (mean 6.4 ms).
Disposable key `d11c1a78-d37a-4bc7-a063-7ee4e1bd3eef` was revoked. The fresh
sample exceeds the 500 ms target. Small uncontrolled regional samples do not
establish a causal speedup, global SLO or total serving cost.
