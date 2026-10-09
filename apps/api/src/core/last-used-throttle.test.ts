import { beforeEach, describe, expect, it } from "vitest";
import { __resetLastUsedThrottleForTests, shouldRecordLastUsed } from "./last-used-throttle";

describe("shouldRecordLastUsed", () => {
	beforeEach(() => __resetLastUsedThrottleForTests());

	it("records at most once per minute per scope and id", () => {
		expect(shouldRecordLastUsed("keys", "a", 1_000)).toBe(true);
		expect(shouldRecordLastUsed("keys", "a", 30_000)).toBe(false);
		expect(shouldRecordLastUsed("keys", "a", 61_000)).toBe(true);
	});

	it("tracks scopes and ids independently", () => {
		expect(shouldRecordLastUsed("keys", "a", 1_000)).toBe(true);
		expect(shouldRecordLastUsed("keys", "b", 1_000)).toBe(true);
		expect(shouldRecordLastUsed("byok_keys", "a", 1_000)).toBe(true);
	});
});
