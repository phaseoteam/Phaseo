// Gemini thought signatures must come back to Gemini on the part that carried
// them, in the original order, whichever client surface the conversation uses:
// https://docs.cloud.google.com/vertex-ai/generative-ai/docs/thought-signatures
// Gemini 3+ returns 400 when the first functionCall of a step in the current turn
// arrives without its signature. Signatures must never reach another provider.
import { describe, expect, it, it as itBase } from "vitest";
import { decodeOpenAIChatRequest } from "@protocols/openai-chat/decode";
import { decodeOpenAIResponsesRequest } from "@protocols/openai-responses/decode";
import { decodeAnthropicMessagesRequest } from "@protocols/anthropic-messages/decode";
import { encodeOpenAIChatResponse } from "@protocols/openai-chat/encode";
import { encodeOpenAIResponsesResponse } from "@protocols/openai-responses/encode";
import { encodeAnthropicMessagesResponse } from "@protocols/anthropic-messages/encode";
import { GOOGLE_REASONING_FORMAT } from "@core/reasoning-state";
import { geminiToIR, irToGemini as vertexIrToGemini } from "@executors/google-vertex/text-generate";
import { irToGemini as interactionsIrToGemini, transformStream } from "../index";
import { irToAnthropicMessages, anthropicMessagesToIR } from "@executors/anthropic/text-generate";
import { bedrockInvokeBody } from "@executors/amazon-bedrock/text-generate";

const MODEL = "gemini-3.5-flash";
const GATEWAY_MODEL = "google/gemini-3.5-flash";
const SKIP = "skip_thought_signature_validator";

const lookup = (id: string | undefined, shelf: string) => ({ ...(id ? { id } : {}), name: "lookup", args: { shelf } });

// Model turns Gemini can return. Each must go back to Gemini part for part.
const SHAPES: Record<string, { parts: any[]; calls: string[] }> = {
	"one signed function call": {
		parts: [
			{ text: "Plan.", thought: true },
			{ functionCall: lookup("fc_1", "A1"), thoughtSignature: "sig-call-1" },
		],
		calls: ["fc_1"],
	},
	"parallel calls, only the first signed": {
		parts: [
			{ text: "Check both.", thought: true },
			{ functionCall: lookup("fc_1", "A1"), thoughtSignature: "sig-call-1" },
			{ functionCall: lookup("fc_2", "B2") },
		],
		calls: ["fc_1", "fc_2"],
	},
	"parallel calls without upstream ids": {
		parts: [
			{ functionCall: lookup(undefined, "A1"), thoughtSignature: "sig-call-1" },
			{ functionCall: lookup(undefined, "B2") },
		],
		calls: ["lookup", "lookup_1"],
	},
	"text answer with the signature on the last text part": {
		parts: [
			{ text: "Plan.", thought: true },
			{ text: "There are 4 crates.", thoughtSignature: "sig-text" },
		],
		calls: [],
	},
	"signature on an empty thought part before the call": {
		parts: [
			{ text: "", thought: true, thoughtSignature: "sig-thought" },
			{ functionCall: lookup("fc_1", "A1"), thoughtSignature: "sig-call-1" },
		],
		calls: ["fc_1"],
	},
};

const tools = [{ type: "function", function: { name: "lookup", parameters: { type: "object", properties: { shelf: { type: "string" } } } } }];

function geminiReply(parts: any[]) {
	return geminiToIR({ candidates: [{ index: 0, content: { role: "model", parts }, finishReason: "STOP" }], usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 5 } } as any, "req_1", MODEL, "google-vertex");
}

/** Gemini parts with signature key spelling and absent fields normalised. */
function normalise(parts: any[]): any[] {
	return JSON.parse(JSON.stringify(parts.map((part) => {
		const { thought_signature, ...rest } = part;
		const signature = rest.thoughtSignature ?? thought_signature;
		const out: any = { ...rest };
		delete out.thoughtSignature;
		if (signature) out.thoughtSignature = signature;
		return out;
	})));
}

async function upstreamModelTurn(ir: any, target = MODEL) {
	const request = await vertexIrToGemini(ir, target);
	return { request, turn: request.contents.find((content: any) => content.role === "model") };
}

const results = (ids: string[]) => ids.map((id) => ({ id, out: `${id}: 4 crates` }));

