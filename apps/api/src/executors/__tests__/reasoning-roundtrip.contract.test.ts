// Round-trip contract tests for reasoning state on agent tool loops (review
// finding R3: A-F4, G-F6). Each test runs a 3-step tool loop through the
// public surfaces: client request -> decode -> executor -> upstream body, and
// upstream response -> executor -> encode -> what the client sends back next.
// Upstream payloads follow the providers' documented response shapes.

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { IRChatRequest, IRChatResponse } from "@core/ir";
import type { ExecutorExecuteArgs } from "@executors/types";
import { ChatCompletionsSchema, ResponsesSchema } from "@core/schemas";
import { decodeOpenAIChatRequest } from "@protocols/openai-chat/decode";
import { decodeOpenAIResponsesRequest } from "@protocols/openai-responses/decode";
import { encodeOpenAIChatResponse } from "@protocols/openai-chat/encode";
import { encodeOpenAIResponsesResponse } from "@protocols/openai-responses/encode";
import { executor as anthropicExecutor } from "@executors/anthropic/text-generate";
import { executor as openAIExecutor } from "@executors/openai/text-generate";
import { execute as azureExecute } from "@executors/azure/text-generate";
import { execute as vertexExecute } from "@executors/google-vertex/text-generate";
import { executor as aiStudioExecutor } from "@executors/google-ai-studio/text-generate";
import { irToOpenAIChat } from "@executors/_shared/text-generate/openai-compat/transform-chat";
import { installFetchMock, jsonResponse, type FetchCall } from "../../../tests/helpers/mock-fetch";
import { setupTestRuntime, teardownTestRuntime } from "../../../tests/helpers/runtime";
import { sseResponse } from "../../../tests/helpers/sse";

vi.mock("@supabase/supabase-js", () => ({
	createClient: () => ({}),
}));

beforeAll(() => setupTestRuntime());
afterAll(() => teardownTestRuntime());

// Example values from the providers' documentation.
const CLAUDE_SIG_1 = "EqQBCgIYAhIM1gbcDa9GJwZA2b3hGgxBdjrkzLoky3dl1pkiMOYds";
const CLAUDE_SIG_2 = "EoYDCkYIBRgCKkCuWBQx9X4m2xgvQlNyfBBMyU3pQn6c1vH7Y";
const CLAUDE_REDACTED = "EmwKAhgBEgy3va3pzix/LafPsn4aDFIT2Xlxh0L5L8rLVyIwxtE3rAFBa8cr3qpPkNRj2YfWXGmKDxH4mPnZ5sQ7vB5URj2pabSmabLfz4OxaB4zKkM2ahv4";
const OPENAI_ENC_1 = "gAAAAABpY3Rlc3QtZW5jcnlwdGVkLXJlYXNvbmluZy1zdGVwLTE=";
const OPENAI_ENC_2 = "gAAAAABpY3Rlc3QtZW5jcnlwdGVkLXJlYXNvbmluZy1zdGVwLTI=";
const GEMINI_SIG_1 = "CiQBcsjafE5ZpLbYqI2h1lJ0n8o9Yq3kQ5Nn0WJv3oPpTgHxkfQ=";
const GEMINI_SIG_2 = "CiQBcsjafHk2Vwz9d7Vb0eXq1kQm3aTGp8E4f2oN6qLrYtUoPcA=";

const weatherTool = {
	type: "function",
	function: {
		name: "get_weather",
		description: "Current weather for a city",
		parameters: { type: "object", properties: { city: { type: "string" } }, required: ["city"] },
	},
};
const responsesWeatherTool = {
	type: "function",
	name: "get_weather",
	description: "Current weather for a city",
	parameters: { type: "object", properties: { city: { type: "string" } }, required: ["city"] },
};

function chatIR(body: Record<string, any>): IRChatRequest {
	return decodeOpenAIChatRequest(ChatCompletionsSchema.parse(body) as any);
}

function responsesIR(body: Record<string, any>): IRChatRequest {
	return decodeOpenAIResponsesRequest(ResponsesSchema.parse(body) as any);
}

