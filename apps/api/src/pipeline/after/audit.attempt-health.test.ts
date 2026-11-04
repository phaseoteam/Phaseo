import { beforeEach, describe, expect, it, vi } from "vitest";

const { auditSuccessMock, auditFailureMock } = vi.hoisted(() => ({
	auditSuccessMock: vi.fn(),
	auditFailureMock: vi.fn(),
}));

vi.mock("../audit", () => ({
	auditSuccess: (...args: any[]) => auditSuccessMock(...args),
	auditFailure: (...args: any[]) => auditFailureMock(...args),
}));
vi.mock("../pricing/persist", () => ({ recordUsageAndCharge: vi.fn() }));
vi.mock("@observability/events", () => ({ emitGatewayRequestEvent: vi.fn(async () => undefined) }));
vi.mock("@core/spend-limits", () => ({
	recordShadowSpend: vi.fn(),
	settleEnforcedSpend: vi.fn(),
	releaseSpend: vi.fn(),
}));

import { handleFailureAudit, handleSuccessAudit } from "./audit";

// A failover: the first provider was unreachable, the second served the response.
function ctx() {
	return {
		requestId: "req_health",
		billingRequestId: "bill_health",
		workspaceId: "ws_1",
		endpoint: "chat.completions",
		capability: "text.generate",
		model: "fixture/model",
		stream: true,
		body: {},
		meta: { requestId: "req_health", authMethod: "api_key" },
		providers: [],
		pricing: {},
		gating: { credit: { ok: true, reason: null, resetAt: null } },
		providerAttempts: [
			{ attempt_number: 1, provider: "first", outcome: "upstream_non_2xx", status: 502, health_class: "reachability" },
			{ attempt_number: 2, provider: "second", outcome: "success", status: 200, health_class: "success" },
		],
	} as any;
}

const persistedClasses = () =>
	(auditFailureMock.mock.calls.at(-1)?.[0]?.providerAttempts ?? auditSuccessMock.mock.calls.at(-1)?.[0]?.providerAttempts ?? [])
		.map((attempt: any) => attempt.health_class);

describe("served attempt health at audit", () => {
	beforeEach(() => {
		auditSuccessMock.mockReset().mockResolvedValue(undefined);
		auditFailureMock.mockReset().mockResolvedValue(undefined);
	});

	it.each([
		["upstream", "upstream_stream_failure", ["reachability", "call_error"]],
		["gateway", "google_empty_response", ["reachability", "call_error"]],
		["client", "client_closed_request", ["reachability", "customer"]],
		// Phaseo's own failure after a good response keeps the provider's success.
		["gateway", "stream_finalization_failed", ["reachability", "success"]],
	])("%s:%s", async (attribution, code, expected) => {
		const context = ctx();
		await handleFailureAudit(context, { provider: "second" } as any, 502, attribution, code, "failed");
		await vi.waitFor(() => expect(auditFailureMock).toHaveBeenCalled());
		expect(context.providerAttempts.map((attempt: any) => attempt.health_class)).toEqual(expected);
		expect(persistedClasses()).toEqual(expected);
	});

	it("marks a served response that finished with an error as a call error", async () => {
		const context = ctx();
		await handleSuccessAudit(
			context,
			{
				kind: "completed",
				upstream: new Response("{}", { status: 200, headers: { "content-type": "application/json" } }),
				provider: "second",
				generationTimeMs: 50,
				bill: { cost_cents: 0, currency: "USD", usage: null, finish_reason: "error" },
				mappedRequest: null,
				rawResponse: {},
			} as any,
			false,
			{},
			0,
			0,
			"USD",
			"error",
			200,
		);
		expect(context.providerAttempts.map((attempt: any) => attempt.health_class)).toEqual(["reachability", "call_error"]);
	});
});
