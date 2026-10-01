import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ExecutorExecuteArgs } from "@executors/types";
import { installFetchMock, jsonResponse } from "../../../../tests/helpers/mock-fetch";
import { setupRuntimeFromEnv, teardownTestRuntime } from "../../../../tests/helpers/runtime";
import { resolveProviderExecutor } from "@executors/index";

beforeAll(() => setupRuntimeFromEnv({ WAFER_API_KEY: "test-wafer-key" }));
afterAll(teardownTestRuntime);

describe("Wafer ZDR routing", () => {
	it.each([
		["wafer-zdr", "required"],
		["wafer", undefined],
	])("sends the correct upstream headers for %s", async (providerId, expectedZdrHeader) => {
		const executor = resolveProviderExecutor(providerId, "text.generate");
		expect(executor).toBeTruthy();
		const mock = installFetchMock([{
			match: (url) => url === "https://pass.wafer.ai/v1/chat/completions",
			response: jsonResponse({
				id: "chatcmpl_wafer",
				object: "chat.completion",
				created: 1735689600,
				model: "wafer:GLM-5.2",
				choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
				usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
			}),
		}]);
		try {
			const args = {
				ir: { model: "wafer:GLM-5.2", stream: false, messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }] },
				requestId: "req_wafer_zdr",
				workspaceId: "workspace_test",
				providerId,
				endpoint: "chat.completions",
				protocol: "openai.chat.completions",
				capability: "text.generate",
				byokMeta: [],
				pricingCard: { rules: [] },
				meta: {},
			} as ExecutorExecuteArgs;
			const result = await executor!(args);
			expect(result.kind).toBe("completed");
			expect(mock.calls).toHaveLength(1);
			expect(mock.calls[0].headers).toMatchObject({ Authorization: "Bearer test-wafer-key" });
			expect(mock.calls[0].headers["Wafer-ZDR"]).toBe(expectedZdrHeader);
		} finally {
			mock.restore();
		}
	});
});
