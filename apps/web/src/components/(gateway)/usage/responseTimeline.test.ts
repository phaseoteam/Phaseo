import { providerAttemptTimelineDuration, responseTimelineTiming } from "./responseTimeline";

describe("response timeline", () => {
	it("does not count pre-dispatch preparation again in a failed attempt", () => {
		const timeline = { version: 1, first_dispatch_at_ms: 1030 };
		expect(providerAttemptTimelineDuration({ started_at_unix_ms: 1010, duration_ms: 220, total_ms: 900 }, timeline)).toBe(200);
		expect(providerAttemptTimelineDuration({ started_at_unix_ms: 1250, duration_ms: 100 }, timeline)).toBe(100);
		expect(providerAttemptTimelineDuration({ started_at_unix_ms: 1000, duration_ms: 5 }, timeline)).toBe(0);
		expect(providerAttemptTimelineDuration({})).toBeNull();
	});

	it("splits streaming provider duration without counting first-token waiting twice", () => {
		expect(responseTimelineTiming({ stream: true, latency_ms: 120, generation_ms: 520,
			detail_metadata: { response_timeline: { version: 1, routing_ms: 15 } },
		})).toEqual({ routingMs: 15, providerMs: 120, generationMs: 400 });
	});

	it("keeps non-streaming provider time as one interval", () => {
		expect(responseTimelineTiming({ stream: false, latency_ms: 100, generation_ms: 500 }))
			.toEqual({ routingMs: null, providerMs: 500, generationMs: null });
	});

	it("preserves measured zero while leaving historical routing time unknown", () => {
		expect(responseTimelineTiming({ stream: true, latency_ms: 0, generation_ms: 0,
			detail_metadata: { response_timeline: { version: 1, routing_ms: 0 } },
		})).toEqual({ routingMs: 0, providerMs: 0, generationMs: 0 });
		expect(responseTimelineTiming({})).toEqual({ routingMs: null, providerMs: null, generationMs: null });
	});

	it.each([null, undefined, "", " ", -1, NaN, Infinity])("rejects invalid measurements (%s)", (value) => {
		expect(responseTimelineTiming({ stream: true, latency_ms: value, generation_ms: value,
			detail_metadata: { response_timeline: { version: 1, routing_ms: value } },
		})).toEqual({ routingMs: null, providerMs: null, generationMs: null });
	});

	it("does not invent a split for incomplete or inconsistent measurements", () => {
		expect(responseTimelineTiming({ stream: true, latency_ms: 200 })).toEqual({ routingMs: null, providerMs: 200, generationMs: null });
		expect(responseTimelineTiming({ stream: true, latency_ms: 200, generation_ms: 100 })).toEqual({ routingMs: null, providerMs: 100, generationMs: null });
		expect(responseTimelineTiming({ detail_metadata: { response_timeline: { version: 2, routing_ms: 10 } } }).routingMs).toBeNull();
	});
});
