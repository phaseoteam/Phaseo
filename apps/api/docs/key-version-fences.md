# Key version publication fences

Local reads cannot return a marker that raced a local publication. Pending
publications replace warm-cache reads; failed publications retain a fail-closed
fence until retried successfully. Authentication already falls back to the
authoritative database for unknown versions rather than accepting an older
credential cache. Context lookups reject the ambiguous version.

The isolate retains at most 2,000 pending/failed publication fences and permits
128 active version reads, including uncached reads. Capacity exhaustion rejects
work instead of retaining unbounded promises. Concurrent same-key publications
are rejected rather than allowed to reorder their remote writes. A single
isolate epoch replaces the previously unbounded per-key epoch map; concurrent
unrelated invalidation can conservatively reject an in-flight read.

This is a local race repair, not globally synchronous revocation. Workers KV
propagation and the existing credential cache lifetime still bound remote
freshness; the full serving-lease/mutation work remains separate.

Validation: 41 focused auth/version/performance tests; all 4,530 source tests
across 590 files; typecheck, scoped lint and staging dry-run pass. An initial
unbounded local test run suffered two worker-process crashes; the complete
four-worker rerun passed. No production deployment.

Staging source `aeef56e23`, version `50b0f2ce-1269-4a77-b72a-4b4e07e01d1e`:
12/12 free Poolside protocol cases passed with successful zero-charge audit rows;
disposable key `8e5cb86b-96d3-436a-b4fc-c852620d6a31` revoked. LHR routing times:
486, 4, 70, 3, 4, 4, 164, 16, 18, 5, 17, 12 ms. This protocol probe is not a
cross-region revocation freshness measurement; deterministic races are tested
separately above.
