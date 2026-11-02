import { beforeEach, describe, expect, it, vi } from "vitest";

const { auditSuccessMock, auditFailureMock, recordUsageAndChargeMock } = vi.hoisted(() => ({
	auditSuccessMock: vi.fn(),
	auditFailureMock: vi.fn(),
	recordUsageAndChargeMock: vi.fn(),
}));

vi.mock("../audit", () => ({
	auditSuccess: (...args: any[]) => auditSuccessMock(...args),
	auditFailure: (...args: any[]) => auditFailureMock(...args),
}));
vi.mock("../pricing/persist", () => ({ recordUsageAndCharge: recordUsageAndChargeMock }));
vi.mock("@observability/events", () => ({ emitGatewayRequestEvent: vi.fn(async () => undefined) }));
vi.mock("@core/spend-limits", () => ({
	recordShadowSpend: vi.fn(),
	settleEnforcedSpend: vi.fn(),
	releaseSpend: vi.fn(),
}));

import { handleFailureAudit, handleSuccessAudit } from "./audit";
import { recordUsageAndChargeOnce } from "./charge";

// A model fallback runs a fresh before stage, so each attempt has its own public and billing IDs.
function attempt(requestId: string, billingRequestId: string, model: string) {
	return {
		requestId,
		billingRequestId,
		workspaceId: "ws_1",
		endpoint: "responses",
		capability: "text.generate",
		model,
		stream: false,
		body: {},
		meta: { requestId, authMethod: "api_key" },
		providers: [],
		pricing: {},
		gating: { credit: { ok: true, reason: null, resetAt: null } },
	} as any;
}

describe("charge-to-request link across a model fallback", () => {
	beforeEach(() => {
		auditSuccessMock.mockReset().mockResolvedValue(undefined);
		auditFailureMock.mockReset().mockResolvedValue(undefined);
		recordUsageAndChargeMock.mockReset().mockResolvedValue({ applied: true });
	});

	it("records each attempt's charge key and charges only the attempt that served", async () => {
		const primary = attempt("req_primary", "bill_primary", "primary/model");
		const fallback = attempt("req_fallback", "bill_fallback", "fallback/model");

		await handleFailureAudit(primary, { provider: "openai" } as any, 503, "upstream", "upstream_error", "unavailable");

		// The success path and a re-entered finalizer both settle; only one debit is made.
		await recordUsageAndChargeOnce({ ctx: fallback, costNanos: 12_345, endpoint: "responses" });
		await recordUsageAndChargeOnce({ ctx: fallback, costNanos: 12_345, endpoint: "responses" });
		await handleSuccessAudit(
			fallback,
			{
				kind: "completed",
				upstream: new Response("{}", { status: 200, headers: { "content-type": "application/json" } }),
				provider: "anthropic",
				generationTimeMs: 50,
				bill: { cost_cents: 0, currency: "USD", usage: null, finish_reason: "stop" },
				mappedRequest: null,
				rawResponse: {},
			} as any,
			false,
			{ output_tokens: 3, total_tokens: 3 },
			1,
			12_345,
			"USD",
			"stop",
			200,
			"resp_1",
			{ id: "resp_1" },
		);

		expect(recordUsageAndChargeMock).toHaveBeenCalledOnce();
		expect(recordUsageAndChargeMock).toHaveBeenCalledWith(expect.objectContaining({
			requestId: "bill_fallback", workspaceId: "ws_1", cost_nanos: 12_345,
		}));
		expect(auditFailureMock).toHaveBeenCalledWith(expect.objectContaining({
			requestId: "req_primary", billingRequestId: "bill_primary", stage: "execute",
		}));
		expect(auditSuccessMock).toHaveBeenCalledWith(expect.objectContaining({
			requestId: "req_fallback", billingRequestId: "bill_fallback", totalNanos: 12_345,
		}));
	});
});
