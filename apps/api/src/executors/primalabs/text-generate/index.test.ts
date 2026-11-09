import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { IRChatRequest } from "@core/ir";
import type { ExecutorExecuteArgs } from "@executors/types";
import { resolveProviderExecutor } from "@executors/index";
import { dropUnsupportedParams } from "@/pipeline/execute/unsupportedParams";
import { installFetchMock, jsonResponse } from "../../../../tests/helpers/mock-fetch";
import { setupRuntimeFromEnv, teardownTestRuntime } from "../../../../tests/helpers/runtime";

beforeAll(() => setupRuntimeFromEnv({ PRIMALABS_API_KEY: "test-primalabs-key" }));
afterAll(teardownTestRuntime);

// The Kimi K3.1 Pro route's declared parameters: PrimaLabs follows the Kimi Vendor Verifier,
// so only these sampling values are accepted (https://docs.primalabs.ai/inference/models).
const KIMI_ROUTE_PARAMS = [
	{ param_id: "temperature", supported_values: [0, 0.6, 1] },
	{ param_id: "top_p", supported_values: [0.95] },
	{ param_id: "frequency_penalty", supported_values: [0] },
	{ param_id: "presence_penalty", supported_values: [0] },
	"stop", "max_tokens", "tools", "tool_choice", "reasoning", "reasoning_effort",
];

function ir(extra: Partial<IRChatRequest>): IRChatRequest {
	return { model: "moonshotai/kimi-k3.1-pro", stream: false, messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }], ...extra } as IRChatRequest;
}

describe("PrimaLabs Kimi sampling limits", () => {
	it("drops and reports sampling values the route does not accept", () => {
		const { ir: out, dropped } = dropUnsupportedParams(ir({ temperature: 0.7, topP: 0.9, frequencyPenalty: 0.2, presencePenalty: 0.1 }), "primalabs", KIMI_ROUTE_PARAMS);
		expect(out.temperature).toBeUndefined();
		expect(out.topP).toBeUndefined();
		expect(out.frequencyPenalty).toBeUndefined();
		expect(out.presencePenalty).toBeUndefined();
		expect(dropped.map((entry) => [entry.param, entry.reason])).toEqual(expect.arrayContaining([
			["temperature", "value_not_supported"],
			["top_p", "value_not_supported"],
			["frequency_penalty", "value_not_supported"],
			["presence_penalty", "value_not_supported"],
		]));
	});

	it.each([0, 0.6, 1])("keeps temperature %s with the accepted top_p and penalties", (temperature) => {
		const { ir: out, dropped } = dropUnsupportedParams(ir({ temperature, topP: 0.95, frequencyPenalty: 0, presencePenalty: 0 }), "primalabs", KIMI_ROUTE_PARAMS);
		expect(dropped).toEqual([]);
		expect(out).toMatchObject({ temperature, topP: 0.95, frequencyPenalty: 0, presencePenalty: 0 });
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
				ir: ir({ temperature: 0.6 }),
				requestId: "req_primalabs",
				workspaceId: "workspace_test",
				providerId: "primalabs",
				providerModelSlug: "primalabs-ai/Kimi-K3.1-Pro",
				endpoint: "chat.completions",
				protocol: "openai.chat.completions",
				capability: "text.generate",
				capabilityParams: { params: KIMI_ROUTE_PARAMS },
				byokMeta: [],
				pricingCard: { rules: [] },
				meta: {},
			} as unknown as ExecutorExecuteArgs);
			expect(result.kind).toBe("completed");
			expect(mock.calls).toHaveLength(1);
			expect(mock.calls[0].headers).toMatchObject({ Authorization: "Bearer test-primalabs-key" });
			expect(mock.calls[0].bodyJson).toMatchObject({ model: "primalabs-ai/Kimi-K3.1-Pro", temperature: 0.6 });
		} finally {
			mock.restore();
		}
	});
});
