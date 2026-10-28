import { describe, expect, it } from "vitest";
import {
	canReplayReasoning,
	openReasoningState,
	reasoningFormatForRoute,
	reasoningModelKey,
	sealReasoningState,
} from "@core/reasoning-state";
import { decodeAnthropicMessagesRequest } from "../anthropic-messages/decode";
import { decodeOpenAIResponsesRequest } from "../openai-responses/decode";
import { encodeAnthropicMessagesResponse } from "../anthropic-messages/encode";
import { decodeChatReasoningDetails, decodeResponsesReasoningItem } from "./reasoning";
import { normaliseAnthropicCacheBreakpoints } from "@executors/anthropic/text-generate/breakpoints";
import { irToOpenAIChat } from "@executors/_shared/text-generate/openai-compat/transform-chat";
import { irToAnthropicMessages } from "@executors/anthropic/text-generate";

describe("reasoning state seals", () => {
	it("round-trips the origin and leaves the provider value unchanged", () => {
		const sealed = sealReasoningState({
			format: "anthropic-claude-v1",
			kind: "signature",
			value: "EqQBCgIYAhIM1gbcDa9GJwZA2b+/=",
			model: "claude-opus-4-5-20251101",
			provider: "anthropic",
		});
		expect(sealed.endsWith(".EqQBCgIYAhIM1gbcDa9GJwZA2b+/=")).toBe(true);
		expect(openReasoningState(sealed)).toEqual({
			format: "anthropic-claude-v1",
			kind: "signature",
			value: "EqQBCgIYAhIM1gbcDa9GJwZA2b+/=",
			model: "claude-opus-4-5-20251101",
			provider: "anthropic",
		});
		// Sealing is idempotent.
		expect(sealReasoningState({ format: "openai-responses-v1", kind: "encrypted", value: sealed })).toBe(sealed);
	});

	it("accepts a raw value only with the surface's native format", () => {
		expect(openReasoningState("gAAAAABo...")).toBeNull();
		expect(openReasoningState("gAAAAABo...", { format: "openai-responses-v1", kind: "encrypted" })).toEqual({
			format: "openai-responses-v1",
			kind: "encrypted",
			value: "gAAAAABo...",
			unsealed: true,
		});
		expect(openReasoningState("phx1.not-json.value", { format: "openai-responses-v1", kind: "encrypted" })).toBeNull();
	});

	it("maps routes to the format they issue", () => {
		expect(reasoningFormatForRoute("anthropic-aws", "claude-sonnet-5")).toBe("anthropic-claude-v1");
		expect(reasoningFormatForRoute("amazon-bedrock", "us.anthropic.claude-opus-4-5-20251101-v1:0")).toBe("anthropic-claude-v1");
		expect(reasoningFormatForRoute("amazon-bedrock", "openai.gpt-oss-120b")).toBeNull();
		expect(reasoningFormatForRoute("google-vertex", "claude-opus-4-5@20251101")).toBe("anthropic-claude-v1");
		expect(reasoningFormatForRoute("google-vertex", "gemini-3.6-flash")).toBe("google-gemini-v1");
		expect(reasoningFormatForRoute("azure", "claude-opus-5")).toBe("anthropic-claude-v1");
		expect(reasoningFormatForRoute("azure", "gpt-5.1")).toBe("azure-openai-responses-v1");
		expect(reasoningFormatForRoute("x-ai", "grok-4.7")).toBe("xai-responses-v1");
		expect(reasoningFormatForRoute("deepseek", "deepseek-v4")).toBeNull();
	});

	it("normalises platform model ids", () => {
		expect(reasoningModelKey("anthropic/claude-opus-4.5")).toBe("claude-opus-4-5");
		expect(reasoningModelKey("us.anthropic.claude-opus-4-5-20251101-v1:0")).toBe("claude-opus-4-5");
		expect(reasoningModelKey("claude-opus-4-5@20251101")).toBe("claude-opus-4-5");
		expect(reasoningModelKey("openai/gpt-5.1-2025-11-13")).toBe("gpt-5-1");
	});

	it("replays only to the issuing family and model", () => {
		const claude = { format: "anthropic-claude-v1", model: "claude-opus-4-5-20251101", provider: "anthropic" };
		// Claude signatures work across the Claude API, Bedrock and Vertex.
		expect(canReplayReasoning(claude, { providerId: "amazon-bedrock", model: "us.anthropic.claude-opus-4-5-20251101-v1:0" })).toBe(true);
		expect(canReplayReasoning(claude, { providerId: "openai", model: "gpt-5.1" })).toBe(false);
		// Sonnet 5.5 thinking is bound to the account that produced it.
		const sonnet55 = { format: "anthropic-claude-v1", model: "claude-sonnet-5-5", provider: "anthropic" };
		expect(canReplayReasoning(sonnet55, { providerId: "anthropic-us", model: "claude-sonnet-5-5" })).toBe(true);
		expect(canReplayReasoning(sonnet55, { providerId: "amazon-bedrock", model: "anthropic.claude-sonnet-5-5" })).toBe(false);
		const gpt = { format: "openai-responses-v1", model: "openai/gpt-5.1" };
		expect(canReplayReasoning(gpt, { providerId: "openai", model: "gpt-5.1" })).toBe(true);
		expect(canReplayReasoning(gpt, { providerId: "azure", model: "gpt-5.1" })).toBe(false);
		expect(canReplayReasoning(gpt, { providerId: "openai", model: "gpt-5.1-codex" })).toBe(false);
		const gemini = { format: "google-gemini-v1", model: "gemini-3.6-flash" };
		expect(canReplayReasoning(gemini, { providerId: "google-vertex", model: "gemini-3.1-pro-preview" })).toBe(false);
		expect(canReplayReasoning({ format: undefined }, { providerId: "anthropic", model: "claude-opus-5" })).toBe(false);
	});
});

