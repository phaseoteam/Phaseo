import { beforeEach, describe, expect, it, vi } from "vitest";
import { Timer } from "../telemetry/timer";
import { runTextGeneratePipeline } from "./text-generate";
import type { CachedResponseRecord } from "@/core/response-cache";

const detectTextProtocolMock = vi.fn();
const decodeProtocolMock = vi.fn();
const encodeProtocolMock = vi.fn();
const doRequestWithIRMock = vi.fn();
const finalizeRequestMock = vi.fn();
const handleSuccessAuditMock = vi.fn();
const getResponseCacheMock = vi.fn();
const ensureRuntimeForBackgroundMock = vi.fn();
const dispatchBackgroundMock = vi.fn();
const validateTextIRContractMock = vi.fn();
const prepareServerToolsForTextRequestMock = vi.fn();

vi.mock("@protocols/detect", () => ({
	detectTextProtocol: (...args: any[]) => detectTextProtocolMock(...args),
}));

vi.mock("@protocols/index", () => ({
	decodeProtocol: (...args: any[]) => decodeProtocolMock(...args),
	encodeProtocol: (...args: any[]) => encodeProtocolMock(...args),
}));

vi.mock("../execute", () => ({
	doRequestWithIR: (...args: any[]) => doRequestWithIRMock(...args),
}));

vi.mock("../after", () => ({
	finalizeRequest: (...args: any[]) => finalizeRequestMock(...args),
}));

vi.mock("../after/audit", () => ({
	handleSuccessAudit: (...args: any[]) => handleSuccessAuditMock(...args),
}));

vi.mock("@/runtime/env", () => ({
	getResponseCache: (...args: any[]) => getResponseCacheMock(...args),
	ensureRuntimeForBackground: (...args: any[]) =>
		ensureRuntimeForBackgroundMock(...args),
	dispatchBackground: (...args: any[]) => dispatchBackgroundMock(...args),
}));

vi.mock("../text-ir-contract", () => ({
	validateTextIRContract: (...args: any[]) =>
		validateTextIRContractMock(...args),
	buildTextIRContractErrorResponse: () =>
		new Response(JSON.stringify({ error: "invalid_contract" }), {
			status: 400,
		}),
}));

vi.mock("./server-tools", () => ({
	prepareServerToolsForTextRequest: (...args: any[]) =>
		prepareServerToolsForTextRequestMock(...args),
	attachServerToolUsage: vi.fn(),
	attachServerToolUsageToRawUsage: vi.fn(),
	buildSyntheticServerToolStream: vi.fn(),
	buildServerToolContinuation: vi.fn(),
	consumeTextProtocolStreamToIR: vi.fn(),
	mergeIRUsageTotals: vi.fn(),
}));

function createPre() {
	return {
		ok: true as const,
		ctx: {
			endpoint: "responses",
			capability: "text.generate",
			requestId: "req_test_cache",
			protocol: "responses",
			meta: {
				debug: undefined,
				returnMeta: false,
				before_ms: 12,
			},
			rawBody: {
				model: "openai/gpt-5.4-nano",
				input: "hello",
			},
			body: {
				model: "openai/gpt-5.4-nano",
				input: "hello",
			},
			model: "openai/gpt-5.4-nano",
			workspaceId: "ws_123",
			stream: false,
			providers: [],
			pricing: {},
			gating: {
				key: { ok: true, reason: null, resetAt: null },
				keyLimit: { ok: true, reason: null, resetAt: null },
				credit: { ok: true, reason: null, resetAt: null },
			},
			preset: null,
			internal: false,
			teamSettings: {
				routingMode: "balanced",
				byokFallbackEnabled: true,
				betaChannelEnabled: false,
				billingMode: "wallet",
			},
			routingMode: "balanced",
		} as any,
	};
}

function createArgs() {
	return {
		pre: createPre(),
		req: new Request("https://example.com/v1/responses", {
			method: "POST",
		}),
		endpoint: "responses" as const,
		timing: {
			timer: new Timer(),
			internal: {
				adapterMarked: false,
			},
		},
	};
}

