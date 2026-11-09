import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { IRChatRequest } from "@core/ir";
import type { ExecutorExecuteArgs } from "@executors/types";
import { resolveProviderExecutor } from "@executors/index";
import { applyReasoningParams } from "@executors/_shared/text-generate/openai-compat/reasoning";
import { installFetchMock, jsonResponse } from "../../../../tests/helpers/mock-fetch";
import { setupRuntimeFromEnv, teardownTestRuntime } from "../../../../tests/helpers/runtime";

beforeAll(() => setupRuntimeFromEnv({ LG_EXAONE_PLATFORM: "test-exaone-key" }));
afterAll(teardownTestRuntime);

function ir(extra: Partial<IRChatRequest>): IRChatRequest {
	return { model: "lg/k-exaone-2.5", stream: false, messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }], ...extra } as IRChatRequest;
}

describe("LG EXAONE reasoning effort", () => {
	it.each([
		[{ effort: "minimal" }, "low"],
		[{ effort: "low" }, "low"],
		[{ effort: "medium" }, "high"],
		[{ effort: "high" }, "high"],
		[{ effort: "xhigh" }, "max"],
		[{ effort: "max" }, "max"],
	])("maps %j to %s", (reasoning, expected) => {
		const request: Record<string, unknown> = {};
		applyReasoningParams({ ir: ir({ reasoning } as Partial<IRChatRequest>), request, providerId: "lg", providerModelSlug: "k-exaone_v2.5" });
		expect(request.reasoning_effort).toBe(expected);
		expect(request.enable_thinking).toBeUndefined();
	});

	it.each([{ effort: "none" }, { enabled: false }])("never sends an effort for disable request %j (rejected before execution)", (reasoning) => {
		const request: Record<string, unknown> = {};
		applyReasoningParams({ ir: ir({ reasoning } as Partial<IRChatRequest>), request, providerId: "lg" });
		expect(request).toEqual({});
	});

	it("leaves the upstream default when no effort is requested", () => {
		const request: Record<string, unknown> = {};
		applyReasoningParams({ ir: ir({ reasoning: { enabled: true } } as Partial<IRChatRequest>), request, providerId: "lg" });
		expect(request).toEqual({});
	});
});

describe("LG EXAONE text generate", () => {
	it("calls the OpenAI-compatible chat endpoint with the EXAONE key and reads reasoning usage", async () => {
		const executor = resolveProviderExecutor("lg", "text.generate");
		expect(executor).toBeTruthy();
		// Response shape captured from a live call on 2026-11-09 (top-level usage.reasoning_tokens).
		const mock = installFetchMock([{
			match: (url) => url === "https://api.exaone.ai/v1/chat/completions",
			response: jsonResponse({
				id: "f7223d7070ed4f05a0da7479bf23bab4",
				object: "chat.completion",
				created: 1794245638,
				model: "k-exaone_v2.5",
				choices: [{ index: 0, finish_reason: "stop", matched_stop: 53, message: { role: "assistant", content: "\n\npong", reasoning_content: "Reply pong.\n", tool_calls: null } }],
				metadata: { weight_version: "default" },
				moderation: null,
				usage: { prompt_tokens: 24, completion_tokens: 36, total_tokens: 60, completion_tokens_details: null, prompt_tokens_details: null, reasoning_tokens: 32 },
			}),
		}]);
		try {
			const result = await executor!({
				ir: ir({ reasoning: { effort: "medium" } } as Partial<IRChatRequest>),
				requestId: "req_exaone",
				workspaceId: "workspace_test",
				providerId: "lg",
				providerModelSlug: "k-exaone_v2.5",
				endpoint: "chat.completions",
				protocol: "openai.chat.completions",
				capability: "text.generate",
				capabilityParams: { params: ["max_tokens", "temperature", "top_p", "reasoning", "reasoning_effort", "tools", "tool_choice", "response_format"] },
				byokMeta: [],
				pricingCard: { rules: [] },
				meta: {},
			} as unknown as ExecutorExecuteArgs);
			expect(result.kind).toBe("completed");
			expect(mock.calls).toHaveLength(1);
			expect(mock.calls[0].headers).toMatchObject({ Authorization: "Bearer test-exaone-key" });
			expect(mock.calls[0].bodyJson).toMatchObject({ model: "k-exaone_v2.5", reasoning_effort: "high" });
		} finally {
			mock.restore();
		}
	});
});
