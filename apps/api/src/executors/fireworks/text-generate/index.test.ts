import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { IRChatRequest } from "@core/ir";
import type { ExecutorExecuteArgs } from "@executors/types";
import { executor, fireworksNeedsResponses } from "./index";
import { installFetchMock, jsonResponse } from "../../../../tests/helpers/mock-fetch";
import { setupTestRuntime, teardownTestRuntime } from "../../../../tests/helpers/runtime";

vi.mock("@supabase/supabase-js", () => ({
	createClient: () => ({}),
}));

beforeAll(() => {
	setupTestRuntime();
});

afterAll(() => {
	teardownTestRuntime();
});

const NAMESPACED_KEY = "pck_example_workspace_scoped_cache_key";

function buildArgs(overrides?: Partial<IRChatRequest>, cacheAffinityKey: string | null = NAMESPACED_KEY): ExecutorExecuteArgs {
	return {
		ir: {
			model: "accounts/fireworks/models/kimi-k2p6",
			stream: false,
			messages: [
				{ role: "system", content: [{ type: "text", text: "You are a coding agent." }] },
				{ role: "user", content: [{ type: "text", text: "Fix the failing test" }] },
			],
			promptCacheKey: cacheAffinityKey ?? undefined,
			...overrides,
		},
		requestId: "req_fireworks_affinity",
		workspaceId: "team_test",
		providerId: "fireworks",
		endpoint: "responses",
		protocol: "openai.responses",
		capability: "text.generate",
		providerModelSlug: "accounts/fireworks/models/kimi-k2p6",
		// Production capability params are the catalogue's params list.
		capabilityParams: ["tools", "tool_choice", "temperature", "max_tokens"] as any,
		byokMeta: [],
		pricingCard: { rules: [] } as any,
		meta: { returnUpstreamRequest: true, cacheAffinityKey },
	} as ExecutorExecuteArgs;
}

// Chat completion with the cached-token field Fireworks documents:
// https://docs.fireworks.ai/api-reference/post-chatcompletions (UsageInfo.prompt_tokens_details.cached_tokens)
const FIREWORKS_CHAT_RESPONSE = {
	id: "chatcmpl-fw-1",
	object: "chat.completion",
	created: 1760700000,
	model: "accounts/fireworks/models/kimi-k2p6",
	choices: [{ index: 0, message: { role: "assistant", content: "Done." }, finish_reason: "stop" }],
	usage: {
		prompt_tokens: 18_240,
		completion_tokens: 96,
		total_tokens: 18_336,
		prompt_tokens_details: { cached_tokens: 17_920 },
	},
};

describe("Fireworks cache affinity", () => {
	it("uses Chat Completions with prompt_cache_key, user and x-session-affinity, and reads cached usage", async () => {
		const mock = installFetchMock([{
			match: (url) => url === "https://api.fireworks.example/inference/v1/chat/completions",
			response: jsonResponse(FIREWORKS_CHAT_RESPONSE),
		}]);
		const result = await executor(buildArgs());
		mock.restore();

		expect(result.kind).toBe("completed");
		expect(mock.calls).toHaveLength(1);
		expect(mock.calls[0]?.headers["x-session-affinity"]).toBe(NAMESPACED_KEY);
		expect(mock.calls[0]?.bodyJson).toMatchObject({
			prompt_cache_key: NAMESPACED_KEY,
			user: NAMESPACED_KEY,
		});
		expect((result as any).ir?.usage).toMatchObject({ inputTokens: 18_240, cachedInputTokens: 17_920 });
	});

	it("keeps a client-supplied user", async () => {
		const mock = installFetchMock([{
			match: (url) => url.endsWith("/chat/completions"),
			response: jsonResponse(FIREWORKS_CHAT_RESPONSE),
		}]);
		await executor(buildArgs({ userId: "end-user-17" }));
		mock.restore();
		expect(mock.calls[0]?.bodyJson?.user).toBe("end-user-17");
		expect(mock.calls[0]?.headers["x-session-affinity"]).toBe(NAMESPACED_KEY);
	});

	it("sends no affinity hints when the request has no cache key or session", async () => {
		const mock = installFetchMock([{
			match: (url) => url.endsWith("/chat/completions"),
			response: jsonResponse(FIREWORKS_CHAT_RESPONSE),
		}]);
		await executor(buildArgs(undefined, null));
		mock.restore();
		expect(mock.calls[0]?.headers["x-session-affinity"]).toBeUndefined();
		expect(mock.calls[0]?.bodyJson).not.toHaveProperty("prompt_cache_key");
		expect(mock.calls[0]?.bodyJson).not.toHaveProperty("user");
	});

	it("uses Responses only for stored state, with store:false unless the client asked", async () => {
		const mock = installFetchMock([{
			match: (url) => url === "https://api.fireworks.example/inference/v1/responses",
			response: jsonResponse({
				id: "resp_fw_2",
				object: "response",
				created_at: 1760700000,
				model: "accounts/fireworks/models/kimi-k2p6",
				status: "completed",
				output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "ok" }] }],
				usage: { prompt_tokens: 40, completion_tokens: 2, total_tokens: 42 },
			}),
		}]);
		await executor(buildArgs({ previousResponseId: "resp_fw_1" }));
		mock.restore();
		expect(mock.calls[0]?.url).toBe("https://api.fireworks.example/inference/v1/responses");
		expect(mock.calls[0]?.bodyJson).toMatchObject({ previous_response_id: "resp_fw_1", store: false, user: NAMESPACED_KEY });
		// Not in the Fireworks Responses schema; affinity goes via user and the header.
		expect(mock.calls[0]?.bodyJson).not.toHaveProperty("prompt_cache_key");
		expect(mock.calls[0]?.headers["x-session-affinity"]).toBe(NAMESPACED_KEY);
	});

	it("decides the route from Responses-only features", () => {
		const base = buildArgs().ir as IRChatRequest;
		expect(fireworksNeedsResponses(base)).toBe(false);
		expect(fireworksNeedsResponses({ ...base, tools: [{ name: "lookup", type: "function", parameters: {} }] })).toBe(false);
		expect(fireworksNeedsResponses({ ...base, store: true })).toBe(true);
		expect(fireworksNeedsResponses({ ...base, conversation: "conv_1" })).toBe(true);
		expect(fireworksNeedsResponses({ ...base, tools: [{ name: "docs", type: "mcp", parameters: {} }] })).toBe(true);
	});
});
