// Reasoning must go back to OpenAI, Azure, xAI and the gpt-oss hosts the way
// each provider documents, through every client surface, streamed or not.
// - OpenAI: "Keep those items in their original order"; "changes to the history
//   preceding a reasoning item can cause the API to drop that reasoning".
//   https://developers.openai.com/api/docs/guides/reasoning
// - xAI: pass reasoning items back unchanged with their encrypted_content.
//   https://docs.x.ai/developers/model-capabilities/text/reasoning
// - Fireworks: you "MUST include the reasoning_content from previous assistant
//   turns" when the last message is a tool result. https://docs.fireworks.ai/guides/reasoning
// - Groq: assistant messages take `reasoning` (groq-python ChatCompletionAssistantMessageParam).
// - Cerebras: "Resend conversation history ... including any assistant reasoning",
//   as `message.reasoning`. https://inference-docs.cerebras.ai/capabilities/reasoning
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { IRChatRequest } from "@core/ir";
import type { ExecutorExecuteArgs } from "@executors/types";
import { ChatCompletionsSchema, ResponsesSchema } from "@core/schemas";
import { decodeOpenAIChatRequest } from "@protocols/openai-chat/decode";
import { decodeOpenAIResponsesRequest } from "@protocols/openai-responses/decode";
import { encodeOpenAIChatResponse } from "@protocols/openai-chat/encode";
import { encodeOpenAIResponsesResponse } from "@protocols/openai-responses/encode";
import { executor as openAIExecutor } from "@executors/openai/text-generate";
import { executor as xAiExecutor } from "@executors/x-ai/text-generate";
import { execute as azureExecute } from "@executors/azure/text-generate";
import { resolveProviderExecutor } from "@executors/index";
import { installFetchMock, jsonResponse, type FetchCall } from "../../../../../tests/helpers/mock-fetch";
import { setupTestRuntime, teardownTestRuntime } from "../../../../../tests/helpers/runtime";
import { sseResponse } from "../../../../../tests/helpers/sse";

vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({}) }));

beforeAll(() => setupTestRuntime());
afterAll(() => teardownTestRuntime());

const ENC_1 = "gAAAAABpY3Rlc3QtZW5jcnlwdGVkLXJlYXNvbmluZy0x";
const ENC_2 = "gAAAAABpY3Rlc3QtZW5jcnlwdGVkLXJlYXNvbmluZy0y";

const chatTool = { type: "function", function: { name: "lookup", parameters: { type: "object", properties: { shelf: { type: "string" } } } } };
const responsesTool = { type: "function", name: "lookup", parameters: chatTool.function.parameters };

function args(ir: IRChatRequest, overrides: Partial<ExecutorExecuteArgs>): ExecutorExecuteArgs {
	return {
		ir,
		requestId: "req_rr",
		workspaceId: "ws_rr",
		providerId: "openai",
		endpoint: "chat.completions",
		protocol: "openai.chat.completions",
		capability: "text.generate",
		providerModelSlug: null,
		capabilityParams: { params: { reasoning: {}, tools: {} } },
		byokMeta: [],
		pricingCard: { rules: [] } as any,
		meta: { returnUsage: true } as any,
		...overrides,
	} as ExecutorExecuteArgs;
}

async function run(response: () => Response, execute: () => Promise<any>): Promise<{ call: FetchCall; result: any }> {
	const mock = installFetchMock([{ match: () => true, response }]);
	let result: any;
	try {
		result = await execute();
		// Drain a streamed result while the mock is still installed.
		if (result?.stream) result.streamText = await new Response(result.stream).text();
	} finally {
		mock.restore();
	}
	expect(mock.calls).toHaveLength(1);
	return { call: mock.calls[0]!, result };
}