function args(ir: IRChatRequest, overrides: Partial<ExecutorExecuteArgs>): ExecutorExecuteArgs {
	return {
		ir,
		requestId: "req_reasoning",
		workspaceId: "ws_reasoning",
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

async function run(
	match: (url: string) => boolean,
	response: () => Response,
	execute: () => Promise<any>,
): Promise<{ call: FetchCall; result: any }> {
	const mock = installFetchMock([{ match, response }]);
	let result: any;
	try {
		result = await execute();
	} finally {
		mock.restore();
	}
	expect(mock.calls).toHaveLength(1);
	return { call: mock.calls[0]!, result };
}

function completedIR(result: any): IRChatResponse {
	if (result.kind !== "completed" || !result.ir) throw new Error(`expected a completed result, got ${result.kind}`);
	return result.ir;
}

/** Anthropic Messages SSE for one assistant step (documented event grammar). */
function claudeStep(blocks: Array<Record<string, any>>, model: string): Response {
	const events: any[] = [{
		type: "message_start",
		message: { id: "msg_step", type: "message", role: "assistant", model, content: [], usage: { input_tokens: 40, output_tokens: 1 } },
	}];
	blocks.forEach((block, index) => {
		if (block.type === "thinking") {
			events.push({ type: "content_block_start", index, content_block: { type: "thinking", thinking: "", signature: "" } });
			if (block.thinking) events.push({ type: "content_block_delta", index, delta: { type: "thinking_delta", thinking: block.thinking } });
			events.push({ type: "content_block_delta", index, delta: { type: "signature_delta", signature: block.signature } });
		} else if (block.type === "redacted_thinking") {
			events.push({ type: "content_block_start", index, content_block: block });
		} else if (block.type === "tool_use") {
			events.push({ type: "content_block_start", index, content_block: { type: "tool_use", id: block.id, name: block.name, input: {} } });
			events.push({ type: "content_block_delta", index, delta: { type: "input_json_delta", partial_json: JSON.stringify(block.input) } });
		} else {
			events.push({ type: "content_block_start", index, content_block: { type: "text", text: "" } });
			events.push({ type: "content_block_delta", index, delta: { type: "text_delta", text: block.text } });
		}
		events.push({ type: "content_block_stop", index });
	});
	events.push({ type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 30 } });
	events.push({ type: "message_stop" });
	return sseResponse(events);
}

async function readStreamFrames(stream: ReadableStream<Uint8Array>): Promise<Array<{ event: string | null; data: any }>> {
	const text = await new Response(stream).text();
	return text.split("\n\n").filter(Boolean).flatMap((block) => {
		const event = block.split("\n").find((line) => line.startsWith("event:"))?.slice(6).trim() ?? null;
		const dataLine = block.split("\n").find((line) => line.startsWith("data:"));
		if (!dataLine) return [];
		const raw = dataLine.slice(5).trim();
		if (raw === "[DONE]") return [];
		return [{ event, data: JSON.parse(raw) }];
	});
}

describe("Claude manual thinking (Opus 4.5 with a budget) over Chat Completions", () => {
	const model = "claude-opus-4-5-20251101";
	const isAnthropic = (url: string) => url === "https://api.anthropic.example/v1/messages";
	const base = {
		model: "anthropic/claude-opus-4.5",
		reasoning: { max_tokens: 2048 },
		tools: [weatherTool],
	};

	it("returns signatures in reasoning_details and replays them as thinking blocks on steps 2 and 3", async () => {
		const history: any[] = [{ role: "user", content: "Weather in Paris, then Rome?" }];

		// Step 1
		const step1 = await run(isAnthropic, () => claudeStep([
			{ type: "thinking", thinking: "I should check Paris first.", signature: CLAUDE_SIG_1 },
			{ type: "tool_use", id: "toolu_paris", name: "get_weather", input: { city: "Paris" } },
		], model), () => anthropicExecutor(args(chatIR({ ...base, messages: history }), { providerModelSlug: model })));
		expect(step1.call.bodyJson.thinking).toEqual({ type: "enabled", budget_tokens: 2048 });
		const reply1 = encodeOpenAIChatResponse(completedIR(step1.result), "req_1").choices[0].message as any;
		expect(reply1.reasoning_content).toBe("I should check Paris first.");
		expect(reply1.reasoning_details).toEqual([expect.objectContaining({
			type: "reasoning.text",
			text: "I should check Paris first.",
			format: "anthropic-claude-v1",
			signature: expect.stringMatching(/^phx1\./),
		})]);
		history.push(reply1, { role: "tool", tool_call_id: "toolu_paris", content: "{\"temp_c\":18}" });

		// Step 2: the signed thinking block must open the in-progress turn.
		const step2 = await run(isAnthropic, () => claudeStep([
			{ type: "thinking", thinking: "Now Rome.", signature: CLAUDE_SIG_2 },
			{ type: "tool_use", id: "toolu_rome", name: "get_weather", input: { city: "Rome" } },
		], model), () => anthropicExecutor(args(chatIR({ ...base, messages: history }), { providerModelSlug: model })));
		expect(step2.call.bodyJson.thinking).toEqual({ type: "enabled", budget_tokens: 2048 });
		expect(step2.call.bodyJson.messages[1]).toEqual({
			role: "assistant",
			content: [
				{ type: "thinking", thinking: "I should check Paris first.", signature: CLAUDE_SIG_1 },
				{ type: "tool_use", id: "toolu_paris", name: "get_weather", input: { city: "Paris" } },
			],
		});
		const reply2 = encodeOpenAIChatResponse(completedIR(step2.result), "req_2").choices[0].message as any;
		history.push(reply2, { role: "tool", tool_call_id: "toolu_rome", content: "{\"temp_c\":24}" });

		// Step 3: both steps keep their own signatures.
		const step3 = await run(isAnthropic, () => claudeStep([
			{ type: "thinking", thinking: "Both done.", signature: CLAUDE_SIG_1 },
			{ type: "text", text: "Paris 18°C, Rome 24°C." },
		], model), () => anthropicExecutor(args(chatIR({ ...base, messages: history }), { providerModelSlug: model })));
		const assistantTurns = step3.call.bodyJson.messages.filter((message: any) => message.role === "assistant");
		expect(assistantTurns.map((turn: any) => turn.content[0])).toEqual([
			{ type: "thinking", thinking: "I should check Paris first.", signature: CLAUDE_SIG_1 },
			{ type: "thinking", thinking: "Now Rome.", signature: CLAUDE_SIG_2 },
		]);
		expect(step3.call.bodyJson.thinking).toEqual({ type: "enabled", budget_tokens: 2048 });
	});

	it("sends the step without thinking when the client dropped the signature mid-turn", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const step = await run(isAnthropic, () => claudeStep([{ type: "text", text: "Paris is 18°C." }], model), () =>
			anthropicExecutor(args(chatIR({
				...base,
				messages: [
					{ role: "user", content: "Weather in Paris?" },
					// A client that kept only reasoning_content: no signature survives.
					{ role: "assistant", reasoning_content: "I should check Paris first.", tool_calls: [{ id: "toolu_paris", type: "function", function: { name: "get_weather", arguments: "{\"city\":\"Paris\"}" } }] },
					{ role: "tool", tool_call_id: "toolu_paris", content: "{\"temp_c\":18}" },
				],
			}), { providerModelSlug: model })));
		expect(step.call.bodyJson.thinking).toBeUndefined();
		expect(step.call.bodyJson.messages[1].content).toEqual([
			{ type: "tool_use", id: "toolu_paris", name: "get_weather", input: { city: "Paris" } },
		]);
		// The downgrade is logged, without prompt content.
		const logged = warn.mock.calls.find(([message]) => message === "[gateway] manual thinking dropped for this step");
		warn.mockRestore();
		expect(logged?.[1]).toMatchObject({ reason: "in_progress_turn_without_thinking_block" });
		expect(JSON.stringify(logged?.[1])).not.toContain("Paris");
	});
});

