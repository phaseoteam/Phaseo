import { beforeEach, describe, expect, it, vi } from "vitest";

const failureAuditMock = vi.fn(async (..._args: any[]) => undefined);
const successAuditMock = vi.fn(async (..._args: any[]) => undefined);

vi.mock("./audit", () => ({
	handleFailureAudit: (...args: any[]) => failureAuditMock(...args),
	handleSuccessAudit: (...args: any[]) => successAuditMock(...args),
}));

vi.mock("@observability/events", () => ({
	emitGatewayRequestEvent: vi.fn(async () => undefined),
}));

vi.mock("./charge", () => ({
	recordUsageAndChargeOnce: vi.fn(async () => undefined),
}));

vi.mock("@core/provider-rate-limits", () => ({
	recordManagedProviderTokensOnce: vi.fn(async () => undefined),
}));

vi.mock("../execute/health", async () => {
	const { classifyAttemptHealth, PROVIDER_FAILURE_CLASSES } = await import("../execute/attempt-health");
	return {
		classifyProviderHealthImpact: (args: any) => {
			const healthClass = classifyAttemptHealth(args);
			if (healthClass === "success") return "success";
			return PROVIDER_FAILURE_CLASSES.has(healthClass) ? "failure" : "neutral";
		},
		onCallEnd: vi.fn(async () => undefined),
		reportProbeResult: vi.fn(async () => undefined),
		maybeOpenOnRecentErrors: vi.fn(async () => undefined),
	};
});

vi.mock("../execute/sticky-routing", () => ({
	maybeWriteStickyRoutingFromUsage: vi.fn(async () => undefined),
	resolveCacheAwareRoutingPreference: () => false,
}));

vi.mock("@/runtime/env", () => ({
	ensureRuntimeForBackground: () => () => {},
	dispatchBackground: (promise: Promise<unknown>) => {
		void promise.catch(() => {});
	},
}));

import { handleStreamResponse } from "./stream";

// A chat stream that stops after one delta: no finish reason, no usage, no [DONE].
function truncatedChatStream(): Response {
	const frame = { id: "chatcmpl_cut", object: "chat.completion.chunk", choices: [{ index: 0, delta: { content: "hel" }, finish_reason: null }] };
	return new Response(`data: ${JSON.stringify(frame)}\n\n`, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

function ctxFor(downstreamDisconnected: boolean): any {
	return {
		requestId: "req_stream_cancel",
		workspaceId: "ws_local_test",
		endpoint: "chat.completions",
		protocol: "openai.chat.completions",
		capability: "text.generate",
		model: "openai/gpt-5-mini",
		requestedModel: "openai/gpt-5-mini",
		stream: true,
		body: { model: "openai/gpt-5-mini", stream: true },
		rawBody: { model: "openai/gpt-5-mini", stream: true },
		meta: {
			requestId: "req_stream_cancel",
			apiKeyId: "key_local_test",
			authMethod: "api_key",
			// streaming.ts sets this when the client closes the response.
			...(downstreamDisconnected ? { downstreamDisconnected: true } : {}),
		},
		providers: [],
		pricing: {},
		providerAttempts: [{ attempt_number: 1, provider: "openai", outcome: "success", status: 200, health_class: "success" }],
		gating: {
			key: { ok: true, reason: null, resetAt: null },
			keyLimit: { ok: true, reason: null, resetAt: null },
			credit: { ok: true, reason: null, resetAt: null },
		},
	};
}

async function runTruncated(ctx: any) {
	const upstream = truncatedChatStream();
	const response = await handleStreamResponse(ctx, {
		kind: "stream",
		stream: upstream.body,
		upstream,
		provider: "openai",
		keySource: "gateway",
		usageFinalizer: async () => null,
		bill: { cost_cents: 0, currency: "USD", usage: null, finish_reason: null },
		mappedRequest: null,
		rawResponse: null,
	} as any, { rules: [] } as any);
	await response.text();
	for (let i = 0; i < 5 && failureAuditMock.mock.calls.length === 0; i++) {
		await new Promise((resolve) => setTimeout(resolve, 0));
	}
}

describe("a stream that ends without a terminal event", () => {
	beforeEach(() => {
		failureAuditMock.mockClear();
		successAuditMock.mockClear();
	});

	it("is a customer cancellation when the client had already disconnected", async () => {
		await runTruncated(ctxFor(true));
		expect(failureAuditMock).toHaveBeenCalledTimes(1);
		const [, , status, attribution, code] = failureAuditMock.mock.calls[0];
		expect([status, attribution, code]).toEqual([499, "client", "client_closed_request"]);
		expect(successAuditMock).not.toHaveBeenCalled();
	});

	it("is a provider stream failure when the client was still reading", async () => {
		await runTruncated(ctxFor(false));
		expect(failureAuditMock).toHaveBeenCalledTimes(1);
		const [, , status, attribution, code] = failureAuditMock.mock.calls[0];
		expect([status, attribution, code]).toEqual([502, "upstream", "upstream_stream_failure"]);
	});
});
