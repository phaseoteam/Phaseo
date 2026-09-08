import { afterEach, beforeEach, expect, it } from "vitest";
import { executor } from "./text-generate";
import { executor as embeddings } from "../openai/embeddings";
import { installFetchMock, jsonResponse } from "../../../tests/helpers/mock-fetch";
import { setupRuntimeFromEnv, teardownTestRuntime } from "../../../tests/helpers/runtime";

beforeEach(() => setupRuntimeFromEnv({ PARASAIL_API_KEY: "test-key" } as any));
afterEach(teardownTestRuntime);
const common = { providerId: "parasail", requestId: "test", workspaceId: "test", byokMeta: [], pricingCard: {}, meta: {} };
it("uses the native endpoint ID and preserves cache usage", async () => {
	const mock = installFetchMock([{ match: url => url === "https://api.parasail.io/v1/chat/completions", response: jsonResponse({ id: "native", choices: [{ index: 0, message: { role: "assistant", content: "Hello" }, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12, prompt_tokens_details: { cached_tokens: 4 } } }) }]);
	try {
		const result = await executor({ ...common, ir: { model: "z-ai/glm-5.3", messages: [{ role: "user", content: [{ type: "text", text: "Hi" }] }], stream: false }, providerModelSlug: "parasail-glm-53", endpoint: "text.generate" });
		expect(mock.calls[0].bodyJson.model).toBe("parasail-glm-53");
		expect(result.bill.usage).toMatchObject({ output_text_tokens: 2, cached_read_text_tokens: 4 });
	} finally { mock.restore(); }
});
it("routes BGE-M3 embeddings with the native model ID", async () => {
	const mock = installFetchMock([{ match: url => url === "https://api.parasail.io/v1/embeddings", response: jsonResponse({ data: [{ index: 0, embedding: [0.1] }], usage: { prompt_tokens: 3, total_tokens: 3 } }) }]);
	try {
		const result = await embeddings({ ...common, ir: { model: "baai/bge-m3", input: ["text"] }, providerModelSlug: "parasail-bge-m3", endpoint: "embeddings" });
		expect(mock.calls[0].bodyJson.model).toBe("parasail-bge-m3");
		expect(result.bill.usage?.input_text_tokens).toBe(3);
	} finally { mock.restore(); }
});
