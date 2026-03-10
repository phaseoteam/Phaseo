import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { IRChatRequest } from "@core/ir";
import type { ExecutorExecuteArgs } from "@executors/types";
import { executor } from "../index";
import { installFetchMock } from "../../../../../tests/helpers/mock-fetch";
import { setupTestRuntime, teardownTestRuntime } from "../../../../../tests/helpers/runtime";

vi.mock("@supabase/supabase-js", () => ({
	createClient: () => ({}),
}));

function buildArgs(overrides?: Partial<IRChatRequest>): ExecutorExecuteArgs {
	const ir: IRChatRequest = {
		model: "google/gemma-3-27b:free",
		stream: false,
		messages: [{ role: "user", content: [{ type: "text", text: "Write a short paragraph." }] }],
		...overrides,
	};
	return {
		ir,
		requestId: "req_google_usage_fallback",
		teamId: "team_test",
		providerId: "google-ai-studio",
		endpoint: "responses",
		protocol: "openai.responses",
		capability: "text.generate",
		providerModelSlug: "gemma-3-27b-it",
		capabilityParams: null,
		byokMeta: [],
		pricingCard: null as any,
		meta: {},
	} as ExecutorExecuteArgs;
}

beforeAll(() => {
	setupTestRuntime();
});

afterAll(() => {
	teardownTestRuntime();
});

describe("google-ai-studio execute usage fallback", () => {
	it("estimates completion tokens when upstream usage reports prompt-only counts", async () => {
		const sseBody = [
			`data: ${JSON.stringify({
				candidates: [{
					index: 0,
					content: { parts: [{ text: "This is a generated answer from Gemini." }] },
					finishReason: "STOP",
				}],
				usageMetadata: {
					promptTokenCount: 552,
					candidatesTokenCount: 0,
					totalTokenCount: 552,
				},
			})}`,
			"",
			"data: [DONE]",
			"",
		].join("\n");

		const mock = installFetchMock([{
			match: (url) => url.includes(":streamGenerateContent?alt=sse"),
			response: new Response(sseBody, {
				status: 200,
				headers: { "Content-Type": "text/event-stream" },
			}),
		}]);

		const result = await executor(buildArgs());
		mock.restore();

		expect(result.kind).toBe("completed");
		if (result.kind !== "completed") return;
		expect(result.ir?.choices?.[0]?.message?.content?.[0]).toEqual({
			type: "text",
			text: "This is a generated answer from Gemini.",
		});
		expect(result.ir?.usage?.inputTokens).toBe(552);
		expect(result.ir?.usage?.outputTokens ?? 0).toBeGreaterThan(0);
		expect(result.ir?.usage?.totalTokens ?? 0).toBeGreaterThan(552);

		const usage = (result.rawResponse as any)?.usage;
		expect(usage?.prompt_tokens).toBe(552);
		expect(usage?.completion_tokens ?? 0).toBeGreaterThan(0);
		expect(usage?.total_tokens ?? 0).toBeGreaterThan(552);
	});
});