describe("Claude adaptive thinking over a streamed Responses tool loop", () => {
	const model = "claude-opus-5";
	const isAnthropic = (url: string) => url === "https://api.anthropic.example/v1/messages";
	const base = { model: "anthropic/claude-opus-5", stream: true, tools: [responsesWeatherTool], store: false };

	async function streamStep(input: any[], blocks: Array<Record<string, any>>) {
		const step = await run(isAnthropic, () => claudeStep(blocks, model), () =>
			anthropicExecutor(args(responsesIR({ ...base, input }), {
				providerModelSlug: model,
				endpoint: "responses",
				protocol: "openai.responses",
			})));
		if (step.result.kind !== "stream") throw new Error("expected a stream");
		const frames = await readStreamFrames(step.result.stream);
		const completed = frames.find((frame) => frame.event === "response.completed")?.data.response;
		const doneItems = frames.filter((frame) => frame.event === "response.output_item.done").map((frame) => frame.data.item);
		return { call: step.call, output: completed.output as any[], doneItems };
	}

	it("seals signatures and redacted thinking on reasoning items and replays them in order", async () => {
		const input: any[] = [{ role: "user", content: "Weather in Paris, then Rome?" }];

		const step1 = await streamStep(input, [
			{ type: "thinking", thinking: "", signature: CLAUDE_SIG_1 },
			{ type: "redacted_thinking", data: CLAUDE_REDACTED },
			{ type: "tool_use", id: "toolu_paris", name: "get_weather", input: { city: "Paris" } },
		]);
		expect(step1.call.bodyJson.thinking).toEqual({ type: "adaptive", display: "summarized" });
		const reasoning = step1.output.filter((item) => item.type === "reasoning");
		expect(reasoning).toHaveLength(2);
		expect(reasoning.every((item) => /^phx1\./.test(item.encrypted_content))).toBe(true);
		// Stream clients that collect output_item.done events get the same items.
		expect(step1.doneItems.filter((item) => item.type === "reasoning")).toEqual(reasoning);
		input.push(...step1.output, { type: "function_call_output", call_id: "toolu_paris", output: "{\"temp_c\":18}" });

		const step2 = await streamStep(input, [
			{ type: "thinking", thinking: "Now Rome.", signature: CLAUDE_SIG_2 },
			{ type: "tool_use", id: "toolu_rome", name: "get_weather", input: { city: "Rome" } },
		]);
		expect(step2.call.bodyJson.messages[1].content).toEqual([
			{ type: "thinking", thinking: "", signature: CLAUDE_SIG_1 },
			{ type: "redacted_thinking", data: CLAUDE_REDACTED },
			{ type: "tool_use", id: "toolu_paris", name: "get_weather", input: { city: "Paris" } },
		]);
		input.push(...step2.output, { type: "function_call_output", call_id: "toolu_rome", output: "{\"temp_c\":24}" });

		const step3 = await streamStep(input, [{ type: "text", text: "Paris 18°C, Rome 24°C." }]);
		const assistantTurns = step3.call.bodyJson.messages.filter((message: any) => message.role === "assistant");
		expect(assistantTurns).toHaveLength(2);
		expect(assistantTurns[1].content[0]).toEqual({ type: "thinking", thinking: "Now Rome.", signature: CLAUDE_SIG_2 });
		expect(step3.call.bodyJson.thinking).toEqual({ type: "adaptive", display: "summarized" });
	});
});

