// Golden byte-equality coverage for the text streaming adapters.
// The snapshot files were recorded against the adapters as of commit
// 9f81174876 (before the shared incremental SSE parser and the re-encode
// trimming), and pin the exact bytes emitted for every client protocol, so
// parser and pass-removal changes must stay byte-identical.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/runtime/env", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/runtime/env")>();
	return {
		...actual,
		getBindings: () => ({}) as any,
	};
});

import { bufferStreamToIR, resolveStreamForProtocol } from "../index";
import { transformChatStream } from "../stream-transforms";
import { executeAnthropic } from "../../../../anthropic/text-generate";
import { execute as executeBedrock } from "../../../../amazon-bedrock/text-generate";
import { passthroughWithPricing } from "@pipeline/after/streaming";
import { consumeTextProtocolStreamToIR } from "@pipeline/surfaces/server-tools.stream";

const FIXED_NOW = Date.UTC(2026, 0, 2, 3, 4, 5);
const SNAPSHOT_DIR = "./__snapshots__/stream-golden";

const sse = (event: string | null, data: unknown) =>
	`${event ? `event: ${event}\n` : ""}data: ${JSON.stringify(data)}\n\n`;

const chunk = (choices: unknown[], extra: Record<string, unknown> = {}) => sse(null, {
	id: "chatcmpl-1",
	object: "chat.completion.chunk",
	created: 1700000000,
	model: "gpt-x",
	choices,
	...extra,
});

export const CHAT_FIXTURE = [
	": keep-alive\n\n",
	chunk([{ index: 0, delta: { role: "assistant", content: "" }, finish_reason: null }]),
	chunk([{ index: 0, delta: { reasoning_content: "Thinking ✓" }, finish_reason: null }]),
	chunk([{ index: 0, delta: { content: "Hel" }, finish_reason: null }]),
	chunk([{ index: 0, delta: { content: "lo wörld 👋" }, finish_reason: null }]),
	chunk([{ index: 0, delta: { tool_calls: [{ index: 0, id: "call_1", type: "function", function: { name: "get_weather", arguments: "" } }] }, finish_reason: null }]),
	chunk([{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: "{\"city\":\"Paris\"}" } }] }, finish_reason: null }]),
	"data: {not json}\n\n",
	chunk([{ index: 0, delta: {}, finish_reason: "tool_calls" }]),
	chunk([], { usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30, prompt_tokens_details: { cached_tokens: 4 } } }),
	"data: [DONE]\n\n",
].join("");

const responseCompleted = {
	type: "response.completed",
	response: {
		id: "resp_1",
		object: "response",
		created_at: 1700000000,
		status: "completed",
		model: "gpt-x",
		output: [
			{ type: "reasoning", id: "rs_1", summary: [{ type: "summary_text", text: "thinking" }] },
			{ type: "message", id: "msg_1", status: "completed", role: "assistant", content: [{ type: "output_text", text: "Hello wörld", annotations: [] }] },
			{ type: "function_call", id: "fc_1", call_id: "call_1", name: "get_weather", arguments: "{\"city\":\"Paris\"}", status: "completed" },
		],
		usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30, input_tokens_details: { cached_tokens: 3 }, output_tokens_details: { reasoning_tokens: 5 } },
	},
};

export const RESPONSES_FIXTURE = [
	": keep-alive\n\n",
	sse("response.created", { type: "response.created", response: { id: "resp_1", object: "response", created_at: 1700000000, model: "gpt-x", status: "in_progress" } }),
	sse("response.output_item.added", { type: "response.output_item.added", output_index: 0, item: { type: "reasoning", id: "rs_1" } }),
	sse("response.reasoning_summary_text.delta", { type: "response.reasoning_summary_text.delta", item_id: "rs_1", output_index: 0, delta: "thinking" }),
	sse("response.output_item.added", { type: "response.output_item.added", output_index: 1, item: { type: "message", id: "msg_1", role: "assistant", content: [] } }),
	sse("response.output_text.delta", { type: "response.output_text.delta", item_id: "msg_1", output_index: 1, delta: "Hello" }),
	sse("response.output_text.delta", { type: "response.output_text.delta", item_id: "msg_1", output_index: 1, delta: " wörld" }),
	"event: response.output_text.delta\ndata: {broken\n\n",
	sse("response.output_text.done", { type: "response.output_text.done", item_id: "msg_1", output_index: 1, text: "Hello wörld" }),
	sse("response.output_item.added", { type: "response.output_item.added", output_index: 2, item: { type: "function_call", id: "fc_1", call_id: "call_1", name: "get_weather", arguments: "" } }),
	sse("response.function_call_arguments.delta", { type: "response.function_call_arguments.delta", item_id: "fc_1", output_index: 2, delta: "{\"city\":" }),
	sse("response.function_call_arguments.delta", { type: "response.function_call_arguments.delta", item_id: "fc_1", output_index: 2, delta: "\"Paris\"}" }),
	sse("response.function_call_arguments.done", { type: "response.function_call_arguments.done", item_id: "fc_1", output_index: 2, arguments: "{\"city\":\"Paris\"}" }),
	sse("response.output_item.done", { type: "response.output_item.done", output_index: 2, item: { type: "function_call", id: "fc_1", call_id: "call_1", name: "get_weather", arguments: "{\"city\":\"Paris\"}", status: "completed" } }),
	sse("response.completed", responseCompleted),
].join("");

