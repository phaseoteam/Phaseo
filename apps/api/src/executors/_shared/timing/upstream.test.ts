import { afterEach, describe, expect, it, vi } from "vitest";
import {
	createUpstreamTimingTracker,
	fetchUpstream,
	resolveUpstreamHeadersTimeoutMs,
	UpstreamHeadersTimeoutError,
} from "./upstream";
import { GatewayTimingTrace } from "@pipeline/telemetry/gateway-trace";

const bindingsState = vi.hoisted(() => ({ value: null as Record<string, unknown> | null }));
vi.mock("@/runtime/env", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/runtime/env")>();
	return { ...actual, getBindingsIfConfigured: () => bindingsState.value };
});

function hangingFetch() {
	return vi.spyOn(globalThis, "fetch").mockImplementation((_input, init) => new Promise<Response>((_resolve, reject) => {
		const signal = init?.signal;
		signal?.addEventListener("abort", () => {
			reject(signal.reason ?? new DOMException("aborted", "AbortError"));
		});
	}));
}

describe("upstream headers deadline", () => {
	afterEach(() => {
		bindingsState.value = null;
		vi.restoreAllMocks();
	});

	it.each([undefined, "", "0", "-5", "abc"])("is off when GATEWAY_UPSTREAM_HEADERS_TIMEOUT_MS is %j", async (value) => {
		bindingsState.value = value === undefined ? {} : { GATEWAY_UPSTREAM_HEADERS_TIMEOUT_MS: value };
		expect(resolveUpstreamHeadersTimeoutMs()).toBe(0);
		const init = { method: "POST" };
		const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("ok"));
		await createUpstreamTimingTracker().timing.fetch("https://provider.test", init);
		// The caller's init is passed through untouched (no injected signal).
		expect(fetchSpy).toHaveBeenCalledWith("https://provider.test", init);
	});

	it("fails a stalled provider with a provider transport failure", async () => {
		bindingsState.value = { GATEWAY_UPSTREAM_HEADERS_TIMEOUT_MS: "25" };
		hangingFetch();
		const tracker = createUpstreamTimingTracker();
		const error = await tracker.timing.fetch("https://provider.test", { method: "POST" }).catch((err) => err);
		expect(error).toBeInstanceOf(UpstreamHeadersTimeoutError);
		expect(error).toMatchObject({ name: "UpstreamHeadersTimeoutError", code: "upstream_headers_timeout", timeoutMs: 25 });
		expect(tracker.isProviderTransportFailure(error)).toBe(true);
		expect(tracker.snapshot().upstreamRequestCount).toBe(1);
	});

	it("applies to fetchUpstream without a tracker", async () => {
		bindingsState.value = { GATEWAY_UPSTREAM_HEADERS_TIMEOUT_MS: "20" };
		hangingFetch();
		await expect(fetchUpstream({} as any, "https://provider.test")).rejects.toBeInstanceOf(UpstreamHeadersTimeoutError);
	});

	it.each(["auth", "poll", "media", "preflight"] as const)("does not apply to %s requests", async (phase) => {
		bindingsState.value = { GATEWAY_UPSTREAM_HEADERS_TIMEOUT_MS: "5" };
		const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
			await new Promise((resolve) => setTimeout(resolve, 30));
			return new Response("late but fine");
		});
		const response = await createUpstreamTimingTracker().timing.fetch("https://provider.test", undefined, phase);
		expect(await response.text()).toBe("late but fine");
		expect(fetchSpy.mock.calls[0][1]).toBeUndefined();
	});

	it("keeps caller cancellation a neutral AbortError", async () => {
		bindingsState.value = { GATEWAY_UPSTREAM_HEADERS_TIMEOUT_MS: "1000" };
		hangingFetch();
		const caller = new AbortController();
		const tracker = createUpstreamTimingTracker();
		const pending = tracker.timing.fetch("https://provider.test", { signal: caller.signal }).catch((err) => err);
		caller.abort(new DOMException("client went away", "AbortError"));
		const error = await pending;
		expect(error).not.toBeInstanceOf(UpstreamHeadersTimeoutError);
		expect(error.name).toBe("AbortError");
		expect(tracker.isProviderTransportFailure(error)).toBe(false);
	});

	it("clears the deadline once headers arrive so slow bodies still stream", async () => {
		bindingsState.value = { GATEWAY_UPSTREAM_HEADERS_TIMEOUT_MS: "20" };
		let bodySignal: AbortSignal | undefined;
		vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
			bodySignal = init?.signal ?? undefined;
			const encoder = new TextEncoder();
			return new Response(new ReadableStream<Uint8Array>({
				async start(controller) {
					controller.enqueue(encoder.encode("data: a\n\n"));
					await new Promise((resolve) => setTimeout(resolve, 60));
					controller.enqueue(encoder.encode("data: b\n\n"));
					controller.close();
				},
			}));
		});
		const response = await createUpstreamTimingTracker().timing.fetch("https://provider.test");
		expect(await response.text()).toBe("data: a\n\ndata: b\n\n");
		expect(bodySignal?.aborted).toBe(false);
	});

	it("forwards caller aborts that happen after headers to the request signal", async () => {
		bindingsState.value = { GATEWAY_UPSTREAM_HEADERS_TIMEOUT_MS: "1000" };
		let requestSignal: AbortSignal | undefined;
		vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
			requestSignal = init?.signal ?? undefined;
			return new Response("ok");
		});
		const caller = new AbortController();
		await createUpstreamTimingTracker().timing.fetch("https://provider.test", { signal: caller.signal });
		caller.abort();
		expect(requestSignal?.aborted).toBe(true);
	});
});

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
