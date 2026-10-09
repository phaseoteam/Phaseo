import { afterEach, describe, expect, it, vi } from "vitest";

import { awaitShared } from "./shared-wait";

describe("awaitShared", () => {
	afterEach(() => { vi.useRealTimers(); });

	it("returns the shared value when it settles in time", async () => {
		expect(await awaitShared(Promise.resolve("value"), 1_000)).toEqual({ settled: true, value: "value" });
	});

	it("gives up after the bound when the shared promise never settles", async () => {
		vi.useFakeTimers();
		const result = awaitShared(new Promise<string>(() => {}), 1_000);
		await vi.advanceTimersByTimeAsync(1_000);
		expect(await result).toEqual({ settled: false });
	});

	it("reports another request's rejection as unsettled", async () => {
		expect(await awaitShared(Promise.reject(new Error("other request failed")), 1_000)).toEqual({ settled: false });
	});
});
