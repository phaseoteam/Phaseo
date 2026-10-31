import { test, expect } from "vitest";
import { readLogReplay } from "@/lib/chat/logReplay";

const IMAGE = "data:image/png;base64,iVBORw0KGgo=";

test("reads a Chat Completions request with tools, results and the logged response", () => {
	const replay = readLogReplay({
		endpoint: "chat.completions",
		model: "openai/gpt-5-mini",
		requestPayload: {
			model: "openai/gpt-5-mini",
			temperature: 0.2,
			max_completion_tokens: 512,
			reasoning_effort: "low",
			messages: [
				{ role: "system", content: "Be brief." },
				{ role: "user", content: [{ type: "text", text: "What's in this?" }, { type: "image_url", image_url: { url: IMAGE } }] },
				{ role: "assistant", content: null, tool_calls: [{ id: "call_1", type: "function", function: { name: "lookup", arguments: "{\"q\":\"cat\"}" } }] },
				{ role: "tool", tool_call_id: "call_1", content: "A cat" },
			],
			tools: [
				{ type: "function", function: { name: "lookup", description: "Search", parameters: { type: "object" } } },
				{ type: "phaseo:web_search" },
			],
		},
		gatewayResponse: {
			object: "chat.completion",
			choices: [{ index: 0, message: { role: "assistant", content: "It's a cat.", reasoning_content: "Looked it up." } }],
		},
	});

	expect(replay).toEqual({
		endpoint: "chat.completions",
		model: "openai/gpt-5-mini",
		systemPrompt: "Be brief.",
		turns: [
			{ role: "user", parts: [{ type: "text", text: "What's in this?" }, { type: "image", url: IMAGE }] },
			{ role: "assistant", text: "", reasoning: "", toolCalls: [{ id: "call_1", name: "lookup", arguments: "{\"q\":\"cat\"}" }] },
			{ role: "tool", callId: "call_1", output: "A cat" },
			{ role: "assistant", text: "It's a cat.", reasoning: "Looked it up.", toolCalls: [] },
		],
		requestTurnCount: 3,
		params: { temperature: 0.2, maxOutputTokens: 512, reasoningEffort: "low", reasoningEnabled: true },
		functionTools: [{ name: "lookup", description: "Search", parameters: { type: "object" } }],
		serverTools: ["phaseo:web_search"],
		warnings: [],
	});
});

test("reads Responses input items and output, and flags history kept by ID", () => {
	const replay = readLogReplay({
		endpoint: "responses",
		requestPayload: {
			model: "anthropic/claude-sonnet-5-5",
			instructions: "You are helpful.",
			previous_response_id: "resp_0",
			input: [
				{ role: "user", content: [{ type: "input_text", text: "Weather?" }] },
				{ type: "reasoning", summary: [{ type: "summary_text", text: "Need a tool." }] },
				{ type: "function_call", call_id: "fc_1", name: "weather", arguments: "{}" },
				{ type: "function_call_output", call_id: "fc_1", output: "Sunny" },
			],
			tools: [{ type: "function", name: "weather", parameters: { type: "object", properties: {} } }],
		},
		gatewayResponse: {
			object: "response",
			status: "completed",
			output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "It's sunny." }] }],
		},
	});

	expect(replay?.systemPrompt).toBe("You are helpful.");
	expect(replay?.turns).toEqual([
		{ role: "user", parts: [{ type: "text", text: "Weather?" }] },
		{ role: "assistant", text: "", reasoning: "Need a tool.", toolCalls: [{ id: "fc_1", name: "weather", arguments: "{}" }] },
		{ role: "tool", callId: "fc_1", output: "Sunny" },
		{ role: "assistant", text: "It's sunny.", reasoning: "", toolCalls: [] },
	]);
	expect(replay?.functionTools).toEqual([{ name: "weather", parameters: { type: "object", properties: {} } }]);
	expect(replay?.warnings).toEqual(["earlier_history_missing"]);
});

