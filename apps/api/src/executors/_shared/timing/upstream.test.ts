import { afterEach, describe, expect, it, vi } from "vitest";
import { createUpstreamTimingTracker } from "./upstream";

describe("upstream timing tracker", () => {
	afterEach(() => vi.restoreAllMocks());

	it("correlates timing with the selected response instead of the first attempt", async () => {
		const first = new Response("first", { status: 503 });
		const selected = new Response("selected", { status: 200 });
		vi.spyOn(globalThis, "fetch")
			.mockResolvedValueOnce(first)
			.mockResolvedValueOnce(selected);

		const tracker = createUpstreamTimingTracker();
		await tracker.timing.fetch("https://provider-a.test");
		await tracker.timing.fetch("https://provider-b.test");

		const firstTiming = tracker.timing.timingFor(first);
		const selectedTiming = tracker.timing.timingFor(selected);
		expect(firstTiming?.sequence).toBe(1);
		expect(selectedTiming?.sequence).toBe(2);
		expect(selectedTiming?.dispatchAtMs).toBeTypeOf("number");
		expect(tracker.snapshot().upstreamRequestCount).toBe(2);
	});
});
