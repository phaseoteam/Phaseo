import { beforeEach, describe, expect, it, vi } from "vitest";

const auditSuccessMock = vi.fn();
const recordShadowSpendMock = vi.fn();
const settleEnforcedSpendMock = vi.fn();
const releaseSpendMock = vi.fn();

vi.mock("../audit", () => ({
	auditSuccess: (...args: any[]) => auditSuccessMock(...args),
	auditFailure: vi.fn(),
}));
vi.mock("@observability/events", () => ({ emitGatewayRequestEvent: vi.fn(async () => undefined) }));
vi.mock("@core/spend-limits", () => ({
	recordShadowSpend: (...args: any[]) => recordShadowSpendMock(...args),
	settleEnforcedSpend: (...args: any[]) => settleEnforcedSpendMock(...args),
	releaseSpend: (...args: any[]) => releaseSpendMock(...args),
}));

import { handleFailureAudit, handleSuccessAudit } from "./audit";

const KEY = "00000000-0000-4000-8000-000000000001";
const CAPPED = {
	ok: true, reason: null, resetAt: null,
	buckets: { daily: { windowStart: null, requestsUsed: 3, requestsLimit: 100, costUsedNanos: 0, costLimitNanos: 0 } },
};

const ADMISSION = { workspaceId: "ws_1", keyId: KEY, admissionId: "req_1", leaseId: "lease_1", fromSlice: true, unlimited: false };

function context(overrides: { meta?: Record<string, unknown>; keyLimit?: unknown; testingMode?: boolean; internal?: boolean; spendAdmission?: unknown } = {}) {
	return {
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
		spendAdmission: overrides.spendAdmission ?? null,
	} as any;
}

function audit(overrides: Parameters<typeof context>[0] = {}) {
	return handleSuccessAudit(
		context(overrides),
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
		settleEnforcedSpendMock.mockReset();
		releaseSpendMock.mockReset();
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

	it("counts a capped delegated OAuth key, which is a real key attributed to its app", async () => {
		await audit({ meta: { authMethod: "oauth", apiKeyRef: "kid_delegated", oauthClientId: "client_1" } });
		expect(recordShadowSpendMock).toHaveBeenCalledWith(expect.objectContaining({ keyId: KEY }));
	});

	it("skips keys without limits, OAuth access tokens, unpersisted testing requests and failed row writes", async () => {
		await audit({ keyLimit: { ok: true, reason: null, resetAt: null, buckets: null, budgets: [] } });
		await audit({ meta: { authMethod: "oauth", apiKeyRef: "oauth_client_1" } });
		await audit({ testingMode: true });
		const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
		auditSuccessMock.mockRejectedValueOnce(new Error("database unavailable"));
		await audit();
		auditSuccessMock.mockResolvedValueOnce(false);
		await audit();
		error.mockRestore();
		expect(recordShadowSpendMock).not.toHaveBeenCalled();
	});

	it("settles the enforce-mode admission with the charge, whatever the legacy key-limit state", async () => {
		auditSuccessMock.mockImplementation(async () => {
			expect(settleEnforcedSpendMock).not.toHaveBeenCalled();
		});
		await audit({ spendAdmission: ADMISSION, keyLimit: { ok: true, reason: null, resetAt: null, buckets: null, budgets: [] } });
		expect(settleEnforcedSpendMock).toHaveBeenCalledWith({
			admission: ADMISSION, rowWritten: true, workspaceId: "ws_1", keyId: KEY, billingRequestId: "bill_1", requestId: "req_1",
			costNanos: 12_345, internal: false,
		});
		// Without a row the admission is released (settleEnforcedSpend decides); OAuth access tokens have none.
		settleEnforcedSpendMock.mockClear();
		await audit({ spendAdmission: ADMISSION, testingMode: true });
		expect(settleEnforcedSpendMock).toHaveBeenCalledWith(expect.objectContaining({ admission: ADMISSION, rowWritten: false }));
		settleEnforcedSpendMock.mockClear();
		await audit({ meta: { authMethod: "oauth", apiKeyRef: "oauth_client_1" } });
		expect(settleEnforcedSpendMock).not.toHaveBeenCalled();
		// A delegated OAuth key is a key: its admission is settled like any other.
		await audit({ spendAdmission: ADMISSION, meta: { authMethod: "oauth", apiKeyRef: "kid_delegated", oauthClientId: "client_1" } });
		expect(settleEnforcedSpendMock).toHaveBeenCalledWith(expect.objectContaining({ admission: ADMISSION, keyId: KEY }));
	});

	it("releases the enforce-mode admission when the request fails", async () => {
		await handleFailureAudit(context({ spendAdmission: ADMISSION }), { provider: "openai" } as any, 502, "upstream", "upstream_error", "failed");
		expect(releaseSpendMock).toHaveBeenCalledWith(ADMISSION);
	});
});
