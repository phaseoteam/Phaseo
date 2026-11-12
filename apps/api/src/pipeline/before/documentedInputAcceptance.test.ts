// Documented request fields and values that used to fail with 400: explicit
// nulls, OpenAI's service_tier values, prediction, include_reasoning, Messages
// context_management and user, reasoning without an effort, and the default
// values of the data-collection routing filters.
import { describe, expect, it } from "vitest";
import { AnthropicMessagesSchema, ChatCompletionsSchema, ResponsesSchema } from "@core/schemas";
import { normalizeTextServiceTier, readRequestedServiceTier } from "@core/serviceTiers";
import { decodeOpenAIChatRequest } from "@protocols/openai-chat/decode";
import { decodeOpenAIResponsesRequest } from "@protocols/openai-responses/decode";
import { decodeAnthropicMessagesRequest } from "@protocols/anthropic-messages/decode";
import { dropUnsupportedParams } from "@pipeline/execute/unsupportedParams";
import { collectUnsupportedRoutingFields } from "@pipeline/requestRouting";
import { extractRequestedParams, getUnknownTopLevelParams } from "./paramCapabilities";
import { validateSynchronousTextServiceTierRequest } from "./serviceTierValidation";
import { withoutNullTextParams } from "./textParamPolicy";

const chatBase = { model: "openai/gpt-5.4", messages: [{ role: "user", content: "Hello" }] };
const responsesBase = { model: "openai/gpt-5.4", input: "Hello" };
const messagesBase = { model: "anthropic/claude-sonnet-5", max_tokens: 256, messages: [{ role: "user", content: "Hello" }] };

function serviceTierOk(endpoint: "chat.completions" | "responses", body: unknown): boolean {
	return validateSynchronousTextServiceTierRequest({ endpoint, body, requestId: "req_test", workspaceId: "ws_test" }).ok;
}

describe("explicit null on optional text parameters", () => {
	const chatNulls = {
		temperature: null, top_p: null, max_tokens: null, max_completion_tokens: null, stop: null,
		tool_choice: null, tools: null, service_tier: null, metadata: null, parallel_tool_calls: null,
		seed: null, frequency_penalty: null, presence_penalty: null, response_format: null,
		reasoning: null, reasoning_effort: null, stream_options: null, user: null, logprobs: null,
	};

	it("treats Chat nulls as absent through validation, routing and decoding", () => {
		const raw = withoutNullTextParams("chat.completions", { ...chatBase, ...chatNulls });
		expect(raw).toEqual(chatBase);
		expect(getUnknownTopLevelParams("chat.completions", raw)).toEqual([]);
		expect(extractRequestedParams("chat.completions", raw)).toEqual([]);
		const parsed = ChatCompletionsSchema.safeParse(raw);
		expect(parsed.success).toBe(true);
		const ir = decodeOpenAIChatRequest(parsed.data as any);
		expect(ir.temperature).toBeUndefined();
		expect(ir.maxTokens).toBeUndefined();
		expect(ir.stop).toBeUndefined();
		expect(ir.serviceTier).toBeUndefined();
		expect(ir.reasoning).toBeUndefined();
	});

	it("treats Responses nulls as absent", () => {
		const raw = withoutNullTextParams("responses", {
			...responsesBase,
			instructions: null, temperature: null, top_p: null, max_output_tokens: null, metadata: null,
			parallel_tool_calls: null, truncation: null, include: null, background: null, reasoning: null,
			tool_choice: null, previous_response_id: null, service_tier: null, text: null,
		});
		expect(raw).toEqual(responsesBase);
		expect(ResponsesSchema.safeParse(raw).success).toBe(true);
		expect(getUnknownTopLevelParams("responses", raw)).toEqual([]);
	});

	it("treats Messages nulls as absent", () => {
		const raw = withoutNullTextParams("messages", {
			...messagesBase,
			temperature: null, top_p: null, top_k: null, stop_sequences: null, tool_choice: null,
			metadata: null, service_tier: null, thinking: null, system: null,
		});
		expect(raw).toEqual(messagesBase);
		expect(AnthropicMessagesSchema.safeParse(raw).success).toBe(true);
	});

	it("still reports an unknown key even when it is null, and leaves a body without nulls untouched", () => {
		const raw = withoutNullTextParams("chat.completions", { ...chatBase, not_a_param: null });
		expect(getUnknownTopLevelParams("chat.completions", raw)).toEqual(["not_a_param"]);
		const body = { ...chatBase, temperature: 0.2 };
		expect(withoutNullTextParams("chat.completions", body)).toBe(body);
	});
});

