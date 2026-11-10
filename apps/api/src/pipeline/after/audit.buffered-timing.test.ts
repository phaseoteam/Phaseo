import { beforeEach, describe, expect, it, vi } from "vitest";

const { auditSuccessMock } = vi.hoisted(() => ({ auditSuccessMock: vi.fn() }));

vi.mock("../audit", () => ({
	auditSuccess: (...args: any[]) => auditSuccessMock(...args),
	auditFailure: vi.fn(),
}));
vi.mock("../pricing/persist", () => ({ recordUsageAndCharge: vi.fn() }));
vi.mock("@observability/events", () => ({ emitGatewayRequestEvent: vi.fn(async () => undefined) }));
vi.mock("@core/spend-limits", () => ({
	recordShadowSpend: vi.fn(),
	settleEnforcedSpend: vi.fn(),
	releaseSpend: vi.fn(),
}));

import { handleSuccessAudit } from "./audit";

// A non-streaming client served from the provider stream the text pipeline always opens.
function bufferedContext(meta: Record<string, unknown>) {
	return {
		requestId: "req_buffered",
		billingRequestId: "bill_buffered",
		workspaceId: "ws_1",
		endpoint: "chat.completions",
		capability: "text.generate",
		model: "fixture/model",
		stream: false,
		body: {},
		meta: {
			requestId: "req_buffered",
			authMethod: "api_key",
			startedAtMs: 1_000,
			generation_ms: 4_000,
			...meta,
		},
		providers: [],
		pricing: {},
		gating: { credit: { ok: true, reason: null, resetAt: null } },
		providerAttempts: [{ attempt_number: 1, provider: "p", outcome: "success", status: 200, health_class: "success" }],
	} as any;
}

async function audit(context: any) {
	await handleSuccessAudit(
		context,
		{
			kind: "completed",
			upstream: new Response("{}", { status: 200, headers: { "content-type": "application/json" } }),
			provider: "p",
			generationTimeMs: 4_000,
			bill: { cost_cents: 0, currency: "USD", usage: null, finish_reason: "stop" },
			mappedRequest: null,
			rawResponse: {},
		} as any,
		false,
		{ output_tokens: 400 },
		0,
		0,
		"USD",
		"stop",
		200,
	);
	await vi.waitFor(() => expect(auditSuccessMock).toHaveBeenCalled());
	return auditSuccessMock.mock.calls.at(-1)?.[0];
}

describe("buffered text timing at audit", () => {
	beforeEach(() => {
		auditSuccessMock.mockReset().mockResolvedValue(undefined);
	});

	it("keeps observed provider and gateway TTFT for a buffered client", async () => {
		const row = await audit(bufferedContext({
			provider_ttft_ms: 1_200,
			firstProviderOutputAtMs: 2_500,
			lastProviderRoundSpeedWindow: { durationMs: 2_800, outputTokens: 400, reasoningTokens: null, arrivals: 40 },
		}));
		expect(row.providerTtftMs).toBe(1_200);
		expect(row.gatewayTtftMs).toBe(1_500);
		// Tokens after the first one, over the window that follows it.
		expect(row.outputSpeedTps).toBeCloseTo(399 / 2.8, 5);
	});

	it("reports no output speed when all output arrived in one read", async () => {
		const row = await audit(bufferedContext({
			provider_ttft_ms: 1_200,
			firstProviderOutputAtMs: 2_500,
			// One read with all the output, then a late usage frame: not a generation interval.
			lastProviderRoundSpeedWindow: { durationMs: 2_800, outputTokens: 400, reasoningTokens: null, arrivals: 1 },
		}));
		expect(row.providerTtftMs).toBe(1_200);
		expect(row.outputSpeedTps ?? null).toBeNull();
	});

	it("ignores an executor first-frame estimate when no output was observed", async () => {
		const row = await audit(bufferedContext({ provider_ttft_ms: 300 }));
		expect(row.providerTtftMs).toBeNull();
		expect(row.gatewayTtftMs).toBeNull();
	});
});
