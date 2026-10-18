// Request hygiene for OpenAI-compatible upstreams: the documented `input`
// field on every Responses API, tool results as content parts or plain text
// (never a JSON string of the parts), participant names only where the
// provider's schema has them, and no stream_options where it is undefined.
import { describe, expect, it } from "vitest";
import type { IRChatRequest } from "@core/ir";
import { ChatCompletionsSchema } from "@core/schemas";
import { decodeOpenAIChatRequest } from "@protocols/openai-chat/decode";
import { decodeOpenAIResponsesRequest } from "@protocols/openai-responses/decode";
import { irToOpenAIResponses } from "../transform";
import { irToOpenAIChat } from "../transform-chat";
import { providerAcceptsStreamOptions } from "../prompt-cache-policy";

const weatherTool = { name: "get_weather", description: "Weather", parameters: { type: "object", properties: { city: { type: "string" } } } };

function baseIR(overrides: Partial<IRChatRequest> = {}): IRChatRequest {
	return {
		model: "lab/model",
		stream: true,
		messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
		...overrides,
	} as IRChatRequest;
}

function chatAgentIR(): IRChatRequest {
	return decodeOpenAIChatRequest({
		model: "lab/model",
		messages: [
			{ role: "user", content: "Weather?", name: "alice" },
			{ role: "assistant", content: null, tool_calls: [{ id: "call_1", type: "function", function: { name: "get_weather", arguments: "{}" } }] },
			{ role: "tool", tool_call_id: "call_1", content: [{ type: "text", text: "18C " }, { type: "text", text: "and clear" }] },
		],
	} as any);
}

describe("Responses requests use the documented input field", () => {
	it.each(["sambanova", "scaleway", "ambient", "baidu", "alibaba-cloud", "openai"])("sends input, not input_items, to %s", (providerId) => {
		const request = irToOpenAIResponses(baseIR(), "model-slug", providerId);
		expect(request.input).toEqual([{ type: "message", role: "user", content: [{ type: "input_text", text: "hi" }] }]);
		expect(request).not.toHaveProperty("input_items");
	});

	it.each(["sambanova", "scaleway", "ambient"])("sends %s flat Responses function tools and text.format", (providerId) => {
		const request = irToOpenAIResponses(baseIR({
			tools: [weatherTool],
			toolChoice: { name: "get_weather" },
			responseFormat: { type: "json_object" },
		}), "model-slug", providerId);
		expect(request.tools[0]).toMatchObject({ type: "function", name: "get_weather" });
		expect(request.tools[0]).not.toHaveProperty("function");
		expect(request.tool_choice).toEqual({ type: "function", name: "get_weather" });
		expect(request.text).toEqual({ format: { type: "json_object" } });
		expect(request).not.toHaveProperty("response_format");
	});

	it("runs Baidu's Responses thinking mapping now that the body has input", () => {
		const request = irToOpenAIResponses(baseIR({ reasoning: { effort: "high" } }), "ernie-5.0", "baidu");
		expect(request.thinking).toEqual({ type: "enabled" });
	});
});

