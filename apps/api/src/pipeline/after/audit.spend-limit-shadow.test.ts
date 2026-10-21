import { beforeEach, describe, expect, it, vi } from "vitest";

const auditSuccessMock = vi.fn();
const recordShadowSpendMock = vi.fn();

vi.mock("../audit", () => ({
	auditSuccess: (...args: any[]) => auditSuccessMock(...args),
	auditFailure: vi.fn(),
}));
vi.mock("@observability/events", () => ({ emitGatewayRequestEvent: vi.fn(async () => undefined) }));
vi.mock("@core/spend-limits", () => ({ recordShadowSpend: (...args: any[]) => recordShadowSpendMock(...args) }));

import { handleSuccessAudit } from "./audit";

const KEY = "00000000-0000-4000-8000-000000000001";
const CAPPED = {
	ok: true, reason: null, resetAt: null,
	buckets: { daily: { windowStart: null, requestsUsed: 3, requestsLimit: 100, costUsedNanos: 0, costLimitNanos: 0 } },
};

function audit(overrides: { meta?: Record<string, unknown>; keyLimit?: unknown; testingMode?: boolean; internal?: boolean } = {}) {
	return handleSuccessAudit(
		{
			requestId: "req_1",
			billingRequestId: "bill_1",
			workspaceId: "ws_1",
			keyId: KEY,
			endpoint: "responses",
			capability: "text.generate",
			model: "openai/gpt-5.4",
			stream: false,
			body: {},
			internal: overrides.internal ?? false,
			testingMode: overrides.testingMode ?? false,
			meta: { requestId: "req_1", apiKeyId: KEY, authMethod: "api_key", ...overrides.meta },
			providers: [],
			pricing: {},
			gating: {
				key: { ok: true, reason: null, resetAt: null },
				keyLimit: overrides.keyLimit ?? CAPPED,
				credit: { ok: true, reason: null, resetAt: null },
			},
		} as any,
		{
			kind: "completed",
			upstream: new Response("{}", { status: 200, headers: { "content-type": "application/json" } }),
			provider: "openai",
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
}

describe("handleSuccessAudit spend-limit shadow", () => {
	beforeEach(() => {
		auditSuccessMock.mockReset().mockResolvedValue(undefined);
		recordShadowSpendMock.mockReset();
	});

	it("counts a capped key's successful request after its row is written", async () => {
		auditSuccessMock.mockImplementation(async () => {
			// The row is written before the coordinator hears of it.
			expect(recordShadowSpendMock).not.toHaveBeenCalled();
		});
		await audit();
		expect(auditSuccessMock).toHaveBeenCalledTimes(1);
		expect(recordShadowSpendMock).toHaveBeenCalledWith({
			workspaceId: "ws_1", keyId: KEY, billingRequestId: "bill_1", requestId: "req_1", costNanos: 12_345, internal: false,
		});
	});

	it("skips keys without limits, OAuth requests and unpersisted testing requests", async () => {
		await audit({ keyLimit: { ok: true, reason: null, resetAt: null, buckets: null, budgets: [] } });
		await audit({ meta: { authMethod: "oauth" } });
		await audit({ testingMode: true });
		expect(recordShadowSpendMock).not.toHaveBeenCalled();
	});
});
