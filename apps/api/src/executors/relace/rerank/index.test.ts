import { afterEach, beforeEach, expect, it } from "vitest";
import { executor } from "./index";
import { installFetchMock, jsonResponse } from "../../../../tests/helpers/mock-fetch";
import { setupRuntimeFromEnv, teardownTestRuntime } from "../../../../tests/helpers/runtime";

beforeEach(() => setupRuntimeFromEnv({ RELACE_API_KEY: "test-key" } as any));
afterEach(teardownTestRuntime);
const args = (ir: any) => ({ ir, providerId: "relace", endpoint: "text.rerank" as const, requestId: "test", workspaceId: "test", byokMeta: [], pricingCard: {}, meta: {} });

it("preserves document indices, selects top results and bills native token usage", async () => {
	const mock = installFetchMock([{ match: url => url.endsWith("/v2/code/rank"), response: jsonResponse({ results: [{ filename: "b.ts", score: 0.9 }, { filename: "document_0", score: 0.2 }], usage: { total_tokens: 17 } }) }]);
	try {
		const result = await executor(args({ model: "relace-rank", query: "lookup", documents: ["first", { filename: "b.ts", content: "second" }], topN: 1, returnDocuments: true, vendor: { provider_options: { relace: { token_limit: 1000 } } } }));
		expect(mock.calls[0].bodyJson).toEqual({ query: "lookup", codebase: [{ filename: "document_0", content: "first" }, { filename: "b.ts", content: "second" }], token_limit: 1000 });
		expect(result.kind === "completed" && result.ir).toMatchObject({ results: [{ index: 1, relevanceScore: 0.9, document: { filename: "b.ts", content: "second" } }] });
		expect(result.bill.usage?.input_text_tokens).toBe(17);
	} finally { mock.restore(); }
});

it("rejects unsupported chunking before contacting the provider", async () => {
	const mock = installFetchMock([]);
	try {
		const result = await executor(args({ model: "relace-rank", query: "lookup", documents: ["first"], maxChunksPerDoc: 2 }));
		expect(result.upstream.status).toBe(400);
		expect(mock.calls).toHaveLength(0);
	} finally { mock.restore(); }
});