test("reads Messages requests with base64 images, thinking and tool results", () => {
	const replay = readLogReplay({
		endpoint: "messages",
		requestPayload: {
			model: "anthropic/claude-haiku-5-5",
			system: [{ type: "text", text: "Answer in French." }],
			thinking: { type: "enabled", budget_tokens: 1024 },
			messages: [
				{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: "image/jpeg", data: "AAAA" } }, { type: "text", text: "Describe" }] },
				{ role: "assistant", content: [{ type: "thinking", thinking: "Hmm", signature: "sig" }, { type: "tool_use", id: "tu_1", name: "zoom", input: { level: 2 } }] },
				{ role: "user", content: [{ type: "tool_result", tool_use_id: "tu_1", content: [{ type: "text", text: "zoomed" }] }] },
			],
			tools: [
				{ name: "zoom", input_schema: { type: "object" } },
				{ type: "web_search_20250305", name: "web_search" },
			],
		},
		gatewayResponse: { type: "message", role: "assistant", content: [{ type: "text", text: "Un chat." }] },
	});

	expect(replay?.systemPrompt).toBe("Answer in French.");
	expect(replay?.turns).toEqual([
		{ role: "user", parts: [{ type: "image", url: "data:image/jpeg;base64,AAAA" }, { type: "text", text: "Describe" }] },
		{ role: "assistant", text: "", reasoning: "Hmm", toolCalls: [{ id: "tu_1", name: "zoom", arguments: "{\"level\":2}" }] },
		{ role: "tool", callId: "tu_1", output: "zoomed" },
		{ role: "assistant", text: "Un chat.", reasoning: "", toolCalls: [] },
	]);
	expect(replay?.params).toEqual({ reasoningEnabled: true });
	expect(replay?.functionTools).toEqual([{ name: "zoom", parameters: { type: "object" } }]);
});

test("warns when the logged response is only a stream chunk or calls are unanswered", () => {
	const replay = readLogReplay({
		endpoint: "chat.completions",
		requestPayload: {
			messages: [
				{ role: "user", content: "Hi" },
				{ role: "assistant", content: "", tool_calls: [{ id: "c", function: { name: "f", arguments: "{}" } }] },
			],
		},
		gatewayResponse: { object: "chat.completion.chunk", choices: [{ index: 0, delta: {}, finish_reason: "stop" }] },
	});

	expect(replay?.requestTurnCount).toBe(2);
	expect(replay?.turns).toHaveLength(2);
	expect(replay?.warnings).toEqual(["no_response", "unanswered_tool_calls"]);
});

test("returns null for endpoints Chat can't continue", () => {
	expect(readLogReplay({ endpoint: "embeddings", requestPayload: { input: "x" } })).toBeNull();
	expect(readLogReplay({ endpoint: "responses", requestPayload: null })).toBeNull();
});

test("keeps Responses custom tool calls and definitions as custom", () => {
	const replay = readLogReplay({
		endpoint: "responses",
		requestPayload: {
			input: [
				{ role: "user", content: "Patch it" },
				{ type: "custom_tool_call", call_id: "ct_1", name: "apply_patch", input: "*** Begin Patch" },
				{ type: "custom_tool_call_output", call_id: "ct_1", output: "ok" },
			],
			tools: [{ type: "custom", name: "apply_patch", description: "Edit files", format: { type: "grammar", syntax: "lark", definition: "start: /.+/" } }],
		},
	});

	expect(replay?.turns[1]).toEqual({ role: "assistant", text: "", reasoning: "", toolCalls: [{ id: "ct_1", name: "apply_patch", arguments: "*** Begin Patch", kind: "custom" }] });
	expect(replay?.functionTools).toEqual([
		{ name: "apply_patch", kind: "custom", description: "Edit files", format: { type: "grammar", syntax: "lark", definition: "start: /.+/" } },
	]);
});

test("keeps the logged response in its own turn after an assistant prefill", () => {
	const replay = readLogReplay({
		endpoint: "messages",
		model: "anthropic/claude-sonnet-5-5",
		requestPayload: {
			model: "anthropic/claude-sonnet-5-5",
			max_tokens: 100,
			messages: [
				{ role: "user", content: "Name a colour." },
				{ role: "assistant", content: "The colour is" },
			],
		},
		gatewayResponse: { type: "message", role: "assistant", content: [{ type: "text", text: " blue." }], stop_reason: "end_turn" },
	});

	expect(replay?.requestTurnCount).toBe(2);
	expect(replay?.turns.map((turn) => turn.role === "assistant" ? turn.text : turn.role)).toEqual(["user", "The colour is", " blue."]);
	expect(replay?.warnings).not.toContain("no_response");
});
