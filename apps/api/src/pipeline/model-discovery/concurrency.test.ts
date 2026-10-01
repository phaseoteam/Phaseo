import { describe, expect, it } from "vitest";
import {
	DEFAULT_MODEL_DISCOVERY_CONCURRENCY,
	MAX_MODEL_DISCOVERY_CONCURRENCY,
	mapWithConcurrency,
	normalizeModelDiscoveryConcurrency,
} from "./concurrency";

describe("model discovery concurrency", () => {
	it("clamps invalid and excessive concurrency values", () => {
		expect(normalizeModelDiscoveryConcurrency(Number.NaN)).toBe(DEFAULT_MODEL_DISCOVERY_CONCURRENCY);
		expect(normalizeModelDiscoveryConcurrency(0)).toBe(1);
		expect(normalizeModelDiscoveryConcurrency(999)).toBe(MAX_MODEL_DISCOVERY_CONCURRENCY);
	});

	it("preserves input order while limiting active work", async () => {
		let active = 0;
		let peak = 0;
		const results = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (value) => {
			active += 1;
			peak = Math.max(peak, active);
			await new Promise((resolve) => setTimeout(resolve, value === 1 ? 20 : 1));
			active -= 1;
			return value * 2;
		});

		expect(results).toEqual([2, 4, 6, 8, 10]);
		expect(peak).toBeLessThanOrEqual(2);
	});
});
