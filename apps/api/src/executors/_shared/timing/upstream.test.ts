import { afterEach, describe, expect, it, vi } from "vitest";
import { createUpstreamTimingTracker } from "./upstream";
import { GatewayTimingTrace } from "@pipeline/telemetry/gateway-trace";

describe("upstream timing tracker", () => {
	afterEach(() => vi.restoreAllMocks());

    it("records optional provider waits while preserving response timing identity and stream bytes", async () => {
        let now = 10;
        const trace = new GatewayTimingTrace(() => now);
        const payload = 'data: {"type":"response.output_text.delta","delta":"hello"}\n\n';
        vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
            now = 110;
            return new Response(payload, { headers: { "content-type": "text/event-stream" } });
        });
        const tracker = createUpstreamTimingTracker(trace);
        const response = await tracker.timing.fetch("https://provider.test/responses");
        expect(tracker.timing.timingFor(response)?.sequence).toBe(1);
        expect(trace.marks).toMatchObject({ upstream_dispatch: 10, upstream_headers: 110 });
        expect(trace.waits[0]).toEqual({ start: 10, end: 110, kind: "headers" });
        expect(await response.text()).toBe(payload);
        expect(trace.marks.upstream_first_content).toBe(110);
    });

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