function chatFollowUp(assistant: any, calls: string[]) {
	return decodeOpenAIChatRequest({
		model: GATEWAY_MODEL,
		reasoning_effort: "low",
		tools,
		messages: [
			{ role: "user", content: "Count the crates." },
			assistant,
			...results(calls).map((r) => ({ role: "tool", tool_call_id: r.id, content: r.out })),
			...(calls.length ? [] : [{ role: "user", content: "And shelf B?" }]),
		],
	} as any);
}

function responsesFollowUp(output: any[], calls: string[]) {
	return decodeOpenAIResponsesRequest({
		model: GATEWAY_MODEL,
		reasoning: { effort: "low" },
		tools: [{ type: "function", name: "lookup", parameters: tools[0].function.parameters }],
		input: [
			{ role: "user", content: "Count the crates." },
			...output,
			...results(calls).map((r) => ({ type: "function_call_output", call_id: r.id, output: r.out })),
			...(calls.length ? [] : [{ role: "user", content: "And shelf B?" }]),
		],
	} as any);
}

function messagesFollowUp(content: any[], calls: string[]) {
	return decodeAnthropicMessagesRequest({
		model: GATEWAY_MODEL,
		max_tokens: 1024,
		tools: [{ name: "lookup", input_schema: tools[0].function.parameters }],
		messages: [
			{ role: "user", content: "Count the crates." },
			{ role: "assistant", content },
			calls.length
				? { role: "user", content: results(calls).map((r) => ({ type: "tool_result", tool_use_id: r.id, content: r.out })) }
				: { role: "user", content: "And shelf B?" },
		],
	} as any);
}

// ---------------------------------------------------------------------------
// Streams: the same reply as a Gemini SSE stream, one part per frame.
// ---------------------------------------------------------------------------

function geminiStream(parts: any[]): ReadableStream<Uint8Array> {
	const frames = parts.map((part) => ({ candidates: [{ index: 0, content: { role: "model", parts: [part] } }] }));
	frames.push({ candidates: [{ index: 0, content: { role: "model", parts: [] }, finishReason: "STOP" }], usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 5 } } as any);
	return new Response(frames.map((frame) => `data: ${JSON.stringify(frame)}\n\n`).join("")).body!;
}

function streamArgs(protocol: string) {
	return {
		ir: { messages: [], model: MODEL, stream: true },
		requestId: "req_1",
		workspaceId: "team_test",
		providerId: "google-vertex",
		providerModelSlug: MODEL,
		endpoint: protocol === "openai.responses" ? "responses" : "chat.completions",
		protocol,
		capability: "text.generate",
		byokMeta: [],
		pricingCard: null,
		meta: {},
	} as any;
}