function frames(text: string): any[] {
	return text.split("\n\n").flatMap((block) => {
		const lines = block.split("\n");
		const data = lines.find((line) => line.startsWith("data:"))?.slice(5).trim();
		const event = lines.find((line) => line.startsWith("event:"))?.slice(6).trim();
		if (!data || !data.startsWith("{")) return [];
		const frame = JSON.parse(data);
		if (event && !frame.type) frame.type = event;
		return [frame];
	});
}

/** Accumulate Chat stream chunks into the assistant message, the way OpenRouter-style clients do. */
function chatMessageFromStream(text: string): any {
	const details = new Map<number, any>();
	const calls: any[] = [];
	let content = "";
	let reasoning = "";
	for (const frame of frames(text)) {
		const delta = frame.choices?.[0]?.delta;
		if (!delta) continue;
		if (typeof delta.content === "string") content += delta.content;
		if (typeof delta.reasoning_content === "string") reasoning += delta.reasoning_content;
		// gpt-oss hosts stream it as `reasoning` (the gateway sends both names on converted streams).
		else if (typeof delta.reasoning === "string") reasoning += delta.reasoning;
		for (const detail of delta.reasoning_details ?? []) {
			const previous = details.get(detail.index);
			if (!previous) { details.set(detail.index, { ...detail }); continue; }
			for (const field of ["text", "summary", "signature", "data"]) if (typeof detail[field] === "string") previous[field] = (previous[field] ?? "") + detail[field];
		}
		for (const call of delta.tool_calls ?? []) {
			const slot = (calls[call.index] ??= { id: call.id, type: "function", function: { name: "", arguments: "" } });
			if (call.function?.name) slot.function.name += call.function.name;
			if (call.function?.arguments) slot.function.arguments += call.function.arguments;
		}
	}
	return {
		role: "assistant",
		content: content || null,
		...(calls.length ? { tool_calls: calls } : {}),
		...(details.size ? { reasoning_details: [...details.values()].map(({ index, ...detail }) => detail) } : {}),
		...(reasoning && !details.size ? { reasoning_content: reasoning } : {}),
	};
}

// ---------------------------------------------------------------------------
// Responses-API providers (OpenAI, Azure, xAI): one reply, interleaved
// ---------------------------------------------------------------------------

// A GPT-5.x reply with a commentary preamble: reasoning, message, reasoning, two
// parallel calls. The next request must carry these items in this order.
const INTERLEAVED: any[] = [
	{ type: "reasoning", id: "rs_1", summary: [{ type: "summary_text", text: "Plan the lookups." }], encrypted_content: ENC_1 },
	{ type: "message", id: "msg_1", role: "assistant", status: "completed", phase: "commentary", content: [{ type: "output_text", text: "Checking both shelves.", annotations: [] }] },
	{ type: "reasoning", id: "rs_2", summary: [], encrypted_content: ENC_2 },
	{ type: "function_call", id: "fc_a", call_id: "call_a", name: "lookup", arguments: "{\"shelf\":\"A1\"}", status: "completed" },
	{ type: "function_call", id: "fc_b", call_id: "call_b", name: "lookup", arguments: "{\"shelf\":\"B2\"}", status: "completed" },
];
// The same reply with no preamble: reasoning, then two calls.
const SIMPLE: any[] = [INTERLEAVED[0], INTERLEAVED[3], INTERLEAVED[4]];

