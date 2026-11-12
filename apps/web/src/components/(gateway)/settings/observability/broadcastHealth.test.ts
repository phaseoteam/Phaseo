import { describe, it, expect } from "vitest";
import { broadcastHealthState, type BroadcastDestinationHealth } from "./broadcastHealth";

const health = (overrides: Partial<BroadcastDestinationHealth> = {}): BroadcastDestinationHealth => ({
	lastSuccessAt: null,
	lastFailureAt: null,
	lastHttpStatus: null,
	lastError: null,
	consecutiveFailures: 0,
	delivered24h: 0,
	failed24h: 0,
	...overrides,
});

describe("broadcastHealthState", () => {
	it("shows a disabled destination as disabled whatever its history", () => {
		expect(broadcastHealthState(false, health({ lastFailureAt: "2026-10-21T10:00:00Z", consecutiveFailures: 4 }))).toBe("disabled");
	});

	it("waits for a first delivery before judging health", () => {
		expect(broadcastHealthState(true, null)).toBe("idle");
		expect(broadcastHealthState(true, health())).toBe("idle");
	});

	it("is failing while the latest requests fail and healthy once one succeeds", () => {
		expect(broadcastHealthState(true, health({ lastFailureAt: "2026-10-21T10:00:00Z", consecutiveFailures: 1 }))).toBe("failing");
		expect(broadcastHealthState(true, health({
			lastSuccessAt: "2026-10-21T10:05:00Z",
			lastFailureAt: "2026-10-21T10:00:00Z",
			consecutiveFailures: 0,
		}))).toBe("healthy");
	});
});
