import { afterEach, describe, expect, it, vi } from "vitest";
import type { IRChatRequest } from "@core/ir";
import {
	clearRuntime,
} from "@/runtime/env";
import { decodeOpenAIChatRequest } from "../../../../protocols/openai-chat/decode";
import { decodeAnthropicMessagesRequest } from "../../../../protocols/anthropic-messages/decode";
import {
	anthropicMessagesToIR,
	irToAnthropicMessages,
	resolveAnthropicInferenceGeo,
} from "../index";

function createBaseRequest(): IRChatRequest {
	return {
		model: "claude-3-7-sonnet",
		stream: false,
		messages: [
			{
				role: "user",
				content: [{ type: "text", text: "Hello" }],
			},
		],
	};
}

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	clearRuntime();
});

describe("irToAnthropicMessages service controls", () => {
	it("passes Anthropic native web fetch tools through unchanged", () => {
		const request = createBaseRequest();
		request.tools = [
			{
				name: "web_fetch",
				type: "web_fetch_20260209",
				parameters: {},
				raw: {
					type: "web_fetch_20260209",
					name: "web_fetch",
					max_content_tokens: 9000,
					allowed_domains: ["docs.phaseo.app"],
				},
			},
		];
		request.toolChoice = { name: "web_fetch" };

		const payload = irToAnthropicMessages(request);
		expect(payload.tools).toEqual([
			{
				type: "web_fetch_20260209",
				name: "web_fetch",
				max_content_tokens: 9000,
				allowed_domains: ["docs.phaseo.app"],
			},
		]);
		expect(payload.tool_choice).toEqual({ type: "tool", name: "web_fetch" });
	});

	it("passes Anthropic native advisor tools through unchanged", () => {
		const request = createBaseRequest();
		request.tools = [
			{
				name: "advisor",
				type: "advisor_20260301",
				parameters: {},
				raw: {
					type: "advisor_20260301",
					name: "advisor",
					model: "claude-opus-4-8",
					max_tokens: 1400,
					caching: { type: "ephemeral", ttl: "5m" },
				},
			},
		];
		request.toolChoice = { name: "advisor" };

		const payload = irToAnthropicMessages(request);
		expect(payload.tools).toEqual([
			{
				type: "advisor_20260301",
				name: "advisor",
				model: "claude-opus-4-8",
				max_tokens: 1400,
				caching: { type: "ephemeral", ttl: "5m" },
			},
		]);
		expect(payload.tool_choice).toEqual({ type: "tool", name: "advisor" });
	});

	it("preserves Anthropic advisor provider blocks in request history", () => {
		const request = createBaseRequest();
		request.messages = [
			{
				role: "assistant",
				content: [
					{
						type: "provider_block",
						block: {
							type: "server_tool_use",
							id: "srvu_123",
							name: "advisor",
							input: {},
						},
					},
					{
						type: "provider_block",
						block: {
							type: "advisor_tool_result",
							tool_use_id: "srvu_123",
							content: [{ type: "text", text: "Use smaller steps." }],
						},
					},
				],
			},
			{
				role: "user",
				content: [{ type: "text", text: "Continue" }],
			},
		] as any;

		const payload = irToAnthropicMessages(request);
		expect(payload.messages[0].content).toEqual([
			{
				type: "server_tool_use",
				id: "srvu_123",
				name: "advisor",
				input: {},
			},
			{
				type: "advisor_tool_result",
				tool_use_id: "srvu_123",
				content: [{ type: "text", text: "Use smaller steps." }],
			},
		]);
	});

	it("preserves provider-native blocks in response history", () => {
		const ir = anthropicMessagesToIR(
			{
				id: "msg_provider_blocks",
				content: [
					{ type: "text", text: "I checked this." },
					{
						type: "server_tool_use",
						id: "srvu_123",
						name: "web_search",
						input: { query: "Phaseo" },
					},
					{
						type: "web_search_tool_result",
						tool_use_id: "srvu_123",
						content: [{ type: "web_search_result", title: "Phaseo", url: "https://phaseo.app" }],
					},
				],
				stop_reason: "end_turn",
				usage: { input_tokens: 10, output_tokens: 5 },
			},
			"req_provider_blocks",
			"anthropic/claude-sonnet-4",
			"anthropic",
		);

		expect(ir.choices[0]?.message.content).toEqual([
			{ type: "text", text: "I checked this." },
			{
				type: "provider_block",
				block: {
					type: "server_tool_use",
					id: "srvu_123",
					name: "web_search",
					input: { query: "Phaseo" },
				},
			},
			{
				type: "provider_block",
				block: {
					type: "web_search_tool_result",
					tool_use_id: "srvu_123",
					content: [{ type: "web_search_result", title: "Phaseo", url: "https://phaseo.app" }],
				},
			},
		]);
	});

	it("maps priority tier to auto service tier without fast mode", () => {
		const request = createBaseRequest();
		request.serviceTier = "priority";

		const payload = irToAnthropicMessages(request);
		expect(payload.speed).toBeUndefined();
		expect(payload.service_tier).toBe("auto");
	});

	it("maps priority tier to fast mode for Opus 4.6", () => {
		const request = createBaseRequest();
		request.model = "anthropic/claude-opus-4.6";
		request.serviceTier = "priority";

		const payload = irToAnthropicMessages(request);
		expect(payload.speed).toBe("fast");
		expect(payload.service_tier).toBeUndefined();
	});

	it("maps priority tier to fast mode for Opus 4.7", () => {
		const request = createBaseRequest();
		request.model = "anthropic/claude-opus-4.7";
		request.serviceTier = "priority";

		const payload = irToAnthropicMessages(request);
		expect(payload.speed).toBe("fast");
		expect(payload.service_tier).toBeUndefined();
	});

	it("maps standard tier to standard_only service tier", () => {
		const request = createBaseRequest();
		request.serviceTier = "standard";

		const payload = irToAnthropicMessages(request);
		expect(payload.speed).toBeUndefined();
		expect(payload.service_tier).toBe("standard_only");
	});

	it("maps OpenAI surface service_tier=priority to Anthropic service_tier=auto", () => {
		const request = decodeOpenAIChatRequest({
			model: "anthropic/claude-3-7-sonnet",
			messages: [{ role: "user", content: "Hello" }],
			service_tier: "priority",
		} as any);

		const payload = irToAnthropicMessages(request);
		expect(payload.speed).toBeUndefined();
		expect(payload.service_tier).toBe("auto");
	});

	it("maps OpenAI surface service_tier=priority to Anthropic fast mode for Opus 4.7", () => {
		const request = decodeOpenAIChatRequest({
			model: "anthropic/claude-opus-4.7",
			messages: [{ role: "user", content: "Hello" }],
			service_tier: "priority",
		} as any);

		const payload = irToAnthropicMessages(request);
		expect(payload.speed).toBe("fast");
		expect(payload.service_tier).toBeUndefined();
	});

	it("does not expose Anthropic surface speed as a public text control", () => {
		const request = decodeAnthropicMessagesRequest({
			model: "anthropic/claude-3-7-sonnet",
			max_tokens: 256,
			speed: "fast",
			messages: [{ role: "user", content: "Hello" }],
		});

		const payload = irToAnthropicMessages(request);
		expect(payload.speed).toBeUndefined();
		expect(payload.service_tier).toBeUndefined();
	});

	it("maps OpenAI xhigh reasoning effort to Anthropic output_config.effort=xhigh for Opus 4.7", () => {
		const request = decodeOpenAIChatRequest({
			model: "anthropic/claude-opus-4.7",
			messages: [{ role: "user", content: "Hello" }],
			reasoning: { effort: "xhigh" },
		} as any);

		const payload = irToAnthropicMessages(request);
		expect(payload.output_config?.effort).toBe("xhigh");
	});

	it("keeps legacy Anthropic effort mapping for pre-4.7 models", () => {
		const request = decodeOpenAIChatRequest({
			model: "anthropic/claude-3-7-sonnet",
			messages: [{ role: "user", content: "Hello" }],
			reasoning: { effort: "xhigh" },
		} as any);

		const payload = irToAnthropicMessages(request);
		expect(payload.output_config?.effort).toBe("max");
	});

	it("maps OpenAI high reasoning effort straight through to Anthropic", () => {
		const request = decodeOpenAIChatRequest({
			model: "anthropic/claude-3-7-sonnet",
			messages: [{ role: "user", content: "Hello" }],
			reasoning: { effort: "high" },
		} as any);

		const payload = irToAnthropicMessages(request);
		expect(payload.output_config?.effort).toBe("high");
	});

	it("maps none reasoning effort to thinking disabled", () => {
		const request = decodeOpenAIChatRequest({
			model: "anthropic/claude-3-7-sonnet",
			messages: [{ role: "user", content: "Hello" }],
			reasoning: { effort: "none" },
		} as any);

		const payload = irToAnthropicMessages(request);
		expect(payload.thinking).toEqual({ type: "disabled" });
		expect(payload.output_config).toBeUndefined();
	});

	it("uses adaptive summarized thinking for Opus 4.7 and omits thinking budgets", () => {
		const request = decodeOpenAIChatRequest({
			model: "anthropic/claude-opus-4.7",
			messages: [{ role: "user", content: "Hello" }],
			reasoning: { effort: "high", max_tokens: 32000, enabled: true },
		} as any);

		const payload = irToAnthropicMessages(request);
		expect(payload.thinking).toEqual({ type: "adaptive", display: "summarized" });
		expect(payload.thinking?.budget_tokens).toBeUndefined();
		expect(payload.output_config?.effort).toBe("high");
	});

	it("keeps adaptive summarized thinking for Opus 4.7 even when reasoning is explicitly disabled", () => {
		const request = decodeOpenAIChatRequest({
			model: "anthropic/claude-opus-4.7",
			messages: [{ role: "user", content: "Hello" }],
			reasoning: { enabled: false },
		} as any);

		const payload = irToAnthropicMessages(request);
		expect(payload.thinking).toEqual({ type: "adaptive", display: "summarized" });
		expect(payload.thinking?.budget_tokens).toBeUndefined();
	});

	it("omits Opus 4.7 sampling params that Anthropic now rejects", () => {
		const request = decodeOpenAIChatRequest({
			model: "anthropic/claude-opus-4.7",
			messages: [{ role: "user", content: "Hello" }],
			temperature: 0.2,
			top_p: 0.8,
		} as any);
		(request as any).topK = 20;

		const payload = irToAnthropicMessages(request);
		expect(payload.temperature).toBeUndefined();
		expect(payload.top_p).toBeUndefined();
		expect(payload.top_k).toBeUndefined();
	});

	it("adds JSON object structured-output instruction to system prompt", () => {
		const request = createBaseRequest();
		request.responseFormat = { type: "json_object" };

		const payload = irToAnthropicMessages(request);
		expect(typeof payload.system).toBe("string");
		expect(payload.system).toContain("valid JSON object");
	});

	it("adds JSON schema structured-output instruction to system prompt", () => {
		const request = createBaseRequest();
		request.responseFormat = {
			type: "json_schema",
			name: "weather",
			strict: true,
			schema: {
				type: "object",
				properties: {
					location: { type: "string" },
					temperature_c: { type: "number" },
				},
				required: ["location", "temperature_c"],
				additionalProperties: false,
			},
		};

		const payload = irToAnthropicMessages(request);
		expect(typeof payload.system).toBe("string");
		expect(payload.system).toContain("strictly matches this schema");
		expect(payload.system).toContain("\"temperature_c\"");
	});

	it("adds inference_geo when a US-only Anthropic offer is selected", () => {
		const request = createBaseRequest();

		const payload = irToAnthropicMessages(request, null, request.model, {
			inferenceGeo: "us",
		});

		expect(payload.inference_geo).toBe("us");
	});

	it("resolves inference geo from IR geo preferences before provider defaults", () => {
		const request = createBaseRequest();
		request.geo = {
			requiredExecutionRegion: "us",
		};

		expect(resolveAnthropicInferenceGeo("anthropic", request)).toBe("us");
		expect(resolveAnthropicInferenceGeo("anthropic-us", request)).toBe("us");
	});
});

