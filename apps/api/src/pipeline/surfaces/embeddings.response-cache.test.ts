import { beforeEach, describe, expect, it, vi } from "vitest";
import { Timer } from "../telemetry/timer";
import type { CachedResponseRecord } from "@/core/response-cache";

const mocks = vi.hoisted(() => ({
	doRequestWithIR: vi.fn(),
	finalizeRequest: vi.fn(),
	handleSuccessAudit: vi.fn(),
	getResponseCache: vi.fn(),
	releaseCustomerRequest: vi.fn(),
	background: [] as Promise<unknown>[],
}));

vi.mock("@protocols/openai-embeddings/decode", () => ({
	decodeOpenAIEmbeddingsRequest: () => ({ model: "openai/text-embedding-3-small", input: ["hello"] }),
}));
vi.mock("@protocols/openai-embeddings/encode", () => ({
	encodeOpenAIEmbeddingsResponse: (ir: unknown) => ir,
}));
vi.mock("../execute", () => ({ doRequestWithIR: mocks.doRequestWithIR }));
vi.mock("../after", () => ({ finalizeRequest: mocks.finalizeRequest }));
vi.mock("../after/audit", () => ({ handleSuccessAudit: mocks.handleSuccessAudit }));
vi.mock("@/routes/v1/data/customer-quota", () => ({ releaseCustomerRequest: mocks.releaseCustomerRequest }));
vi.mock("@/runtime/env", () => ({
	getResponseCache: mocks.getResponseCache,
	ensureRuntimeForBackground: () => () => {},
	dispatchBackground: (promise: Promise<unknown>) => { mocks.background.push(promise); },
}));

import { runEmbeddingsPipeline } from "./embeddings";

function args(headers: Record<string, string> = { "X-Phaseo-Cache": "true" }) {
	return {
		pre: {
			ok: true as const,
			ctx: {
				endpoint: "embeddings",
				requestId: "req_embed_hit",
				workspaceId: "ws_123",
				keyId: "key_123",
				model: "openai/text-embedding-3-small",
				meta: { before_ms: 3 },
				rawBody: { model: "openai/text-embedding-3-small", input: "hello" },
				body: { model: "openai/text-embedding-3-small", input: "hello" },
				preset: null,
				routingMode: "balanced",
				teamSettings: {},
			} as any,
		},
		req: new Request("https://example.com/v1/embeddings", { method: "POST", headers }),
		endpoint: "embeddings" as const,
		timing: { timer: new Timer(), internal: { adapterMarked: false } },
	};
}

const record: CachedResponseRecord = {
	version: "v2",
	key: "gateway:response-cache:v2:key_123:abc",
	fingerprint: "abc",
	endpoint: "embeddings",
	model: "openai/text-embedding-3-small",
	statusCode: 200,
	responseBody: {
		object: "list",
		data: [{ object: "embedding", index: 0, embedding: [0.25, -0.5] }],
		usage: { prompt_tokens: 2, total_tokens: 2 },
	},
	providerId: "openai",
	providerModelSlug: null,
	usage: { prompt_tokens: 2, total_tokens: 2 },
	currency: "USD",
	finishReason: null,
	nativeResponseId: null,
	routingMode: "balanced",
	preset: { id: null, slug: null },
	sourceRequestId: "req_embed_source",
	createdAt: new Date().toISOString(),
	expiresAt: new Date(Date.now() + 60_000).toISOString(),
	ttlSeconds: 300,
};

beforeEach(() => {
	vi.clearAllMocks();
	mocks.background.length = 0;
	mocks.handleSuccessAudit.mockResolvedValue(undefined);
	mocks.doRequestWithIR.mockResolvedValue({
		result: { kind: "completed", ir: { data: [] }, upstream: new Response(null, { status: 200 }), provider: "openai", bill: {} },
	});
	mocks.finalizeRequest.mockResolvedValue(new Response("{}", { status: 200 }));
});

describe("runEmbeddingsPipeline response cache", () => {
	it("serves a hit with the vectors intact and zero usage", async () => {
		mocks.getResponseCache.mockReturnValue({ get: vi.fn().mockResolvedValue(record), set: vi.fn(), delete: vi.fn() });

		const run = args();
		const response = await runEmbeddingsPipeline(run);
		await Promise.all(mocks.background);

		expect(response.headers.get("X-Phaseo-Cache-Status")).toBe("HIT");
		expect(await response.json()).toEqual({
			object: "list",
			data: [{ object: "embedding", index: 0, embedding: [0.25, -0.5] }],
			usage: { prompt_tokens: 0, total_tokens: 0 },
		});
		expect(mocks.doRequestWithIR).not.toHaveBeenCalled();
		expect(mocks.releaseCustomerRequest).toHaveBeenCalledWith(run.req);
	});

	it("runs the request on a miss and leaves the entry for the after stage to store", async () => {
		const store = { get: vi.fn().mockResolvedValue(null), set: vi.fn(), delete: vi.fn() };
		mocks.getResponseCache.mockReturnValue(store);

		const run = args();
		await runEmbeddingsPipeline(run);

		expect(store.get).toHaveBeenCalledTimes(1);
		expect(mocks.doRequestWithIR).toHaveBeenCalledTimes(1);
		expect(run.pre.ctx.responseCache).toMatchObject({ enabled: true, status: "miss", ttlSeconds: 300 });
	});

	it("stays off without the header or a preset", async () => {
		const store = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };
		mocks.getResponseCache.mockReturnValue(store);

		const run = args({});
		await runEmbeddingsPipeline(run);

		expect(store.get).not.toHaveBeenCalled();
		expect(run.pre.ctx.responseCache).toMatchObject({ status: "bypass", reason: "not_enabled" });
	});
});