describe("runTextGeneratePipeline response cache", () => {
	const pendingBackground: Promise<unknown>[] = [];

	beforeEach(() => {
		vi.clearAllMocks();
		pendingBackground.length = 0;

		detectTextProtocolMock.mockReturnValue("responses");
		decodeProtocolMock.mockReturnValue({
			stream: false,
			messages: [{ role: "user", content: "hello" }],
		});
		encodeProtocolMock.mockReturnValue({ id: "resp_123" });
		validateTextIRContractMock.mockReturnValue([]);
		prepareServerToolsForTextRequestMock.mockImplementation((body: any) => ({
			ok: true,
			body,
			config: { enabled: false },
		}));
		ensureRuntimeForBackgroundMock.mockReturnValue(() => {});
		dispatchBackgroundMock.mockImplementation((promise: Promise<unknown>) => {
			pendingBackground.push(promise);
		});
		handleSuccessAuditMock.mockResolvedValue(undefined);
	});

	it("returns cached responses without executing providers", async () => {
		const cachedRecord: CachedResponseRecord = {
			version: "v1",
			key: "gateway:response-cache:v1:ws_123:abc123",
			fingerprint: "abc123",
			endpoint: "responses",
			model: "openai/gpt-5.4-nano",
			statusCode: 200,
			responseBody: { id: "resp_cached", object: "response" },
			providerId: "openai",
			providerModelSlug: null,
			usage: { input_tokens: 10, output_tokens: 4 },
			currency: "USD",
			finishReason: "stop",
			nativeResponseId: "native_123",
			routingMode: "balanced",
			preset: { id: null, slug: null },
			createdAt: new Date(Date.now() - 500).toISOString(),
			expiresAt: new Date(Date.now() + 60_000).toISOString(),
			ttlSeconds: 300,
		};

		getResponseCacheMock.mockReturnValue({
			get: vi.fn().mockResolvedValue(cachedRecord),
			set: vi.fn(),
			delete: vi.fn(),
		});

		const args = createArgs();
		const response = await runTextGeneratePipeline(args);
		await Promise.all(pendingBackground);

		expect(response.status).toBe(200);
		expect(response.headers.get("X-Phaseo-Response-Cache")).toBe("hit");
		expect(await response.json()).toEqual({
			id: "resp_cached",
			object: "response",
		});
		expect(doRequestWithIRMock).not.toHaveBeenCalled();
		expect(finalizeRequestMock).not.toHaveBeenCalled();
		expect(handleSuccessAuditMock).toHaveBeenCalledTimes(1);
		expect(args.pre.ctx.responseCache).toMatchObject({
			enabled: true,
			status: "hit",
			providerId: "openai",
		});
	});

	it("overrides cached response meta with current cache-hit and guardrail metadata", async () => {
		const cachedRecord: CachedResponseRecord = {
			version: "v1",
			key: "gateway:response-cache:v1:ws_123:abc123",
			fingerprint: "abc123",
			endpoint: "responses",
			model: "openai/gpt-5.4-nano",
			statusCode: 200,
			responseBody: {
				id: "resp_cached",
				object: "response",
				meta: {
					routing: {
						selected_provider: "openai",
					},
					response_cache: {
						status: "miss",
					},
				},
			},
			providerId: "openai",
			providerModelSlug: null,
			usage: { input_tokens: 10, output_tokens: 4 },
			currency: "USD",
			finishReason: "stop",
			nativeResponseId: "native_123",
			routingMode: "balanced",
			preset: { id: null, slug: null },
			createdAt: new Date(Date.now() - 500).toISOString(),
			expiresAt: new Date(Date.now() + 60_000).toISOString(),
			ttlSeconds: 300,
		};

		getResponseCacheMock.mockReturnValue({
			get: vi.fn().mockResolvedValue(cachedRecord),
			set: vi.fn(),
			delete: vi.fn(),
		});

		const args = createArgs();
		args.pre.ctx.meta.returnMeta = true;
		args.pre.ctx.guardrailEnforcement = {
			source: "sensitive_info",
			action: "redact",
			actions: ["redact"],
			blocked: false,
			flagged: false,
			redacted: true,
			detectionCount: 1,
			redactionCount: 1,
			detection_count: 1,
			redaction_count: 1,
			guardrailIds: ["gr_123"],
			guardrail_ids: ["gr_123"],
			detections: [],
			detectors: [],
		};

		const response = await runTextGeneratePipeline(args);
		const body = await response.json();

		expect(body.meta).toMatchObject({
			routing: {
				selected_provider: "openai",
			},
			response_cache: {
				status: "hit",
				providerId: "openai",
			},
			guardrail_enforcement: {
				action: "redact",
				redacted: true,
			},
		});
	});

	it("falls through to live execution on cache miss", async () => {
		getResponseCacheMock.mockReturnValue({
			get: vi.fn().mockResolvedValue(null),
			set: vi.fn(),
			delete: vi.fn(),
		});
		doRequestWithIRMock.mockResolvedValue({
			result: {
				kind: "completed",
				ir: { id: "ir_123" },
				upstream: new Response(JSON.stringify({ ok: true }), { status: 200 }),
				provider: "openai",
				generationTimeMs: 4,
				bill: { cost_cents: 0, currency: "USD" },
			},
		});
		finalizeRequestMock.mockResolvedValue(
			new Response(JSON.stringify({ ok: true }), { status: 200 }),
		);

		const args = createArgs();
		const response = await runTextGeneratePipeline(args);

		expect(response.status).toBe(200);
		expect(doRequestWithIRMock).toHaveBeenCalledTimes(1);
		expect(finalizeRequestMock).toHaveBeenCalledTimes(1);
		expect(args.pre.ctx.responseCache).toMatchObject({
			enabled: true,
			status: "miss",
		});
	});
});
