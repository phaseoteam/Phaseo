// Reasoning round trip for providers whose reasoning comes back as plain text
// (`reasoning_content`, `reasoning_details`, Responses `reasoning` items or
// Mistral ThinkChunks). A client takes each reply over Chat, Responses or
// Messages, sends it back, and the next upstream request must carry each
// assistant turn's reasoning the way that provider documents:
// - DeepSeek: with `tools`, the reasoning of EVERY earlier assistant turn, or 400
//   (https://api-docs.deepseek.com/guides/thinking_mode). Its Responses API takes
//   `reasoning` input items with `reasoning_text` content.
// - Kimi: the complete assistant message, reasoning_content included.
// - Z.ai (clear_thinking: false): complete, unmodified reasoning_content.
// - MiniMax: the full message, reasoning in `reasoning_content`.
// - Mistral: the full assistant message with its ThinkChunks.
// - Xiaomi MiMo: reasoning_content on assistant turns.
// Tests marked "BUG:" fail on the current code and describe the defect.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ExecutorExecuteArgs } from "@executors/types";
import { decodeOpenAIChatRequest } from "@protocols/openai-chat/decode";
import { decodeOpenAIResponsesRequest } from "@protocols/openai-responses/decode";
import { decodeAnthropicMessagesRequest } from "@protocols/anthropic-messages/decode";
import { encodeOpenAIChatResponse } from "@protocols/openai-chat/encode";
import { encodeOpenAIResponsesResponse } from "@protocols/openai-responses/encode";
import { encodeAnthropicMessagesResponse } from "@protocols/anthropic-messages/encode";
import { execute as executeDeepSeek } from "@executors/deepseek/text-generate";
import { execute as executeMoonshot } from "@executors/moonshotai/text-generate";
import { execute as executeZai } from "@executors/z-ai/text-generate";
import { execute as executeMinimax } from "@executors/minimax/text-generate";
import { execute as executeMistral } from "@executors/mistral/text-generate";
import { execute as executeXiaomi } from "@executors/xiaomi/text-generate";
import { execute as executeAlibabaCloud } from "@executors/alibaba-cloud/text-generate";
import { installFetchMock } from "../../../../../../tests/helpers/mock-fetch";
import { setupTestRuntime, teardownTestRuntime } from "../../../../../../tests/helpers/runtime";

vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({}) }));

beforeAll(() => setupTestRuntime());
afterAll(() => teardownTestRuntime());

type Surface = "chat" | "responses" | "messages";
type UpstreamStyle = "reasoning_content" | "minimax" | "mistral" | "responses";

type Provider = {
	label: string;
	providerId: string;
	model: string;
	execute: (args: ExecutorExecuteArgs) => Promise<any>;
	style: UpstreamStyle;
};

const PROVIDERS: Provider[] = [
	{ label: "BUG: DeepSeek V4 Pro (Responses route)", providerId: "deepseek", model: "deepseek-v4-pro", execute: executeDeepSeek, style: "responses" },
	{ label: "BUG: DeepSeek Flash (Chat route)", providerId: "deepseek", model: "deepseek-flash", execute: executeDeepSeek, style: "reasoning_content" },
	{ label: "Moonshot Kimi K2.6", providerId: "moonshotai", model: "kimi-k2.6", execute: executeMoonshot, style: "reasoning_content" },
	{ label: "Moonshot Kimi K3", providerId: "moonshotai", model: "kimi-k3", execute: executeMoonshot, style: "reasoning_content" },
	{ label: "Z.ai GLM-5.3 Flash", providerId: "z-ai", model: "glm-5.3-flash", execute: executeZai, style: "reasoning_content" },
	{ label: "MiniMax M3.1 Flash (BUG on streamed Responses)", providerId: "minimax", model: "MiniMax-M3.1-Flash", execute: executeMinimax, style: "minimax" },
	{ label: "Mistral Small 4", providerId: "mistral", model: "mistral-small-2603", execute: executeMistral, style: "mistral" },
	{ label: "BUG: Xiaomi MiMo V2.6 Flash (Responses route)", providerId: "xiaomi", model: "mimo-v2.6-flash", execute: executeXiaomi, style: "responses" },
	{ label: "Alibaba Cloud Qwen", providerId: "alibaba-cloud", model: "qwen3.5-flash", execute: executeAlibabaCloud, style: "reasoning_content" },
];