describe("array tool results", () => {
	it("keeps text parts as an array for providers whose chat schema accepts one", () => {
		const request = irToOpenAIChat(chatAgentIR(), "gpt-5.4", "openai");
		const tool = request.messages.find((message: any) => message.role === "tool");
		expect(tool.content).toEqual([{ type: "text", text: "18C " }, { type: "text", text: "and clear" }]);
	});

	it("joins the text parts for providers whose tool content is a string", () => {
		const request = irToOpenAIChat(chatAgentIR(), "meta-llama/Llama-3.3-70B", "together");
		const tool = request.messages.find((message: any) => message.role === "tool");
		expect(tool.content).toBe("18C and clear");
	});

	it("never sends a JSON string of the parts, even with an image part", () => {
		const ir = decodeOpenAIResponsesRequest({
			model: "lab/model",
			input: [
				{ type: "function_call", call_id: "call_1", name: "get_weather", arguments: "{}" },
				{
					type: "function_call_output",
					call_id: "call_1",
					output: [
						{ type: "input_text", text: "search hit" },
						{ type: "input_image", image_url: "https://example.com/a.png" },
					],
				},
			],
		} as any);
		const toolResult = (ir.messages.find((message) => message.role === "tool") as any).toolResults[0];
		expect(toolResult.content).toBe("search hit");
		expect(toolResult.parts).toHaveLength(2);

		const openai = irToOpenAIResponses(ir, "gpt-5.4", "openai");
		const openaiOutput = openai.input.find((item: any) => item.type === "function_call_output").output;
		expect(openaiOutput).toEqual([
			{ type: "input_text", text: "search hit" },
			expect.objectContaining({ type: "input_image", image_url: "https://example.com/a.png" }),
		]);

		const sambanova = irToOpenAIResponses(ir, "gpt-oss-120b", "sambanova");
		expect(sambanova.input.find((item: any) => item.type === "function_call_output").output).toBe("search hit");

		const chat = irToOpenAIChat(ir, "llama", "together");
		expect(chat.messages.find((message: any) => message.role === "tool").content).toBe("search hit");
	});

	it("keeps a string tool result a string", () => {
		const ir = decodeOpenAIChatRequest({
			model: "lab/model",
			messages: [
				{ role: "assistant", content: null, tool_calls: [{ id: "call_1", type: "function", function: { name: "f", arguments: "{}" } }] },
				{ role: "tool", tool_call_id: "call_1", content: "plain" },
			],
		} as any);
		const request = irToOpenAIChat(ir, "gpt-5.4", "openai");
		expect(request.messages.find((message: any) => message.role === "tool").content).toBe("plain");
	});
});

describe("message names", () => {
	it.each(["openai", "deepseek", "together"])("forwards a participant name to %s, whose schema defines it", (providerId) => {
		const request = irToOpenAIChat(chatAgentIR(), "model", providerId);
		expect(request.messages[0]).toMatchObject({ role: "user", name: "alice" });
	});

	it.each(["mistral", "sambanova", "groq"])("leaves the name out for %s, whose schema does not take it", (providerId) => {
		const request = irToOpenAIChat(chatAgentIR(), "model", providerId);
		expect(request.messages[0]).not.toHaveProperty("name");
	});
});

describe("fields the client did not send", () => {
	it("decodes no parallel_tool_calls, logprobs or null safety_identifier when the client sent none", () => {
		const chat = decodeOpenAIChatRequest({ model: "lab/model", messages: [{ role: "user", content: "hi" }] } as any);
		expect(chat.parallelToolCalls).toBeUndefined();
		expect(chat.logprobs).toBeUndefined();
		const responses = decodeOpenAIResponsesRequest({ model: "lab/model", input: "hi", safety_identifier: null } as any);
		expect(responses.safetyIdentifier).toBeUndefined();
		const request = irToOpenAIResponses(responses, "model", "ambient");
		expect(request).not.toHaveProperty("safety_identifier");
	});

	it("adds no parallel_tool_calls or logprobs defaults when parsing a Chat request", () => {
		const parsed = ChatCompletionsSchema.parse({ model: "lab/model", messages: [{ role: "user", content: "hi" }] });
		expect(parsed).not.toHaveProperty("parallel_tool_calls");
		expect(parsed).not.toHaveProperty("logprobs");
		const request = irToOpenAIChat(decodeOpenAIChatRequest(parsed as any), "model", "baidu");
		expect(request).not.toHaveProperty("parallel_tool_calls");
		expect(request).not.toHaveProperty("logprobs");
	});

	it.each(["mistral", "mistral-eu", "together"])("does not add stream_options for %s", (providerId) => {
		expect(providerAcceptsStreamOptions(providerId)).toBe(false);
	});

	it("still adds stream_options where the provider's API defines it", () => {
		expect(providerAcceptsStreamOptions("openai")).toBe(true);
		expect(providerAcceptsStreamOptions("deepinfra")).toBe(true);
	});
});
