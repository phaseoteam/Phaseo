import { describe, expect, it } from "vitest";
import { computeBalanceAwareTtlSeconds } from "./context";

describe("computeBalanceAwareTtlSeconds", () => {
	it("returns the two-minute minimum TTL for zero/negative balances", () => {
		expect(computeBalanceAwareTtlSeconds(0)).toBe(120);
		expect(computeBalanceAwareTtlSeconds(-10)).toBe(120);
	});

	it("caps TTL at ten minutes for high balances", () => {
		expect(computeBalanceAwareTtlSeconds(250)).toBe(600);
		expect(computeBalanceAwareTtlSeconds(1_000)).toBe(600);
	});

	it("is monotonic as balance increases", () => {
		const balances = [1, 5, 10, 25, 50, 100, 150, 200, 250];
		const ttls = balances.map((balance) => computeBalanceAwareTtlSeconds(balance));
		for (let i = 1; i < ttls.length; i += 1) {
			expect(ttls[i]).toBeGreaterThanOrEqual(ttls[i - 1]);
		}
	});

	it("drops quickly near low balances", () => {
		const ttlAt10 = computeBalanceAwareTtlSeconds(10);
		const ttlAt50 = computeBalanceAwareTtlSeconds(50);
		const ttlAt200 = computeBalanceAwareTtlSeconds(200);

		expect(ttlAt10).toBeLessThanOrEqual(240);
		expect(ttlAt50).toBeLessThanOrEqual(400);
		expect(ttlAt200).toBeGreaterThanOrEqual(540);
	});
});