const TOOLS_CHAT = [{ type: "function", function: { name: "lookup", parameters: { type: "object", properties: { shelf: { type: "string" } } } } }];
const ARGS_JSON = JSON.stringify({ shelf: "A1" });

type Reply = { reasoning: string; text: string; toolCall: boolean };
const TURN_A: Reply = { reasoning: "The user greets me. Reply briefly.", text: "Hello!", toolCall: false };
const TURN_B: Reply = { reasoning: "I need the crate count, so call lookup.", text: "Checking.", toolCall: true };

// ---------------------------------------------------------------------------
// Fake upstream replies
// ---------------------------------------------------------------------------

function sse(frames: Array<{ event?: string; data: any }>): Response {
	const body = frames.map((frame) => `${frame.event ? `event: ${frame.event}\n` : ""}data: ${typeof frame.data === "string" ? frame.data : JSON.stringify(frame.data)}\n\n`).join("");
	return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

const USAGE = { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 };

function chatStream(style: UpstreamStyle, reply: Reply, model: string): Response {
	const chunk = (delta: any, finish: string | null = null) => ({ data: { id: "cmpl_1", object: "chat.completion.chunk", created: 1, model, choices: [{ index: 0, delta, finish_reason: finish }] } });
	const frames: Array<{ data: any }> = [];
	if (style === "minimax") {
		frames.push(chunk({ role: "assistant", reasoning_details: [{ type: "reasoning.text", id: "reasoning-text-1", format: "MiniMax-response-v1", index: 0, text: reply.reasoning }] }));
		frames.push(chunk({ content: reply.text }));
	} else if (style === "mistral") {
		frames.push(chunk({ role: "assistant", content: [{ type: "thinking", thinking: [{ type: "text", text: reply.reasoning }], signature: `mistral-sig-${reply.toolCall ? "b" : "a"}` }] }));
		frames.push(chunk({ content: reply.text }));
	} else {
		frames.push(chunk({ role: "assistant", reasoning_content: reply.reasoning }));
		frames.push(chunk({ content: reply.text }));
	}
	if (reply.toolCall) frames.push(chunk({ tool_calls: [{ index: 0, id: "call_1", type: "function", function: { name: "lookup", arguments: ARGS_JSON } }] }));
	frames.push(chunk({}, reply.toolCall ? "tool_calls" : "stop"));
	frames.push({ data: { id: "cmpl_1", object: "chat.completion.chunk", created: 1, model, choices: [], usage: USAGE } });
	frames.push({ data: "[DONE]" });
	return sse(frames);
}

function chatJson(style: UpstreamStyle, reply: Reply, model: string): Response {
	const message: any = { role: "assistant", content: reply.text };
	if (style === "minimax") message.reasoning_details = [{ type: "reasoning.text", id: "reasoning-text-1", format: "MiniMax-response-v1", index: 0, text: reply.reasoning }];
	else if (style === "mistral") message.content = [{ type: "thinking", thinking: [{ type: "text", text: reply.reasoning }], signature: `mistral-sig-${reply.toolCall ? "b" : "a"}` }, { type: "text", text: reply.text }];
	else message.reasoning_content = reply.reasoning;
	if (reply.toolCall) message.tool_calls = [{ id: "call_1", type: "function", function: { name: "lookup", arguments: ARGS_JSON } }];
	return new Response(JSON.stringify({ id: "cmpl_1", object: "chat.completion", created: 1, model, choices: [{ index: 0, message, finish_reason: reply.toolCall ? "tool_calls" : "stop" }], usage: USAGE }), { status: 200, headers: { "Content-Type": "application/json" } });
}

function responsesStream(reply: Reply, model: string): Response {
	const reasoningItem = { type: "reasoning", id: "rs_1", summary: [], content: [{ type: "reasoning_text", text: reply.reasoning }], status: "completed" };
	const messageItem = { type: "message", id: "msg_1", role: "assistant", status: "completed", content: [{ type: "output_text", text: reply.text, annotations: [] }] };
	const callItem = { type: "function_call", id: "fc_1", call_id: "call_1", name: "lookup", arguments: ARGS_JSON, status: "completed" };
	const output = [reasoningItem, messageItem, ...(reply.toolCall ? [callItem] : [])];
	const base = { id: "resp_1", object: "response", created_at: 1, model };
	let seq = 0;
	const ev = (event: string, data: any) => ({ event, data: { type: event, sequence_number: seq++, ...data } });
	const frames = [
		ev("response.created", { response: { ...base, status: "in_progress", output: [] } }),
		ev("response.output_item.added", { output_index: 0, item: { ...reasoningItem, content: [], status: "in_progress" } }),
		ev("response.reasoning_text.delta", { output_index: 0, item_id: "rs_1", content_index: 0, delta: reply.reasoning }),
		ev("response.reasoning_text.done", { output_index: 0, item_id: "rs_1", content_index: 0, text: reply.reasoning }),
		ev("response.output_item.done", { output_index: 0, item: reasoningItem }),
		ev("response.output_item.added", { output_index: 1, item: { ...messageItem, content: [], status: "in_progress" } }),
		ev("response.content_part.added", { output_index: 1, item_id: "msg_1", content_index: 0, part: { type: "output_text", text: "", annotations: [] } }),
		ev("response.output_text.delta", { output_index: 1, item_id: "msg_1", content_index: 0, delta: reply.text }),
		ev("response.output_text.done", { output_index: 1, item_id: "msg_1", content_index: 0, text: reply.text }),
		ev("response.content_part.done", { output_index: 1, item_id: "msg_1", content_index: 0, part: { type: "output_text", text: reply.text, annotations: [] } }),
		ev("response.output_item.done", { output_index: 1, item: messageItem }),
		...(reply.toolCall ? [
			ev("response.output_item.added", { output_index: 2, item: { ...callItem, arguments: "", status: "in_progress" } }),
			ev("response.function_call_arguments.delta", { output_index: 2, item_id: "fc_1", delta: ARGS_JSON }),
			ev("response.function_call_arguments.done", { output_index: 2, item_id: "fc_1", arguments: ARGS_JSON }),
			ev("response.output_item.done", { output_index: 2, item: callItem }),
		] : []),
		ev("response.completed", { response: { ...base, status: "completed", output, usage: { input_tokens: 10, output_tokens: 10, total_tokens: 20 } } }),
	];
	return sse(frames);
}

function upstreamReply(provider: Provider, reply: Reply, url: string, body: any): Response {
	if (url.endsWith("/responses")) return responsesStream(reply, provider.model);
	return body?.stream === false ? chatJson(provider.style, reply, provider.model) : chatStream(provider.style, reply, provider.model);
}

// ---------------------------------------------------------------------------
// Running one request through the executor
// ---------------------------------------------------------------------------

const PROTOCOL: Record<Surface, { protocol: string; endpoint: string }> = {
	chat: { protocol: "openai.chat.completions", endpoint: "chat.completions" },
	responses: { protocol: "openai.responses", endpoint: "responses" },
	messages: { protocol: "anthropic.messages", endpoint: "messages" },
};

async function run(provider: Provider, surface: Surface, ir: any, reply: Reply) {
	let captured: { url: string; body: any } | null = null;
	const mock = installFetchMock([{
		match: () => true,
		response: () => upstreamReply(provider, reply, captured!.url, captured!.body),
		onRequest: (call) => { captured = { url: call.url, body: call.bodyJson }; },
	}]);
	try {
		const result = await provider.execute({
			ir: { ...ir, model: provider.model },
			requestId: "req_1",
			workspaceId: "team_test",
			providerId: provider.providerId,
			endpoint: PROTOCOL[surface].endpoint,
			protocol: PROTOCOL[surface].protocol,
			capability: "text.generate",
			providerModelSlug: provider.model,
			capabilityParams: null,
			byokMeta: [],
			pricingCard: { rules: [] },
			meta: {},
		} as any);
		let stream: string | null = null;
		if (result.kind === "stream") stream = await new Response(result.stream).text();
		return { result, stream, upstream: captured! };
	} finally {
		mock.restore();
	}
}

function parseFrames(text: string): any[] {
	return text.split(/\r?\n\r?\n/).flatMap((block) => {
		const lines = block.split(/\r?\n/);
		const data = lines.find((line) => line.startsWith("data: "))?.slice(6);
		const event = lines.find((line) => line.startsWith("event: "))?.slice(7).trim();
		if (!data || !data.startsWith("{")) return [];
		const frame = JSON.parse(data);
		if (event && !frame.type) frame.type = event;
		return [frame];
	});
}

// ---------------------------------------------------------------------------
// What the client keeps and sends back, per surface
// ---------------------------------------------------------------------------

/** Chat: the assistant message the client appends to its history. */
function chatHistoryMessage(run: { result: any; stream: string | null }): any {
	if (!run.stream) return encodeOpenAIChatResponse(run.result.ir, "req_1").choices[0].message;
	const details = new Map<number, any>();
	const calls: any[] = [];
	let content = "";
	let reasoning = "";
	for (const frame of parseFrames(run.stream)) {
		const delta = frame.choices?.[0]?.delta;
		if (!delta) continue;
		if (typeof delta.content === "string") content += delta.content;
		if (typeof delta.reasoning_content === "string") reasoning += delta.reasoning_content;
		else if (typeof delta.reasoning === "string") reasoning += delta.reasoning;
		for (const detail of delta.reasoning_details ?? []) {
			const previous = details.get(detail.index);
			if (!previous) { details.set(detail.index, { ...detail }); continue; }
			for (const field of ["text", "signature", "data", "summary"]) if (typeof detail[field] === "string") previous[field] = (previous[field] ?? "") + detail[field];
		}
		for (const call of delta.tool_calls ?? []) {
			const slot = (calls[call.index] ??= { id: call.id, type: "function", function: { name: "", arguments: "" } });
			if (call.id) slot.id = call.id;
			if (call.function?.name) slot.function.name += call.function.name;
			if (call.function?.arguments) slot.function.arguments += call.function.arguments;
		}
	}
	return {
		role: "assistant",
		content: content || null,
		...(reasoning ? { reasoning_content: reasoning } : {}),
		...(details.size ? { reasoning_details: [...details.values()].map(({ index, ...detail }) => detail) } : {}),
		...(calls.length ? { tool_calls: calls } : {}),
	};
}

/** Responses: the output items the client appends to `input`. */
function responsesHistoryItems(run: { result: any; stream: string | null }): any[] {
	if (!run.stream) return encodeOpenAIResponsesResponse(run.result.ir, "req_1").output as any[];
	const completed = parseFrames(run.stream).find((frame) => frame.type === "response.completed");
	return completed?.response?.output ?? [];
}

/** Messages: the content blocks of the assistant turn. */
function messagesHistoryContent(run: { result: any; stream: string | null }): any[] {
	if (!run.stream) return (encodeAnthropicMessagesResponse(run.result.ir) as any).content;
	const blocks: any[] = [];
	const json: Record<number, string> = {};
	for (const frame of parseFrames(run.stream)) {
		if (frame.type === "content_block_start") blocks[frame.index] = { ...frame.content_block };
		else if (frame.type === "content_block_delta") {
			const block = blocks[frame.index];
			const delta = frame.delta;
			if (delta.type === "text_delta") block.text = (block.text ?? "") + delta.text;
			else if (delta.type === "thinking_delta") block.thinking = (block.thinking ?? "") + delta.thinking;
			else if (delta.type === "signature_delta") block.signature = (block.signature ?? "") + delta.signature;
			else if (delta.type === "input_json_delta") json[frame.index] = (json[frame.index] ?? "") + delta.partial_json;
		}
	}
	for (const [index, text] of Object.entries(json)) blocks[Number(index)].input = text ? JSON.parse(text) : {};
	return blocks.filter(Boolean);
}

// ---------------------------------------------------------------------------
// Building each follow-up request the way a client does
// ---------------------------------------------------------------------------

type History = { a?: any; b?: any };

function decodeFollowUp(surface: Surface, history: History, step: "B" | "C") {
	if (surface === "chat") {
		const messages: any[] = [{ role: "user", content: "Hi" }, history.a, { role: "user", content: "How many crates are on shelf A1?" }];
		if (step === "C") messages.push(history.b, { role: "tool", tool_call_id: "call_1", content: "4 crates" });
		return decodeOpenAIChatRequest({ model: "x", reasoning_effort: "high", tools: TOOLS_CHAT, messages } as any);
	}
	if (surface === "responses") {
		const input: any[] = [{ role: "user", content: "Hi" }, ...history.a, { role: "user", content: "How many crates are on shelf A1?" }];
		if (step === "C") input.push(...history.b, { type: "function_call_output", call_id: "call_1", output: "4 crates" });
		return decodeOpenAIResponsesRequest({ model: "x", reasoning: { effort: "high" }, tools: [{ type: "function", name: "lookup", parameters: TOOLS_CHAT[0].function.parameters }], input } as any);
	}
	const messages: any[] = [{ role: "user", content: "Hi" }, { role: "assistant", content: history.a }, { role: "user", content: "How many crates are on shelf A1?" }];
	if (step === "C") {
		messages.push({ role: "assistant", content: history.b });
		const toolUse = history.b.find((block: any) => block.type === "tool_use");
		messages.push({ role: "user", content: [{ type: "tool_result", tool_use_id: toolUse?.id ?? "call_1", content: "4 crates" }] });
	}
	return decodeAnthropicMessagesRequest({ model: "x", max_tokens: 1024, thinking: { type: "enabled", budget_tokens: 1024 }, tools: [{ name: "lookup", input_schema: TOOLS_CHAT[0].function.parameters }], messages } as any);
}

function historyOf(surface: Surface, result: { result: any; stream: string | null }) {
	return surface === "chat" ? chatHistoryMessage(result) : surface === "responses" ? responsesHistoryItems(result) : messagesHistoryContent(result);
}

/** Runs turn A and turn B, then returns the upstream request for step C. */
async function conversation(provider: Provider, surface: Surface, stream: boolean) {
	const first = decodeFollowUp(surface, { a: surface === "chat" ? { role: "assistant", content: "" } : [] }, "B");
	const turnA = await run(provider, surface, { ...first, messages: first.messages.slice(0, 1), stream }, TURN_A);
	const history: History = { a: historyOf(surface, turnA) };
	const turnB = await run(provider, surface, { ...decodeFollowUp(surface, history, "B"), stream }, TURN_B);
	history.b = historyOf(surface, turnB);
	const followUp = { ...decodeFollowUp(surface, history, "C"), stream };
	const turnC = await run(provider, surface, followUp, { reasoning: "Done.", text: "There are 4 crates.", toolCall: false });
	return { upstream: turnC.upstream, history, ir: followUp };
}

// ---------------------------------------------------------------------------
// Reading what reached the provider
// ---------------------------------------------------------------------------

type UpstreamTurn = { reasoning: string; text: string; toolCallIds: string[]; raw: any };

function textOf(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content.filter((part: any) => part?.type === "text" || part?.type === "output_text").map((part: any) => part.text).join("");
}

/** The assistant turns of an upstream Chat or Responses request, in order. */
function upstreamAssistantTurns(upstream: { url: string; body: any }): UpstreamTurn[] {
	if (upstream.url.endsWith("/responses")) {
		const turns: UpstreamTurn[] = [];
		let current: UpstreamTurn | null = null;
		for (const item of upstream.body.input) {
			const isAssistantItem = item.type === "reasoning" || item.type === "function_call" || (item.type === "message" && item.role === "assistant");
			if (!isAssistantItem) { current = null; continue; }
			if (!current) { current = { reasoning: "", text: "", toolCallIds: [], raw: [] }; turns.push(current); }
			current.raw.push(item);
			if (item.type === "reasoning") current.reasoning += textOf((item.content ?? []).map((part: any) => ({ type: "text", text: part.text })));
			if (item.type === "message") current.text += textOf(item.content);
			if (item.type === "function_call") current.toolCallIds.push(item.call_id);
		}
		return turns;
	}
	return upstream.body.messages.filter((message: any) => message.role === "assistant").map((message: any) => {
		const thinking = Array.isArray(message.content)
			? message.content.filter((chunk: any) => chunk?.type === "thinking").map((chunk: any) => chunk.thinking.map((part: any) => part.text).join("")).join("")
			: "";
		const details = Array.isArray(message.reasoning_details) ? message.reasoning_details.map((detail: any) => detail.text ?? "").join("") : "";
		return {
			reasoning: message.reasoning_content ?? (details || thinking),
			text: textOf(message.content),
			toolCallIds: (message.tool_calls ?? []).map((call: any) => call.id),
			raw: message,
		};
	});
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const SURFACES: Surface[] = ["chat", "responses", "messages"];

for (const provider of PROVIDERS.filter((entry) => entry.providerId !== "alibaba-cloud")) {
	describe(provider.label, () => {
		for (const surface of SURFACES) {
			for (const stream of [false, true]) {
				it(`${surface}${stream ? ", streamed" : ""}: every assistant turn goes back with its own reasoning, nothing leaks into content`, async () => {
					const { upstream } = await conversation(provider, surface, stream);
					const turns = upstreamAssistantTurns(upstream);
					expect(turns).toHaveLength(2);
					const [a, b] = turns;
					// The answer text goes back once, without reasoning in it.
					expect(a.text).toBe(TURN_A.text);
					expect(b.text).toBe(TURN_B.text);
					expect(b.toolCallIds).toHaveLength(1);
					// Reasoning goes back on the tool-call turn (DeepSeek, Kimi and others 400
					// or lose the chain of thought otherwise) and on the earlier turn (DeepSeek
					// requires it whenever `tools` is present; Kimi, Z.ai, MiniMax and Mistral
					// ask for the complete message).
					expect(b.reasoning).toBe(TURN_B.reasoning);
					expect(a.reasoning).toBe(TURN_A.reasoning);
				});
			}
		}
	});
}

describe("documented field names", () => {
	it("MiniMax gets reasoning back as the reasoning_details it returned", async () => {
		// We send reasoning_split: true, so MiniMax returns reasoning_details, and that is
		// what goes back. The M3 function-call guide names reasoning_content instead, but
		// MiniMax-M3.1-Flash accepted reasoning_details in a live tool loop (2026-11-13).
		const minimax = PROVIDERS.find((entry) => entry.providerId === "minimax")!;
		const { upstream } = await conversation(minimax, "chat", false);
		const turns = upstreamAssistantTurns(upstream);
		expect(turns[1].raw.reasoning_details).toEqual([expect.objectContaining({ type: "reasoning.text", text: TURN_B.reasoning })]);
	});

	it("Mistral gets its ThinkChunk signature back, and no reasoning_content", async () => {
		const mistral = PROVIDERS.find((entry) => entry.providerId === "mistral")!;
		for (const stream of [false, true]) {
			const { upstream } = await conversation(mistral, "chat", stream);
			const [a, b] = upstreamAssistantTurns(upstream);
			expect(a.raw).not.toHaveProperty("reasoning_content");
			expect(a.raw.content[0]).toMatchObject({ type: "thinking", signature: "mistral-sig-a" });
			expect(b.raw.content[0]).toMatchObject({ type: "thinking", signature: "mistral-sig-b" });
		}
	});
});

describe("Alibaba Cloud (Model Studio)", () => {
	const alibaba = PROVIDERS.find((entry) => entry.providerId === "alibaba-cloud")!;
	it("never puts reasoning in content", async () => {
		const { upstream } = await conversation(alibaba, "chat", false);
		const [a, b] = upstreamAssistantTurns(upstream);
		expect(a.text).toBe(TURN_A.text);
		expect(b.text).toBe(TURN_B.text);
	});

	it("BUG: Kimi K3 on Alibaba gets its reasoning_content back (Kimi K3 keeps preserved thinking on)", async () => {
		// Model Studio: kimi-k3.1-pro and kimi-k3 "retain historical reasoning_content
		// supplied by the client by default". Moonshot: pass the complete message back.
		const { upstream } = await conversation({ ...alibaba, model: "kimi-k3" }, "chat", false);
		const [, b] = upstreamAssistantTurns(upstream);
		expect(b.raw.reasoning_content).toBe(TURN_B.reasoning);
	});
});
