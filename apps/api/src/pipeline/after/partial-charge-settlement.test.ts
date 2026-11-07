import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	auditFailure: vi.fn(async (_args: unknown) => undefined as unknown),
	settleChargedFailureSpend: vi.fn(),
	releaseSpend: vi.fn(),
	background: [] as Promise<unknown>[],
}));

vi.mock("../audit", () => ({
	auditFailure: (args: unknown) => mocks.auditFailure(args),
	auditSuccess: vi.fn(async () => undefined),
}));
vi.mock("@core/spend-limits", async (importOriginal) => ({
	...(await importOriginal<typeof import("@core/spend-limits")>()),
	settleChargedFailureSpend: (...args: unknown[]) => mocks.settleChargedFailureSpend(...args),
	releaseSpend: (...args: unknown[]) => mocks.releaseSpend(...args),
}));
vi.mock("@observability/events", () => ({ emitGatewayRequestEvent: async () => undefined }));
vi.mock("@observability/otlp-export", () => ({ enqueueGatewayOtlpExport: async () => undefined }));
vi.mock("@/runtime/env", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/runtime/env")>()),
	ensureRuntimeForBackground: () => () => {},
	dispatchBackground: (promise: Promise<unknown>) => { mocks.background.push(promise.catch(() => undefined)); },
}));

import { handleFailureAudit } from "./audit";
import { handleError } from "@core/error-handler";

function chargedFailure() {
	return {
		requestId: "req_partial",
		billingRequestId: "bill_partial",
		workspaceId: "ws_1",
		keyId: "00000000-0000-4000-8000-000000000001",
		endpoint: "chat.completions",
		capability: "text.generate",
		model: "openai/gpt-5.4-nano",
		requestedModel: "openai/gpt-5.4-nano",
		stream: false,
		body: {},
		rawBody: {},
		meta: { apiKeyId: "00000000-0000-4000-8000-000000000001" },
		providers: [],
		pricing: {},
		providerAttempts: [],
		spendAdmission: { admissionId: "adm_1" },
		serverToolPartialCharge: { costNanos: 400, currency: "USD", usage: { input_tokens: 3_000 }, pricingLines: [] },
	} as any;
}

const result = () => ({
	kind: "completed",
	provider: "openai",
	upstream: new Response(null, { status: 200 }),
	generationTimeMs: 1,
	bill: { cost_cents: 0, currency: "USD", usage: {} },
}) as any;

// The empty-follow-up and broken-stream paths: the failure row is written by handleFailureAudit,
// then handleError returns the response with a no-op audit.
async function failAfterRounds(ctx: any) {
	await handleFailureAudit(ctx, result(), 502, "gateway", "google_empty_response", "Empty response");
	await handleError({
		stage: "execute",
		res: new Response(JSON.stringify({ error: "google_empty_response" }), { status: 502 }),
		endpoint: "chat.completions",
		ctx,
		auditFailure: async () => {},
	});
	while (mocks.background.length) await Promise.all(mocks.background.splice(0));
}

describe("spend-limit settlement of a charged server-tool failure", () => {
	beforeEach(() => {
		mocks.auditFailure.mockReset().mockResolvedValue(undefined);
		mocks.settleChargedFailureSpend.mockReset();
		mocks.releaseSpend.mockReset();
		mocks.background.length = 0;
	});

	it("settles once when the failure row is persisted", async () => {
		const ctx = chargedFailure();
		await failAfterRounds(ctx);

		expect(mocks.auditFailure).toHaveBeenCalledWith(expect.objectContaining({ costNanos: 400 }));
		expect(mocks.settleChargedFailureSpend).toHaveBeenCalledOnce();
		expect(mocks.settleChargedFailureSpend).toHaveBeenCalledWith(ctx, 400);
		expect(mocks.releaseSpend).not.toHaveBeenCalled();
	});

	it("still settles once, never releasing, when persisting the failure row fails", async () => {
		mocks.auditFailure.mockRejectedValue(new Error("insert failed"));
		const ctx = chargedFailure();
		await failAfterRounds(ctx);

		expect(mocks.settleChargedFailureSpend).toHaveBeenCalledOnce();
		expect(mocks.settleChargedFailureSpend).toHaveBeenCalledWith(ctx, 400);
		expect(mocks.releaseSpend).not.toHaveBeenCalled();
	});

	it("settles from handleError, never releasing, when it is the one persisting and its write fails", async () => {
		const ctx = chargedFailure();
		await handleError({
			stage: "execute",
			res: new Response(JSON.stringify({ error: "gateway_server_tool_limit" }), { status: 400 }),
			endpoint: "chat.completions",
			ctx,
			auditFailure: async () => { throw new Error("insert failed"); },
		});
		while (mocks.background.length) await Promise.all(mocks.background.splice(0));

		expect(mocks.settleChargedFailureSpend).toHaveBeenCalledOnce();
		expect(mocks.settleChargedFailureSpend).toHaveBeenCalledWith(ctx, 400);
		expect(mocks.releaseSpend).not.toHaveBeenCalled();
	});
});
