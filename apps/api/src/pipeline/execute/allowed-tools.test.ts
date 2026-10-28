import { describe, expect, it } from "vitest";
import { decodeOpenAIChatRequest } from "@protocols/openai-chat/decode";
import { decodeOpenAIResponsesRequest } from "@protocols/openai-responses/decode";
import { irToAnthropicMessages } from "@executors/anthropic/text-generate";
import { irToOpenAIChat } from "@executors/_shared/text-generate/openai-compat/transform-chat";
import { irToOpenAIResponses } from "@executors/_shared/text-generate/openai-compat/transform";
import { normalizeIRForProvider } from "./normalize";

// Three tools are defined; the allowed_tools choice permits two of them.
const chatTools = ["get_weather", "search", "delete_account"].map((name) => ({
	type: "function",
	function: { name, parameters: { type: "object", properties: {} } },
}));
const responsesTools = ["get_weather", "search", "delete_account"].map((name) => ({
	type: "function",
	name,
	parameters: { type: "object", properties: {} },
}));

function chatRequest(mode: "auto" | "required") {
	return {
		model: "claude-sonnet-4-5",
		messages: [{ role: "user", content: "What's the weather?" }],
		tools: chatTools,
		tool_choice: {
			type: "allowed_tools",
			allowed_tools: {
				mode,
				tools: [
					{ type: "function", function: { name: "get_weather" } },
					{ type: "function", function: { name: "search" } },
				],
			},
		},
	} as any;
}

function responsesRequest(mode: "auto" | "required") {
	return {
		model: "claude-sonnet-4-5",
		input: "What's the weather?",
		tools: responsesTools,
		tool_choice: {
			type: "allowed_tools",
			mode,
			tools: [
				{ type: "function", name: "get_weather" },
				{ type: "function", name: "search" },
			],
		},
	} as any;
}

const toolNames = (tools: any[] | undefined) =>
	(tools ?? []).map((tool) => tool.name ?? tool.function?.name);

describe("allowed_tools with a proper subset of the defined tools", () => {
	for (const mode of ["auto", "required"] as const) {
		const anthropicChoice = mode === "auto" ? { type: "auto" } : { type: "any" };

		it(`sends Claude only the allowed tools from a Chat request (${mode})`, () => {
			const ir = normalizeIRForProvider(decodeOpenAIChatRequest(chatRequest(mode)), "anthropic", "openai.chat.completions");
			const request = irToAnthropicMessages(ir, 8192, "claude-sonnet-4-5", { providerId: "anthropic" });
			expect(toolNames(request.tools)).toEqual(["get_weather", "search"]);
			expect(request.tool_choice).toEqual(anthropicChoice);
		});

		it(`sends Claude only the allowed tools from a Responses request (${mode})`, () => {
			const ir = normalizeIRForProvider(decodeOpenAIResponsesRequest(responsesRequest(mode)), "anthropic", "openai.responses");
			const request = irToAnthropicMessages(ir, 8192, "claude-sonnet-4-5", { providerId: "anthropic" });
			expect(toolNames(request.tools)).toEqual(["get_weather", "search"]);
			expect(request.tool_choice).toEqual(anthropicChoice);
		});

		it(`sends other Chat providers only the allowed tools (${mode})`, () => {
			const ir = normalizeIRForProvider(decodeOpenAIChatRequest(chatRequest(mode)), "groq", "openai.chat.completions");
			const request = irToOpenAIChat(ir, "llama", "groq");
			expect(toolNames(request.tools)).toEqual(["get_weather", "search"]);
			expect(request.tool_choice).toBe(mode);
		});

		it(`sends OpenAI Chat the original choice and every tool (${mode})`, () => {
			const body = chatRequest(mode);
			const ir = normalizeIRForProvider(decodeOpenAIChatRequest(body), "openai", "openai.chat.completions");
			expect(ir).not.toHaveProperty("allowedToolNames");
			const request = irToOpenAIChat(ir, "gpt-5", "openai");
			expect(request.tools).toHaveLength(3);
			expect(toolNames(request.tools)).toEqual(["get_weather", "search", "delete_account"]);
			expect(request.tool_choice).toEqual(body.tool_choice);
		});

		it(`sends OpenAI Responses the original choice and every tool (${mode})`, () => {
			const body = responsesRequest(mode);
			const ir = normalizeIRForProvider(decodeOpenAIResponsesRequest(body), "openai", "openai.responses");
			const request = irToOpenAIResponses(ir, "gpt-5", "openai");
			expect(toolNames(request.tools)).toEqual(["get_weather", "search", "delete_account"]);
			expect(request.tool_choice).toEqual(body.tool_choice);
		});
	}

	it("forces the one allowed tool on Claude when required allows one, and sends only it", () => {
		const body = chatRequest("required");
		body.tool_choice.allowed_tools.tools = [{ type: "function", function: { name: "search" } }];
		const ir = normalizeIRForProvider(decodeOpenAIChatRequest(body), "anthropic", "openai.chat.completions");
		const request = irToAnthropicMessages(ir, 8192, "claude-sonnet-4-5", { providerId: "anthropic" });
		expect(toolNames(request.tools)).toEqual(["search"]);
		expect(request.tool_choice).toEqual({ type: "tool", name: "search" });
	});

	it("leaves the tools alone when no allowed_tools choice is set", () => {
		const body = { ...chatRequest("auto"), tool_choice: "auto" };
		const ir = normalizeIRForProvider(decodeOpenAIChatRequest(body), "anthropic", "openai.chat.completions");
		expect(toolNames(ir.tools)).toEqual(["get_weather", "search", "delete_account"]);
	});
});