describe("GPT reasoning with encrypted_content over Responses", () => {
	const isOpenAI = (url: string) => url === "https://api.openai.com/v1/responses";
	const base = {
		model: "openai/gpt-5.1",
		reasoning: { effort: "medium", summary: "auto" },
		tools: [responsesWeatherTool],
	};

	function openAIStep(id: string, encrypted: string, call: { id: string; city: string } | null): Response {
		const output: any[] = [{
			type: "reasoning",
			id,
			summary: [{ type: "summary_text", text: `Checking ${call?.city ?? "the results"}.` }],
			encrypted_content: encrypted,
		}];
		output.push(call
			? { type: "function_call", id: `fc_${call.id}`, call_id: call.id, name: "get_weather", arguments: JSON.stringify({ city: call.city }), status: "completed" }
			: { type: "message", id: "msg_final", role: "assistant", status: "completed", content: [{ type: "output_text", text: "Paris 18°C, Rome 24°C.", annotations: [] }] });
		return sseResponse([{
			type: "response.completed",
			response: { id: `resp_${id}`, object: "response", created_at: 1760000000, model: "gpt-5.1", status: "completed", output, usage: { input_tokens: 50, output_tokens: 20, total_tokens: 70, output_tokens_details: { reasoning_tokens: 12 } } },
		}]);
	}

	async function step(input: any[], response: Response) {
		const result = await run(isOpenAI, () => response, () => openAIExecutor(args(responsesIR({ ...base, input }), {
			providerId: "openai",
			providerModelSlug: "gpt-5.1",
			endpoint: "responses",
			protocol: "openai.responses",
			capabilityParams: { params: { reasoning: {}, tools: {}, max_output_tokens: {} } },
		})));
		return { call: result.call, output: encodeOpenAIResponsesResponse(completedIR(result.result), "req_gpt").output as any[] };
	}

	it("requests encrypted reasoning with store=false and replays it unchanged on steps 2 and 3", async () => {
		const input: any[] = [{ role: "user", content: "Weather in Paris, then Rome?" }];

		const step1 = await step(input, openAIStep("rs_1", OPENAI_ENC_1, { id: "call_paris", city: "Paris" }));
		expect(step1.call.bodyJson.store).toBe(false);
		expect(step1.call.bodyJson.include).toContain("reasoning.encrypted_content");
		const reasoning1 = step1.output.find((item) => item.type === "reasoning");
		expect(reasoning1).toMatchObject({ id: "rs_1", encrypted_content: expect.stringMatching(/^phx1\./) });
		input.push(...step1.output, { type: "function_call_output", call_id: "call_paris", output: "{\"temp_c\":18}" });

		const step2 = await step(input, openAIStep("rs_2", OPENAI_ENC_2, { id: "call_rome", city: "Rome" }));
		expect(step2.call.bodyJson.input.slice(1, 3)).toEqual([
			{ type: "reasoning", id: "rs_1", summary: [{ type: "summary_text", text: "Checking Paris." }], encrypted_content: OPENAI_ENC_1 },
			{ type: "function_call", call_id: "call_paris", name: "get_weather", arguments: "{\"city\":\"Paris\"}" },
		]);
		input.push(...step2.output, { type: "function_call_output", call_id: "call_rome", output: "{\"temp_c\":24}" });

		const step3 = await step(input, openAIStep("rs_3", OPENAI_ENC_1, null));
		const replayed = step3.call.bodyJson.input.filter((item: any) => item.type === "reasoning");
		expect(replayed.map((item: any) => [item.id, item.encrypted_content])).toEqual([
			["rs_1", OPENAI_ENC_1],
			["rs_2", OPENAI_ENC_2],
		]);
	});

	it("seals encrypted_content on streamed Responses events", async () => {
		const mock = installFetchMock([{
			match: isOpenAI,
			response: () => sseResponse([
				{ type: "response.created", response: { id: "resp_s", object: "response", status: "in_progress" } },
				{ type: "response.output_item.done", output_index: 0, item: { type: "reasoning", id: "rs_s", summary: [], encrypted_content: OPENAI_ENC_1 } },
				{ type: "response.completed", response: { id: "resp_s", object: "response", status: "completed", output: [{ type: "reasoning", id: "rs_s", summary: [], encrypted_content: OPENAI_ENC_1 }], usage: { input_tokens: 5, output_tokens: 5, total_tokens: 10 } } },
			].map((frame) => frame)),
		}]);
		let result: any;
		try {
			result = await openAIExecutor(args(responsesIR({ ...base, stream: true, input: "Hi" }), {
				providerId: "openai",
				providerModelSlug: "gpt-5.1",
				endpoint: "responses",
				protocol: "openai.responses",
			}));
		} finally {
			mock.restore();
		}
		const text = await new Response(result.stream).text();
		expect(text).not.toContain(OPENAI_ENC_1.slice(0, 20) + "\"");
		expect(text).toContain("\"encrypted_content\":\"phx1.");
	});
});

