// Contract tests for provider prompt-cache controls: client payload -> decode -> IR ->
// normalisation -> executor -> captured upstream body and headers. Each case follows the
// provider's published request format, quoted next to the code it tests.

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { IRChatRequest } from "@core/ir";
import type { ExecutorExecuteArgs } from "@executors/types";
import { AnthropicMessagesSchema, ChatCompletionsSchema } from "@core/schemas";
import { decodeOpenAIChatRequest } from "@protocols/openai-chat/decode";
import { decodeAnthropicMessagesRequest } from "@protocols/anthropic-messages/decode";
import { irToOpenAIChat } from "@executors/_shared/text-generate/openai-compat/transform-chat";
import { sessionAffinityHeaders } from "@executors/_shared/text-generate/openai-compat";
import { executor as basetenExecutor } from "@executors/baseten/text-generate";
import { executor as moonshotExecutor } from "@executors/moonshotai/text-generate";
import { executor as xaiExecutor } from "@executors/x-ai/text-generate";
import { getUnknownTopLevelParams } from "@pipeline/before/paramCapabilities";
import { normalizeIRForProvider } from "@pipeline/execute/normalize";
import type { DroppedParam } from "@pipeline/execute/unsupportedParams";
import { applyUpstreamPromptCacheKey, resolveUpstreamPromptCacheKey } from "@pipeline/execute/prompt-cache-key";
import { installFetchMock, jsonResponse, type FetchCall } from "../../../tests/helpers/mock-fetch";
import { setupTestRuntime, teardownTestRuntime } from "../../../tests/helpers/runtime";

vi.mock("@supabase/supabase-js", () => ({
	createClient: () => ({}),
}));

beforeAll(() => setupTestRuntime());
afterAll(() => teardownTestRuntime());

function chatIR(body: Record<string, any>): IRChatRequest {
	return decodeOpenAIChatRequest(ChatCompletionsSchema.parse(body) as any);
}

function args(ir: IRChatRequest, overrides: Partial<ExecutorExecuteArgs>): ExecutorExecuteArgs {
	return {
		ir,
		requestId: "req_cache_controls",
		workspaceId: "ws_cache_controls",
		providerId: "openai",
		endpoint: "chat.completions",
		protocol: "openai.chat.completions",
		capability: "text.generate",
		providerModelSlug: null,
		capabilityParams: null,
		byokMeta: [],
		pricingCard: { rules: [] } as any,
		meta: { returnUsage: true } as any,
		...overrides,
	} as ExecutorExecuteArgs;
}

async function captureCall(
	match: (url: string) => boolean,
	run: () => Promise<unknown>,
): Promise<FetchCall> {
	const mock = installFetchMock([{
		match,
		response: () => jsonResponse({ error: { message: "captured" } }, { status: 400 }),
	}]);
	try {
		await run();
	} finally {
		mock.restore();
	}
	expect(mock.calls.length).toBeGreaterThan(0);
	return mock.calls[0]!;
}

function normalise(ir: IRChatRequest, providerId: string, model: string, pricingCard?: { rules: Array<{ meter: string }> }) {
	const dropped: DroppedParam[] = [];
	const next = normalizeIRForProvider(ir, providerId, "openai.chat.completions", {
		modelForReasoning: model,
		pricingCard: pricingCard ?? { rules: [] },
		onDroppedParams: (entries) => dropped.push(...entries),
	});
	return { ir: next, dropped };
}

const KIMI_K3_CARD = {
	rules: [
		{ meter: "input_text_tokens" },
		{ meter: "cached_read_text_tokens" },
		{ meter: "cached_write_text_tokens_5m" },
		{ meter: "cached_write_text_tokens_1h" },
		{ meter: "output_text_tokens" },
	],
};
const KIMI_K26_CARD = { rules: [{ meter: "input_text_tokens" }, { meter: "cached_read_text_tokens" }, { meter: "output_text_tokens" }] };

