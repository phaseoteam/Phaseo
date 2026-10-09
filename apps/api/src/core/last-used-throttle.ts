// Purpose: Throttle `last_used_at` bookkeeping writes.
// Why: Updating a key's last-used timestamp on every request costs one
//      Postgres UPDATE per request (row versions, WAL, and lock contention on
//      hot keys) for a value that dashboards display at minute granularity.
// How: Each isolate records at most one write per scope/id per interval.

const LAST_USED_WRITE_INTERVAL_MS = 60_000;
const MAX_TRACKED_IDS = 20_000;

const lastWrites = new Map<string, number>();

export function __resetLastUsedThrottleForTests(): void {
	lastWrites.clear();
}

/**
 * Returns true when this isolate should write `last_used_at` for `id` now, and
 * records the write. Callers must still write when they have other changes to
 * persist (for example a pending hash migration).
 */
export function shouldRecordLastUsed(scope: string, id: string, now = Date.now()): boolean {
	const key = `${scope}:${id}`;
	const previous = lastWrites.get(key);
	if (previous !== undefined && now - previous < LAST_USED_WRITE_INTERVAL_MS) return false;
	lastWrites.delete(key);
	lastWrites.set(key, now);
	while (lastWrites.size > MAX_TRACKED_IDS) {
		const oldest = lastWrites.keys().next();
		if (oldest.done) break;
		lastWrites.delete(oldest.value);
	}
	return true;
}
