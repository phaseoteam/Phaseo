import { describe, expect, it } from "vitest";
import { seenModelRefreshIntervalMs, shouldWriteSeenModel, storedModelsAreCurrent, watchSnapshotKey } from "./seen-model-writes";

const HOUR_MS = 60 * 60 * 1000;
const NOW_MS = Date.parse("2026-10-17T12:00:00.000Z");
const snapshot = {
	contextLength: 128_000,
	maxCompletionTokens: 8_192,
	pricingDetails: { pricing: { input: 0.00000026, output: 0.00000038 } },
	pricingFingerprint: "{\"input\":2.6e-7}",
};
// What Postgres hands back for the same jsonb: keys reordered, numbers re-serialised.
const storedSnapshot = JSON.parse(
	'{"contextLength":128000,"pricingDetails":{"pricing":{"output":0.00000038,"input":0.00000026}},"maxCompletionTokens":8192,"pricingFingerprint":"{\\"input\\":2.6e-7}"}',
);
const policy = { nowMs: NOW_MS, refreshIntervalMs: 24 * HOUR_MS };
const stored = (overrides: Partial<{ snapshot: unknown; lastSeenAt: string | null; removalPending: boolean }> = {}) => ({
	snapshot: storedSnapshot as unknown,
	lastSeenAt: new Date(NOW_MS - 2 * HOUR_MS).toISOString(),
	removalPending: false,
	...overrides,
});

describe("watchSnapshotKey", () => {
	it("treats a jsonb round trip as unchanged", () => {
		expect(watchSnapshotKey(storedSnapshot)).toBe(watchSnapshotKey(snapshot));
	});

	it("changes when a watched value changes", () => {
		expect(watchSnapshotKey({ ...snapshot, contextLength: 256_000 })).not.toBe(watchSnapshotKey(snapshot));
	});

	it("keeps missing snapshots distinct from empty ones", () => {
		expect(watchSnapshotKey(null)).toBeNull();
		expect(watchSnapshotKey(undefined)).toBeNull();
	});
});

describe("shouldWriteSeenModel", () => {
	it("skips an unchanged row seen recently", () => {
		expect(shouldWriteSeenModel(stored(), snapshot, policy)).toBe(false);
	});

	it("writes new models, changed snapshots and models returning from a pending removal", () => {
		expect(shouldWriteSeenModel(undefined, snapshot, policy)).toBe(true);
		expect(shouldWriteSeenModel(stored(), { ...snapshot, maxCompletionTokens: 16_384 }, policy)).toBe(true);
		expect(shouldWriteSeenModel(stored({ removalPending: true }), snapshot, policy)).toBe(true);
	});

	it("refreshes last_seen_at once the interval has passed", () => {
		expect(shouldWriteSeenModel(stored({ lastSeenAt: new Date(NOW_MS - 23 * HOUR_MS).toISOString() }), snapshot, policy)).toBe(false);
		expect(shouldWriteSeenModel(stored({ lastSeenAt: new Date(NOW_MS - 24 * HOUR_MS).toISOString() }), snapshot, policy)).toBe(true);
		expect(shouldWriteSeenModel(stored({ lastSeenAt: null }), snapshot, policy)).toBe(true);
	});
});

describe("storedModelsAreCurrent", () => {
	it("lets an unchanged provider skip extraction only when no stored row needs this sweep", () => {
		expect(storedModelsAreCurrent([stored(), stored()], policy)).toBe(true);
		expect(storedModelsAreCurrent([], policy)).toBe(false);
		expect(storedModelsAreCurrent([stored(), stored({ removalPending: true })], policy)).toBe(false);
		expect(storedModelsAreCurrent([stored(), stored({ lastSeenAt: new Date(NOW_MS - 25 * HOUR_MS).toISOString() })], policy)).toBe(false);
	});
});

describe("seenModelRefreshIntervalMs", () => {
	it("refreshes daily under the default 7-day retention", () => {
		expect(seenModelRefreshIntervalMs(7)).toBe(24 * HOUR_MS);
	});

	it("refreshes three times per window when retention is shorter than three days", () => {
		expect(seenModelRefreshIntervalMs(1)).toBe(8 * HOUR_MS);
	});
});