describe("/v1/messages prompt_cache_key", () => {
	const body = {
		model: "openai/gpt-5.6",
		max_tokens: 256,
		prompt_cache_key: "repo-main",
		messages: [{ role: "user", content: "Review src/a.ts" }],
	};

	it("is a known Messages parameter", () => {
		expect(getUnknownTopLevelParams("messages", body)).toEqual([]);
	});

	it("is decoded and reaches an OpenAI-compatible route namespaced per workspace", async () => {
		const ir = decodeAnthropicMessagesRequest(AnthropicMessagesSchema.parse(body) as any);
		expect(ir.promptCacheKey).toBe("repo-main");
		const upstream = await resolveUpstreamPromptCacheKey({ workspaceId: "ws_alpha", promptCacheKey: ir.promptCacheKey });
		const sent = irToOpenAIChat(applyUpstreamPromptCacheKey(ir, "together", upstream), "gpt-oss-120b", "together");
		expect(sent.prompt_cache_key).toBe(upstream!.key);
		expect(sent.prompt_cache_key).not.toBe("repo-main");
	});
});

describe("Moonshot prompt_cache_options", () => {
	const request = (options: Record<string, unknown>) => chatIR({
		model: "moonshotai/kimi-k3",
		messages: [{ role: "user", content: "Summarise the design doc." }],
		prompt_cache_options: options,
	});

	it("sends the documented 1-hour ttl to a route priced for 1-hour writes", async () => {
		const { ir, dropped } = normalise(request({ mode: "implicit", ttl: "1h" }), "moonshotai", "kimi-k3", KIMI_K3_CARD);
		expect(dropped).toEqual([]);
		const call = await captureCall(
			(url) => new URL(url).host === "api.moonshot.example",
			() => moonshotExecutor(args(ir, { providerId: "moonshotai", providerModelSlug: "kimi-k3" })),
		);
		expect(call.bodyJson?.prompt_cache_options).toEqual({ mode: "implicit", ttl: "1h" });
		expect(call.bodyJson?.prompt_cache_retention).toBeUndefined();
	});

	it("drops a 1-hour ttl where the route has no 1-hour write price, and reports it", () => {
		const { ir, dropped } = normalise(request({ ttl: "1h" }), "moonshotai", "kimi-k2.6", KIMI_K26_CARD);
		expect(ir.promptCacheOptions).toEqual({});
		expect(dropped).toEqual([
			{ param: "prompt_cache_options.ttl", reason: "value_not_supported", source: "provider_api", clientSent: true },
		]);
		expect(irToOpenAIChat(ir, "kimi-k2.6", "moonshotai").prompt_cache_options).toBeUndefined();
	});

	it("drops values Moonshot does not document: explicit mode and other lifetimes", () => {
		const { ir, dropped } = normalise(request({ mode: "explicit", ttl: "30m" }), "moonshotai", "kimi-k3", KIMI_K3_CARD);
		expect(dropped.map((entry) => entry.param)).toEqual(["prompt_cache_options.mode", "prompt_cache_options.ttl"]);
		expect(irToOpenAIChat(ir, "kimi-k3", "moonshotai").prompt_cache_options).toBeUndefined();
	});

	it("keeps a 5-minute ttl on any route", () => {
		const { ir, dropped } = normalise(request({ ttl: "5m" }), "moonshotai", "kimi-k2.6", KIMI_K26_CARD);
		expect(dropped).toEqual([]);
		expect(irToOpenAIChat(ir, "kimi-k2.6", "moonshotai").prompt_cache_options).toEqual({ ttl: "5m" });
	});
});

