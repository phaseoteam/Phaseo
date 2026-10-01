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
	it("maps Scaleway's documented Jina/Cohere-compatible rerank contract", async () => {
		setupRuntimeFromEnv({ SCW_SECRET_KEY: "test-scaleway-key", SCALEWAY_BASE_URL: "https://api.scaleway.example" } as any);
		const mock = installFetchMock([{
			match: (url) => url === "https://api.scaleway.example/v1/rerank",
			response: jsonResponse({
				id: "rerank-scaleway", model: "qwen3-embedding-8b", usage: { total_tokens: 99 },
				results: [{ index: 1, document: { text: "doc two", multi_modal: null }, relevance_score: 0.6456 }],
			}),
		}]);
		const result = await executor(buildArgs({ providerId: "scaleway", providerModelSlug: "qwen3-embedding-8b", ir: {
			model: "qwen/qwen3-embedding-8b", documents: ["doc one", { text: "doc two" }], topN: 1,
			returnDocuments: true, maxChunksPerDoc: 2, maxTokensPerDoc: 100, priority: 5,
			rankFields: ["text"], userId: "unsupported", serviceTier: "default", metadata: { trace: "x" },
		} }));
		mock.restore();
		expect(mock.calls[0]?.bodyJson).toEqual({
			model: "qwen3-embedding-8b", query: "what is a reranker?",
			documents: ["doc one", '{"text":"doc two"}'], top_n: 1,
		});
		expect((result as any).ir.results[0]).toMatchObject({ index: 1, relevanceScore: 0.6456, document: { text: "doc two", multi_modal: null } });
		expect((result as any).bill.usage).toMatchObject({ input_text_tokens: 99, total_tokens: 99 });
	});

	it.each(["novita", "novitaai"])("implements Novita rerank for alias %s", async (providerId) => {
		setupRuntimeFromEnv({
			NOVITA_API_KEY: "novita-test",
			NOVITA_BASE_URL: "https://api.novita.ai",
		} as any);
		const mock = installFetchMock([{
			match: (url) => url === "https://api.novita.example/openai/v1/rerank",
			response: jsonResponse({
				id: "rerank_novita",
				results: [{ index: 1, relevance_score: 0.97, document: { text: "doc two" } }],
				usage: { prompt_tokens: 9, completion_tokens: 1, total_tokens: 10 },
			}),
		}]);
		const result = await executor(buildArgs({
			providerId,
			providerModelSlug: "baai/bge-reranker-v2-m3",
			ir: {
				model: "baai/bge-reranker-v2-m3",
				documents: ["doc one", { title: "doc two" }],
				topN: 1,
				returnDocuments: true,
				maxChunksPerDoc: 3,
				maxTokensPerDoc: 512,
				priority: 10,
				rankFields: ["title"],
				userId: "not-supported",
				metadata: { trace: "not-supported" },
			},
		}));
		expect(mock.calls[0]?.headers.Authorization).toBe("Bearer test-novita-key");
		expect(mock.calls[0]?.bodyJson).toEqual({
			model: "baai/bge-reranker-v2-m3",
			query: "what is a reranker?",
			documents: ["doc one", JSON.stringify({ title: "doc two" })],
			top_n: 1,
		});
		expect((result as any).ir).toMatchObject({
			id: "rerank_novita",
			results: [{ index: 1, relevanceScore: 0.97, document: { text: "doc two" } }],
			usage: { inputTokens: 9, outputTokens: 1, totalTokens: 10 },
		});
		expect((result as any).bill.usage).toMatchObject({ input_text_tokens: 9, output_text_tokens: 1 });
		mock.restore();
	});

	it("posts Cohere-native v2 rerank payloads and preserves search-unit usage", async () => {
		setupRuntimeFromEnv({
			COHERE_API_KEY: "test-cohere-key",
		} as any);

		const mock = installFetchMock([
			{
				match: (url) => url === "https://api.cohere.example/v2/rerank",
				response: jsonResponse({
					id: "rerank_123",
					model: "rerank-v4.0-fast",
					results: [
						{ index: 1, relevance_score: 0.91 },
						{ index: 0, relevance_score: 0.72 },
					],
					meta: {
						api_version: { version: "2", is_experimental: false },
						billed_units: { search_units: 1 },
					},
				}),
			},
		]);

		const result = await executor(buildArgs({
			ir: {
				documents: ["doc one", { title: "Structured", body: "doc two" }],
				maxTokensPerDoc: 2048,
				priority: 100,
				returnDocuments: true,
				maxChunksPerDoc: 3,
				rankFields: ["title", "body"],
				userId: "unsupported-user",
				metadata: { unsupported: "value" },
			},
		}));
		mock.restore();

		expect(result.kind).toBe("completed");
		expect(mock.calls).toHaveLength(1);
		expect(mock.calls[0]?.bodyJson?.query).toBe("what is a reranker?");
		expect(mock.calls[0]?.bodyJson?.documents).toEqual([
			"doc one",
			JSON.stringify({ title: "Structured", body: "doc two" }),
		]);
		expect(mock.calls[0]?.bodyJson?.model).toBe("rerank-v4.0-fast");
		expect(mock.calls[0]?.bodyJson?.max_tokens_per_doc).toBe(2048);
		expect(mock.calls[0]?.bodyJson?.priority).toBe(100);
		expect(mock.calls[0]?.bodyJson?.return_documents).toBeUndefined();
		expect(mock.calls[0]?.bodyJson?.max_chunks_per_doc).toBeUndefined();
		expect(mock.calls[0]?.bodyJson?.rank_fields).toBeUndefined();
		expect(mock.calls[0]?.bodyJson?.user).toBeUndefined();
		expect(mock.calls[0]?.bodyJson?.metadata).toBeUndefined();
		expect((result as any).ir?.results?.[0]?.relevanceScore).toBe(0.91);
		expect((result as any).ir?.usage?.searchUnits).toBe(1);
		expect((result as any).bill?.usage?.search_units).toBe(1);
	});

	it("prefers provider_model_slug when present", async () => {
		setupRuntimeFromEnv({
			FIREWORKS_API_KEY: "test-fireworks-key",
		} as any);

		const mock = installFetchMock([
			{
				match: (url) => url === "https://api.fireworks.example/inference/v1/rerank",
				response: jsonResponse({
					object: "list",
					model: "accounts/fireworks/models/qwen3-reranker-8b",
					data: [{ index: 0, relevance_score: 0.88, document: "doc one" }],
					usage: { prompt_tokens: 9, total_tokens: 9 },
				}),
			},
		]);

		const result = await executor(
			buildArgs({
				providerId: "fireworks",
				providerModelSlug: "accounts/fireworks/models/qwen3-reranker-8b",
				ir: {
					model: "qwen/qwen3-reranker-8b",
					documents: ["doc one", { title: "Structured", body: "doc two" }],
					topN: 1,
					returnDocuments: true,
					maxChunksPerDoc: 3,
					maxTokensPerDoc: 512,
					priority: 10,
					rankFields: ["title"],
					userId: "not-supported",
					metadata: { trace: "not-supported" },
					vendor: { provider_options: { fireworks: { task: "Retrieve relevant passages" } } },
				},
			}),
		);
		mock.restore();

		expect(result.kind).toBe("completed");
		expect(mock.calls).toHaveLength(1);
		expect(mock.calls[0]?.bodyJson?.model).toBe(
			"accounts/fireworks/models/qwen3-reranker-8b",
		);
		expect(mock.calls[0]?.bodyJson).toMatchObject({
			documents: ["doc one", JSON.stringify({ title: "Structured", body: "doc two" })],
			top_n: 1,
			return_documents: true,
			task: "Retrieve relevant passages",
		});
		for (const key of ["max_chunks_per_doc", "max_tokens_per_doc", "priority", "rank_fields", "user", "metadata", "provider_options"]) {
			expect(mock.calls[0]?.bodyJson?.[key]).toBeUndefined();
		}
		expect((result as any).ir.results[0]).toMatchObject({ index: 0, relevanceScore: 0.88, document: "doc one" });
		expect((result as any).ir.usage).toMatchObject({ inputTokens: 9, totalTokens: 9 });
		expect((result as any).bill.usage).toMatchObject({ input_tokens: 9, total_tokens: 9 });
	});

	it.each(["rerank-2.5", "rerank-3", "rerank-3-lite"])("maps %s into Voyage-compatible fields", async model => {
		setupRuntimeFromEnv({
			VOYAGE_API_KEY: "test-voyage-key",
		} as any);

		const mock = installFetchMock([
			{
				match: (url) => url === "https://api.voyage.example/v1/rerank",
				response: jsonResponse({
					id: "rerank_voyage",
					model,
					data: [{ index: 0, relevance_score: 0.94 }],
				}),
			},
		]);

		const result = await executor(
			buildArgs({
				providerId: "voyage",
				ir: {
					model: `voyage/${model}`,
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
		expect(mock.calls[0]?.bodyJson?.model).toBe(model);
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

	it("maps the exact Nebius rerank contract and token usage", async () => {
		setupRuntimeFromEnv({ NEBIUS_API_KEY: "test-nebius-key" } as any);
		const mock = installFetchMock([{ match: (url) => url.endsWith("/v1/rerank"), response: jsonResponse({
			id: "rerank-nebius", model: "Qwen/Qwen3-Reranker-8B",
			usage: { prompt_tokens: 65, total_tokens: 65 },
			results: [{ index: 1, document: { text: "Paris" }, relevance_score: 0.94 }],
		}) }]);
		const result = await executor(buildArgs({ providerId: "nebius-token-factory", providerModelSlug: "Qwen/Qwen3-Reranker-8B", ir: {
			model: "qwen/qwen3-reranker-8b", documents: ["London", { text: "Paris" }], userId: "user-1",
			serviceTier: "flex", topN: 1, returnDocuments: false, metadata: { trace: "x" },
		} }));
		mock.restore();
		expect(mock.calls[0]?.bodyJson).toEqual({ model: "Qwen/Qwen3-Reranker-8B", query: "what is a reranker?", documents: ["London", '{"text":"Paris"}'], user: "user-1", service_tier: "flex" });
		expect((result as any).ir?.results[0]?.document).toEqual({ text: "Paris" });
		expect((result as any).bill?.usage).toMatchObject({ input_tokens: 65, total_tokens: 65 });
	});

	it("preserves Nebius 422 validation errors without fabricating usage", async () => {
		setupRuntimeFromEnv({ NEBIUS_API_KEY: "test-nebius-key" } as any);
		const detail = { detail: [{ loc: ["body", "documents"], msg: "Input should be a valid list", type: "list_type" }] };
		const mock = installFetchMock([{ match: (url) => url.endsWith("/v1/rerank"), response: jsonResponse(detail, { status: 422 }) }]);
		const result = await executor(buildArgs({ providerId: "nebius-token-factory", ir: { model: "qwen/qwen3-reranker-8b" } }));
		mock.restore();
		expect(result.upstream.status).toBe(422);
		expect((result as any).ir).toBeUndefined();
		expect((result as any).bill).toBeUndefined();
		expect((result as any).rawResponse).toEqual(detail);
	});
});
