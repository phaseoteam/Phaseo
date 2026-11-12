import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { IRChatRequest } from "@core/ir";
import type { ExecutorExecuteArgs } from "@executors/types";
import { execute } from "../index";
import { installFetchMock } from "../../../../../tests/helpers/mock-fetch";
import { setupTestRuntime, teardownTestRuntime } from "../../../../../tests/helpers/runtime";

vi.mock("@supabase/supabase-js", () => ({
	createClient: () => ({}),
}));

beforeAll(() => setupTestRuntime());
afterAll(() => teardownTestRuntime());

function buildExecuteArgs(): ExecutorExecuteArgs {
	const ir: IRChatRequest = {
		model: "google/gemini-3.6-flash",
		stream: false,
		messages: [{ role: "user", content: [{ type: "text", text: "weather and news for Lyon" }] }],
	};
	return {
		ir,
		requestId: "req_google_vertex_parallel",
		workspaceId: "team_test",
		providerId: "google-vertex",
		endpoint: "chat.completions",
		protocol: "openai.chat.completions",
		capability: "text.generate",
		providerModelSlug: "gemini-3.6-flash",
		capabilityParams: null,
		byokMeta: [],
		pricingCard: null as any,
		meta: {},
	} as ExecutorExecuteArgs;
}

// Gemini streams each parallel functionCall in its own frame.
function geminiFrame(functionCall: Record<string, unknown>, last: boolean) {
	return {
		candidates: [{
			index: 0,
			content: { role: "model", parts: [{ functionCall, thoughtSignature: `sig_${String(functionCall.id)}` }] },
			...(last ? { finishReason: "STOP" } : {}),
		}],
		usageMetadata: last
			? { promptTokenCount: 12, candidatesTokenCount: 6, totalTokenCount: 18 }
			: { promptTokenCount: 12 },
	};
}

describe("google-vertex Gemini parallel tool calls", () => {
	it("keeps both calls, their upstream ids and their arguments", async () => {
		const body = [
			geminiFrame({ id: "call_up_1", name: "get_weather", args: { city: "Lyon" } }, false),
			geminiFrame({ id: "call_up_2", name: "search_news", args: { query: "lyon" } }, true),
		].map((frame) => `data: ${JSON.stringify(frame)}\r\n\r\n`).join("");
		const mock = installFetchMock([{
			match: (url) => url.includes(":streamGenerateContent"),
			response: new Response(body, { headers: { "Content-Type": "text/event-stream" } }),
		}]);
		try {
			const result = await execute(buildExecuteArgs());
			if (result.kind !== "completed") throw new Error("Expected a buffered Vertex response");
			const choice = result.ir?.choices[0];
			expect(choice?.finishReason).toBe("tool_calls");
			expect(choice?.message.toolCalls?.map((call) => [call.id, call.name, call.arguments])).toEqual([
				["call_up_1", "get_weather", "{\"city\":\"Lyon\"}"],
				["call_up_2", "search_news", "{\"query\":\"lyon\"}"],
			]);
		} finally {
			mock.restore();
		}
	});
});
