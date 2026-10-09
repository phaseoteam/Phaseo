import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/runtime/env", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/runtime/env")>();
	return { ...actual, getBindings: () => ({}) as any };
});

import {
	createAnthropicStreamAccounting,
	createAnthropicToResponsesStreamTransformer,
} from "../stream-transformer";
import { collectAnthropicStreamUsage, executeAnthropic } from "../index";
import { execute as executeBedrock } from "@executors/amazon-bedrock/text-generate";
import { resolveStreamForProtocol } from "@executors/_shared/text-generate/openai-compat";

const sse = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

const FIXTURE = [
	sse("message_start", { type: "message_start", message: { id: "msg_1", model: "claude-x", stop_reason: null, usage: { input_tokens: 30, cache_read_input_tokens: 4, output_tokens: 1 } } }),
	sse("content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }),
	sse("content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hi ✓" } }),
	sse("content_block_stop", { type: "content_block_stop", index: 0 }),
	sse("message_delta", { type: "message_delta", delta: { stop_reason: "max_tokens" }, usage: { output_tokens: 9 } }),
	sse("message_stop", { type: "message_stop" }),
].join("");

function body(text: string, chunkSize = 5): ReadableStream<Uint8Array> {
	const bytes = new TextEncoder().encode(text);
	return new ReadableStream({
		start(controller) {
			for (let i = 0; i < bytes.length; i += chunkSize) controller.enqueue(bytes.slice(i, i + chunkSize));
			controller.close();
		},
	});
}

const readText = (stream: ReadableStream<Uint8Array>) => new Response(stream).text();

function args(overrides: Record<string, any>): any {
	return {
		ir: { messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }], model: "claude-x", stream: true },
		requestId: "req_acct",
		workspaceId: "team",
		providerId: "anthropic",
		providerModelSlug: "claude-x",
		capability: "text.generate",
		byokMeta: [{ id: "byok_1", key: "sk-test" }],
		pricingCard: null,
		meta: {},
		...overrides,
	};
}

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe("Anthropic stream accounting", () => {
	it("tracks the same usage and stop reason as the standalone collector, including a trailing frame", async () => {
		const withTrailing = `${FIXTURE}data: ${JSON.stringify({ type: "message_delta", delta: {}, usage: { server_tool_use: { web_search_requests: 1 } } })}`;
		const accounting = createAnthropicStreamAccounting();
		await readText(body(withTrailing).pipeThrough(
			createAnthropicToResponsesStreamTransformer("req_acct", "claude-x", { accounting }),
		));
		const collected = await collectAnthropicStreamUsage(body(withTrailing));
		expect(accounting.snapshot()).toEqual(collected);
		expect(collected).toEqual({
			usage: { input_tokens: 30, cache_read_input_tokens: 4, output_tokens: 9, server_tool_use: { web_search_requests: 1 } },
			stopReason: "max_tokens",
		});
	});

	it("does not change the transformer's emitted bytes", async () => {
		const plain = await readText(body(FIXTURE).pipeThrough(
			createAnthropicToResponsesStreamTransformer("req_acct", "claude-x"),
		));
		const counted = await readText(body(FIXTURE).pipeThrough(
			createAnthropicToResponsesStreamTransformer("req_acct", "claude-x", { accounting: createAnthropicStreamAccounting() }),
		));
		expect(counted).toBe(plain);
	});

	it.each(["openai.responses", "anthropic.messages", "openai.chat.completions"] as const)(
		"skipping the chat->responses normaliser for canonical transformer output is byte-identical (%s)",
		async (protocol) => {
			vi.useFakeTimers({ toFake: ["Date"] });
			try {
				const run = async (canonical: boolean) => readText(resolveStreamForProtocol(
					new Response(body(FIXTURE).pipeThrough(createAnthropicToResponsesStreamTransformer("req_acct", "claude-x"))),
					args({ protocol, endpoint: protocol === "anthropic.messages" ? "messages" : "responses" }),
					"responses",
					canonical ? { canonicalResponsesEvents: true } : undefined,
				));
				const [withPass, withoutPass] = [await run(false), await run(true)];
				expect(withoutPass).toBe(withPass);
				expect(withoutPass.length).toBeGreaterThan(0);
			} finally {
				vi.useRealTimers();
			}
		},
	);

	it.each([
		["anthropic", () => executeAnthropic(args({ protocol: "anthropic.messages", endpoint: "messages" }))],
		["amazon-bedrock", () => executeBedrock(args({ providerId: "amazon-bedrock", protocol: "anthropic.messages", endpoint: "messages", byokMeta: [{ id: "b", key: "bearer-token" }] }))],
	] as const)("%s streams without tee()-ing the upstream body and finalizes usage from the transformer", async (_name, run) => {
		vi.stubGlobal("fetch", vi.fn(async () => new Response(body(FIXTURE), {
			status: 200,
			headers: { "content-type": "text/event-stream", "request-id": "up_1" },
		})));
		const teeSpy = vi.spyOn(ReadableStream.prototype, "tee");
		const result: any = await run();
		expect(result.kind).toBe("stream");
		await readText(result.stream);
		expect(teeSpy).not.toHaveBeenCalled();
		const bill = await result.usageFinalizer();
		expect(bill.finish_reason).toBe("length");
		expect(bill.usage).toMatchObject({ input_tokens: 30, output_tokens: 9, cached_read_text_tokens: 4 });
	});
});
