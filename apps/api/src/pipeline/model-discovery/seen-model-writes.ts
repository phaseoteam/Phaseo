// Purpose: Decide which `model_discovery_seen_models` rows a sweep has to write, and when a provider can be skipped.
// Why: Every sweep used to upsert all ~3,400 rows just to move last_seen_at. Those updates are never HOT
//      (last_seen_at and last_run_id are indexed), so each sweep wrote about 3.8 MB of WAL in prod while
//      only about 1 sweep in 9 saw any model change.
// How: Write a row only when it is new, was pending removal, carries a different watch snapshot, or its
//      last_seen_at is due a refresh well inside the retention window that prunes unseen rows.

import { normalizeJson, type ProviderApiModelSnapshot } from "./watch-snapshot";

export type StoredSeenModel = {
	/** The stored watch snapshot as read back; its comparison key is only computed when needed. */
	snapshot: unknown;
	lastSeenAt: string | null;
	removalPending: boolean;
};

export type SeenModelWritePolicy = {
	nowMs: number;
	refreshIntervalMs: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Canonical form of a stored or freshly extracted watch snapshot; key order never counts as a change. */
export function watchSnapshotKey(snapshot: unknown): string | null {
	if (snapshot === null || snapshot === undefined) return null;
	return JSON.stringify(normalizeJson(snapshot));
}

/** Refresh at most daily, and at least three times per retention window so seen rows are never pruned. */
export function seenModelRefreshIntervalMs(retentionDays: number): number {
	return Math.min(DAY_MS, (Math.max(1, retentionDays) * DAY_MS) / 3);
}

function isRefreshDue(stored: StoredSeenModel, policy: SeenModelWritePolicy): boolean {
	const lastSeenMs = stored.lastSeenAt ? Date.parse(stored.lastSeenAt) : Number.NaN;
	return !Number.isFinite(lastSeenMs) || policy.nowMs - lastSeenMs >= policy.refreshIntervalMs;
}

export function shouldWriteSeenModel(
	stored: StoredSeenModel | undefined,
	snapshot: ProviderApiModelSnapshot,
	policy: SeenModelWritePolicy,
): boolean {
	if (!stored || stored.removalPending) return true;
	if (isRefreshDue(stored, policy)) return true;
	return watchSnapshotKey(stored.snapshot) !== watchSnapshotKey(snapshot);
}

/**
 * True when a provider's stored rows need nothing from this sweep beyond an unchanged list: there are
 * rows, none is waiting for its removal to be confirmed, and none is due its last_seen_at refresh. Only
 * then may a byte-identical /models response skip extraction; the refresh rule also guarantees every
 * provider is fully re-extracted at least once a day, so extraction changes take effect within a day.
 */
export function storedModelsAreCurrent(stored: Iterable<StoredSeenModel>, policy: SeenModelWritePolicy): boolean {
	let rows = 0;
	for (const row of stored) {
		if (row.removalPending || isRefreshDue(row, policy)) return false;
		rows += 1;
	}
	return rows > 0;
}