describe("irToAnthropicMessages cache control", () => {
	it("applies default anthropic cache control to the last user message", () => {
		const request = createBaseRequest();
		request.anthropicCacheControl = {
			type: "ephemeral",
			ttl: "5m",
			scope: "last_user_message",
		} as any;

		const payload = irToAnthropicMessages(request);
		expect(payload.messages[0].content[0].cache_control).toEqual({
			type: "ephemeral",
			ttl: "5m",
		});
	});

	it("preserves per-block cache control when present", () => {
		const request = createBaseRequest();
		request.messages = [{
			role: "user",
			content: [{
				type: "text",
				text: "Hello",
				cacheControl: { type: "ephemeral", ttl: "1h" },
			} as any],
		}] as any;

		const payload = irToAnthropicMessages(request);
		expect(payload.messages[0].content[0].cache_control).toEqual({
			type: "ephemeral",
			ttl: "1h",
		});
	});

	it("preserves cache control on system text blocks", () => {
		const request = createBaseRequest();
		request.messages = [
			{
				role: "system",
				content: [{
					type: "text",
					text: "Stable system prompt",
					cacheControl: { type: "ephemeral", ttl: "1h" },
				}],
			},
			...request.messages,
		] as any;

		const payload = irToAnthropicMessages(request);
		expect(payload.system).toEqual([{
			type: "text",
			text: "Stable system prompt",
			cache_control: { type: "ephemeral", ttl: "1h" },
		}]);
	});

	it("preserves cache control on assistant text, tool results, and tools", () => {
		const request = createBaseRequest();
		request.messages = [
			{
				role: "assistant",
				content: [{
					type: "text",
					text: "Cached assistant context",
					cacheControl: { type: "ephemeral", ttl: "5m" },
				}],
			},
			{
				role: "tool",
				toolResults: [{
					toolCallId: "toolu_123",
					content: "Tool output",
					cacheControl: { type: "ephemeral", ttl: "1h" },
				}],
			},
		] as any;
		request.tools = [{
			name: "lookup",
			description: "Lookup stable data",
			parameters: { type: "object", properties: {} },
			cacheControl: { type: "ephemeral", ttl: "5m" },
		}];

		const payload = irToAnthropicMessages(request);
		expect(payload.messages[0].content[0].cache_control).toEqual({
			type: "ephemeral",
			ttl: "5m",
		});
		expect(payload.messages[1].content[0].cache_control).toEqual({
			type: "ephemeral",
			ttl: "1h",
		});
		expect(payload.tools[0].cache_control).toEqual({
			type: "ephemeral",
			ttl: "5m",
		});
	});
});