describe("surface decoding", () => {
	it("reads OpenRouter-style reasoning_details from Anthropic, Gemini and OpenAI", () => {
		const decoded = decodeChatReasoningDetails([
			{ type: "reasoning.text", text: "Let me think.", signature: "EqQBCgIYAhIM", format: "anthropic-claude-v1", index: 0 },
			{ type: "reasoning.encrypted", data: "EmwKAhgBEgy3", format: "anthropic-claude-v1", index: 1 },
			{ type: "reasoning.encrypted", id: "call_1", data: "CiQBcsjafE5Z", format: "google-gemini-v1", index: 2 },
			{ type: "reasoning.summary", summary: "Checked Paris.", id: "rs_9", format: "openai-responses-v1", index: 3 },
			{ type: "reasoning.encrypted", id: "rs_9", data: "gAAAAABo", format: "openai-responses-v1", index: 4 },
			{ type: "reasoning.text", text: "plain", format: "unknown", index: 5 },
		], new Set(["call_1"]));
		expect(decoded.toolSignatures.get("call_1")).toEqual({ signature: "CiQBcsjafE5Z" });
		expect(decoded.parts).toEqual([
			{ type: "reasoning_text", text: "Let me think.", thoughtSignature: "EqQBCgIYAhIM", reasoningFormat: "anthropic-claude-v1" },
			{ type: "reasoning_text", text: "", redactedData: "EmwKAhgBEgy3", reasoningFormat: "anthropic-claude-v1" },
			{ type: "reasoning_text", text: "Checked Paris.", summary: "Checked Paris.", encryptedContent: "gAAAAABo", reasoningFormat: "openai-responses-v1", reasoningId: "rs_9" },
			{ type: "reasoning_text", text: "plain" },
		]);
	});

	it("treats raw Responses encrypted_content as OpenAI's", () => {
		expect(decodeResponsesReasoningItem({
			type: "reasoning",
			id: "rs_1",
			summary: [{ type: "summary_text", text: "Thinking about Paris." }],
			encrypted_content: "gAAAAABo",
		})).toEqual({
			kind: "part",
			part: {
				type: "reasoning_text",
				text: "Thinking about Paris.",
				summary: "Thinking about Paris.",
				encryptedContent: "gAAAAABo",
				reasoningFormat: "openai-responses-v1",
				reasoningId: "rs_1",
			},
		});
	});

	it("reads a raw signature and format on Responses reasoning items", () => {
		// A Claude thinking block sent back as a Responses item.
		expect(decodeResponsesReasoningItem({
			type: "reasoning",
			id: "rs_claude",
			summary: [],
			content: [{ type: "reasoning_text", text: "Let me think." }],
			signature: "EqQBCgIYAhIM",
			format: "anthropic-claude-v1",
		})).toEqual({
			kind: "part",
			part: {
				type: "reasoning_text",
				text: "Let me think.",
				thoughtSignature: "EqQBCgIYAhIM",
				reasoningFormat: "anthropic-claude-v1",
				reasoningId: "rs_claude",
			},
		});
		// Claude redacted thinking arrives as encrypted_content with its format.
		expect(decodeResponsesReasoningItem({
			type: "reasoning",
			summary: [],
			encrypted_content: "EmwKAhgBEgy3",
			format: "anthropic-claude-v1",
		})).toEqual({
			kind: "part",
			part: { type: "reasoning_text", text: "", redactedData: "EmwKAhgBEgy3", reasoningFormat: "anthropic-claude-v1" },
		});
		// A Gemini thought signature.
		expect(decodeResponsesReasoningItem({
			type: "reasoning",
			summary: [{ type: "summary_text", text: "Plan." }],
			signature: "CiQBcsjafE5Z",
			format: "google-gemini-v1",
		})).toMatchObject({
			kind: "part",
			part: { type: "reasoning_text", text: "Plan.", thoughtSignature: "CiQBcsjafE5Z", reasoningFormat: "google-gemini-v1" },
		});
		// Without a known format a raw signature is not trusted.
		expect(decodeResponsesReasoningItem({ type: "reasoning", summary: [], signature: "EqQBCgIYAhIM" })).toBeNull();
	});

	it("replays a Claude Responses reasoning item with signature and format to Claude", () => {
		const ir = decodeOpenAIResponsesRequest({
			model: "anthropic/claude-opus-5",
			input: [
				{ role: "user", content: "Weather in Paris?" },
				{ type: "reasoning", summary: [], content: [{ type: "reasoning_text", text: "Use the tool." }], signature: "EqQBCgIYAhIM", format: "anthropic-claude-v1" },
				{ type: "function_call", call_id: "toolu_1", name: "get_weather", arguments: "{\"city\":\"Paris\"}" },
				{ type: "function_call_output", call_id: "toolu_1", output: "Sunny" },
			],
			tools: [{ type: "function", name: "get_weather", parameters: { type: "object", properties: {} } }],
		} as any);
		const request = irToAnthropicMessages(ir, undefined, "claude-opus-5", { providerId: "anthropic" });
		const assistant = request.messages.find((message: any) => message.role === "assistant");
		expect(assistant.content[0]).toEqual({ type: "thinking", thinking: "Use the tool.", signature: "EqQBCgIYAhIM" });
	});

	it("keeps Claude thinking order around tool calls on the Messages surface", () => {
		// Opus 5.5 progress update: a thinking block right before the second call.
		const ir = decodeAnthropicMessagesRequest({
			model: "claude-opus-5-5",
			max_tokens: 1024,
			messages: [
				{ role: "user", content: "Paris and Rome?" },
				{ role: "assistant", content: [
					{ type: "thinking", thinking: "Plan.", signature: "sigA" },
					{ type: "tool_use", id: "toolu_1", name: "get_weather", input: { city: "Paris" } },
					{ type: "thinking", thinking: "Now Rome.", signature: "sigB" },
					{ type: "tool_use", id: "toolu_2", name: "get_weather", input: { city: "Rome" } },
				] },
			],
		} as any);
		const assistant = ir.messages[1] as any;
		expect(assistant.content[1]).toMatchObject({ thoughtSignature: "sigB", beforeToolCallId: "toolu_2" });
		const encoded = encodeAnthropicMessagesResponse({
			id: "r", created: 1, model: "claude-opus-5-5", provider: "anthropic",
			choices: [{ index: 0, message: { role: "assistant", content: assistant.content, toolCalls: assistant.toolCalls }, finishReason: "tool_calls" }],
		});
		expect(encoded.content.map((block: any) => block.type === "thinking" ? `thinking:${block.signature}` : `${block.type}:${block.id}`)).toEqual([
			"thinking:sigA",
			"tool_use:toolu_1",
			"thinking:sigB",
			"tool_use:toolu_2",
		]);
	});

	it("seals another provider's state when it is returned on the Messages surface", () => {
		const encoded = encodeAnthropicMessagesResponse({
			id: "r", created: 1, model: "gemini-3.6-flash", provider: "google-vertex",
			choices: [{ index: 0, message: { role: "assistant", content: [{ type: "reasoning_text", text: "Hmm.", thoughtSignature: "CiQB", reasoningFormat: "google-gemini-v1" }] }, finishReason: "stop" }],
		});
		const block = encoded.content[0] as any;
		expect(block.type).toBe("thinking");
		expect(block.signature).toMatch(/^phx1\./);
		const decoded = decodeAnthropicMessagesRequest({
			model: "claude-opus-5",
			max_tokens: 64,
			messages: [{ role: "user", content: "Hi" }, { role: "assistant", content: [block] }, { role: "user", content: "Again" }],
		} as any);
		expect((decoded.messages[1] as any).content[0]).toMatchObject({ reasoningFormat: "google-gemini-v1", thoughtSignature: "CiQB" });
	});
});

