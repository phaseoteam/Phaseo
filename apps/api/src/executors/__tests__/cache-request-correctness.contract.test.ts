// Contract tests for the request-correctness fixes from the 2026-10-17 prompt
// caching review: client payload -> decode -> IR -> executor -> captured upstream body.
// Payload shapes follow the providers' published request formats.

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { IRChatRequest } from "@core/ir";
import type { ExecutorExecuteArgs } from "@executors/types";
import { ChatCompletionsSchema, ResponsesSchema } from "@core/schemas";
import { decodeOpenAIChatRequest } from "@protocols/openai-chat/decode";
import { decodeOpenAIResponsesRequest } from "@protocols/openai-responses/decode";
import { providerAcceptsStreamOptions } from "@executors/_shared/text-generate/openai-compat/prompt-cache-policy";
import { executor as anthropicExecutor } from "@executors/anthropic/text-generate";
import { execute as bedrockExecute } from "@executors/amazon-bedrock/text-generate";
import { executor as ionRouterExecutor } from "@executors/ionrouter/text-generate";
import { executor as cerebrasExecutor } from "@executors/cerebras/text-generate";
import { executor as upstageExecutor } from "@executors/upstage/text-generate";
import { executor as openAIExecute } from "@executors/openai/text-generate";
import { execute as azureExecute } from "@executors/azure/text-generate";
import { execute as vertexExecute } from "@executors/google-vertex/text-generate";
import { executor as aiStudioExecutor } from "@executors/google-ai-studio/text-generate";
import { irToOpenAIChat } from "@executors/_shared/text-generate/openai-compat/transform-chat";
import { irToOpenAIResponses } from "@executors/_shared/text-generate/openai-compat/transform";
import { irToolCallsToGeminiParts, GEMINI_SKIP_THOUGHT_SIGNATURE } from "@executors/google/shared/function-history";
import { validateCapabilities } from "@pipeline/before/capabilityValidation";
import { mergePresetWithBody } from "@pipeline/before/presetMerge";
import { serverToolFollowUpToolChoice } from "@pipeline/surfaces/text-generate";
import { installFetchMock, jsonResponse, type FetchCall } from "../../../tests/helpers/mock-fetch";
import { setupRuntimeFromEnv, setupTestRuntime, teardownTestRuntime } from "../../../tests/helpers/runtime";
import { sseResponse } from "../../../tests/helpers/sse";

vi.mock("@supabase/supabase-js", () => ({
	createClient: () => ({}),
}));

beforeAll(() => setupTestRuntime());
afterAll(() => teardownTestRuntime());

function chatIR(body: Record<string, any>): IRChatRequest {
	return decodeOpenAIChatRequest(ChatCompletionsSchema.parse(body) as any);
}

function responsesIR(body: Record<string, any>): IRChatRequest {
	return decodeOpenAIResponsesRequest(ResponsesSchema.parse(body) as any);
}