/** Upstream Responses SSE for one reply, with the per-item events a real stream has. */
function responsesUpstream(output: any[], model: string): Response {
	const events: any[] = [{ type: "response.created", response: { id: "resp_1", object: "response", status: "in_progress", model, output: [] } }];
	output.forEach((item, index) => {
		const empty = item.type === "message" ? { ...item, content: [] } : item.type === "function_call" ? { ...item, arguments: "" } : { ...item, summary: [] };
		events.push({ type: "response.output_item.added", output_index: index, item: empty });
		if (item.type === "message") {
			events.push({ type: "response.content_part.added", output_index: index, item_id: item.id, content_index: 0, part: { type: "output_text", text: "" } });
			events.push({ type: "response.output_text.delta", output_index: index, item_id: item.id, content_index: 0, delta: item.content[0].text });
			events.push({ type: "response.output_text.done", output_index: index, item_id: item.id, content_index: 0, text: item.content[0].text });
		}
		if (item.type === "function_call") {
			events.push({ type: "response.function_call_arguments.delta", output_index: index, item_id: item.id, delta: item.arguments });
			events.push({ type: "response.function_call_arguments.done", output_index: index, item_id: item.id, arguments: item.arguments });
		}
		if (item.type === "reasoning" && item.summary.length) {
			events.push({ type: "response.reasoning_summary_text.delta", output_index: index, item_id: item.id, summary_index: 0, delta: item.summary[0].text });
		}
		events.push({ type: "response.output_item.done", output_index: index, item });
	});
	events.push({ type: "response.completed", response: { id: "resp_1", object: "response", status: "completed", model, output, usage: { input_tokens: 50, output_tokens: 20, total_tokens: 70, output_tokens_details: { reasoning_tokens: 12 } } } });
	return sseResponse(events);
}

const results = [
	{ type: "function_call_output", call_id: "call_a", output: "A1: 4 crates" },
	{ type: "function_call_output", call_id: "call_b", output: "B2: 2 crates" },
];
const chatResults = [
	{ role: "tool", tool_call_id: "call_a", content: "A1: 4 crates" },
	{ role: "tool", tool_call_id: "call_b", content: "B2: 2 crates" },
];

type Route = {
	name: string;
	gatewayModel: string;
	slug: string;
	providerId: string;
	execute: (a: ExecutorExecuteArgs) => Promise<any>;
	/** Chat clients with reasoning go to the Responses API. */
	chatViaResponses: boolean;
};

const ROUTES: Route[] = [
	{ name: "OpenAI", gatewayModel: "openai/gpt-5.5-mini", slug: "gpt-5.5-mini", providerId: "openai", execute: (a) => openAIExecutor(a), chatViaResponses: true },
	{ name: "xAI", gatewayModel: "x-ai/grok-4.3", slug: "grok-4.3", providerId: "x-ai", execute: (a) => xAiExecutor(a), chatViaResponses: true },
	{ name: "Azure", gatewayModel: "openai/gpt-5.5-mini", slug: "gpt-5.5-mini", providerId: "azure", execute: (a) => azureExecute(a), chatViaResponses: true },
];

/** Item kinds and ids of an upstream Responses `input`, for order comparisons. */
function shape(input: any[]): string[] {
	return input.map((item) => {
		if (item.type === "reasoning") {
			if (!item.encrypted_content) return "reasoning";
			return `reasoning:${item.encrypted_content === ENC_1 ? "1" : item.encrypted_content === ENC_2 ? "2" : "?"}`;
		}
		if (item.type === "function_call") return `call:${item.call_id}`;
		if (item.type === "function_call_output") return `result:${item.call_id}`;
		if (item.type === "message" || item.role) return `${item.role}`;
		return item.type;
	});
}

const expectedShape = (output: any[]) => [
	"user",
	...shape(output).map((entry) => (entry === "message" ? "assistant" : entry)),
	"result:call_a",
	"result:call_b",
];

