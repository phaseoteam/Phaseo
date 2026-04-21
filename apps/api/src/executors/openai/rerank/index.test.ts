import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { IRRerankRequest } from "@core/ir";
import type { ExecutorExecuteArgs } from "@executors/types";
import { executor } from "./index";
import { installFetchMock, jsonResponse } from "../../../../tests/helpers/mock-fetch";
import {
	setupRuntimeFromEnv,
	setupTestRuntime,
	teardownTestRuntime,
} from "../../../../tests/helpers/runtime";

function buildArgs({
	providerId = "cohere",
	providerModelSlug = null,
	ir,
}: {
	providerId?: string;
	providerModelSlug?: string | null;
	ir?: Partial<IRRerankRequest>;
} = {}): ExecutorExecuteArgs {
	const request: IRRerankRequest = {
		model: "cohere/rerank-v4.0-fast",
		query: "what is a reranker?",
		documents: ["doc one", "doc two"],
		topN: 2,
		...ir,
	};

	return {
		ir: request,
		requestId: "req_openai_rerank_test",
		workspaceId: "team_test",
		providerId,
		endpoint: "rerank",
		protocol: "openai.rerank",
		capability: "rerank",
		providerModelSlug,
		capabilityParams: null,
		byokMeta: [],
		pricingCard: { rules: [] } as any,
		meta: {
			returnUpstreamRequest: true,
			debug: {
				return_upstream_request: true,
			},
		},
	} as ExecutorExecuteArgs;
}

beforeAll(() => {
	setupTestRuntime();
});

afterAll(() => {
	teardownTestRuntime();
});

describe("openai rerank executor", () => {
	it("posts OpenAI-compatible rerank payloads and normalizes response", async () => {
		setupRuntimeFromEnv({
			COHERE_API_KEY: "test-cohere-key",
		} as any);

		const mock = installFetchMock([
			{
				match: (url) =>
					url === "https://api.cohere.example/compatibility/v1/rerank",
				response: jsonResponse({
					id: "rerank_123",
					model: "rerank-v4.0-fast",
					results: [
						{ index: 1, relevance_score: 0.91, document: "doc two" },
						{ index: 0, relevance_score: 0.72, document: "doc one" },
					],
					usage: {
						input_tokens: 42,
						total_tokens: 42,
					},
				}),
			},
		]);

		const result = await executor(buildArgs());
		mock.restore();

		expect(result.kind).toBe("completed");
		expect(mock.calls).toHaveLength(1);
		expect(mock.calls[0]?.bodyJson?.query).toBe("what is a reranker?");
		expect(mock.calls[0]?.bodyJson?.documents).toEqual(["doc one", "doc two"]);
		expect(mock.calls[0]?.bodyJson?.model).toBe("rerank-v4.0-fast");
		expect((result as any).ir?.results?.[0]?.relevanceScore).toBe(0.91);
		expect((result as any).bill?.usage?.input_tokens).toBe(42);
	});

	it("prefers provider_model_slug when present", async () => {
		setupRuntimeFromEnv({
			FIREWORKS_API_KEY: "test-fireworks-key",
		} as any);

		const mock = installFetchMock([
			{
				match: (url) => url === "https://api.fireworks.example/inference/v1/rerank",
				response: jsonResponse({
					id: "rerank_fw",
					model: "accounts/fireworks/models/qwen3-reranker-8b",
					results: [{ index: 0, relevance_score: 0.88 }],
				}),
			},
		]);

		const result = await executor(
			buildArgs({
				providerId: "fireworks",
				providerModelSlug: "accounts/fireworks/models/qwen3-reranker-8b",
				ir: {
					model: "qwen/qwen3-reranker-8b",
				},
			}),
		);
		mock.restore();

		expect(result.kind).toBe("completed");
		expect(mock.calls).toHaveLength(1);
		expect(mock.calls[0]?.bodyJson?.model).toBe(
			"accounts/fireworks/models/qwen3-reranker-8b",
		);
	});

	it("maps OpenAI-style rerank payload into Voyage-compatible fields", async () => {
		setupRuntimeFromEnv({
			VOYAGE_API_KEY: "test-voyage-key",
		} as any);

		const mock = installFetchMock([
			{
				match: (url) => url === "https://api.voyage.example/v1/rerank",
				response: jsonResponse({
					id: "rerank_voyage",
					model: "rerank-2.5",
					data: [{ index: 0, relevance_score: 0.94 }],
				}),
			},
		]);

		const result = await executor(
			buildArgs({
				providerId: "voyage",
				ir: {
					model: "voyage/rerank-2.5",
					query: "best retrieval strategy",
					documents: [
						{ title: "Vector search", body: "Use ANN for recall." },
						"Keyword baseline",
					],
					topN: 1,
					rankFields: ["title", "body"],
					maxChunksPerDoc: 5,
					userId: "user_voyage",
					metadata: { team: "search" },
					vendor: { provider_options: { voyage: { truncation: false } } },
				},
			}),
		);
		mock.restore();

		expect(result.kind).toBe("completed");
		expect(mock.calls).toHaveLength(1);
		expect(mock.calls[0]?.bodyJson?.model).toBe("rerank-2.5");
		expect(mock.calls[0]?.bodyJson?.top_k).toBe(1);
		expect(mock.calls[0]?.bodyJson?.top_n).toBeUndefined();
		expect(mock.calls[0]?.bodyJson?.documents).toEqual([
			"Vector search\nUse ANN for recall.",
			"Keyword baseline",
		]);
		expect(mock.calls[0]?.bodyJson?.truncation).toBe(false);
		expect(mock.calls[0]?.bodyJson?.rank_fields).toBeUndefined();
		expect(mock.calls[0]?.bodyJson?.max_chunks_per_doc).toBeUndefined();
		expect(mock.calls[0]?.bodyJson?.user).toBeUndefined();
		expect(mock.calls[0]?.bodyJson?.metadata).toBeUndefined();
		expect((result as any).ir?.results?.[0]?.relevanceScore).toBe(0.94);
	});

	it("falls back to total_tokens when rerank usage omits input_tokens", async () => {
		setupRuntimeFromEnv({
			VOYAGE_API_KEY: "test-voyage-key",
		} as any);

		const mock = installFetchMock([
			{
				match: (url) => url === "https://api.voyage.example/v1/rerank",
				response: jsonResponse({
					id: "rerank_voyage_tokens",
					model: "rerank-2",
					data: [{ index: 0, relevance_score: 0.88 }],
					usage: {
						total_tokens: 8,
					},
				}),
			},
		]);

		const result = await executor(
			buildArgs({
				providerId: "voyage",
				ir: {
					model: "voyage/rerank-2",
				},
			}),
		);
		mock.restore();

		expect(result.kind).toBe("completed");
		expect((result as any).bill?.usage?.input_tokens).toBe(8);
		expect((result as any).bill?.usage?.input_text_tokens).toBe(8);
		expect((result as any).bill?.usage?.total_tokens).toBe(8);
	});
});
