import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { IRChatRequest } from "@core/ir";
import type { ExecutorExecuteArgs } from "@executors/types";
import { resolveProviderExecutor } from "@executors/index";
import { installFetchMock, jsonResponse } from "../../../../tests/helpers/mock-fetch";
import { setupRuntimeFromEnv, teardownTestRuntime } from "../../../../tests/helpers/runtime";
import { preprocess } from "./index";

beforeAll(() => setupRuntimeFromEnv({ PRIMALABS_API_KEY: "test-primalabs-key" }));
afterAll(teardownTestRuntime);

const PARAMS = { params: ["temperature", "top_p", "frequency_penalty", "presence_penalty", "max_tokens"] };

function ir(extra: Partial<IRChatRequest>): IRChatRequest {
	return { model: "moonshotai/kimi-k3.1-pro", stream: false, messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }], ...extra } as IRChatRequest;
}

function args(providerModelSlug: string): ExecutorExecuteArgs {
	return { providerModelSlug, capabilityParams: PARAMS } as unknown as ExecutorExecuteArgs;
}

describe("PrimaLabs Kimi sampling", () => {
	it("drops sampling values the Kimi endpoint rejects", () => {
		const out = preprocess(ir({ temperature: 0.7, topP: 0.9, frequencyPenalty: 0.2, presencePenalty: 0.1 }), args("primalabs-ai/Kimi-K3.1-Pro"));
		expect(out.temperature).toBeUndefined();
		expect(out.topP).toBeUndefined();
		expect(out.frequencyPenalty).toBeUndefined();
		expect(out.presencePenalty).toBeUndefined();
	});

	it.each([0, 0.6, 1])("keeps temperature %s and the allowed top_p and penalties", (temperature) => {
		const out = preprocess(ir({ temperature, topP: 0.95, frequencyPenalty: 0, presencePenalty: 0 }), args("primalabs-ai/Kimi-K3.1-Pro"));
		expect(out).toMatchObject({ temperature, topP: 0.95, frequencyPenalty: 0, presencePenalty: 0 });
	});

	it("leaves other models' sampling values alone", () => {
		const out = preprocess(ir({ temperature: 0.7, topP: 0.9 }), args("primalabs-ai/DeepSeek-V4.1-Flash-1017"));
		expect(out).toMatchObject({ temperature: 0.7, topP: 0.9 });
	});
});

describe("PrimaLabs text generate", () => {
	it("calls the OpenAI-compatible chat endpoint with the PrimaLabs key", async () => {
		const executor = resolveProviderExecutor("primalabs", "text.generate");
		expect(executor).toBeTruthy();
		const mock = installFetchMock([{
			match: (url) => url === "https://api.primalabs.ai/v1/chat/completions",
			response: jsonResponse({
				id: "chatcmpl_primalabs",
				object: "chat.completion",
				created: 1735689600,
				model: "primalabs-ai/Kimi-K3.1-Pro",
				choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
				usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
			}),
		}]);
		try {
			const result = await executor!({
				ir: ir({ temperature: 0.7 }),
				requestId: "req_primalabs",
				workspaceId: "workspace_test",
				providerId: "primalabs",
				providerModelSlug: "primalabs-ai/Kimi-K3.1-Pro",
				endpoint: "chat.completions",
				protocol: "openai.chat.completions",
				capability: "text.generate",
				capabilityParams: PARAMS,
				byokMeta: [],
				pricingCard: { rules: [] },
				meta: {},
			} as unknown as ExecutorExecuteArgs);
			expect(result.kind).toBe("completed");
			expect(mock.calls).toHaveLength(1);
			expect(mock.calls[0].headers).toMatchObject({ Authorization: "Bearer test-primalabs-key" });
			const body = mock.calls[0].bodyJson;
			expect(body.model).toBe("primalabs-ai/Kimi-K3.1-Pro");
			expect(body.temperature).toBeUndefined();
		} finally {
			mock.restore();
		}
	});
});