for (const route of ROUTES) {
	describe(`${route.name}: encrypted reasoning round trip`, () => {
		const responsesArgs = (input: any[], stream: boolean) => args(decodeOpenAIResponsesRequest(ResponsesSchema.parse({
			model: route.gatewayModel,
			reasoning: { effort: "low", summary: "auto" },
			tools: [responsesTool],
			stream,
			input,
		}) as any), { providerId: route.providerId, providerModelSlug: route.slug, endpoint: "responses", protocol: "openai.responses" });

		const chatArgs = (messages: any[], stream: boolean) => args(decodeOpenAIChatRequest(ChatCompletionsSchema.parse({
			model: route.gatewayModel,
			reasoning_effort: "low",
			tools: [chatTool],
			stream,
			messages,
		}) as any), { providerId: route.providerId, providerModelSlug: route.slug });

		for (const [label, output] of [["reasoning then parallel calls", SIMPLE], ["commentary between reasoning items", INTERLEAVED]] as const) {
			describe(label, () => {
				it("Responses client, non-streamed", async () => {
					const step1 = await run(() => responsesUpstream(output, route.slug), () => route.execute(responsesArgs([{ role: "user", content: "Count the crates." }], false)));
					expect(step1.call.bodyJson.store).toBe(false);
					expect(step1.call.bodyJson.include).toContain("reasoning.encrypted_content");
					const clientOutput = encodeOpenAIResponsesResponse(step1.result.ir, "req_rr").output as any[];
					const step2 = await run(() => responsesUpstream([], route.slug), () => route.execute(responsesArgs([{ role: "user", content: "Count the crates." }, ...clientOutput, ...results], false)));
					expect(shape(step2.call.bodyJson.input)).toEqual(expectedShape(output));
				});

				it("Responses client, streamed", async () => {
					const step1 = await run(() => responsesUpstream(output, route.slug), () => route.execute(responsesArgs([{ role: "user", content: "Count the crates." }], true)));
					const completed = frames(step1.result.streamText).find((frame) => frame.type === "response.completed");
					const clientOutput = completed.response.output;
					const step2 = await run(() => responsesUpstream([], route.slug), () => route.execute(responsesArgs([{ role: "user", content: "Count the crates." }, ...clientOutput, ...results], false)));
					expect(shape(step2.call.bodyJson.input)).toEqual(expectedShape(output));
				});

				it("Chat client, non-streamed", async () => {
					if (!route.chatViaResponses) return;
					const step1 = await run(() => responsesUpstream(output, route.slug), () => route.execute(chatArgs([{ role: "user", content: "Count the crates." }], false)));
					expect(step1.call.url).toMatch(/\/responses$/);
					const message = (encodeOpenAIChatResponse(step1.result.ir, "req_rr") as any).choices[0].message;
					// Turn 2 does not repeat reasoning_effort: the reasoning in the history alone keeps it on Responses.
					const step2 = await run(() => responsesUpstream([], route.slug), () => route.execute(chatArgs([{ role: "user", content: "Count the crates." }, message, ...chatResults], false)));
					expect(step2.call.url).toMatch(/\/responses$/);
					expect(shape(step2.call.bodyJson.input)).toEqual(expectedShape(output));
				});

				it("Chat client, streamed", async () => {
					if (!route.chatViaResponses) return;
					const step1 = await run(() => responsesUpstream(output, route.slug), () => route.execute(chatArgs([{ role: "user", content: "Count the crates." }], true)));
					const message = chatMessageFromStream(step1.result.streamText);
					const step2 = await run(() => responsesUpstream([], route.slug), () => route.execute(chatArgs([{ role: "user", content: "Count the crates." }, message, ...chatResults], false)));
					expect(shape(step2.call.bodyJson.input)).toEqual(expectedShape(output));
				});
			});
		}
	});
}