function args(ir: IRChatRequest, overrides: Partial<ExecutorExecuteArgs>): ExecutorExecuteArgs {
	return {
		ir,
		requestId: "req_cache_contract",
		workspaceId: "ws_cache_contract",
		providerId: "anthropic",
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

function anthropicMessageSse(): Response {
	return sseResponse([
		{ type: "message_start", message: { id: "msg_01", type: "message", role: "assistant", model: "claude-sonnet-5", content: [], usage: { input_tokens: 12, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 1 } } },
		{ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
		{ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "ok" } },
		{ type: "content_block_stop", index: 0 },
		{ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 1 } },
		{ type: "message_stop" },
	]);
}

async function captureAnthropic(ir: IRChatRequest, model = "claude-sonnet-5"): Promise<FetchCall> {
	const mock = installFetchMock([{
		match: (url) => url === "https://api.anthropic.example/v1/messages",
		response: () => anthropicMessageSse(),
	}]);
	try {
		await anthropicExecutor(args(ir, { providerId: "anthropic", providerModelSlug: model }));
	} finally {
		mock.restore();
	}
	expect(mock.calls).toHaveLength(1);
	return mock.calls[0]!;
}

// Compare the parsed host, not a URL prefix, so the matcher cannot be satisfied by a lookalike host.
function hasHost(url: string, host: string): boolean {
	return new URL(url).host === host;
}

async function captureFailedCall(
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

function countCacheMarks(body: any): number {
	const blocks = [
		...(body.tools ?? []),
		...(Array.isArray(body.system) ? body.system : []),
		...(body.messages ?? []).flatMap((message: any) => Array.isArray(message.content) ? message.content : []),
	];
	return blocks.filter((block: any) => block?.cache_control).length;
}

const weatherTool = {
	type: "function",
	function: {
		name: "get_weather",
		description: "Current weather for a city",
		parameters: { type: "object", properties: { city: { type: "string" } }, required: ["city"] },
	},
};

describe("R4: OpenAI prompt_cache_breakpoint on Anthropic targets", () => {
	it("becomes an ephemeral cache_control instead of an invalid type", async () => {
		const call = await captureAnthropic(chatIR({
			model: "anthropic/claude-sonnet-5",
			messages: [
				{ role: "system", content: [{ type: "text", text: "You are a support agent. Policy follows.", prompt_cache_breakpoint: { mode: "explicit" } }] },
				{ role: "user", content: "Can I return an item after 20 days?" },
			],
		}));
		expect(call.bodyJson.system).toEqual([
			{ type: "text", text: "You are a support agent. Policy follows.", cache_control: { type: "ephemeral" } },
		]);
		expect(call.bodyText).not.toContain("prompt_cache_breakpoint");
	});

	it("keeps at most four breakpoints: the first and the latest three", async () => {
		const marked = (text: string) => ({ role: "user", content: [{ type: "text", text, prompt_cache_breakpoint: { mode: "explicit" } }] });
		const call = await captureAnthropic(chatIR({
			model: "anthropic/claude-sonnet-5",
			messages: [
				{ role: "system", content: [{ type: "text", text: "System", prompt_cache_breakpoint: { mode: "explicit" } }] },
				marked("turn 1"), { role: "assistant", content: "a1" },
				marked("turn 2"), { role: "assistant", content: "a2" },
				marked("turn 3"), { role: "assistant", content: "a3" },
				marked("turn 4"), { role: "assistant", content: "a4" },
				marked("turn 5"),
			],
		}));
		expect(countCacheMarks(call.bodyJson)).toBe(4);
		expect(call.bodyJson.system[0].cache_control).toEqual({ type: "ephemeral" });
		const markedTurns = call.bodyJson.messages
			.filter((message: any) => message.content?.[0]?.cache_control)
			.map((message: any) => message.content[0].text);
		expect(markedTurns).toEqual(["turn 3", "turn 4", "turn 5"]);
	});

	it("raises a translated breakpoint that precedes a 1h mark to 1h", async () => {
		const call = await captureAnthropic(chatIR({
			model: "anthropic/claude-sonnet-5",
			messages: [
				{ role: "system", content: [{ type: "text", text: "System", prompt_cache_breakpoint: { mode: "explicit" } }] },
				{ role: "user", content: [{ type: "text", text: "Long document", cache_control: { type: "ephemeral", ttl: "1h" } }] },
				{ role: "assistant", content: "a1" },
				{ role: "user", content: [{ type: "text", text: "Latest turn", cache_control: { type: "ephemeral" } }] },
			],
		}));
		// Anthropic requires longer TTLs first; the trailing 5m mark stays 5m.
		expect(call.bodyJson.system[0].cache_control).toEqual({ type: "ephemeral", ttl: "1h" });
		expect(call.bodyJson.messages[0].content[0].cache_control).toEqual({ type: "ephemeral", ttl: "1h" });
		expect(call.bodyJson.messages[2].content[0].cache_control).toEqual({ type: "ephemeral" });
	});
});

describe("R5: documented cache_control on Chat and Responses", () => {
	it("decodes per-part and per-tool cache_control into the Anthropic request", async () => {
		const call = await captureAnthropic(chatIR({
			model: "anthropic/claude-sonnet-5",
			tools: [{ ...weatherTool, cache_control: { type: "ephemeral" } }],
			messages: [
				{ role: "system", content: [{ type: "text", text: "You are a support assistant. Follow the company policy exactly.", cache_control: { type: "ephemeral", ttl: "1h" } }] },
				{ role: "user", content: "Summarise the latest ticket." },
			],
		}));
		expect(call.bodyJson.tools[0]).toMatchObject({ name: "get_weather", cache_control: { type: "ephemeral" } });
		expect(call.bodyJson.system[0].cache_control).toEqual({ type: "ephemeral", ttl: "1h" });
	});

	it("decodes Responses input_text cache_control into the Anthropic request", async () => {
		const call = await captureAnthropic(responsesIR({
			model: "anthropic/claude-sonnet-5",
			input: [{ role: "user", content: [
				{ type: "input_text", text: "Reference document: Refunds are available for 30 days when...", cache_control: { type: "ephemeral", ttl: "5m" } },
				{ type: "input_text", text: "Answer this customer: Can I return an item after 20 days?" },
			] }],
		}));
		expect(call.bodyJson.messages[0].content).toEqual([
			{ type: "text", text: "Reference document: Refunds are available for 30 days when...", cache_control: { type: "ephemeral", ttl: "5m" } },
			{ type: "text", text: "Answer this customer: Can I return an item after 20 days?" },
		]);
	});

	it("prefers prompt_cache_breakpoint when a block carries both marks", () => {
		const ir = chatIR({
			model: "openai/gpt-5.6-terra",
			messages: [{ role: "user", content: [{ type: "text", text: "Doc", cache_control: { type: "ephemeral", ttl: "1h" }, prompt_cache_breakpoint: { mode: "explicit" } }] }],
		});
		expect((ir.messages[0] as any).content[0].cacheControl).toEqual({ type: "prompt_cache_breakpoint", mode: "explicit" });
	});

	it("keeps a marked Chat tool result as text with its breakpoint", async () => {
		const call = await captureAnthropic(chatIR({
			model: "anthropic/claude-sonnet-5",
			tools: [weatherTool],
			messages: [
				{ role: "user", content: "Weather in Paris?" },
				{ role: "assistant", tool_calls: [{ id: "call_1", type: "function", function: { name: "get_weather", arguments: "{\"city\":\"Paris\"}" } }] },
				{ role: "tool", tool_call_id: "call_1", content: [{ type: "text", text: "Sunny, 18°C", cache_control: { type: "ephemeral" } }] },
			],
		}));
		expect(call.bodyJson.messages[2]).toEqual({
			role: "user",
			content: [{ type: "tool_result", tool_use_id: "call_1", content: "Sunny, 18°C", cache_control: { type: "ephemeral" } }],
		});
	});

	it("translates block cache_control into prompt_cache_breakpoint for GPT-5.6 on OpenAI", async () => {
		// The GPT-5.6 migration guide's example, including its invalid 24h TTL.
		const call = await captureFailedCall((url) => url.endsWith("/responses"), () => openAIExecute(args(responsesIR({
			model: "openai/gpt-5.6-sol",
			input: [{ role: "user", content: [
				{ type: "input_text", text: "Stable policy document...", cache_control: { type: "ephemeral", ttl: "24h" } },
				{ type: "input_text", text: "Apply the policy to this new customer request." },
			] }],
			prompt_cache_options: { mode: "explicit", ttl: "30m" },
			// The decoded alias, so the assertion below proves the GPT-5.6 deletion rule.
			provider_options: { openai: { prompt_cache_retention: "24h" } },
		}), { providerId: "openai", providerModelSlug: "gpt-5.6-sol", endpoint: "responses", protocol: "openai.responses" })));
		const body = call.bodyJson;
		expect(body.input[0].content[0]).toEqual({ type: "input_text", text: "Stable policy document...", prompt_cache_breakpoint: { mode: "explicit" } });
		expect(body.input[0].content[1]).toEqual({ type: "input_text", text: "Apply the policy to this new customer request." });
		expect(body.prompt_cache_options).toEqual({ mode: "explicit", ttl: "30m" });
		// OpenAI documents prompt_cache_retention for models before GPT-5.6 only.
		expect(body.prompt_cache_retention).toBeUndefined();
	});

	it("keeps only prompt_cache_retention for GPT-5.5 on OpenAI", async () => {
		const call = await captureFailedCall((url) => url.endsWith("/responses"), () => openAIExecute(args(responsesIR({
			model: "openai/gpt-5.5",
			input: [{ role: "user", content: [{ type: "input_text", text: "Stable policy", cache_control: { type: "ephemeral" } }] }],
			prompt_cache_options: { mode: "explicit", ttl: "30m" },
			// Only the provider_options alias is decoded today (top-level is review item G-F8).
			provider_options: { openai: { prompt_cache_retention: "24h" } },
			prompt_cache_key: "tenant-a:session-1",
		}), { providerId: "openai", providerModelSlug: "gpt-5.5", endpoint: "responses", protocol: "openai.responses" })));
		const body = call.bodyJson;
		expect(body.input[0].content[0]).toEqual({ type: "input_text", text: "Stable policy" });
		expect(body.prompt_cache_options).toBeUndefined();
		expect(body.prompt_cache_retention).toBe("24h");
		expect(body.prompt_cache_key).toBe("tenant-a:session-1");
	});

	it("gates Azure on the model, not the deployment name", async () => {
		const call = await captureFailedCall((url) => hasHost(url, "api.azure.example"), () => azureExecute(args(chatIR({
			model: "openai/gpt-5.4",
			messages: [{ role: "user", content: [{ type: "text", text: "Doc", prompt_cache_breakpoint: { mode: "explicit" } }] }],
			prompt_cache_options: { mode: "explicit", ttl: "30m" },
		}), { providerId: "azure", providerModelSlug: "prod-chat-deployment" })));
		expect(call.bodyJson.messages[0].content).toBe("Doc");
		expect(call.bodyJson.prompt_cache_options).toBeUndefined();
	});

	it("strips OpenAI-only and Anthropic-style cache fields for other compatible providers", async () => {
		const call = await captureFailedCall((url) => hasHost(url, "api.cerebras.example"), () => cerebrasExecutor(args(chatIR({
			model: "openai/gpt-oss-120b",
			messages: [
				{ role: "system", content: [{ type: "text", text: "Policy", cache_control: { type: "ephemeral" } }] },
				{ role: "user", content: [{ type: "text", text: "Hello", prompt_cache_breakpoint: { mode: "explicit" } }] },
			],
			prompt_cache_options: { mode: "explicit", ttl: "30m" },
			provider_options: { openai: { prompt_cache_retention: "24h" } },
		}), { providerId: "cerebras", providerModelSlug: "gpt-oss-120b" })));
		const body = call.bodyJson;
		expect(body.messages[0]).toEqual({ role: "system", content: "Policy" });
		expect(body.messages[1]).toEqual({ role: "user", content: "Hello" });
		expect(body.prompt_cache_options).toBeUndefined();
		expect(body.prompt_cache_retention).toBeUndefined();
	});

	it("forwards tool and image cache_control to cache-control upstreams on Chat and Responses", () => {
		const image = "https://example.com/diagram.png";
		const chat = irToOpenAIChat(chatIR({
			model: "anthropic/claude-sonnet-5",
			tools: [{ ...weatherTool, cache_control: { type: "ephemeral" } }],
			messages: [{ role: "user", content: [
				{ type: "image_url", image_url: { url: image }, cache_control: { type: "ephemeral" } },
				{ type: "text", text: "Describe it." },
			] }],
		}), "anthropic/claude-sonnet-5", "openrouter");
		expect(chat.tools[0].cache_control).toEqual({ type: "ephemeral" });
		expect(chat.messages[0].content[0]).toMatchObject({ type: "image_url", cache_control: { type: "ephemeral" } });

		const responses = irToOpenAIResponses(responsesIR({
			model: "anthropic/claude-sonnet-5",
			tools: [{ type: "function", name: "get_weather", parameters: weatherTool.function.parameters, cache_control: { type: "ephemeral" } }],
			input: [{ role: "user", content: [
				{ type: "input_image", image_url: image, cache_control: { type: "ephemeral" } },
				{ type: "input_text", text: "Describe it." },
			] }],
		}), "anthropic/claude-sonnet-5", "openrouter");
		expect(responses.tools[0].cache_control).toEqual({ type: "ephemeral" });
		expect((responses.input ?? responses.input_items)[0].content[0]).toMatchObject({ type: "input_image", cache_control: { type: "ephemeral" } });

		// Upstreams without Anthropic-style marks still get none.
		const cerebras = irToOpenAIChat(chatIR({
			model: "openai/gpt-oss-120b",
			tools: [{ ...weatherTool, cache_control: { type: "ephemeral" } }],
			messages: [{ role: "user", content: "Hi" }],
		}), "gpt-oss-120b", "cerebras");
		expect(cerebras.tools[0].cache_control).toBeUndefined();
	});

	it("keeps cache_control for Alibaba Model Studio's explicit cache", () => {
		const body = irToOpenAIChat(chatIR({
			model: "qwen/qwen3.7-max",
			messages: [
				{ role: "system", content: [{ type: "text", text: "Long policy", cache_control: { type: "ephemeral" } }] },
				{ role: "user", content: "Question" },
			],
		}), "qwen3.7-max", "alibaba-cloud");
		expect(body.messages[0].content).toEqual([{ type: "text", text: "Long policy", cache_control: { type: "ephemeral" } }]);
	});
});

describe("R6: Anthropic metadata", () => {
	it("sends only metadata.user_id", async () => {
		const call = await captureAnthropic(chatIR({
			model: "anthropic/claude-sonnet-5",
			user: "user-7c1f",
			metadata: { trace: "abc" },
			messages: [{ role: "user", content: "Hello" }],
		}));
		expect(call.bodyJson.metadata).toEqual({ user_id: "user-7c1f" });
	});

	it("omits metadata when there is no user id", async () => {
		const call = await captureAnthropic(chatIR({
			model: "anthropic/claude-sonnet-5",
			metadata: { trace: "abc" },
			messages: [{ role: "user", content: "Hello" }],
		}));
		expect(call.bodyJson.metadata).toBeUndefined();
	});
});

describe("A-F8: Anthropic system and developer messages", () => {
	const conversation = {
		messages: [
			{ role: "system", content: "You are terse." },
			{ role: "developer", content: "Answer in British English." },
			{ role: "user", content: "Hi" },
			{ role: "assistant", content: "Hello." },
			{ role: "user", content: "Colour of the sky?" },
			{ role: "system", content: "From now on, answer in one word." },
		],
	};

	it("concatenates leading messages and hoists later ones on Sonnet 5", async () => {
		const call = await captureAnthropic(chatIR({ model: "anthropic/claude-sonnet-5", ...conversation }));
		expect(call.bodyJson.system).toBe("You are terse.\nAnswer in British English.\nFrom now on, answer in one word.");
		expect(call.bodyJson.messages.map((message: any) => message.role)).toEqual(["user", "assistant", "user"]);
	});

	it("keeps a later system message in place on models with mid-conversation system messages", async () => {
		const call = await captureAnthropic(chatIR({ model: "anthropic/claude-opus-5", ...conversation }), "claude-opus-5");
		expect(call.bodyJson.system).toBe("You are terse.\nAnswer in British English.");
		expect(call.bodyJson.messages.at(-1)).toEqual({ role: "system", content: "From now on, answer in one word." });
	});

	it("hoists a later system message whose position Anthropic would reject", async () => {
		const call = await captureAnthropic(chatIR({
			model: "anthropic/claude-opus-5",
			messages: [
				{ role: "user", content: "Hi" },
				{ role: "assistant", content: "Hello." },
				{ role: "system", content: "Be brief." },
				{ role: "user", content: "Why?" },
			],
		}), "claude-opus-5");
		expect(call.bodyJson.system).toBe("Be brief.");
		expect(call.bodyJson.messages.map((message: any) => message.role)).toEqual(["user", "assistant", "user"]);
	});
});

describe("R1: Bedrock Claude on every client protocol", () => {
	it.each([
		["chat.completions", "openai.chat.completions"],
		["responses", "openai.responses"],
	])("sends %s requests for Claude to the Messages API", async (endpoint, protocol) => {
		const mock = installFetchMock([{
			match: (url) => hasHost(url, "api.bedrock.example"),
			response: () => jsonResponse({ id: "msg_bdrk", type: "message", role: "assistant", model: "anthropic.claude-opus-5", content: [{ type: "text", text: "ok" }], stop_reason: "end_turn", usage: { input_tokens: 3, cache_read_input_tokens: 1024, output_tokens: 1 } }),
		}]);
		let result;
		try {
			result = await bedrockExecute(args(chatIR({
				model: "anthropic/claude-opus-5",
				messages: [
					{ role: "system", content: [{ type: "text", text: "Policy", cache_control: { type: "ephemeral", ttl: "1h" } }] },
					{ role: "user", content: "Hello" },
				],
			}), { providerId: "amazon-bedrock", providerModelSlug: "anthropic.claude-opus-5", endpoint: endpoint as any, protocol: protocol as any }));
		} finally {
			mock.restore();
		}
		expect(mock.calls[0]!.url).toBe("https://api.bedrock.example/anthropic/v1/messages");
		expect(mock.calls[0]!.bodyJson.system[0].cache_control).toEqual({ type: "ephemeral", ttl: "1h" });
		expect(result?.bill.usage).toMatchObject({ cached_read_text_tokens: 1024 });
	});
});

describe("R2: Gemini tool-call history", () => {
	const toolLoop = {
		tools: [weatherTool],
		messages: [
			{ role: "user", content: "Weather in Paris and Rome?" },
			{ role: "assistant", tool_calls: [
				{ id: "call_paris", type: "function", function: { name: "get_weather", arguments: "{\"city\":\"Paris\"}" } },
				{ id: "call_rome", type: "function", function: { name: "get_weather", arguments: "{\"city\":\"Rome\"}" } },
			] },
			{ role: "tool", tool_call_id: "call_paris", content: "{\"temp_c\":18}" },
			{ role: "tool", tool_call_id: "call_rome", content: "{\"temp_c\":24}" },
		],
	};

	it("sends functionCall parts and paired functionResponse parts on Vertex", async () => {
		const mock = installFetchMock([{
			match: (url) => url.includes("/publishers/google/models/gemini-3.6-flash:"),
			response: () => jsonResponse({ candidates: [{ content: { role: "model", parts: [{ text: "Paris 18°C, Rome 24°C." }] }, finishReason: "STOP" }], usageMetadata: { promptTokenCount: 40, candidatesTokenCount: 8, totalTokenCount: 48 } }),
		}]);
		try {
			await vertexExecute(args(chatIR({ model: "google/gemini-3.6-flash", ...toolLoop }), { providerId: "google-vertex", providerModelSlug: "gemini-3.6-flash" }));
		} finally {
			mock.restore();
		}
		const contents = mock.calls[0]!.bodyJson.contents;
		expect(contents).toHaveLength(3);
		expect(contents[1]).toEqual({
			role: "model",
			parts: [
				{ functionCall: { id: "call_paris", name: "get_weather", args: { city: "Paris" } }, thoughtSignature: GEMINI_SKIP_THOUGHT_SIGNATURE },
				{ functionCall: { id: "call_rome", name: "get_weather", args: { city: "Rome" } } },
			],
		});
		// Same-name parallel calls are paired by id, not by order.
		expect(contents[2]).toEqual({
			role: "user",
			parts: [
				{ functionResponse: { id: "call_paris", name: "get_weather", response: { temp_c: 18 } } },
				{ functionResponse: { id: "call_rome", name: "get_weather", response: { temp_c: 24 } } },
			],
		});
	});

	it("sends functionCall parts on the AI Studio generateContent fallback", async () => {
		const mock = installFetchMock([{
			match: (url) => url.endsWith("/v1beta/models/gemma-3-27b-it:generateContent"),
			response: () => jsonResponse({ candidates: [{ content: { role: "model", parts: [{ text: "Done." }] }, finishReason: "STOP" }], usageMetadata: { promptTokenCount: 30, candidatesTokenCount: 2, totalTokenCount: 32 } }),
		}]);
		try {
			await aiStudioExecutor(args(chatIR({ model: "google/gemma-3-27b:free", ...toolLoop }), { providerId: "google-ai-studio", providerModelSlug: "gemma-3-27b-it", endpoint: "responses", protocol: "openai.responses" }));
		} finally {
			mock.restore();
		}
		const contents = mock.calls[0]!.bodyJson.contents;
		expect(contents[1].role).toBe("model");
		// Gemma has no thought-signature validator, so no placeholder is added.
		expect(contents[1].parts).toEqual([
			{ functionCall: { id: "call_paris", name: "get_weather", args: { city: "Paris" } } },
			{ functionCall: { id: "call_rome", name: "get_weather", args: { city: "Rome" } } },
		]);
		expect(contents[2].parts).toHaveLength(2);
	});

	it("replays a real signature from the IR instead of the placeholder", () => {
		expect(irToolCallsToGeminiParts([
			{ id: "get_weather", name: "get_weather", arguments: "{}", thoughtSignature: "CtUBAdHtim9..." },
		], "gemini-3.1-pro-preview")).toEqual([
			{ functionCall: { name: "get_weather", args: {} }, thoughtSignature: "CtUBAdHtim9..." },
		]);
	});
});

describe("R7: cache and identity hints never constrain routing", () => {
	it("keeps providers whose profiles reject prompt_cache_key", () => {
		const rawBody = {
			model: "meta-llama/llama-4-maverick",
			messages: [{ role: "user", content: "Hello" }],
			prompt_cache_key: "session-42",
			safety_identifier: "user-hash",
			user: "user-1",
			provider: { require_parameters: true },
		};
		const result = validateCapabilities({
			endpoint: "chat.completions",
			rawBody,
			body: rawBody,
			requestId: "req_hints",
			workspaceId: "ws_hints",
			model: rawBody.model,
			providers: [
				{ providerId: "sambanova", capabilityParams: { max_tokens: {} }, maxOutputTokens: null },
				{ providerId: "cerebras", capabilityParams: { max_tokens: {}, prompt_cache_key: {} }, maxOutputTokens: null },
			] as any,
		});
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.providers.map((provider) => provider.providerId)).toEqual(["sambanova", "cerebras"]);
			expect(result.requestedParams).toEqual([]);
		}
	});

	it.each(["perplexity", "reflection", "tensorix", "sambanova", "scaleway"])("strips rejected hints from the %s request body", (providerId) => {
		const body = irToOpenAIChat(chatIR({
			model: "test/model",
			messages: [{ role: "user", content: "Hello" }],
			prompt_cache_key: "session-42",
		}), "model", providerId);
		expect(body.prompt_cache_key).toBeUndefined();
	});
});