describe("Inference.net block cache_control", () => {
	const marked = (model: string, ttl?: string) => chatIR({
		model,
		messages: [
			{ role: "system", content: [{ type: "text", text: "Long policy", cache_control: { type: "ephemeral", ...(ttl ? { ttl } : {}) } }] },
			{ role: "user", content: "Question" },
		],
	});

	it("forwards cache_control on Claude and Gemini routes", () => {
		for (const [gatewayModel, slug] of [["anthropic/claude-opus-5", "claude-opus-5"], ["google/gemini-2.5-pro", "gemini-2.5-pro"]]) {
			const { ir } = normalise(marked(gatewayModel), "inference-net", slug);
			const body = irToOpenAIChat(ir, slug, "inference-net");
			expect(body.messages[0].content).toEqual([{ type: "text", text: "Long policy", cache_control: { type: "ephemeral" } }]);
		}
	});

	it("removes a ttl the pages do not document, and reports it", () => {
		const { ir, dropped } = normalise(marked("anthropic/claude-opus-5", "1h"), "inference-net", "claude-opus-5");
		expect(dropped).toEqual([
			{ param: "cache_control.ttl", reason: "value_not_supported", source: "provider_api", clientSent: true },
		]);
		const body = irToOpenAIChat(ir, "claude-opus-5", "inference-net");
		expect(body.messages[0].content[0].cache_control).toEqual({ type: "ephemeral" });
	});

	it("still strips cache_control on models whose pages do not document it", () => {
		const { ir, dropped } = normalise(marked("deepseek/deepseek-v4-pro", "1h"), "inference-net", "deepseek-v4-pro");
		expect(dropped).toEqual([]);
		expect(irToOpenAIChat(ir, "deepseek-v4-pro", "inference-net").messages[0]).toEqual({ role: "system", content: "Long policy" });
	});
});

describe("session affinity headers", () => {
	const meta = { cacheAffinityKey: "pck_abc" } as ExecutorExecuteArgs["meta"];

	it("sends each provider's documented header", () => {
		expect(sessionAffinityHeaders({ providerId: "baseten", meta })).toEqual({ "x-session-affinity": "pck_abc" });
		expect(sessionAffinityHeaders({ providerId: "morph", meta })).toEqual({ "x-session-id": "pck_abc" });
		expect(sessionAffinityHeaders({ providerId: "fireworks", meta })).toEqual({ "x-session-affinity": "pck_abc" });
		expect(sessionAffinityHeaders({ providerId: "together", meta })).toEqual({});
	});

	it("reaches Baseten on the wire", async () => {
		const ir = chatIR({ model: "deepseek/deepseek-v4-flash", messages: [{ role: "user", content: "Hi" }] });
		const call = await captureCall(
			(url) => new URL(url).host === "api.baseten.example",
			() => basetenExecutor(args(ir, {
				providerId: "baseten",
				providerModelSlug: "deepseek-ai/DeepSeek-V4-Flash-0731",
				meta: { returnUsage: true, cacheAffinityKey: "pck_abc" } as any,
			})),
		);
		expect(call.headers["x-session-affinity"]).toBe("pck_abc");
	});
});

describe("xAI session-derived cache key", () => {
	it("reaches the request body under the live provider id", async () => {
		const derived = await resolveUpstreamPromptCacheKey({ workspaceId: "ws_alpha", promptCacheKey: null, sessionId: "sess_42" });
		const ir: IRChatRequest = { model: "x-ai/grok-4.7", stream: false, messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }] };
		for (const providerId of ["spacex-ai", "x-ai"]) {
			expect(applyUpstreamPromptCacheKey(ir, providerId, derived).promptCacheKey).toBe(derived!.key);
		}
		const call = await captureCall(
			(url) => url.includes("/responses"),
			() => xaiExecutor(args(applyUpstreamPromptCacheKey(ir, "spacex-ai", derived), {
				providerId: "spacex-ai",
				providerModelSlug: "grok-4.7",
				endpoint: "responses",
				protocol: "openai.responses",
				meta: { returnUsage: true, cacheAffinityKey: derived!.key } as any,
			})),
		);
		expect(call.bodyJson?.prompt_cache_key).toBe(derived!.key);
		expect(call.headers["x-grok-conv-id"]).toBe(derived!.key);
	});
});
