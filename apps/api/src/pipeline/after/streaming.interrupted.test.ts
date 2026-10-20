import { describe, expect, it } from "vitest";
import { passthroughWithPricing } from "./streaming";

// An upstream that ends with no stop and no final snapshot (a provider disconnect
// after partial output) must reach every client surface as a failure, as a
// mid-stream provider error does: never message_stop, response.completed or [DONE].

type SourceFrame = { event?: string; data: any };

function sseText(frames: SourceFrame[]): string {
	return frames.map((frame) => `${frame.event ? `event: ${frame.event}\n` : ""}data: ${JSON.stringify(frame.data)}\n\n`).join("");
}

function sseResponse(text: string): Response {
	return new Response(text, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

function baseCtx(protocol: string): any {
	return { requestId: "req_interrupted_test", workspaceId: "team_test", endpoint: "responses", protocol, meta: {} };
}

function parseBlocks(text: string): Array<{ event: string | null; data: any }> {
	return text.split(/\n\n/).filter(Boolean).map((block) => {
		const lines = block.split("\n");
		const event = lines.find((line) => line.startsWith("event:"))?.slice(6).trim() ?? null;
		const data = lines.find((line) => line.startsWith("data:"))?.slice(5).trim() ?? "";
		return { event, data: data === "[DONE]" ? data : JSON.parse(data) };
	});
}

async function run(protocol: string, upstream: Response, provider = "groq") {
	const usageInfo: any[] = [];
	const response = await passthroughWithPricing({
		upstream,
		ctx: baseCtx(protocol),
		provider,
		priceCard: null,
		onFinalUsage: (_usage, info) => {
			usageInfo.push(info);
		},
	});
	return { blocks: parseBlocks(await response.text()), usageInfo };
}

const partialChat: SourceFrame[] = [
	{ data: { id: "c", object: "chat.completion.chunk", choices: [{ index: 0, delta: { content: "Hel" }, finish_reason: null }] } },
];
const partialResponses: SourceFrame[] = [
	{ event: "response.created", data: { type: "response.created", response: { id: "r", object: "response", status: "in_progress" } } },
	{ event: "response.output_text.delta", data: { type: "response.output_text.delta", output_index: 0, item_id: "m", delta: "Hel" } },
];
const partialMessages: SourceFrame[] = [
	{ event: "message_start", data: { type: "message_start", message: { id: "msg", type: "message", role: "assistant", content: [], usage: { input_tokens: 3, output_tokens: 0 } } } },
	{ event: "content_block_start", data: { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } } },
	{ event: "content_block_delta", data: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hel" } } },
];

describe("passthroughWithPricing when the upstream ends without a stop", () => {
	it.each([
		["a Chat upstream", partialChat],
		["a Responses upstream (re-encoded)", partialResponses],
	])("ends a Chat client stream from %s with an error frame and no [DONE]", async (_name, frames) => {
		const { blocks, usageInfo } = await run("openai.chat.completions", sseResponse(sseText(frames)));
		expect(blocks.map((block) => block.data)).not.toContain("[DONE]");
		expect(blocks.at(-1)?.data).toMatchObject({
			object: "error",
			code: "upstream_stream_failure",
			error: { type: "server_error", code: "upstream_stream_failure", message: "The upstream stream ended before the response completed." },
		});
		expect(blocks.flatMap((block) => block.data?.choices ?? []).some((choice: any) => choice.finish_reason)).toBe(false);
		expect(usageInfo).toEqual([{ aborted: true, sawFinalUsage: false }]);
	});

	it.each([
		["a Responses upstream", partialResponses],
		["a Chat upstream (re-encoded)", partialChat],
	])("ends a Responses client stream from %s with response.failed", async (_name, frames) => {
		const { blocks } = await run("openai.responses", sseResponse(sseText(frames)));
		const events = blocks.map((block) => block.event);
		expect(events).not.toContain("response.completed");
		expect(events).not.toContain("response.incomplete");
		expect(blocks.at(-1)).toMatchObject({
			event: "response.failed",
			data: { type: "response.failed", response: { status: "failed", error: { code: "upstream_stream_failure" } } },
		});
	});

	it.each([
		["a Messages upstream", partialMessages],
		["a Chat upstream (re-encoded)", partialChat],
		["a Responses upstream (re-encoded)", partialResponses],
	])("ends a Messages client stream from %s with an error event and no message_stop", async (_name, frames) => {
		const { blocks } = await run("anthropic.messages", sseResponse(sseText(frames)));
		const events = blocks.map((block) => block.event ?? block.data?.type);
		expect(events).not.toContain("message_delta");
		expect(events).not.toContain("message_stop");
		expect(blocks.at(-1)).toMatchObject({
			event: "error",
			data: { type: "error", error: { type: "api_error" } },
		});
	});

	it("does not add a second failure after an upstream error frame", async () => {
		const { blocks } = await run("openai.chat.completions", sseResponse(sseText([
			...partialChat,
			{ data: { error: { message: "upstream reset", type: "server_error" } } },
		])));
		expect(blocks.at(-1)?.data).toEqual({ error: { message: "upstream reset", type: "server_error" } });
		expect(blocks.filter((block) => block.data?.error)).toHaveLength(1);
	});

	it("does not take a [DONE] with no finish_reason before it as completion", async () => {
		// Some executors (Google) append [DONE] after the upstream body ends, however it ended.
		const { blocks } = await run("openai.chat.completions", sseResponse(`${sseText(partialChat)}data: [DONE]\n\n`), "google");
		expect(blocks.map((block) => block.data)).not.toContain("[DONE]");
		expect(blocks.at(-1)?.data).toMatchObject({ error: { code: "upstream_stream_failure" } });
	});

	it("reports the interruption when the upstream body errors mid-stream", async () => {
		let sent = false;
		const upstream = new Response(new ReadableStream<Uint8Array>({
			pull(controller) {
				if (sent) {
					controller.error(new Error("connection reset"));
					return;
				}
				sent = true;
				controller.enqueue(new TextEncoder().encode(sseText(partialChat)));
			},
		}), { headers: { "Content-Type": "text/event-stream" } });
		const { blocks, usageInfo } = await run("openai.chat.completions", upstream);
		expect(blocks.map((block) => block.data)).not.toContain("[DONE]");
		expect(blocks.at(-1)?.data).toMatchObject({ error: { code: "upstream_stream_failure" } });
		expect(usageInfo).toEqual([{ aborted: true, sawFinalUsage: false }]);
	});

	it("still completes a stream that sent its finish", async () => {
		const { blocks } = await run("openai.chat.completions", sseResponse(`${sseText([
			...partialChat,
			{ data: { id: "c", object: "chat.completion.chunk", choices: [{ index: 0, delta: {}, finish_reason: "stop" }] } },
		])}data: [DONE]\n\n`));
		expect(blocks.at(-1)?.data).toBe("[DONE]");
		expect(blocks.some((block) => block.data?.error)).toBe(false);
	});
});