describe("OpenAI service_tier values on Chat and Responses", () => {
	it.each([
		["chat.completions", ChatCompletionsSchema, chatBase],
		["responses", ResponsesSchema, responsesBase],
	] as const)("accepts auto as no tier preference on %s", (endpoint, schema, base) => {
		const parsed = schema.safeParse({ ...base, service_tier: "auto" });
		expect(parsed.success).toBe(true);
		expect(serviceTierOk(endpoint, parsed.data)).toBe(true);
		// Routing and pricing read the requested tier from the body: auto selects none.
		expect(normalizeTextServiceTier(readRequestedServiceTier(parsed.data).value)).toBeUndefined();
	});

	it.each([
		["chat.completions", ChatCompletionsSchema, chatBase],
		["responses", ResponsesSchema, responsesBase],
	] as const)("reads scale as the standard tier on %s", (endpoint, schema, base) => {
		const parsed = schema.safeParse({ ...base, service_tier: "scale" });
		expect(parsed.success).toBe(true);
		expect((parsed.data as any).service_tier).toBe("default");
		expect(serviceTierOk(endpoint, parsed.data)).toBe(true);
		expect(normalizeTextServiceTier(readRequestedServiceTier(parsed.data).value)).toBe("standard");
	});

	it("decodes auto to no tier and scale to standard", () => {
		const auto = decodeOpenAIChatRequest(ChatCompletionsSchema.parse({ ...chatBase, service_tier: "auto" }));
		const scale = decodeOpenAIResponsesRequest(ResponsesSchema.parse({ ...responsesBase, service_tier: "scale" }));
		expect(auto.serviceTier).toBeUndefined();
		expect(scale.serviceTier).toBe("standard");
	});
});

describe("prediction and include_reasoning on Chat", () => {
	const prediction = { type: "content", content: "const x = 1;" };

	it("accepts prediction and forwards it to OpenAI", () => {
		const body = { ...chatBase, prediction };
		expect(getUnknownTopLevelParams("chat.completions", body)).toEqual([]);
		const parsed = ChatCompletionsSchema.safeParse(body);
		expect(parsed.success).toBe(true);
		expect(decodeOpenAIChatRequest(parsed.data as any).vendor?.openai?.prediction).toEqual(prediction);
	});

	it.each([true, false])("accepts include_reasoning: %s", (includeReasoning) => {
		const body = { ...chatBase, include_reasoning: includeReasoning };
		expect(getUnknownTopLevelParams("chat.completions", body)).toEqual([]);
		expect(ChatCompletionsSchema.safeParse(body).success).toBe(true);
	});
});