describe("Gemini 3 thought signatures on parallel function calls", () => {
	it("returns the signature with the first call and replays it on Vertex generateContent", async () => {
		const isVertex = (url: string) => url.includes("/publishers/google/models/gemini-3.6-flash:");
		const vertexArgs = (messages: any[]) => args(chatIR({ model: "google/gemini-3.6-flash", tools: [weatherTool], messages }), {
			providerId: "google-vertex",
			providerModelSlug: "gemini-3.6-flash",
		});
		const messages: any[] = [{ role: "user", content: "Weather in Paris and Rome?" }];

		// Step 1: parallel calls, signature on the first functionCall part only (documented).
		const step1 = await run(isVertex, () => jsonResponse({
			candidates: [{
				content: { role: "model", parts: [
					{ functionCall: { name: "get_weather", args: { city: "Paris" } }, thoughtSignature: GEMINI_SIG_1 },
					{ functionCall: { name: "get_weather", args: { city: "Rome" } } },
				] },
				finishReason: "STOP",
			}],
			usageMetadata: { promptTokenCount: 30, candidatesTokenCount: 10, totalTokenCount: 40 },
		}), () => vertexExecute(vertexArgs(messages)));
		const reply1 = encodeOpenAIChatResponse(completedIR(step1.result), "req_g1").choices[0].message as any;
		const [paris, rome] = reply1.tool_calls;
		expect(paris.id).not.toBe(rome.id);
		expect(reply1.reasoning_details).toEqual([expect.objectContaining({
			type: "reasoning.encrypted",
			id: paris.id,
			format: "google-gemini-v1",
			data: expect.stringMatching(/^phx1\./),
		})]);
		messages.push(reply1,
			{ role: "tool", tool_call_id: paris.id, content: "{\"temp_c\":18}" },
			{ role: "tool", tool_call_id: rome.id, content: "{\"temp_c\":24}" });

		// Step 2: the real signature, not the placeholder, on the first call.
		const step2 = await run(isVertex, () => jsonResponse({
			candidates: [{
				content: { role: "model", parts: [
					{ functionCall: { name: "get_weather", args: { city: "Madrid" } }, thoughtSignature: GEMINI_SIG_2 },
				] },
				finishReason: "STOP",
			}],
			usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 8, totalTokenCount: 58 },
		}), () => vertexExecute(vertexArgs(messages)));
		expect(step2.call.bodyJson.contents[1].parts).toEqual([
			{ functionCall: { name: "get_weather", args: { city: "Paris" } }, thoughtSignature: GEMINI_SIG_1 },
			{ functionCall: { name: "get_weather", args: { city: "Rome" } } },
		]);
		const reply2 = encodeOpenAIChatResponse(completedIR(step2.result), "req_g2").choices[0].message as any;
		messages.push(reply2, { role: "tool", tool_call_id: reply2.tool_calls[0].id, content: "{\"temp_c\":27}" });

		// Step 3: each model turn keeps its own signature.
		const step3 = await run(isVertex, () => jsonResponse({
			candidates: [{ content: { role: "model", parts: [{ text: "Paris 18°C, Rome 24°C, Madrid 27°C." }] }, finishReason: "STOP" }],
			usageMetadata: { promptTokenCount: 70, candidatesTokenCount: 12, totalTokenCount: 82 },
		}), () => vertexExecute(vertexArgs(messages)));
		const modelTurns = step3.call.bodyJson.contents.filter((content: any) => content.role === "model");
		expect(modelTurns.map((turn: any) => turn.parts[0].thoughtSignature)).toEqual([GEMINI_SIG_1, GEMINI_SIG_2]);
	});

	it("resends every Interactions step with its signature on AI Studio (stateless)", async () => {
		const isInteractions = (url: string) => url.endsWith("/v1beta/interactions");
		const studioArgs = (input: any[]) => args(responsesIR({ model: "google/gemini-3.1-pro-preview", tools: [responsesWeatherTool], reasoning: { effort: "high" }, input }), {
			providerId: "google-ai-studio",
			providerModelSlug: "gemini-3.1-pro-preview",
			endpoint: "responses",
			protocol: "openai.responses",
		});
		const input: any[] = [{ role: "user", content: "Weather in Paris and Rome?" }];

		const step1 = await run(isInteractions, () => jsonResponse({
			id: "interactions/step1",
			status: "requires_action",
			steps: [
				{ type: "thought", signature: GEMINI_SIG_1 },
				{ type: "function_call", id: "fc_paris", name: "get_weather", arguments: { city: "Paris" } },
				{ type: "function_call", id: "fc_rome", name: "get_weather", arguments: { city: "Rome" } },
			],
			usage: { total_input_tokens: 30, total_output_tokens: 20, total_tokens: 50 },
		}), () => aiStudioExecutor(studioArgs(input)));
		expect(step1.call.bodyJson.store).toBe(false);
		const output1 = encodeOpenAIResponsesResponse(completedIR(step1.result), "req_i1").output as any[];
		// A signature-only thought is kept, sealed, before the calls.
		expect(output1.map((item) => item.type)).toEqual(["reasoning", "function_call", "function_call"]);
		expect(output1[0].encrypted_content).toMatch(/^phx1\./);
		input.push(...output1,
			{ type: "function_call_output", call_id: "fc_paris", output: "{\"temp_c\":18}" },
			{ type: "function_call_output", call_id: "fc_rome", output: "{\"temp_c\":24}" });

		const step2 = await run(isInteractions, () => jsonResponse({
			id: "interactions/step2",
			status: "requires_action",
			steps: [
				{ type: "thought", signature: GEMINI_SIG_2, summary: [{ type: "text", text: "Madrid too." }] },
				{ type: "function_call", id: "fc_madrid", name: "get_weather", arguments: { city: "Madrid" } },
			],
			usage: { total_input_tokens: 60, total_output_tokens: 10, total_tokens: 70 },
		}), () => aiStudioExecutor(studioArgs(input)));
		expect(step2.call.bodyJson.input.slice(1, 4)).toEqual([
			{ type: "thought", signature: GEMINI_SIG_1 },
			{ type: "function_call", id: "fc_paris", name: "get_weather", arguments: { city: "Paris" } },
			{ type: "function_call", id: "fc_rome", name: "get_weather", arguments: { city: "Rome" } },
		]);
		const output2 = encodeOpenAIResponsesResponse(completedIR(step2.result), "req_i2").output as any[];
		input.push(...output2, { type: "function_call_output", call_id: "fc_madrid", output: "{\"temp_c\":27}" });

		const step3 = await run(isInteractions, () => jsonResponse({
			id: "interactions/step3",
			status: "completed",
			steps: [{ type: "model_output", content: [{ type: "text", text: "Paris 18°C, Rome 24°C, Madrid 27°C." }] }],
			usage: { total_input_tokens: 80, total_output_tokens: 12, total_tokens: 92 },
		}), () => aiStudioExecutor(studioArgs(input)));
		const thoughts = step3.call.bodyJson.input.filter((step: any) => step.type === "thought");
		expect(thoughts).toEqual([
			{ type: "thought", signature: GEMINI_SIG_1 },
			{ type: "thought", signature: GEMINI_SIG_2, summary: { type: "text", text: "Madrid too." } },
		]);
	});
});