export const ANTHROPIC_FIXTURE = [
	sse("message_start", { type: "message_start", message: { id: "msg_01", type: "message", role: "assistant", model: "claude-x", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 25, cache_read_input_tokens: 5, cache_creation_input_tokens: 2, output_tokens: 1 } } }),
	sse("ping", { type: "ping" }),
	sse("content_block_start", { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "" } }),
	sse("content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "Let me think ✓" } }),
	sse("content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "signature_delta", signature: "sig==" } }),
	sse("content_block_stop", { type: "content_block_stop", index: 0 }),
	sse("content_block_start", { type: "content_block_start", index: 1, content_block: { type: "text", text: "" } }),
	sse("content_block_delta", { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "Hello" } }),
	sse("content_block_delta", { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: " wörld 👋" } }),
	sse("content_block_stop", { type: "content_block_stop", index: 1 }),
	sse("content_block_start", { type: "content_block_start", index: 2, content_block: { type: "tool_use", id: "toolu_1", name: "get_weather", input: {} } }),
	sse("content_block_delta", { type: "content_block_delta", index: 2, delta: { type: "input_json_delta", partial_json: "{\"city\":" } }),
	sse("content_block_delta", { type: "content_block_delta", index: 2, delta: { type: "input_json_delta", partial_json: "\"Paris\"}" } }),
	sse("content_block_stop", { type: "content_block_stop", index: 2 }),
	sse("message_delta", { type: "message_delta", delta: { stop_reason: "tool_use", stop_sequence: null }, usage: { output_tokens: 42 } }),
	sse("message_stop", { type: "message_stop" }),
].join("");

// 0 = whole body in one chunk; others split at fixed byte sizes (cuts inside
// frames, inside "\n\n", and inside multi-byte UTF-8 sequences).
const CHUNKINGS = [0, 1, 7, 64] as const;

export function bodyFrom(text: string, chunkSize: number): ReadableStream<Uint8Array> {
	const bytes = new TextEncoder().encode(text);
	return new ReadableStream<Uint8Array>({
		start(controller) {
			if (chunkSize <= 0) {
				controller.enqueue(bytes);
			} else {
				for (let offset = 0; offset < bytes.length; offset += chunkSize) {
					controller.enqueue(bytes.slice(offset, offset + chunkSize));
				}
			}
			controller.close();
		},
	});
}

async function readText(stream: ReadableStream<Uint8Array>): Promise<string> {
	return await new Response(stream).text();
}

function baseArgs(overrides?: Record<string, any>): any {
	return {
		ir: {
			messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
			model: "test-model",
			stream: true,
		},
		requestId: "req_golden",
		workspaceId: "team_test",
		providerId: "deepseek",
		endpoint: "chat.completions",
		protocol: "openai.chat.completions",
		capability: "text.generate",
		byokMeta: [],
		pricingCard: null,
		meta: {},
		...overrides,
	};
}

const PROTOCOLS = [
	["openai.chat.completions", "chat.completions"],
	["openai.responses", "responses"],
	["anthropic.messages", "messages"],
] as const;

async function expectStableAcrossChunkings(
	produce: (chunkSize: number) => Promise<string>,
	snapshotName: string,
) {
	const outputs: string[] = [];
	for (const size of CHUNKINGS) outputs.push(await produce(size));
	for (const output of outputs.slice(1)) {
		expect(output).toBe(outputs[0]);
	}
	await expect(outputs[0]).toMatchFileSnapshot(`${SNAPSHOT_DIR}/${snapshotName}.sse`);
	return outputs[0];
}

