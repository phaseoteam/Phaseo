import { afterEach, beforeEach, expect, it } from "vitest";
import { executor } from "./index";
import { installFetchMock, jsonResponse } from "../../../../tests/helpers/mock-fetch";
import { setupRuntimeFromEnv, teardownTestRuntime } from "../../../../tests/helpers/runtime";

beforeEach(() => setupRuntimeFromEnv({ MODELSCOPE_API_KEY: "test-key" } as any));
afterEach(teardownTestRuntime);

it("uses native model slugs and maps chat completion usage through the text IR", async () => {
	const mock = installFetchMock([{ match: url => url === "https://api-inference.modelscope.cn/v1/chat/completions", response: jsonResponse({ id: "native", model: "Qwen/Qwen3-8B", choices: [{ index: 0, message: { role: "assistant", content: "Hello" }, finish_reason: "stop" }], usage: { prompt_tokens: 4, completion_tokens: 2, total_tokens: 6 } }) }]);
	try {
		const result = await executor({ ir: { model: "qwen/qwen3-8b", messages: [{ role: "user", content: [{ type: "text", text: "Hi" }] }], stream: false, temperature: 0.3 }, providerModelSlug: "Qwen/Qwen3-8B", providerId: "modelscope", endpoint: "text.generate", requestId: "test", workspaceId: "test", byokMeta: [], pricingCard: {}, meta: {} });
		expect(mock.calls[0].bodyJson).toMatchObject({ model: "Qwen/Qwen3-8B", temperature: 0.3, messages: [{ role: "user", content: "Hi" }] });
		expect(new Headers(mock.calls[0].headers).get("Authorization")).toBe("Bearer test-key");
		expect(result.bill.usage).toMatchObject({ input_text_tokens: 4, output_text_tokens: 2 });
	} finally { mock.restore(); }
});
