import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { IRChatRequest } from "@core/ir";
import type { ExecutorExecuteArgs } from "@executors/types";
import { ChatCompletionsSchema, ResponsesSchema } from "@core/schemas";
import { decodeOpenAIChatRequest } from "@protocols/openai-chat/decode";
import { decodeOpenAIResponsesRequest } from "@protocols/openai-responses/decode";
import { irToOpenAIChat } from "@executors/_shared/text-generate/openai-compat/transform-chat";
import { irToOpenAIResponses } from "@executors/_shared/text-generate/openai-compat/transform";
import { sessionAffinityHeaders } from "@executors/_shared/text-generate/openai-compat";
import { openAICompatHeaders } from "@providers/openai-compatible/config";
import { executor as openaiExecutor } from "@executors/openai/text-generate";
import { executor as xaiExecutor } from "@executors/x-ai/text-generate";
import { executor as cerebrasExecutor } from "@executors/cerebras/text-generate";
import { installFetchMock, jsonResponse } from "../../../tests/helpers/mock-fetch";
import { setupTestRuntime, teardownTestRuntime } from "../../../tests/helpers/runtime";
import { applyUpstreamPromptCacheKey, resolveUpstreamPromptCacheKey } from "./prompt-cache-key";

vi.mock("@supabase/supabase-js", () => ({
	createClient: () => ({}),
}));

beforeAll(() => {
	setupTestRuntime();
});

afterAll(() => {
	teardownTestRuntime();
});

const RESPONSES_OK = {
	id: "resp_1",
	object: "response",
	created_at: 1760700000,
	model: "gpt-5.6",
	status: "completed",
	output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "ok" }] }],
	usage: { input_tokens: 2_048, output_tokens: 8, total_tokens: 2_056, input_tokens_details: { cached_tokens: 1_920 } },
};

function executorArgs(providerId: string, ir: IRChatRequest, cacheAffinityKey: string | null): ExecutorExecuteArgs {
	return {
		ir,
		requestId: `req_${providerId}_cache_key`,
		workspaceId: "ws_alpha",
		providerId,
		endpoint: "responses",
		protocol: "openai.responses",
		capability: "text.generate",
		providerModelSlug: null,
		capabilityParams: ["tools", "temperature", "max_tokens"] as any,
		byokMeta: [],
		pricingCard: { rules: [] } as any,
		meta: { returnUpstreamRequest: true, cacheAffinityKey },
	} as ExecutorExecuteArgs;
}