describe("provider request rules", () => {
	it("strips cache_control from thinking blocks", () => {
		const request = {
			messages: [{ role: "assistant", content: [
				{ type: "thinking", thinking: "x", signature: "s", cache_control: { type: "ephemeral" } },
				{ type: "text", text: "y", cache_control: { type: "ephemeral" } },
			] }],
		};
		normaliseAnthropicCacheBreakpoints(request);
		expect(request.messages[0].content[0]).toEqual({ type: "thinking", thinking: "x", signature: "s" });
		expect(request.messages[0].content[1]).toEqual({ type: "text", text: "y", cache_control: { type: "ephemeral" } });
	});

	it("sends MiniMax its reasoning_details and other providers plain reasoning_content", () => {
		const ir: any = {
			model: "minimax/minimax-m3",
			messages: [
				{ role: "user", content: [{ type: "text", text: "Weather?" }] },
				{
					role: "assistant",
					content: [
						{ type: "reasoning_text", text: "Call the tool." },
						{ type: "reasoning_text", text: "Claude thinking", thoughtSignature: "sig", reasoningFormat: "anthropic-claude-v1" },
					],
					toolCalls: [{ id: "call_1", name: "get_weather", arguments: "{}" }],
				},
				{ role: "tool", toolResults: [{ toolCallId: "call_1", content: "18" }] },
			],
		};
		const minimax = irToOpenAIChat(ir, "MiniMax-M3", "minimax");
		expect(minimax.messages[1].reasoning_details).toEqual([{
			type: "reasoning.text", id: "reasoning-text-1", format: "MiniMax-response-v1", index: 0, text: "Call the tool.",
		}]);
		expect(minimax.messages[1].reasoning_content).toBeUndefined();
		const deepseek = irToOpenAIChat(ir, "deepseek-v4", "deepseek");
		expect(deepseek.messages[1].reasoning_content).toBe("Call the tool.");
	});
});