describe("R8: production capability params never filter the request", () => {
	it("forwards tools and prompt_cache_key on an IonRouter route whose catalogue lists three params", async () => {
		const call = await captureFailedCall((url) => hasHost(url, "api.ionrouter.example"), () => ionRouterExecutor(args(chatIR({
			model: "z-ai/glm-5",
			tools: [weatherTool],
			messages: [{ role: "user", content: "Weather in Paris?" }],
			prompt_cache_key: "session-42",
		}), {
			providerId: "ionrouter",
			providerModelSlug: "glm-5",
			// The keyed record routing builds from the catalogue's param list.
			capabilityParams: { max_tokens: {}, temperature: {}, top_p: {} },
		})));
		expect(call.bodyJson.tools?.[0]?.function?.name).toBe("get_weather");
		expect(call.bodyJson.prompt_cache_key).toBe("session-42");
	});
});

describe("R9: stream_options and stateful Responses params", () => {
	// Upstage: "A streaming response carries no usage statistics by default, so token counts are
	// unavailable unless this is set" (https://console.upstage.ai/api/chat).
	it("sends stream_options to Upstage so streamed usage can be billed", async () => {
		teardownTestRuntime();
		setupRuntimeFromEnv({ UPSTAGE_API_KEY: "upstage-test" } as any);
		const mock = installFetchMock([{
			match: (url) => url === "https://api.upstage.ai/v1/chat/completions",
			response: () => sseResponse([
				{ id: "c1", object: "chat.completion.chunk", created: 1, model: "solar-pro4", choices: [{ index: 0, delta: { content: "hi" }, finish_reason: "stop" }], usage: { prompt_tokens: 5, completion_tokens: 1, total_tokens: 6 } },
				"[DONE]",
			]),
		}]);
		try {
			await upstageExecutor(args(chatIR({
				model: "upstage/solar-pro-4",
				stream: true,
				stream_options: { include_usage: true },
				messages: [{ role: "user", content: "Hello" }],
			}), { providerId: "upstage", providerModelSlug: "solar-pro4" }));
		} finally {
			mock.restore();
			teardownTestRuntime();
			setupTestRuntime();
		}
		expect(mock.calls[0]!.bodyJson.stream).toBe(true);
		expect(mock.calls[0]!.bodyJson.stream_options).toEqual({ include_usage: true });
	});

	it("does not add stream_options for providers whose profile rejects it", () => {
		// Mistral's schema has no stream_options (https://docs.mistral.ai/openapi.yaml).
		expect(providerAcceptsStreamOptions("mistral")).toBe(false);
	});

	it.each([
		["previous_response_id", "resp_68af4030592c81938ec0a5fbab4a3e9f"],
		["conversation", "conv_689667905b048191b4740501625afd94"],
	])("rejects %s on /v1/responses before routing", async (param, value) => {
		const rawBody = { model: "openai/gpt-5.5", input: "Continue", [param]: value };
		const result = validateCapabilities({
			endpoint: "responses",
			rawBody,
			body: rawBody,
			requestId: "req_stateful",
			workspaceId: "ws_stateful",
			model: rawBody.model,
			providers: [{ providerId: "openai", capabilityParams: { max_tokens: {} }, maxOutputTokens: null }] as any,
		});
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.response.status).toBe(400);
			const text = await result.response.text();
			expect(text).toContain("unsupported_param");
			expect(text).toContain(param);
		}
	});
});