describe("reasoning without an effort", () => {
	it.each([
		[{ max_tokens: 3000 }, { maxTokens: 3000 }],
		[{ enabled: true }, { enabled: true }],
		[{ summary: "detailed" }, { summary: "detailed" }],
	])("does not add a medium effort to Chat reasoning %j", (reasoning, expected) => {
		const ir = decodeOpenAIChatRequest(ChatCompletionsSchema.parse({ ...chatBase, reasoning }));
		expect(ir.reasoning).toMatchObject(expected);
		expect(ir.reasoning?.effort).toBeUndefined();
	});

	it("accepts effort: null as unset on Chat, Responses and Messages", () => {
		const chat = ChatCompletionsSchema.safeParse({ ...chatBase, reasoning: { effort: null, max_tokens: 2048 } });
		expect(chat.success).toBe(true);
		const chatIr = decodeOpenAIChatRequest(chat.data as any);
		expect(chatIr.reasoning?.effort).toBeUndefined();
		expect(chatIr.reasoning?.maxTokens).toBe(2048);

		const responsesIr = decodeOpenAIResponsesRequest(ResponsesSchema.parse({ ...responsesBase, reasoning: { effort: null, summary: "auto" } }));
		expect(responsesIr.reasoning).toBeDefined();
		expect(responsesIr.reasoning?.effort).toBeUndefined();

		const messages = AnthropicMessagesSchema.safeParse({ ...messagesBase, reasoning: { effort: null, enabled: true } });
		expect(messages.success).toBe(true);
		expect(decodeAnthropicMessagesRequest(messages.data as any).reasoning?.effort).toBeUndefined();
	});

	it("keeps an explicit effort", () => {
		const ir = decodeOpenAIChatRequest(ChatCompletionsSchema.parse({ ...chatBase, reasoning: { effort: "high" } }));
		expect(ir.reasoning).toMatchObject({ effort: "high", summary: "auto" });
	});
});

describe("Messages context_management and user", () => {
	const contextManagement = {
		edits: [
			{ type: "clear_tool_uses_20250919", trigger: { type: "input_tokens", value: 30000 }, keep: { type: "tool_uses", value: 3 } },
			{ type: "clear_thinking_20251015" },
		],
	};

	it("accepts both and decodes them", () => {
		const body = { ...messagesBase, context_management: contextManagement, user: "user_123" };
		expect(getUnknownTopLevelParams("messages", body)).toEqual([]);
		expect(extractRequestedParams("messages", body)).toContain("context_management");
		const parsed = AnthropicMessagesSchema.safeParse(body);
		expect(parsed.success).toBe(true);
		const ir = decodeAnthropicMessagesRequest(parsed.data as any);
		expect(ir.anthropicContextManagement).toEqual(contextManagement);
		expect(ir.userId).toBe("user_123");
	});

	it("refuses compaction edits, whose blocks the gateway cannot return", () => {
		const parsed = AnthropicMessagesSchema.safeParse({ ...messagesBase, context_management: { edits: [{ type: "compact_20260112" }] } });
		expect(parsed.success).toBe(false);
	});

	it("keeps context_management for Anthropic and drops it, reported, elsewhere", () => {
		const ir = decodeAnthropicMessagesRequest(AnthropicMessagesSchema.parse({ ...messagesBase, context_management: contextManagement }) as any);
		const anthropic = dropUnsupportedParams(ir, "anthropic", null);
		expect(anthropic.ir.anthropicContextManagement).toEqual(contextManagement);
		expect(anthropic.dropped).toEqual([]);
		const vertex = dropUnsupportedParams(ir, "google-vertex", null);
		expect(vertex.ir.anthropicContextManagement).toBeUndefined();
		expect(vertex.dropped).toEqual([{ param: "context_management", reason: "unsupported_by_provider", source: "provider_profile" }]);
	});
});

describe("data-collection routing filters", () => {
	it("accepts the documented defaults as no-ops", () => {
		expect(collectUnsupportedRoutingFields({ provider: { data_collection: "allow", enforce_distillable_text: false } })).toEqual([]);
		expect(collectUnsupportedRoutingFields({ routing: { dataCollection: "allow", enforceDistillableText: false } })).toEqual([]);
	});

	it("still rejects the restrictive values", () => {
		expect(collectUnsupportedRoutingFields({ provider: { data_collection: "deny", enforce_distillable_text: true } })).toEqual([
			{
				field: "data_collection",
				path: ["provider", "data_collection"],
				message: "Routing by provider data-collection policy is not yet backed by provider metadata in Phaseo Gateway.",
			},
			{
				field: "enforce_distillable_text",
				path: ["provider", "enforce_distillable_text"],
				message: "Routing by distillable-text policy is not yet backed by provider metadata in Phaseo Gateway.",
			},
		]);
	});
});