describe("encrypted reasoning never crosses provider families", () => {
	async function replyFrom(route: Route) {
		const step = await run(() => responsesUpstream(SIMPLE, route.slug), () => route.execute(args(decodeOpenAIResponsesRequest(ResponsesSchema.parse({
			model: route.gatewayModel, reasoning: { effort: "low" }, tools: [responsesTool], input: [{ role: "user", content: "Count the crates." }],
		}) as any), { providerId: route.providerId, providerModelSlug: route.slug, endpoint: "responses", protocol: "openai.responses" })));
		return encodeOpenAIResponsesResponse(step.result.ir, "req_rr").output as any[];
	}

	for (const from of ROUTES) {
		for (const to of ROUTES) {
			if (from === to) continue;
			it(`${from.name} reasoning is not sent to ${to.name}`, async () => {
				const output = await replyFrom(from);
				const next = await run(() => responsesUpstream([], to.slug), () => to.execute(args(decodeOpenAIResponsesRequest(ResponsesSchema.parse({
					model: to.gatewayModel, reasoning: { effort: "low" }, tools: [responsesTool], input: [{ role: "user", content: "Count the crates." }, ...output, ...results],
				}) as any), { providerId: to.providerId, providerModelSlug: to.slug, endpoint: "responses", protocol: "openai.responses" })));
				expect(next.call.bodyText).not.toContain(ENC_1);
				expect(shape(next.call.bodyJson.input)).toEqual(["user", "call:call_a", "call:call_b", "result:call_a", "result:call_b"]);
			});
		}
	}

	// Not fixed on purpose: an unsealed value names no issuer. Reading it in the
	// destination's format would also send OpenAI's raw values to xAI or Azure when
	// a request falls back there, which fails to decrypt (400). Raw values stay
	// OpenAI's; values the gateway returned are sealed with their issuer.
	it.skip("GAP: raw (unsealed) xAI encrypted_content from a client that called xAI directly goes back to xAI", async () => {
		// A client migrating mid-conversation from xAI's own API has raw values.
		const next = await run(() => responsesUpstream([], "grok-4.3"), () => xAiExecutor(args(decodeOpenAIResponsesRequest(ResponsesSchema.parse({
			model: "x-ai/grok-4.3", reasoning: { effort: "low" }, tools: [responsesTool],
			input: [{ role: "user", content: "Count the crates." }, ...SIMPLE, ...results],
		}) as any), { providerId: "x-ai", providerModelSlug: "grok-4.3", endpoint: "responses", protocol: "openai.responses" })));
		// KNOWN GAP: raw encrypted_content is read as OpenAI's, so xAI never gets it back.
		expect(shape(next.call.bodyJson.input)).toEqual(["user", "reasoning:1", "call:call_a", "call:call_b", "result:call_a", "result:call_b"]);
	});
});

describe("Azure: Chat Completions clients on a reasoning model", () => {
	it("keeps encrypted reasoning across a tool loop: Chat clients with reasoning go to Responses", async () => {
		const azureChatReply = sseResponse([
			{ id: "c1", object: "chat.completion.chunk", choices: [{ index: 0, delta: { role: "assistant", tool_calls: [{ index: 0, id: "call_a", type: "function", function: { name: "lookup", arguments: "{\"shelf\":\"A1\"}" } }] }, finish_reason: null }] },
			{ id: "c1", object: "chat.completion.chunk", choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }], usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 } },
			"[DONE]",
		]);
		const step1 = await run(() => azureChatReply, () => azureExecute(args(decodeOpenAIChatRequest(ChatCompletionsSchema.parse({
			model: "openai/gpt-5.5-mini", reasoning_effort: "low", tools: [chatTool], messages: [{ role: "user", content: "Count the crates." }],
		}) as any), { providerId: "azure", providerModelSlug: "gpt-5.5-mini" })));
		// As on OpenAI: Chat Completions has no field for encrypted reasoning.
		expect(step1.call.url).toMatch(/\/responses/);
		expect(step1.call.bodyJson.include).toContain("reasoning.encrypted_content");
	});
});

// ---------------------------------------------------------------------------
// gpt-oss and other open reasoning models on OpenAI-compatible Chat hosts
// ---------------------------------------------------------------------------

const HOSTS: Array<{ providerId: string; slug: string; field: "reasoning" | "reasoning_content"; bug?: boolean }> = [
	{ providerId: "groq", slug: "openai/gpt-oss-20b", field: "reasoning", bug: true },
	{ providerId: "cerebras", slug: "gpt-oss-120b", field: "reasoning", bug: true },
	{ providerId: "fireworks", slug: "accounts/fireworks/models/gpt-oss-20b", field: "reasoning_content", bug: true },
	{ providerId: "together", slug: "openai/gpt-oss-20b", field: "reasoning_content" },
	{ providerId: "deepinfra", slug: "openai/gpt-oss-20b", field: "reasoning_content" },
];

