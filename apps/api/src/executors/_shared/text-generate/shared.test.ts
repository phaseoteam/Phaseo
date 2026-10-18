import { describe, expect, it } from "vitest";
import type { IRChatRequest } from "@core/ir";
import { cherryPickIRParams } from "./shared";
import { ChatCompletionsSchema } from "@core/schemas";
import { decodeOpenAIChatRequest } from "@protocols/openai-chat/decode";
import { irToOpenAIChat } from "./openai-compat/transform-chat";
import { contextSchema } from "@pipeline/before/schemas";

describe("cherryPickIRParams", () => {
	it("preserves structured output when the catalog uses Responses text.format", () => {
		const ir: IRChatRequest = { model: "model", stream: false, messages: [], responseFormat: { type: "json_object" } };
		expect(cherryPickIRParams(ir, { params: ["text.format"] }).responseFormat).toEqual(ir.responseFormat);
	});
	it("retains validated provider options through decode, preprocessing and wire mapping", () => {
		const ir = decodeOpenAIChatRequest(ChatCompletionsSchema.parse({
			model: "accounts/fireworks/models/deepseek-v4",
			messages: [{ role: "user", content: "hello" }],
			provider_options: { fireworks: { min_p: 0.2, context_length_exceeded_behavior: "error" } },
		}) as any);
		const filtered = cherryPickIRParams(ir, { params: ["temperature", "provider_options.fireworks"] });
		const wire = irToOpenAIChat(filtered, ir.model, "fireworks");
		expect(wire.min_p).toBe(0.2);
		expect(wire.context_length_exceeded_behavior).toBe("error");
	});

	it("keeps the complete reasoning configuration for provider normalization", () => {
		const ir: IRChatRequest = {
			model: "reasoning-model", stream: false, messages: [],
			reasoning: { effort: "high", mode: "pro", context: "all_turns", includeThoughts: true, maxTokens: 4096 },
		};
		const filtered = cherryPickIRParams(ir, { params: ["reasoning.effort"] });
		expect(filtered.reasoning).toEqual(ir.reasoning);
		expect(ir.reasoning?.mode).toBe("pro");
	});

	it("maps audio and verbosity controls through to the wire request", () => {
		const ir: IRChatRequest = {
			model: "gpt-audio", stream: false, messages: [],
			audioConfig: { voice: "alloy", format: "wav" }, modalities: ["text", "audio"],
			textVerbosity: "low", webSearchOptions: { search_context_size: "low" }, temperature: 0.7,
		};
		const filtered = cherryPickIRParams(ir, { params: ["audio", "modalities", "verbosity", "web_search_options"] });
		const wire = irToOpenAIChat(filtered, ir.model, "openai");
		expect(wire.audio).toEqual({ voice: "alloy", format: "wav" });
		expect(wire.modalities).toEqual(["text", "audio"]);
		expect(wire.verbosity).toBe("low");
		expect(wire.web_search_options).toEqual({ search_context_size: "low" });
		// The hook no longer filters: support is enforced during routing.
		expect(wire.temperature).toBe(0.7);
	});

	it("never drops tools or cache hints for the capability shape production routing builds", () => {
		// IonRouter's catalogue lists only three params. Routing parses that list
		// into a keyed record, which is the shape executors receive.
		const parsed = contextSchema.parse({
			workspace_id: "ws_cherry_pick",
			resolved_model: "z-ai/glm-5",
			key_ok: { ok: true, reason: null },
			key_limit_ok: { ok: true, reason: null },
			credit_ok: { ok: true, reason: null },
			providers: [{
				provider_id: "ionrouter",
				api_model_id: "z-ai/glm-5",
				provider_model_slug: "glm-5",
				capability_params: [
					{ param_id: "max_tokens", provider_min: null, provider_max: null, provider_default: null, notes: null },
					{ param_id: "temperature", provider_min: null, provider_max: null, provider_default: null, notes: null },
					{ param_id: "top_p", provider_min: null, provider_max: null, provider_default: null, notes: null },
				],
			}],
			pricing: {},
		});
		const capabilityParams = parsed.providers[0]!.capabilityParams;
		expect(capabilityParams).toEqual({
			max_tokens: expect.any(Object), temperature: expect.any(Object), top_p: expect.any(Object),
		});

		const ir = decodeOpenAIChatRequest(ChatCompletionsSchema.parse({
			model: "z-ai/glm-5",
			messages: [{ role: "user", content: "What is the weather in Paris?" }],
			tools: [{ type: "function", function: { name: "get_weather", parameters: { type: "object", properties: { city: { type: "string" } } } } }],
			tool_choice: "auto",
			prompt_cache_key: "session-42",
			max_tokens: 256,
		}) as any);
		const wire = irToOpenAIChat(cherryPickIRParams(ir, capabilityParams), "glm-5", "ionrouter", capabilityParams);
		expect(wire.tools?.[0]?.function?.name).toBe("get_weather");
		expect(wire.tool_choice).toBe("auto");
		expect(wire.prompt_cache_key).toBe("session-42");
		expect(wire.max_tokens).toBe(256);
	});

	it("preserves provider cache and geographic context alongside an allowlist", () => {
		const ir: IRChatRequest = {
			model: "model", stream: false, messages: [],
			geo: { inferenceGeo: "us" },
			anthropicCacheControl: { type: "ephemeral", ttl: "1h" },
			googleCachedContent: "cachedContents/test",
			xaiConversationId: "conversation-test",
			promptCacheOptions: { mode: "explicit", ttl: "30m" },
		};
		const filtered = cherryPickIRParams(ir, { request: { allowlist: ["max_tokens"] } });
		expect(filtered).toMatchObject(ir);
	});

	it("preserves snake-case min_p and logit_bias allowlist fields", () => {
		const ir: IRChatRequest = {
			model: "deepseek/deepseek-v4-flash-0731",
			stream: false,
			messages: [{ role: "user", content: [{ type: "text", text: "Hello" }] }],
			minP: 0.05,
			logitBias: { "42": 1 },
		};

		const filtered = cherryPickIRParams(ir, { params: ["min_p", "logit_bias"] });

		expect(filtered.minP).toBe(0.05);
		expect(filtered.logitBias).toEqual({ "42": 1 });
	});
});
