import { describe, expect, it } from "vitest";
import type { IRChatRequest } from "@core/ir";
import { cherryPickIRParams } from "./shared";
import { ChatCompletionsSchema } from "@core/schemas";
import { decodeOpenAIChatRequest } from "@protocols/openai-chat/decode";
import { irToOpenAIChat } from "./openai-compat/transform-chat";

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

	it("maps supported audio and verbosity controls without admitting unrelated sampling params", () => {
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
		expect(wire.temperature).toBeUndefined();
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
