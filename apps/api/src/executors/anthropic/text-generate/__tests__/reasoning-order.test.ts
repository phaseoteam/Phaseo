// Claude's thinking blocks must go back in the order Claude wrote them: each
// signature records everything before it, including earlier blocks in the same
// turn (https://platform.claude.com/docs/en/build-with-claude/preserved-thinking).
// A reply that thinks between parallel tool calls must survive every surface.
import { beforeEach, describe, expect, it } from "vitest";
import { decodeOpenAIChatRequest } from "@protocols/openai-chat/decode";
import { decodeOpenAIResponsesRequest } from "@protocols/openai-responses/decode";
import { decodeAnthropicMessagesRequest } from "@protocols/anthropic-messages/decode";
import { encodeOpenAIChatResponse } from "@protocols/openai-chat/encode";
import { encodeOpenAIResponsesResponse } from "@protocols/openai-responses/encode";
import { encodeAnthropicMessagesResponse } from "@protocols/anthropic-messages/encode";
import { anthropicMessagesToIR, irToAnthropicMessages } from "../index";
import { createAnthropicToResponsesStreamTransformer } from "../stream-transformer";
import { resolveStreamForProtocol } from "@executors/_shared/text-generate/openai-compat";

const MODEL = "claude-opus-5-5";
const GATEWAY_MODEL = "anthropic/claude-opus-5.5";

// Each shape is a reply Claude can write; the blocks must go back in this order.
const SHAPES: Record<string, any[]> = {
	"thinking between parallel tool calls": [
		{ type: "thinking", thinking: "Check both shelves.", signature: "sig-a" },
		{ type: "text", text: "Looking both up." },
		{ type: "tool_use", id: "toolu_x", name: "lookup", input: { shelf: "A1" } },
		{ type: "thinking", thinking: "", signature: "sig-b" },
		{ type: "tool_use", id: "toolu_y", name: "lookup", input: { shelf: "B2" } },
		{ type: "redacted_thinking", data: "redacted-c" },
		{ type: "tool_use", id: "toolu_z", name: "lookup", input: { shelf: "C3" } },
	],
	"thinking after text, before the first tool call": [
		{ type: "thinking", thinking: "Plan.", signature: "sig-a" },
		{ type: "text", text: "Let me check." },
		{ type: "thinking", thinking: "Now the tool.", signature: "sig-b" },
		{ type: "tool_use", id: "toolu_x", name: "lookup", input: { shelf: "A1" } },
		{ type: "tool_use", id: "toolu_y", name: "lookup", input: { shelf: "B2" } },
		{ type: "tool_use", id: "toolu_z", name: "lookup", input: { shelf: "C3" } },
	],
};
let original: any[] = [];

const tools = [{ type: "function", function: { name: "lookup", parameters: { type: "object", properties: { shelf: { type: "string" } } } } }];

function claudeReply() {
	return anthropicMessagesToIR(
		{ id: "msg_1", type: "message", role: "assistant", model: MODEL, content: original, stop_reason: "tool_use", usage: { input_tokens: 10, output_tokens: 10 } },
		"req_1",
		GATEWAY_MODEL,
		"anthropic",
	);
}

function replayedAssistant(ir: any) {
	const payload = irToAnthropicMessages(ir, null, MODEL, { providerId: "anthropic" });
	return payload.messages.find((message: any) => message.role === "assistant");
}

const results = (ids: string[]) => ids.map((id) => ({ id, out: `${id}: 4 crates` }));

// The same reply as an Anthropic event stream.
function claudeStream(): ReadableStream<Uint8Array> {
	const events: any[] = [{ type: "message_start", message: { id: "msg_1", type: "message", role: "assistant", model: MODEL, content: [], usage: { input_tokens: 10, output_tokens: 0 } } }];
	original.forEach((block: any, index) => {
		if (block.type === "thinking") {
			events.push({ type: "content_block_start", index, content_block: { type: "thinking", thinking: "" } });
			if (block.thinking) events.push({ type: "content_block_delta", index, delta: { type: "thinking_delta", thinking: block.thinking } });
			events.push({ type: "content_block_delta", index, delta: { type: "signature_delta", signature: block.signature } });
		} else if (block.type === "redacted_thinking") {
			events.push({ type: "content_block_start", index, content_block: block });
		} else if (block.type === "text") {
			events.push({ type: "content_block_start", index, content_block: { type: "text", text: "" } });
			events.push({ type: "content_block_delta", index, delta: { type: "text_delta", text: block.text } });
		} else {
			events.push({ type: "content_block_start", index, content_block: { type: "tool_use", id: block.id, name: block.name, input: {} } });
			events.push({ type: "content_block_delta", index, delta: { type: "input_json_delta", partial_json: JSON.stringify(block.input) } });
		}
		events.push({ type: "content_block_stop", index });
	});
	events.push({ type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 10 } }, { type: "message_stop" });
	return new Response(events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join("")).body!;
}