describe("workspace-namespaced prompt_cache_key", () => {
	it("hashes the client key with the workspace, so tenants with the same key never collide", async () => {
		const alpha = await resolveUpstreamPromptCacheKey({ workspaceId: "ws_alpha", promptCacheKey: "repo-main" });
		const alphaAgain = await resolveUpstreamPromptCacheKey({ workspaceId: "ws_alpha", promptCacheKey: " repo-main " });
		const beta = await resolveUpstreamPromptCacheKey({ workspaceId: "ws_beta", promptCacheKey: "repo-main" });
		expect(alpha?.origin).toBe("client");
		expect(alpha?.key).toMatch(/^pck_[0-9a-f]{40}$/);
		expect(alpha?.key).toBe(alphaAgain?.key);
		expect(alpha?.key).not.toBe(beta?.key);
		expect(alpha?.key).not.toContain("repo-main");
	});

	it("derives a stable key from session_id when the client sends none", async () => {
		const first = await resolveUpstreamPromptCacheKey({ workspaceId: "ws_alpha", promptCacheKey: null, sessionId: "sess_42" });
		const second = await resolveUpstreamPromptCacheKey({ workspaceId: "ws_alpha", promptCacheKey: undefined, sessionId: "sess_42" });
		const explicitSameText = await resolveUpstreamPromptCacheKey({ workspaceId: "ws_alpha", promptCacheKey: "sess_42" });
		expect(first).toEqual(second);
		expect(first?.origin).toBe("session");
		expect(first?.key).not.toBe(explicitSameText?.key);
		expect(await resolveUpstreamPromptCacheKey({ workspaceId: "ws_alpha", promptCacheKey: null })).toBeNull();
	});

	it("sends derived keys only to providers that document prompt_cache_key", async () => {
		const derived = await resolveUpstreamPromptCacheKey({ workspaceId: "ws_alpha", promptCacheKey: null, sessionId: "sess_42" });
		const ir: IRChatRequest = { model: "m", messages: [], stream: false };
		expect(applyUpstreamPromptCacheKey(ir, "openai", derived).promptCacheKey).toBe(derived!.key);
		expect(applyUpstreamPromptCacheKey(ir, "cerebras", derived).promptCacheKey).toBe(derived!.key);
		expect(applyUpstreamPromptCacheKey(ir, "together", derived)).not.toHaveProperty("promptCacheKey");
		const client = await resolveUpstreamPromptCacheKey({ workspaceId: "ws_alpha", promptCacheKey: "k" });
		expect(applyUpstreamPromptCacheKey({ ...ir, promptCacheKey: "k" }, "together", client).promptCacheKey).toBe(client!.key);
	});

	it("never sends prompt_cache_key: null upstream", () => {
		// The Responses schema fills a missing key with null.
		const responsesIr = decodeOpenAIResponsesRequest(ResponsesSchema.parse({ model: "openai/gpt-5.6", input: "hi" }));
		expect((responsesIr as any).promptCacheKey).toBeNull();
		const cleaned = applyUpstreamPromptCacheKey(responsesIr, "openai", null);
		expect(cleaned).not.toHaveProperty("promptCacheKey");
		expect(irToOpenAIResponses(responsesIr, "gpt-5.6", "openai")).not.toHaveProperty("prompt_cache_key");
		const chatIr = decodeOpenAIChatRequest(ChatCompletionsSchema.parse({
			model: "openai/gpt-5.6",
			messages: [{ role: "user", content: "hi" }],
			prompt_cache_key: null,
		}));
		expect(irToOpenAIChat(chatIr, "gpt-5.6", "openai")).not.toHaveProperty("prompt_cache_key");
	});

	it("sends the namespaced key to OpenAI and leaves safety_identifier as the workspace id", async () => {
		const upstream = await resolveUpstreamPromptCacheKey({ workspaceId: "ws_alpha", promptCacheKey: "repo-main" });
		const ir = applyUpstreamPromptCacheKey({
			model: "openai/gpt-5.6",
			stream: false,
			messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
			promptCacheKey: "repo-main",
		}, "openai", upstream);
		const mock = installFetchMock([{
			match: (url) => url === "https://api.openai.com/v1/responses",
			response: jsonResponse(RESPONSES_OK),
		}]);
		await openaiExecutor(executorArgs("openai", ir, upstream!.key));
		mock.restore();
		expect(mock.calls[0]?.bodyJson?.prompt_cache_key).toBe(upstream!.key);
		expect(mock.calls[0]?.bodyJson?.safety_identifier).toBe("ws_alpha");
	});

	it("sends the namespaced key to Cerebras, whose docs make it a routing hint", async () => {
		const upstream = await resolveUpstreamPromptCacheKey({ workspaceId: "ws_alpha", promptCacheKey: "repo-main" });
		const ir = applyUpstreamPromptCacheKey({
			model: "cerebras/qwen3.8-27b",
			stream: false,
			messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
			promptCacheKey: "repo-main",
		}, "cerebras", upstream);
		const mock = installFetchMock([{
			match: (url) => url === "https://api.cerebras.example/v1/chat/completions",
			// https://inference-docs.cerebras.ai/capabilities/prompt-caching (usage example)
			response: jsonResponse({
				id: "chatcmpl-cb",
				object: "chat.completion",
				created: 1760700000,
				model: "qwen3.8-27b",
				choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
				usage: { prompt_tokens: 3_000, completion_tokens: 4, total_tokens: 3_004, prompt_tokens_details: { cached_tokens: 2_816 } },
			}),
		}]);
		const args = executorArgs("cerebras", ir, upstream!.key);
		args.endpoint = "chat.completions";
		args.protocol = "openai.chat.completions";
		await cerebrasExecutor(args);
		mock.restore();
		expect(mock.calls[0]?.bodyJson?.prompt_cache_key).toBe(upstream!.key);
	});

	it("falls back to the namespaced key for the xAI x-grok-conv-id header", async () => {
		const upstream = await resolveUpstreamPromptCacheKey({ workspaceId: "ws_alpha", promptCacheKey: "repo-main" });
		const mock = installFetchMock([{
			match: (url) => url.includes("/responses"),
			response: () => jsonResponse({ ...RESPONSES_OK, model: "grok-4.7" }),
		}]);
		await xaiExecutor(executorArgs("x-ai", { model: "x-ai/grok-4.7", stream: false, messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }], promptCacheKey: upstream!.key }, upstream!.key));
		await xaiExecutor(executorArgs("x-ai", { model: "x-ai/grok-4.7", stream: false, messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }], xaiConversationId: "conv_client" }, upstream!.key));
		mock.restore();
		expect(mock.calls[0]?.headers["x-grok-conv-id"]).toBe(upstream!.key);
		expect(mock.calls[0]?.bodyJson?.prompt_cache_key).toBe(upstream!.key);
		expect(mock.calls[1]?.headers["x-grok-conv-id"]).toBe("conv_client");
	});

	it("maps provider_options.xai.conversation_id on the Responses decoder", () => {
		const ir = decodeOpenAIResponsesRequest(ResponsesSchema.parse({
			model: "x-ai/grok-4.7",
			input: "hi",
			provider_options: { xai: { conversation_id: "conv_abc123" } },
		}));
		expect(ir.xaiConversationId).toBe("conv_abc123");
	});

	it("reads top-level prompt_cache_retention before the provider_options alias", () => {
		const ir = decodeOpenAIResponsesRequest(ResponsesSchema.parse({
			model: "azure/gpt-5.4",
			input: "hi",
			prompt_cache_retention: "24h",
			provider_options: { openai: { prompt_cache_retention: "in_memory" } },
		}));
		expect(ir.promptCacheRetention).toBe("24h");
		const aliasOnly = decodeOpenAIChatRequest(ChatCompletionsSchema.parse({
			model: "azure/gpt-5.4",
			messages: [{ role: "user", content: "hi" }],
			provider_options: { openai: { prompt_cache_retention: "in_memory" } },
		}));
		expect(aliasOnly.promptCacheRetention).toBe("in_memory");
	});

	it("sends x-session-affinity to Fireworks and Cloudflare Workers AI, and to no undocumented provider", () => {
		const meta = { cacheAffinityKey: "pck_abc" } as ExecutorExecuteArgs["meta"];
		expect(sessionAffinityHeaders({ providerId: "cloudflare", meta })).toEqual({ "x-session-affinity": "pck_abc" });
		expect(sessionAffinityHeaders({ providerId: "fireworks", meta })).toEqual({ "x-session-affinity": "pck_abc" });
		expect(sessionAffinityHeaders({ providerId: "together", meta })).toEqual({});
		expect(sessionAffinityHeaders({ providerId: "cloudflare", meta: {} as ExecutorExecuteArgs["meta"] })).toEqual({});
		expect(openAICompatHeaders("fireworks", "fw-token", sessionAffinityHeaders({ providerId: "fireworks", meta }))).toMatchObject({
			Authorization: "Bearer fw-token",
			"x-session-affinity": "pck_abc",
		});
	});
});