async function streamFrames(parts: any[], protocol: string) {
	const text = await new Response(transformStream(geminiStream(parts), streamArgs(protocol))).text();
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

/** Accumulate a streamed Chat reply the way OpenRouter-style clients do. */
function accumulateChat(frames: any[]) {
	const details = new Map<number, any>();
	const calls: any[] = [];
	let content = "";
	let nextDetail = 0;
	for (const frame of frames) {
		const delta = frame.choices?.[0]?.delta;
		if (!delta) continue;
		if (typeof delta.content === "string") content += delta.content;
		for (const detail of delta.reasoning_details ?? []) {
			const key = typeof detail.index === "number" ? detail.index : nextDetail++;
			const previous = details.get(key);
			if (!previous) { details.set(key, { ...detail }); continue; }
			for (const field of ["text", "signature", "data"]) if (typeof detail[field] === "string") previous[field] = (previous[field] ?? "") + detail[field];
		}
		for (const call of delta.tool_calls ?? []) {
			const slot = (calls[call.index] ??= { id: call.id, type: "function", function: { name: "", arguments: "" } });
			if (call.function?.name) slot.function.name += call.function.name;
			if (call.function?.arguments) slot.function.arguments += call.function.arguments;
		}
	}
	return {
		role: "assistant",
		content,
		...(calls.length ? { tool_calls: calls } : {}),
		reasoning_details: [...details.values()].map(({ index, ...detail }) => detail),
	};
}

// Not yet supported: a signature on a final text part. Over Chat it travels as a
// Google reasoning entry, and putting it back on the text needs its position sealed
// (protocols/shared/reasoning.ts records position only for Claude today). Google
// does not enforce this signature, so the cost is reasoning quality, not a 400.
const KNOWN_GAPS = new Set<string>([]);

for (const [shape, { parts, calls: _calls }] of Object.entries(SHAPES)) {
	const it = KNOWN_GAPS.has(shape) ? itBase.skip : itBase;
	describe(`Gemini generateContent: ${shape}`, () => {
		it("non-streamed Chat Completions", async () => {
			const reply = geminiReply(parts);
			const callIds = (reply.choices[0].message.toolCalls ?? []).map((call: any) => call.id);
			const message = (encodeOpenAIChatResponse(reply, "req_1") as any).choices[0].message;
			const { turn } = await upstreamModelTurn(chatFollowUp(message, callIds));
			expect(normalise(turn.parts)).toEqual(normalise(parts));
		});

		it("non-streamed Responses", async () => {
			const reply = geminiReply(parts);
			const callIds = (reply.choices[0].message.toolCalls ?? []).map((call: any) => call.id);
			const encoded = encodeOpenAIResponsesResponse(reply, "req_1") as any;
			const { turn } = await upstreamModelTurn(responsesFollowUp(encoded.output, callIds));
			expect(normalise(turn.parts)).toEqual(normalise(parts));
		});

		it("non-streamed Anthropic Messages", async () => {
			const reply = geminiReply(parts);
			const callIds = (reply.choices[0].message.toolCalls ?? []).map((call: any) => call.id);
			const encoded = encodeAnthropicMessagesResponse(reply) as any;
			const { turn } = await upstreamModelTurn(messagesFollowUp(encoded.content, callIds));
			expect(normalise(turn.parts)).toEqual(normalise(parts));
		});

		it("streamed Chat Completions", async () => {
			const assistant = accumulateChat(await streamFrames(parts, "openai.chat.completions"));
			const callIds = (assistant.tool_calls ?? []).map((call: any) => call.id);
			const { turn } = await upstreamModelTurn(chatFollowUp(assistant, callIds));
			expect(normalise(turn.parts)).toEqual(normalise(parts));
		});

		it("streamed Responses", async () => {
			const frames = await streamFrames(parts, "openai.responses");
			const output = frames.find((frame) => frame.type === "response.completed")?.response?.output ?? [];
			const callIds = output.filter((item: any) => item.type === "function_call").map((item: any) => item.call_id);
			const { turn } = await upstreamModelTurn(responsesFollowUp(output, callIds));
			expect(normalise(turn.parts)).toEqual(normalise(parts));
		});
	});
}

describe("Gemini generateContent: a client that drops reasoning", () => {
	it("Chat: the first call of the step gets Google's skip placeholder, not a 400", async () => {
		const reply = geminiReply(SHAPES["parallel calls, only the first signed"].parts);
		const { reasoning_details: _dropped, ...message } = (encodeOpenAIChatResponse(reply, "req_1") as any).choices[0].message;
		const { turn } = await upstreamModelTurn(chatFollowUp(message, ["fc_1", "fc_2"]));
		const callParts = turn.parts.filter((part: any) => part.functionCall);
		expect(callParts.map((part: any) => part.thoughtSignature)).toEqual([SKIP, undefined]);
	});

	it("each step of a multi-step turn gets the placeholder on its first call", async () => {
		const ir = decodeOpenAIChatRequest({
			model: GATEWAY_MODEL,
			tools,
			messages: [
				{ role: "user", content: "Count the crates." },
				{ role: "assistant", content: null, tool_calls: [{ id: "fc_1", type: "function", function: { name: "lookup", arguments: "{\"shelf\":\"A1\"}" } }] },
				{ role: "tool", tool_call_id: "fc_1", content: "4" },
				{ role: "assistant", content: null, tool_calls: [{ id: "fc_2", type: "function", function: { name: "lookup", arguments: "{\"shelf\":\"B2\"}" } }, { id: "fc_3", type: "function", function: { name: "lookup", arguments: "{\"shelf\":\"C3\"}" } }] },
				{ role: "tool", tool_call_id: "fc_2", content: "5" },
				{ role: "tool", tool_call_id: "fc_3", content: "6" },
			],
		} as any);
		const request = await vertexIrToGemini(ir, MODEL);
		const signatures = request.contents.filter((content: any) => content.role === "model")
			.map((content: any) => content.parts.map((part: any) => part.thoughtSignature ?? null));
		expect(signatures).toEqual([[SKIP], [SKIP, null]]);
		// Parallel responses go together, in call order, after all calls.
		expect(request.contents.at(-1).parts.map((part: any) => part.functionResponse.id)).toEqual(["fc_2", "fc_3"]);
	});
});

describe("Gemini signatures across models and providers", () => {
	const reply = () => geminiReply(SHAPES["parallel calls, only the first signed"].parts);

	it("another Gemini model gets the placeholder, never the foreign signature", async () => {
		const message = (encodeOpenAIChatResponse(reply(), "req_1") as any).choices[0].message;
		const { request } = await upstreamModelTurn(chatFollowUp(message, ["fc_1", "fc_2"]), "gemini-3.1-pro-preview");
		expect(JSON.stringify(request)).not.toContain("sig-call-1");
		const turn = request.contents.find((content: any) => content.role === "model");
		expect(turn.parts.find((part: any) => part.functionCall).thoughtSignature).toBe(SKIP);
	});

	it("the same model on AI Studio Interactions gets the signature back on its function_call step", async () => {
		const message = (encodeOpenAIChatResponse(reply(), "req_1") as any).choices[0].message;
		const request = await interactionsIrToGemini(chatFollowUp(message, ["fc_1", "fc_2"]), MODEL);
		const steps = request.input.filter((step: any) => step.type === "function_call");
		expect(steps.map((step: any) => step.signature ?? null)).toEqual(["sig-call-1", null]);
	});

	it("Claude never receives a Gemini signature", () => {
		const message = (encodeOpenAIChatResponse(reply(), "req_1") as any).choices[0].message;
		const ir = chatFollowUp(message, ["fc_1", "fc_2"]);
		const payload = irToAnthropicMessages({ ...ir, model: "claude-opus-5-5" } as any, null, "claude-opus-5-5", { providerId: "anthropic" });
		expect(JSON.stringify(payload)).not.toContain("sig-call-1");
		const assistant = payload.messages.find((m: any) => m.role === "assistant");
		expect(assistant.content.filter((block: any) => block.type === "thinking" || block.type === "redacted_thinking")).toEqual([]);
	});

	it("Gemini never receives a Claude thinking block; the call gets the placeholder", async () => {
		const claude = anthropicMessagesToIR({
			id: "msg_1", type: "message", role: "assistant", model: "claude-opus-5-5", stop_reason: "tool_use",
			content: [
				{ type: "thinking", thinking: "Claude plan.", signature: "claude-sig" },
				{ type: "redacted_thinking", data: "claude-redacted" },
				{ type: "tool_use", id: "toolu_1", name: "lookup", input: { shelf: "A1" } },
			],
			usage: { input_tokens: 1, output_tokens: 1 },
		}, "req_1", "anthropic/claude-opus-5.5", "anthropic");
		const message = (encodeOpenAIChatResponse(claude, "req_1") as any).choices[0].message;
		const { request, turn } = await upstreamModelTurn(chatFollowUp(message, ["toolu_1"]));
		expect(JSON.stringify(request)).not.toContain("claude-sig");
		expect(JSON.stringify(request)).not.toContain("claude-redacted");
		expect(JSON.stringify(request)).not.toContain("Claude plan.");
		expect(turn.parts).toEqual([{ functionCall: { id: "toolu_1", name: "lookup", args: { shelf: "A1" } }, thoughtSignature: SKIP }]);
	});
});

// ---------------------------------------------------------------------------
// AI Studio Interactions (stateless). The IR below is what interactionToIR
// builds (index.ts interactionToIR): a signed thought step, then function calls.
// ---------------------------------------------------------------------------

function interactionsReply() {
	return {
		id: "req_1",
		created: 0,
		model: MODEL,
		provider: "google-ai-studio",
		choices: [{
			index: 0,
			finishReason: "tool_calls",
			message: {
				role: "assistant",
				content: [{ type: "reasoning_text", text: "Check both.", summary: "Check both.", thoughtSignature: "sig-thought", reasoningFormat: GOOGLE_REASONING_FORMAT, reasoningModel: MODEL, reasoningProvider: "google-ai-studio" }],
				toolCalls: [
					{ id: "fc_1", name: "lookup", arguments: "{\"shelf\":\"A1\"}", thoughtSignature: "sig-call-1", thoughtSignatureModel: MODEL },
					{ id: "fc_2", name: "lookup", arguments: "{\"shelf\":\"B2\"}" },
				],
			},
		}],
	} as any;
}

const EXPECTED_STEPS = [
	{ type: "thought", signature: "sig-thought", summary: [{ type: "text", text: "Check both." }] },
	{ type: "function_call", id: "fc_1", name: "lookup", arguments: { shelf: "A1" }, signature: "sig-call-1" },
	{ type: "function_call", id: "fc_2", name: "lookup", arguments: { shelf: "B2" } },
];

describe("Gemini streamed thought text", () => {
	it("thought text split across chunks goes out as one reasoning.text entry and back as one thought", async () => {
		const parts = [
			{ text: "Check ", thought: true },
			{ text: "both.", thought: true },
			{ functionCall: lookup("fc_1", "A1"), thoughtSignature: "sig-call-1" },
		];
		const assistant = accumulateChat(await streamFrames(parts, "openai.chat.completions"));
		expect(assistant.reasoning_details.filter((d: any) => d.type === "reasoning.text").map((d: any) => d.text)).toEqual(["Check both."]);
		const { turn } = await upstreamModelTurn(chatFollowUp(assistant, ["fc_1"]));
		expect(normalise(turn.parts)).toEqual(normalise([{ text: "Check both.", thought: true }, parts[2]]));
	});

	it("streamed Responses output keeps the thought text once", async () => {
		const frames = await streamFrames([{ text: "Plan.", thought: true }, { functionCall: lookup("fc_1", "A1"), thoughtSignature: "sig-call-1" }], "openai.responses");
		const output = frames.find((frame) => frame.type === "response.completed")?.response?.output ?? [];
		expect(JSON.stringify(output).split("Plan.").length - 1).toBe(1);
	});
});

describe("Gemini Interactions: thought step and parallel calls", () => {
	const modelSteps = (request: any) => request.input.filter((step: any) => step.type !== "user_input" && step.type !== "function_result");

	it("Chat Completions", async () => {
		const message = (encodeOpenAIChatResponse(interactionsReply(), "req_1") as any).choices[0].message;
		expect(modelSteps(await interactionsIrToGemini(chatFollowUp(message, ["fc_1", "fc_2"]), MODEL))).toEqual(EXPECTED_STEPS);
	});

	it("Responses", async () => {
		const encoded = encodeOpenAIResponsesResponse(interactionsReply(), "req_1") as any;
		expect(modelSteps(await interactionsIrToGemini(responsesFollowUp(encoded.output, ["fc_1", "fc_2"]), MODEL))).toEqual(EXPECTED_STEPS);
	});

	it("Anthropic Messages", async () => {
		const encoded = encodeAnthropicMessagesResponse(interactionsReply()) as any;
		expect(modelSteps(await interactionsIrToGemini(messagesFollowUp(encoded.content, ["fc_1", "fc_2"]), MODEL))).toEqual(EXPECTED_STEPS);
	});

	// Live 400 before the fix: "Missing text in content of type text."
	it("a Chat client that sends content: \"\" next to its tool calls adds no empty text step", async () => {
		const message = { ...(encodeOpenAIChatResponse(interactionsReply(), "req_1") as any).choices[0].message, content: "" };
		const steps = modelSteps(await interactionsIrToGemini(chatFollowUp(message, ["fc_1", "fc_2"]), MODEL));
		expect(steps).toEqual(EXPECTED_STEPS);
	});

	it("a client that drops reasoning: function_call steps go without any signature (no skip placeholder on Interactions)", async () => {
		const { reasoning_details: _dropped, ...message } = (encodeOpenAIChatResponse(interactionsReply(), "req_1") as any).choices[0].message;
		const steps = modelSteps(await interactionsIrToGemini(chatFollowUp(message, ["fc_1", "fc_2"]), MODEL)).filter((step: any) => step.type === "function_call");
		// Documents current behaviour: generateContent would get the skip placeholder here.
		expect(steps.map((step: any) => step.signature ?? null)).toEqual([null, null]);
	});
});

// ---------------------------------------------------------------------------
// Claude on Vertex and Bedrock share the Anthropic mapping (irToAnthropicMessages,
// anthropicMessagesToIR, the stream transformer), so the ordering anchors apply.
// ---------------------------------------------------------------------------

describe("Claude on Vertex and Bedrock", () => {
	const blocks = [
		{ type: "thinking", thinking: "Check both shelves.", signature: "sig-a" },
		{ type: "text", text: "Looking both up." },
		{ type: "tool_use", id: "toolu_x", name: "lookup", input: { shelf: "A1" } },
		{ type: "thinking", thinking: "", signature: "sig-b" },
		{ type: "tool_use", id: "toolu_y", name: "lookup", input: { shelf: "B2" } },
	];
	const reply = (model: string, provider: string) => anthropicMessagesToIR(
		{ id: "msg_1", type: "message", role: "assistant", model, content: blocks, stop_reason: "tool_use", usage: { input_tokens: 1, output_tokens: 1 } },
		"req_1", model, provider,
	);
	const replay = (model: string, origin: string, target: string) => {
		const message = (encodeOpenAIChatResponse(reply(model, origin), "req_1") as any).choices[0].message;
		const ir = chatFollowUp(message, ["toolu_x", "toolu_y"]);
		const payload = irToAnthropicMessages({ ...ir, model } as any, null, model, { providerId: target });
		return payload.messages.find((m: any) => m.role === "assistant").content;
	};

	it.each(["google-vertex", "amazon-bedrock"])("keeps thinking order over Chat on %s", (provider) => {
		expect(replay("claude-opus-5-5", provider, provider)).toEqual(blocks);
	});

	it("Bedrock InvokeModel keeps the messages unchanged", () => {
		const message = (encodeOpenAIChatResponse(reply("claude-opus-5-5", "amazon-bedrock"), "req_1") as any).choices[0].message;
		const ir = chatFollowUp(message, ["toolu_x", "toolu_y"]);
		const payload = irToAnthropicMessages({ ...ir, model: "claude-opus-5-5" } as any, null, "claude-opus-5-5", { providerId: "amazon-bedrock" });
		const body = bedrockInvokeBody(payload, "global.anthropic.claude-opus-5-5");
		expect(body.messages.find((m: any) => m.role === "assistant").content).toEqual(blocks);
	});

	it("Opus 5.5 thinking from the Claude API goes to Vertex (not account-bound)", () => {
		expect(replay("claude-opus-5-5", "anthropic", "google-vertex")).toEqual(blocks);
	});

	it("Haiku 5.5 thinking from the Claude API never goes to Bedrock (account-bound)", () => {
		const content = replay("claude-haiku-5-5", "anthropic", "amazon-bedrock");
		expect(JSON.stringify(content)).not.toContain("sig-a");
		expect(content.filter((block: any) => block.type === "thinking")).toEqual([]);
	});
});

describe("Interactions when the client dropped reasoning", () => {
	// Live 2026-11-13, gemini-3.1-flash-lite: function_call steps with no signed thought
	// before them returned 400 "Request contains an invalid argument"; a thought step
	// carrying the skip value was accepted.
	const request = (assistant: any) => decodeOpenAIChatRequest({
		model: "google/gemini-3.1-flash-lite",
		tools: [{ type: "function", function: { name: "lookup", parameters: { type: "object", properties: {} } } }],
		messages: [
			{ role: "user", content: "Count the crates." },
			assistant,
			{ role: "tool", tool_call_id: "call_a", content: "4 crates" },
			{ role: "tool", tool_call_id: "call_b", content: "5 crates" },
		],
	} as any);
	const calls = [
		{ id: "call_a", type: "function", function: { name: "lookup", arguments: "{\"shelf\":\"A1\"}" } },
		{ id: "call_b", type: "function", function: { name: "lookup", arguments: "{\"shelf\":\"B2\"}" } },
	];

	it("puts a skip-signature thought step before the calls", async () => {
		const body = await interactionsIrToGemini(request({ role: "assistant", content: "", tool_calls: calls }), "gemini-3.1-flash-lite");
		expect(body.input.map((step: any) => step.type)).toEqual(["user_input", "thought", "function_call", "function_call", "function_result", "function_result"]);
		expect(body.input[1]).toEqual({ type: "thought", signature: "skip_thought_signature_validator" });
	});

	it("adds nothing when the client sent the signed thought back", async () => {
		const ir = request({ role: "assistant", content: "", tool_calls: calls });
		const assistant: any = ir.messages.find((message) => message.role === "assistant");
		assistant.content.unshift({ type: "reasoning_text", text: "Check both.", thoughtSignature: "sig-real", reasoningFormat: GOOGLE_REASONING_FORMAT, reasoningModel: "gemini-3.1-flash-lite", reasoningProvider: "google-ai-studio" });
		const body = await interactionsIrToGemini(ir, "gemini-3.1-flash-lite");
		expect(body.input.filter((step: any) => step.signature === "skip_thought_signature_validator")).toEqual([]);
		expect(body.input.find((step: any) => step.type === "thought")?.signature).toBe("sig-real");
	});
});