async function clientFrames(protocol: "openai.chat.completions" | "openai.responses") {
	const responsesStream = claudeStream().pipeThrough(createAnthropicToResponsesStreamTransformer("req_1", MODEL, { providerId: "anthropic" }));
	const stream = resolveStreamForProtocol(
		new Response(responsesStream, { headers: { "Content-Type": "text/event-stream" } }),
		{ ir: { messages: [], model: MODEL, stream: true }, requestId: "req_1", workspaceId: "team_test", providerId: "anthropic", endpoint: protocol === "openai.responses" ? "responses" : "chat.completions", protocol, capability: "text.generate", byokMeta: [], pricingCard: null, meta: {} } as any,
		"responses",
		{ canonicalResponsesEvents: true },
	);
	const text = await new Response(stream).text();
	return text.split("\n\n").flatMap((block) => {
		const lines = block.split("\n");
		const data = lines.find((line) => line.startsWith("data: "))?.slice(6);
		const event = lines.find((line) => line.startsWith("event: "))?.slice(7).trim();
		if (!data || !data.startsWith("{")) return [];
		const frame = JSON.parse(data);
		if (event && !frame.type) frame.type = event;
		return [frame];
	});
}

for (const [shape, blocks] of Object.entries(SHAPES)) {
describe(shape, () => {
beforeEach(() => { original = blocks; });

describe("Claude thinking order survives the client round trip", () => {
	it("Chat Completions", () => {
		const encoded = encodeOpenAIChatResponse(claudeReply(), "req_1") as any;
		const ir = decodeOpenAIChatRequest({
			model: GATEWAY_MODEL,
			reasoning_effort: "high",
			tools,
			messages: [
				{ role: "user", content: "Count the crates." },
				encoded.choices[0].message,
				...results(["toolu_x", "toolu_y", "toolu_z"]).map((r) => ({ role: "tool", tool_call_id: r.id, content: r.out })),
			],
		} as any);
		expect(replayedAssistant(ir).content).toEqual(original);
	});

	it("Responses", () => {
		const encoded = encodeOpenAIResponsesResponse(claudeReply(), "req_1") as any;
		const ir = decodeOpenAIResponsesRequest({
			model: GATEWAY_MODEL,
			reasoning: { effort: "high" },
			tools: [{ type: "function", name: "lookup", parameters: tools[0].function.parameters }],
			input: [
				{ role: "user", content: "Count the crates." },
				...encoded.output,
				...results(["toolu_x", "toolu_y", "toolu_z"]).map((r) => ({ type: "function_call_output", call_id: r.id, output: r.out })),
			],
		} as any);
		expect(replayedAssistant(ir).content).toEqual(original);
	});

	it("Anthropic Messages", () => {
		const encoded = encodeAnthropicMessagesResponse(claudeReply()) as any;
		const ir = decodeAnthropicMessagesRequest({
			model: GATEWAY_MODEL,
			max_tokens: 1024,
			tools: [{ name: "lookup", input_schema: tools[0].function.parameters }],
			messages: [
				{ role: "user", content: "Count the crates." },
				{ role: "assistant", content: encoded.content },
				{ role: "user", content: results(["toolu_x", "toolu_y", "toolu_z"]).map((r) => ({ type: "tool_result", tool_use_id: r.id, content: r.out })) },
			],
		} as any);
		expect(replayedAssistant(ir).content).toEqual(original);
	});
});

describe("Claude thinking order survives streamed replies", () => {
	it("Chat Completions, accumulated the way OpenRouter-style clients do", async () => {
		const frames = await clientFrames("openai.chat.completions");
		const details = new Map<number, any>();
		const calls: any[] = [];
		let content = "";
		for (const frame of frames) {
			const delta = frame.choices?.[0]?.delta;
			if (!delta) continue;
			if (typeof delta.content === "string") content += delta.content;
			for (const detail of delta.reasoning_details ?? []) {
				const previous = details.get(detail.index);
				if (!previous) { details.set(detail.index, { ...detail }); continue; }
				for (const field of ["text", "signature", "data"]) if (typeof detail[field] === "string") previous[field] = (previous[field] ?? "") + detail[field];
			}
			for (const call of delta.tool_calls ?? []) {
				const slot = (calls[call.index] ??= { id: call.id, type: "function", function: { name: "", arguments: "" } });
				if (call.function?.name) slot.function.name += call.function.name;
				if (call.function?.arguments) slot.function.arguments += call.function.arguments;
			}
		}
				const ir = decodeOpenAIChatRequest({
			model: GATEWAY_MODEL,
			reasoning_effort: "high",
			tools,
			messages: [
				{ role: "user", content: "Count the crates." },
				{ role: "assistant", content, tool_calls: calls, reasoning_details: [...details.values()].map(({ index, ...detail }) => detail) },
				...results(["toolu_x", "toolu_y", "toolu_z"]).map((r) => ({ role: "tool", tool_call_id: r.id, content: r.out })),
			],
		} as any);
		expect(replayedAssistant(ir).content).toEqual(original);
	});

	it("Responses", async () => {
		const frames = await clientFrames("openai.responses");
		const output = frames.find((frame) => frame.type === "response.completed")?.response?.output;
		const ir = decodeOpenAIResponsesRequest({
			model: GATEWAY_MODEL,
			reasoning: { effort: "high" },
			tools: [{ type: "function", name: "lookup", parameters: tools[0].function.parameters }],
			input: [
				{ role: "user", content: "Count the crates." },
				...output,
				...results(["toolu_x", "toolu_y", "toolu_z"]).map((r) => ({ type: "function_call_output", call_id: r.id, output: r.out })),
			],
		} as any);
		expect(replayedAssistant(ir).content).toEqual(original);
	});
});
});
}
