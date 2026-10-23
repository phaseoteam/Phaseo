import { getSupabaseAdmin } from "@/runtime/env";

type RequestOutcome = { delivered: boolean; status: number | null; error: string | null };
type TimedOutcome = RequestOutcome & { startedAtMs: number };

// One destination's outcomes within a consumer batch, in the shape
// record_broadcast_destination_health takes.
type DestinationHealth = {
	destination_id: string;
	delivered: number;
	failed: number;
	failures: number;
	last_success_at: string | null;
	last_failure_at: string | null;
	last_http_status: number | null;
	last_error: string | null;
};

// Collects delivery outcomes per destination while a batch is delivered, then
// records them in one call. Destinations that were disabled or deleted are not
// recorded, since nothing was attempted. Requests run concurrently, so outcomes
// are replayed in start order: a slow failure that started first doesn't count
// against a later success.
export class BroadcastHealthRecorder {
	private readonly destinations = new Map<string, DestinationHealth>();
	private readonly outcomes = new Map<string, TimedOutcome[]>();

	private entry(destinationId: string): DestinationHealth {
		let entry = this.destinations.get(destinationId);
		if (!entry) {
			entry = {
				destination_id: destinationId,
				delivered: 0,
				failed: 0,
				failures: 0,
				last_success_at: null,
				last_failure_at: null,
				last_http_status: null,
				last_error: null,
			};
			this.destinations.set(destinationId, entry);
		}
		return entry;
	}

	// One export request started at startedAtMs, or an attempt that failed before
	// a request was made.
	request(destinationId: string, outcome: RequestOutcome, startedAtMs = Date.now()): void {
		this.entry(destinationId);
		const list = this.outcomes.get(destinationId) ?? [];
		list.push({ delivered: outcome.delivered, status: outcome.status, error: outcome.error, startedAtMs });
		this.outcomes.set(destinationId, list);
	}

	private applyOutcomes(entry: DestinationHealth): void {
		const list = (this.outcomes.get(entry.destination_id) ?? []).sort((a, b) => a.startedAtMs - b.startedAtMs);
		for (const outcome of list) {
			const at = new Date(outcome.startedAtMs).toISOString();
			if (outcome.delivered) {
				entry.last_success_at = at;
				entry.failures = 0;
				continue;
			}
			entry.failures += 1;
			entry.last_failure_at = at;
			entry.last_http_status = outcome.status;
			entry.last_error = outcome.error;
		}
	}

	// An event that reached the destination, or that will not be retried again.
	event(destinationId: string, delivered: boolean): void {
		const entry = this.entry(destinationId);
		if (delivered) entry.delivered += 1;
		else entry.failed += 1;
	}

	// Health is advisory, so a failure to record it is logged and never fails delivery.
	async flush(): Promise<void> {
		if (!this.destinations.size) return;
		const results = [...this.destinations.values()];
		for (const entry of results) this.applyOutcomes(entry);
		this.destinations.clear();
		this.outcomes.clear();
		try {
			const { error } = await getSupabaseAdmin().rpc("record_broadcast_destination_health", { p_results: results });
			if (error) throw new Error(error.message);
		} catch (error) {
			console.error("broadcast_health_record_failed", {
				destinations: results.length,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}
}
