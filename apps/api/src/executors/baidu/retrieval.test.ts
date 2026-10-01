import { afterEach, beforeEach, expect, it } from "vitest";
import { executor as rerank } from "../openai/rerank";
import { executor as embeddings } from "../openai/embeddings";
import { installFetchMock, jsonResponse } from "../../../tests/helpers/mock-fetch";
import { setupRuntimeFromEnv, teardownTestRuntime } from "../../../tests/helpers/runtime";

beforeEach(() => setupRuntimeFromEnv({ BAIDU_QIANFAN_API_KEY: "test-key" } as any));
afterEach(teardownTestRuntime);
const args = (ir: any) => ({ ir, providerId: "baidu", endpoint: "text.rerank" as const, requestId: "test", workspaceId: "test", byokMeta: [], pricingCard: {}, meta: {} });

it("uses Qianfan rerank fields and bills native prompt tokens", async () => {
	const mock = installFetchMock([{ match: url => url === "https://qianfan.baidubce.com/v2/rerank", response: jsonResponse({ results: [{ index: 1, relevance_score: 0.9, document: "second" }], usage: { prompt_tokens: 17, total_tokens: 17 } }) }]);
	try {
		const result = await rerank(args({ model: "qwen3-reranker-8b", query: "lookup", documents: ["first", "second"], topN: 1, returnDocuments: false }));
		expect(mock.calls[0].bodyJson).toEqual({ model: "qwen3-reranker-8b", query: "lookup", documents: ["first", "second"], top_n: 1 });
		expect(result.kind === "completed" && result.ir).toMatchObject({ results: [{ index: 1, relevanceScore: 0.9 }] });
		expect(result.kind === "completed" && (result.ir as any).results[0].document).toBeUndefined();
		expect(result.bill.usage?.input_text_tokens).toBe(17);
	} finally { mock.restore(); }
});

it("rejects unsupported rerank controls before sending a request", async () => {
	const mock = installFetchMock([]);
	try {
		const result = await rerank(args({ model: "qwen3-reranker-8b", query: "lookup", documents: ["first"], maxChunksPerDoc: 2 }));
		expect(result.upstream.status).toBe(400);
		expect(mock.calls).toHaveLength(0);
	} finally { mock.restore(); }
});

it("uses the native v2 embeddings URL and normalizes usage", async () => {
	const mock = installFetchMock([{ match: url => url === "https://qianfan.baidubce.com/v2/embeddings", response: jsonResponse({ data: [{ index: 0, embedding: [0.1, 0.2] }], usage: { prompt_tokens: 3, total_tokens: 3 } }) }]);
	try {
		const result = await embeddings({ ...args({ model: "qwen3-embedding-8b", input: ["text"] }), endpoint: "embeddings" });
		expect(mock.calls[0].bodyJson).toEqual({ model: "qwen3-embedding-8b", input: ["text"] });
		expect(result.bill.usage?.input_text_tokens).toBe(3);
	} finally { mock.restore(); }
});