describe("A-F10 and H6: prefix stability", () => {
	it("derives the same call_id for a function call item without one", () => {
		const body = {
			model: "openai/gpt-5.5",
			input: [
				{ role: "user", content: "Weather in Paris?" },
				{ type: "function_call", name: "get_weather", arguments: "{\"city\":\"Paris\"}" },
			],
		};
		const first = (responsesIR(body).messages[1] as any).toolCalls[0].id;
		const second = (responsesIR(body).messages[1] as any).toolCalls[0].id;
		expect(first).toMatch(/^call_[0-9a-f]{8}$/);
		expect(second).toBe(first);
		const other = (responsesIR({ ...body, input: [body.input[0], { ...body.input[1], arguments: "{\"city\":\"Rome\"}" }] }).messages[1] as any).toolCalls[0].id;
		expect(other).not.toBe(first);
	});

	it("keeps array system content as parts when a preset prompt is merged", () => {
		const preset = { id: "p1", name: "Support", slug: null, description: null, visibility: "team", config: { systemPrompt: "Company tone guide." } } as any;
		const merged = mergePresetWithBody({
			model: "anthropic/claude-sonnet-5",
			messages: [
				{ role: "system", content: [{ type: "text", text: "Long policy", cache_control: { type: "ephemeral" } }] },
				{ role: "user", content: "Hi" },
			],
		}, preset);
		expect(merged.messages[0].content).toEqual([
			{ type: "text", text: "Company tone guide.\n\n" },
			{ type: "text", text: "Long policy", cache_control: { type: "ephemeral" } },
		]);
		const anthropicStyle = mergePresetWithBody({
			model: "anthropic/claude-sonnet-5",
			system: [{ type: "text", text: "Long policy", cache_control: { type: "ephemeral" } }],
		}, preset);
		expect(anthropicStyle.system).toEqual([
			{ type: "text", text: "Company tone guide.\n\n" },
			{ type: "text", text: "Long policy", cache_control: { type: "ephemeral" } },
		]);
	});

	it("keeps the client's tool_choice on server-tool follow-ups unless it forces a call", () => {
		expect(serverToolFollowUpToolChoice(undefined)).toBeUndefined();
		expect(serverToolFollowUpToolChoice("auto")).toBe("auto");
		expect(serverToolFollowUpToolChoice("none")).toBe("none");
		expect(serverToolFollowUpToolChoice("required")).toBe("auto");
		expect(serverToolFollowUpToolChoice({ name: "web_search" })).toBe("auto");
	});
});