describe("cross-provider fallback drops foreign reasoning state", () => {
	// History from a Claude step, as a Chat client returns it.
	async function claudeHistory(): Promise<any[]> {
		const step = await run((url) => url === "https://api.anthropic.example/v1/messages", () => claudeStep([
			{ type: "thinking", thinking: "Check Paris.", signature: CLAUDE_SIG_1 },
			{ type: "tool_use", id: "toolu_paris", name: "get_weather", input: { city: "Paris" } },
		], "claude-opus-4-5-20251101"), () => anthropicExecutor(args(chatIR({
			model: "anthropic/claude-opus-4.5",
			reasoning: { max_tokens: 2048 },
			tools: [weatherTool],
			messages: [{ role: "user", content: "Weather in Paris?" }],
		}), { providerModelSlug: "claude-opus-4-5-20251101" })));
		const reply = encodeOpenAIChatResponse(completedIR(step.result), "req_x").choices[0].message;
		return [
			{ role: "user", content: "Weather in Paris?" },
			reply,
			{ role: "tool", tool_call_id: "toolu_paris", content: "{\"temp_c\":18}" },
		];
	}

	it("never sends a Claude signature to OpenAI, Gemini or an OpenAI-compatible provider", async () => {
		const messages = await claudeHistory();
		const ir = () => chatIR({ model: "openai/gpt-5.1", reasoning: { effort: "low" }, tools: [weatherTool], messages });

		const openai = await run((url) => url === "https://api.openai.com/v1/responses", () => sseResponse([{
			type: "response.completed",
			response: { id: "resp_fb", object: "response", status: "completed", output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "18°C" }] }], usage: { input_tokens: 5, output_tokens: 2, total_tokens: 7 } },
		}]), () => openAIExecutor(args(ir(), { providerId: "openai", providerModelSlug: "gpt-5.1" })));
		expect(openai.call.bodyText).not.toContain(CLAUDE_SIG_1);
		expect(openai.call.bodyText).not.toContain("[object Object]");
		expect(openai.call.bodyJson.input.some((item: any) => item.type === "reasoning")).toBe(false);

		const gemini = await run((url) => url.includes("/publishers/google/models/gemini-3.6-flash:"), () => jsonResponse({
			candidates: [{ content: { role: "model", parts: [{ text: "18°C" }] }, finishReason: "STOP" }],
			usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 2, totalTokenCount: 12 },
		}), () => vertexExecute(args(ir(), { providerId: "google-vertex", providerModelSlug: "gemini-3.6-flash" })));
		expect(gemini.call.bodyText).not.toContain(CLAUDE_SIG_1);
		expect(gemini.call.bodyJson.contents[1].parts.some((part: any) => part.thought)).toBe(false);

		const deepseek = irToOpenAIChat(ir(), "deepseek-v4", "deepseek");
		expect(JSON.stringify(deepseek)).not.toContain(CLAUDE_SIG_1);
		expect(deepseek.messages[1].reasoning_content).toBeUndefined();
	});

	it("drops OpenAI encrypted reasoning on a fallback to Claude and to Azure", async () => {
		const sealed = encodeOpenAIResponsesResponse({
			id: "req_o",
			created: 1760000000,
			model: "openai/gpt-5.1",
			provider: "openai",
			choices: [{ index: 0, message: { role: "assistant", content: [{ type: "reasoning_text", text: "", encryptedContent: OPENAI_ENC_1, reasoningFormat: "openai-responses-v1", reasoningModel: "gpt-5.1", reasoningId: "rs_1" }], toolCalls: [{ id: "call_paris", name: "get_weather", arguments: "{\"city\":\"Paris\"}" }] }, finishReason: "tool_calls" }],
		}, "req_o").output;
		const input = [{ role: "user", content: "Weather in Paris?" }, ...sealed, { type: "function_call_output", call_id: "call_paris", output: "{\"temp_c\":18}" }];

		const claude = await run((url) => url === "https://api.anthropic.example/v1/messages", () => claudeStep([{ type: "text", text: "18°C" }], "claude-opus-4-5-20251101"), () =>
			anthropicExecutor(args(responsesIR({ model: "anthropic/claude-opus-4.5", reasoning: { max_tokens: 2048 }, tools: [responsesWeatherTool], input }), {
				providerModelSlug: "claude-opus-4-5-20251101",
				endpoint: "responses",
				protocol: "openai.responses",
			})));
		expect(claude.call.bodyText).not.toContain(OPENAI_ENC_1);
		expect(claude.call.bodyJson.messages[1].content).toEqual([
			{ type: "tool_use", id: "call_paris", name: "get_weather", input: { city: "Paris" } },
		]);
		// Manual thinking cannot resume a tool turn without its thinking block.
		expect(claude.call.bodyJson.thinking).toBeUndefined();

		const azure = await run((url) => new URL(url).host === "api.azure.example", () => sseResponse([{
			type: "response.completed",
			response: { id: "resp_az", object: "response", status: "completed", output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "18°C" }] }], usage: { input_tokens: 5, output_tokens: 2, total_tokens: 7 } },
		}]), () => azureExecute(args(responsesIR({ model: "openai/gpt-5.1", reasoning: { effort: "low" }, tools: [responsesWeatherTool], input }), {
			providerId: "azure",
			providerModelSlug: "gpt-5.1",
			endpoint: "responses",
			protocol: "openai.responses",
		})));
		expect(azure.call.bodyText).not.toContain(OPENAI_ENC_1);
	});

	it("replaces a Gemini signature from another model with Google's placeholder", async () => {
		const messages = [
			{ role: "user", content: "Weather in Paris?" },
			{
				role: "assistant",
				tool_calls: [{ id: "get_weather", type: "function", function: { name: "get_weather", arguments: "{\"city\":\"Paris\"}" } }],
				reasoning_details: encodeOpenAIChatResponse({
					id: "r", created: 1, model: "gemini-3.6-flash", provider: "google-vertex",
					choices: [{ index: 0, message: { role: "assistant", content: [], toolCalls: [{ id: "get_weather", name: "get_weather", arguments: "{}", thoughtSignature: GEMINI_SIG_1, thoughtSignatureModel: "gemini-3.6-flash" }] }, finishReason: "tool_calls" }],
				}, "r").choices[0].message.reasoning_details,
			},
			{ role: "tool", tool_call_id: "get_weather", content: "{\"temp_c\":18}" },
		];
		const step = await run((url) => url.includes("/publishers/google/models/gemini-3.1-pro-preview:"), () => jsonResponse({
			candidates: [{ content: { role: "model", parts: [{ text: "18°C" }] }, finishReason: "STOP" }],
			usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 2, totalTokenCount: 12 },
		}), () => vertexExecute(args(chatIR({ model: "google/gemini-3.1-pro-preview", tools: [weatherTool], messages }), {
			providerId: "google-vertex",
			providerModelSlug: "gemini-3.1-pro-preview",
		})));
		expect(step.call.bodyText).not.toContain(GEMINI_SIG_1);
		expect(step.call.bodyJson.contents[1].parts[0].thoughtSignature).toBe("skip_thought_signature_validator");
	});
});