describe("Responses history with Gemini function-call signatures", () => {
	const signatureItem = (value: string) => ({
		type: "reasoning",
		id: "rs_get_weather",
		summary: [],
		content: [],
		encrypted_content: sealReasoningState({
			format: "google-gemini-v1",
			kind: "signature",
			value,
			model: "gemini-3.6-flash",
			provider: "google-vertex",
			callId: "get_weather",
		}),
	});
	const call = (city: string) => ({ type: "function_call", call_id: "get_weather", name: "get_weather", arguments: JSON.stringify({ city }) });
	const output = (temp: number) => ({ type: "function_call_output", call_id: "get_weather", output: JSON.stringify({ temp }) });

	it("binds each signature to the call in its own turn when generated ids repeat", () => {
		const ir = decodeOpenAIResponsesRequest({
			model: "google/gemini-3.6-flash",
			input: [
				{ role: "user", content: "Weather in Paris, then Rome?" },
				signatureItem("SIG_TURN_1"), call("Paris"), output(18),
				// A streamed response lists the signature after its call.
				call("Rome"), signatureItem("SIG_TURN_2"), output(24),
			],
		} as any);
		const signatures = ir.messages
			.filter((message) => message.role === "assistant")
			.map((message: any) => message.toolCalls?.map((toolCall: any) => toolCall.thoughtSignature));
		expect(signatures).toEqual([["SIG_TURN_1"], ["SIG_TURN_2"]]);
	});
});
