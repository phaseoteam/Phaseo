# Advisory health checkpoints

Coordinated health now uses isolate-local evidence and background DO snapshots;
neither reads nor writes the health KV snapshot. `provider-score-v8` and the
existing reducer/recovery rules are unchanged. The legacy uncoordinated fallback
is retained for environments without the binding until the production evidence
gate permits removal.

The DO loads up to 1,024 provider aggregates once. Observations update memory,
not SQL rows. A 30-second one-shot alarm checkpoints dirty providers and a single
metadata row. No self-rescheduling happens when clean. Legacy dedupe rows are
retired in finite 2,000-row alarm batches. No DO class migration/deletion, global
coordinator, cron, new resource or secret is introduced.

Deduplication is advisory: at most 16,384 IDs for two minutes, in memory. A restart
can lose uncheckpointed observations; replay after restart/eviction can count an
observation twice. This explicit tradeoff applies only to routing telemetry,
never balances, reservations or billing. Restart generations prevent lower
restored revisions from being confused with previously acknowledged revisions.

Snapshots refresh in the background at 30-second intervals. Evidence age is not
renewed by reads. Fresh local failure evidence takes precedence until a snapshot
from the same generation includes its acknowledged revision. Isolate retention
is limited to 128 pools and 64 providers per pool; additional advisory providers
use normal empty/low-confidence fallback. At most 32 snapshot refills may be in
flight, including evicted pools. Warm routing does not await snapshot RPCs.

`observeBatch` accepts at most 64 events and validates the entire batch before
mutation. The current sender still invokes one `observe` per completion;
micro-batching is the next independently tested increment, not a saving claimed
by this layer.

## Native validation

Run `pnpm exec tsx scripts/routing-simulator/coordinator-local-test.ts`.
The native SQLite/RPC harness has no KV binding and blocks outbound fetches.
100 concurrent observations and 64 duplicate replays leave zero aggregate/report
rows until checkpoint; checkpoint produces one provider and one metadata row.
It verifies atomic invalid-batch rejection, checkpoint rollback/retry, restart
recovery and generation change, intentional uncheckpointed loss, bounded legacy
cleanup and idle alarm termination. These are operation-pattern assertions,
not a Cloudflare invoice or a measured global throughput limit.

The deterministic routing simulation covers healthy/outage/recovery cases at
100, 1,000 and 10,000 requests/minute for three seeds. It is not a WAN benchmark.