function chatReply(reasoningField: "reasoning" | "reasoning_content"): any {
	return {
		id: "chatcmpl_1",
		object: "chat.completion",
		created: 1760000000,
		model: "gpt-oss-20b",
		choices: [{
			index: 0,
			finish_reason: "tool_calls",
			message: {
				role: "assistant",
				content: null,
				[reasoningField]: "Look up both shelves.",
				tool_calls: [
					{ id: "call_a", type: "function", function: { name: "lookup", arguments: "{\"shelf\":\"A1\"}" } },
					{ id: "call_b", type: "function", function: { name: "lookup", arguments: "{\"shelf\":\"B2\"}" } },
				],
			},
		}],
		usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
	};
}

function chatStreamReply(reasoningField: "reasoning" | "reasoning_content"): Response {
	return sseResponse([
		{ id: "c1", object: "chat.completion.chunk", choices: [{ index: 0, delta: { role: "assistant", [reasoningField]: "Look up " }, finish_reason: null }] },
		{ id: "c1", object: "chat.completion.chunk", choices: [{ index: 0, delta: { [reasoningField]: "both shelves." }, finish_reason: null }] },
		{ id: "c1", object: "chat.completion.chunk", choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: "call_a", type: "function", function: { name: "lookup", arguments: "{\"shelf\":\"A1\"}" } }] }, finish_reason: null }] },
		{ id: "c1", object: "chat.completion.chunk", choices: [{ index: 0, delta: { tool_calls: [{ index: 1, id: "call_b", type: "function", function: { name: "lookup", arguments: "{\"shelf\":\"B2\"}" } }] }, finish_reason: null }] },
		{ id: "c1", object: "chat.completion.chunk", choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }], usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } },
		"[DONE]",
	]);
}

describe("open reasoning models: reasoning text goes back on the tool-result step", () => {
	for (const host of HOSTS) {
		const execute = resolveProviderExecutor(host.providerId, "text.generate")!;
		const chatArgs = (messages: any[], stream: boolean) => args(decodeOpenAIChatRequest(ChatCompletionsSchema.parse({
			model: "openai/gpt-oss-20b", reasoning_effort: "low", tools: [chatTool], stream, messages,
		}) as any), { providerId: host.providerId, providerModelSlug: host.slug, capabilityParams: null });

		for (const streamed of [false, true]) {
			it(`${host.bug ? "BUG: " : ""}${host.providerId} (${streamed ? "streamed" : "non-streamed"}): the reasoning goes back`, async () => {
				const upstream = () => (streamed ? chatStreamReply(host.field) : jsonResponse(chatReply(host.field)));
				const step1 = await run(upstream, () => execute(chatArgs([{ role: "user", content: "Count the crates." }], streamed)));
				const message = streamed
					? chatMessageFromStream(step1.result.streamText)
					: (encodeOpenAIChatResponse(step1.result.ir, "req_rr") as any).choices[0].message;
				const step2 = await run(() => jsonResponse(chatReply(host.field)), () => execute(chatArgs([{ role: "user", content: "Count the crates." }, message, ...chatResults], false)));
				const body = step2.call.bodyJson;
				if (Array.isArray(body.messages)) {
					const assistant = body.messages.find((entry: any) => entry.role === "assistant");
					expect(assistant[host.field]).toBe("Look up both shelves.");
				} else {
					// Groq and Fireworks routes go to /responses, which takes the reasoning
					// back as a reasoning item with reasoning_text content (Groq's multi-turn
					// example appends response.output, reasoning items included).
					expect(shape(body.input)).toEqual(["user", "reasoning", "call:call_a", "call:call_b", "result:call_a", "result:call_b"]);
					expect(body.input[1].content).toEqual([{ type: "reasoning_text", text: "Look up both shelves." }]);
				}
			});
		}
	}
});