beforeEach(() => {
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(FIXED_NOW);
});

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

describe("stream adapter golden output", () => {
	it("chat upstream -> chat clients", async () => {
		await expectStableAcrossChunkings(
			async (size) => readText(transformChatStream(bodyFrom(CHAT_FIXTURE, size), baseArgs(), {
				requestId: "req_golden",
				providerId: "deepseek",
				choiceStates: new Map(),
			})),
			"chat-to-chat",
		);
	});

	it.each(PROTOCOLS.filter(([protocol]) => protocol !== "openai.chat.completions"))(
		"chat upstream -> %s",
		async (protocol, endpoint) => {
			await expectStableAcrossChunkings(
				async (size) => readText(resolveStreamForProtocol(
					new Response(bodyFrom(CHAT_FIXTURE, size)),
					baseArgs({ protocol, endpoint }),
					"chat",
				)),
				`chat-to-${endpoint}`,
			);
		},
	);

	it.each(PROTOCOLS)("responses upstream -> %s", async (protocol, endpoint) => {
		await expectStableAcrossChunkings(
			async (size) => readText(resolveStreamForProtocol(
				new Response(bodyFrom(RESPONSES_FIXTURE, size)),
				baseArgs({ protocol, endpoint, providerId: "openai" }),
				"responses",
			)),
			`responses-to-${endpoint}`,
		);
	});

	it.each(PROTOCOLS)("anthropic executor -> %s (stream bytes and usage finalizer)", async (protocol, endpoint) => {
		const finalizers: unknown[] = [];
		await expectStableAcrossChunkings(async (size) => {
			vi.stubGlobal("fetch", vi.fn(async () => new Response(bodyFrom(ANTHROPIC_FIXTURE, size), {
				status: 200,
				headers: { "content-type": "text/event-stream", "request-id": "req_upstream_1" },
			})));
			const result: any = await executeAnthropic(baseArgs({
				protocol,
				endpoint,
				providerId: "anthropic",
				providerModelSlug: "claude-x",
				byokMeta: [{ id: "byok_1", key: "sk-ant-test" }],
			}));
			expect(result.kind).toBe("stream");
			const text = await readText(result.stream);
			finalizers.push(await result.usageFinalizer());
			return text;
		}, `anthropic-to-${endpoint}`);
		for (const finalized of finalizers) {
			expect(finalized).toEqual(finalizers[0]);
		}
		expect(finalizers[0]).toMatchObject({
			finish_reason: "tool_calls",
			upstream_id: "req_upstream_1",
		});
		await expect(JSON.stringify(finalizers[0], null, 2))
			.toMatchFileSnapshot(`${SNAPSHOT_DIR}/anthropic-finalizer.json`);
	});

	it("bedrock messages executor -> anthropic.messages (stream bytes and usage finalizer)", async () => {
		const finalizers: unknown[] = [];
		await expectStableAcrossChunkings(async (size) => {
			vi.stubGlobal("fetch", vi.fn(async () => new Response(bodyFrom(ANTHROPIC_FIXTURE, size), {
				status: 200,
				headers: { "content-type": "text/event-stream", "x-amzn-requestid": "aws_req_1" },
			})));
			const result: any = await executeBedrock(baseArgs({
				protocol: "anthropic.messages",
				endpoint: "messages",
				providerId: "amazon-bedrock",
				providerModelSlug: "anthropic.claude-x",
				byokMeta: [{ id: "byok_1", key: "bedrock-bearer-token" }],
			}));
			expect(result.kind).toBe("stream");
			const text = await readText(result.stream);
			finalizers.push(await result.usageFinalizer());
			return text;
		}, "bedrock-to-messages");
		for (const finalized of finalizers) {
			expect(finalized).toEqual(finalizers[0]);
		}
		await expect(JSON.stringify(finalizers[0], null, 2))
			.toMatchFileSnapshot(`${SNAPSHOT_DIR}/bedrock-finalizer.json`);
	});

	it.each([
		["openai.chat.completions", "chat.completions", CHAT_FIXTURE],
		["openai.responses", "responses", RESPONSES_FIXTURE],
		["anthropic.messages", "messages", ANTHROPIC_FIXTURE],
	] as const)("passthroughWithPricing re-streams %s frames", async (protocol, endpoint, fixture) => {
		const usages: unknown[] = [];
		await expectStableAcrossChunkings(async (size) => {
			const ctx: any = {
				protocol,
				endpoint,
				requestId: "req_golden",
				workspaceId: "team_test",
				model: "test-model",
				meta: {},
				providers: [],
			};
			let resolveUsage!: (value: unknown) => void;
			const usage = new Promise((resolve) => { resolveUsage = resolve; });
			const response = await passthroughWithPricing({
				upstream: new Response(bodyFrom(fixture, size), { status: 200 }),
				ctx,
				provider: "test-provider",
				priceCard: null,
				rewriteFrame: (frame: any) => ({ ...frame, rewritten: true }),
				onFinalUsage: (usageRaw, info) => resolveUsage({ usageRaw, info }),
			});
			const text = await readText(response.body!);
			usages.push(await usage);
			return text;
		}, `passthrough-${endpoint}`);
		for (const usage of usages) {
			expect(usage).toEqual(usages[0]);
		}
		await expect(JSON.stringify(usages[0], null, 2))
			.toMatchFileSnapshot(`${SNAPSHOT_DIR}/passthrough-${endpoint}-usage.json`);
	});

	it.each([
		["chat", CHAT_FIXTURE, "chat-to-responses"],
		["responses", RESPONSES_FIXTURE, "responses-to-messages"],
	] as const)("CRLF-framed %s upstream emits the same bytes as LF framing", async (route, fixture, snapshot) => {
		const crlf = fixture.replace(/\n/g, "\r\n");
		const protocol = snapshot.endsWith("messages") ? "anthropic.messages" : "openai.responses";
		for (const size of CHUNKINGS) {
			const text = await readText(resolveStreamForProtocol(
				new Response(bodyFrom(crlf, size)),
				baseArgs({ protocol, endpoint: snapshot.split("-to-")[1], providerId: route === "responses" ? "openai" : "deepseek" }),
				route,
			));
			await expect(text).toMatchFileSnapshot(`${SNAPSHOT_DIR}/${snapshot}.sse`);
		}
	});

	it("CRLF-framed anthropic upstream emits the same passthrough bytes as LF framing", async () => {
		const crlf = ANTHROPIC_FIXTURE.replace(/\n/g, "\r\n");
		for (const size of CHUNKINGS) {
			const response = await passthroughWithPricing({
				upstream: new Response(bodyFrom(crlf, size), { status: 200 }),
				ctx: { protocol: "anthropic.messages", endpoint: "messages", requestId: "req_golden", workspaceId: "team_test", model: "test-model", meta: {}, providers: [] } as any,
				provider: "test-provider",
				priceCard: null,
				rewriteFrame: (frame: any) => ({ ...frame, rewritten: true }),
			});
			await expect(await readText(response.body!)).toMatchFileSnapshot(`${SNAPSHOT_DIR}/passthrough-messages.sse`);
		}
	});

	it("forwards already-normalized Responses frames verbatim with client output unchanged", async () => {
		// Non-canonical upstream JSON: spacing and \u escapes that JSON.stringify
		// would rewrite, plus a multi-line data frame and a renamed event.
		const upstreamFrames = [
			"event: response.created\ndata: { \"type\": \"response.created\", \"response\": { \"id\": \"resp_9\", \"object\": \"response\", \"model\": \"gpt-x\" } }\n\n",
			"event: response.output_text.delta\ndata: {\"type\":\"response.output_text.delta\",\"item_id\":\"m\",\"output_index\":0,\"delta\":\"caf\\u00e9\"}\n\n",
			"event: response.output_text.delta\ndata: {\"type\":\"response.output_text.delta\",\ndata: \"item_id\":\"m\",\"output_index\":0,\"delta\":\"!\"}\n\n",
			"event: response.text.delta\ndata: {\"type\":\"response.text.delta\", \"item_id\":\"m\",\"output_index\":0,\"delta\":\"?\"}\n\n",
			sse("response.completed", responseCompleted),
		].join("");
		// What the pre-change transform emitted: every frame re-stringified.
		const canonicalised = upstreamFrames.split("\n\n").filter(Boolean).map((frame) => {
			const event = /^event: (.*)$/m.exec(frame)![1];
			const data = frame.split("\n").filter((line) => line.startsWith("data: ")).map((line) => line.slice(6)).join("\n");
			const normalized = event === "response.text.delta" ? "response.output_text.delta" : event;
			return `event: ${normalized}\ndata: ${JSON.stringify(JSON.parse(data))}\n\n`;
		}).join("");

		const forwarded = await readText(resolveStreamForProtocol(
			new Response(bodyFrom(upstreamFrames, 9)),
			baseArgs({ protocol: "openai.responses", endpoint: "responses", providerId: "openai" }),
			"responses",
		));
		// Single-line frames whose event needs no normalisation keep their bytes.
		expect(forwarded).toContain("data: { \"type\": \"response.created\"");
		expect(forwarded).toContain("\"delta\":\"caf\\u00e9\"");
		// Renamed or multi-line frames are re-encoded exactly as before.
		expect(forwarded).toContain(`event: response.output_text.delta\ndata: ${JSON.stringify({ type: "response.text.delta", item_id: "m", output_index: 0, delta: "?" })}\n\n`);
		expect(forwarded).toContain(`data: ${JSON.stringify({ type: "response.output_text.delta", item_id: "m", output_index: 0, delta: "!" })}\n\n`);

		const viaPassthrough = async (text: string) => {
			const response = await passthroughWithPricing({
				upstream: new Response(bodyFrom(text, 0), { status: 200 }),
				ctx: { protocol: "openai.responses", endpoint: "responses", requestId: "req_golden", workspaceId: "team_test", model: "test-model", meta: {}, providers: [] } as any,
				provider: "openai",
				priceCard: null,
				rewriteFrame: (frame: any) => ({ ...frame, rewritten: true }),
			});
			return readText(response.body!);
		};
		// The bytes the client receives are identical to the re-stringifying path.
		expect(await viaPassthrough(forwarded)).toBe(await viaPassthrough(canonicalised));
	});

	it.each([
		["chat", CHAT_FIXTURE],
		["chat-trailing-frame", CHAT_FIXTURE.replace(/\n\ndata: \[DONE\]\n\n$/, "")],
		["responses", RESPONSES_FIXTURE],
		["responses-trailing-frame", RESPONSES_FIXTURE.replace(/\n\n$/, "")],
		["chat-plain-json", JSON.stringify({ id: "chatcmpl-2", object: "chat.completion", created: 1700000000, model: "gpt-x", choices: [{ index: 0, message: { role: "assistant", content: "plain" }, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })],
	] as const)("bufferStreamToIR materialises %s", async (name, fixture) => {
		const route = name.startsWith("responses") ? "responses" : "chat";
		const outputs: string[] = [];
		for (const size of CHUNKINGS) {
			const result = await bufferStreamToIR(
				new Response(bodyFrom(fixture, size)),
				baseArgs({ stream: false }),
				route,
				FIXED_NOW,
			);
			outputs.push(JSON.stringify({ ir: result.ir, usage: result.usage, rawResponse: result.rawResponse }, null, 2));
		}
		for (const output of outputs.slice(1)) expect(output).toBe(outputs[0]);
		await expect(outputs[0]).toMatchFileSnapshot(`${SNAPSHOT_DIR}/buffer-${name}.json`);
	});

	it.each([
		["openai.chat.completions", CHAT_FIXTURE],
		["openai.chat.completions-trailing-frame", CHAT_FIXTURE.replace(/\n\ndata: \[DONE\]\n\n$/, "")],
		["openai.responses", RESPONSES_FIXTURE],
		["anthropic.messages", ANTHROPIC_FIXTURE],
	] as const)("consumeTextProtocolStreamToIR materialises %s", async (name, fixture) => {
		const protocol = name.replace(/-trailing-frame$/, "") as any;
		const outputs: string[] = [];
		for (const size of CHUNKINGS) {
			const events: unknown[] = [];
			const result = await consumeTextProtocolStreamToIR({
				protocol,
				stream: bodyFrom(fixture, size),
				onEvent: (event) => events.push(event),
				requestId: "req_golden",
				model: "test-model",
				provider: "test-provider",
				startedAtMs: FIXED_NOW,
			});
			outputs.push(JSON.stringify({ result, events }, null, 2));
		}
		for (const output of outputs.slice(1)) expect(output).toBe(outputs[0]);
		await expect(outputs[0]).toMatchFileSnapshot(`${SNAPSHOT_DIR}/consume-${name}.json`);
	});
});
