import { describe, expect, it } from "vitest";
import { resolveStreamForProtocol } from "../index";
import { createAnthropicToResponsesStreamTransformer } from "../../../../anthropic/text-generate/stream-transformer";

// A provider that fails after its stream started must reach every client
// surface as a failure: Chat gets an error frame and no finish, Responses gets
// response.failed, Messages gets an `error` event and no message_stop.

function sse(frames: Array<{ event?: string; data: any } | "[DONE]">): string {
	return frames
		.map((frame) => (frame === "[DONE]" ? "data: [DONE]\n\n" : `${frame.event ? `event: ${frame.event}\n` : ""}data: ${JSON.stringify(frame.data)}\n\n`))
		.join("");
}

function sseResponse(text: string): Response {
	return new Response(text, { headers: { "Content-Type": "text/event-stream" } });
}

function frames(text: string): Array<{ event: string | null; data: any }> {
	const out: Array<{ event: string | null; data: any }> = [];
	for (const block of text.split(/\n\n/)) {
		if (!block.trim()) continue;
		const event = block.split("\n").find((line) => line.startsWith("event:"))?.slice(6).trim() ?? null;
		const data = block.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("");
		if (!data || data === "[DONE]") continue;
		out.push({ event, data: JSON.parse(data) });
	}
	return out;
}

function args(protocol: "openai.chat.completions" | "openai.responses" | "anthropic.messages", providerId = "deepinfra"): any {
	return {
		ir: { messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }], model: "test-model", stream: true },
		requestId: "req_midstream",
		workspaceId: "team_test",
		providerId,
		endpoint: protocol === "anthropic.messages" ? "messages" : protocol === "openai.responses" ? "responses" : "chat.completions",
		protocol,
		capability: "text.generate",
		byokMeta: [],
		pricingCard: null,
		meta: {},
	};
}

const CHAT_UPSTREAM_FAILURE = sse([
	{ data: { id: "chatcmpl_1", object: "chat.completion.chunk", created: 1, model: "test-model", choices: [{ index: 0, delta: { content: "partial" } }] } },
	{ data: { error: { message: "upstream reset", type: "server_error" } } },
]);

const RESPONSES_UPSTREAM_FAILURE = sse([
	{ event: "response.created", data: { type: "response.created", response: { id: "resp_1", model: "test-model" } } },
	{ event: "response.output_text.delta", data: { type: "response.output_text.delta", item_id: "msg_1", output_index: 0, delta: "partial" } },
	{ event: "error", data: { type: "error", code: "server_error", message: "upstream reset", sequence_number: 9 } },
]);

describe("mid-stream upstream errors from a Chat upstream", () => {
	it("ends a Responses client stream with response.failed, never response.completed", async () => {
		const text = await new Response(resolveStreamForProtocol(sseResponse(CHAT_UPSTREAM_FAILURE), args("openai.responses"), "chat")).text();
		const events = frames(text);
		expect(events.map((frame) => frame.event)).not.toContain("response.completed");
		const failed = events.find((frame) => frame.event === "response.failed");
		expect(failed?.data.response).toMatchObject({
			status: "failed",
			error: { code: "server_error", message: "upstream reset" },
		});
		expect(JSON.stringify(failed?.data.response.output)).toContain("partial");
	});

	it("ends a Messages client stream with an error event and no message_stop", async () => {
		const text = await new Response(resolveStreamForProtocol(sseResponse(CHAT_UPSTREAM_FAILURE), args("anthropic.messages"), "chat")).text();
		const events = frames(text);
		expect(events.map((frame) => frame.event)).not.toContain("message_stop");
		expect(events.map((frame) => frame.event)).not.toContain("message_delta");
		expect(events.at(-1)).toEqual({
			event: "error",
			data: { type: "error", error: { type: "api_error", message: "upstream reset" } },
		});
	});

	it("passes the provider's error frame to a Chat client and adds no finish", async () => {
		const text = await new Response(resolveStreamForProtocol(sseResponse(CHAT_UPSTREAM_FAILURE), args("openai.chat.completions"), "chat")).text();
		const events = frames(text);
		expect(events.at(-1)?.data).toEqual({ error: { message: "upstream reset", type: "server_error" } });
		expect(text).not.toMatch(/"finish_reason":"(stop|length)"/);
	});

	it("reports response.failed when the upstream fails before sending any chunk", async () => {
		const text = await new Response(resolveStreamForProtocol(
			sseResponse(sse([{ data: { error: { message: "upstream reset", type: "server_error" } } }])),
			args("openai.responses"),
			"chat",
		)).text();
		expect(frames(text).map((frame) => frame.event)).toEqual(["response.created", "response.failed"]);
	});
});

describe("mid-stream upstream errors from a Responses upstream", () => {
	it("gives a Chat client an error frame carrying the upstream message", async () => {
		const text = await new Response(resolveStreamForProtocol(sseResponse(RESPONSES_UPSTREAM_FAILURE), args("openai.chat.completions", "groq"), "responses")).text();
		const events = frames(text);
		expect(events.at(-1)?.data).toMatchObject({ object: "error", message: "upstream reset", error: { message: "upstream reset" } });
		expect(text).not.toMatch(/"finish_reason":"(stop|length)"/);
	});

	it("gives a Messages client an error event instead of max_tokens", async () => {
		const text = await new Response(resolveStreamForProtocol(sseResponse(RESPONSES_UPSTREAM_FAILURE), args("anthropic.messages", "groq"), "responses")).text();
		const events = frames(text);
		expect(text).not.toContain("max_tokens");
		expect(events.map((frame) => frame.event)).not.toContain("message_stop");
		expect(events.at(-1)?.data).toEqual({ type: "error", error: { type: "api_error", message: "upstream reset" } });
	});
});

describe("mid-stream upstream errors from Anthropic", () => {
	const anthropicFailure = sse([
		{ event: "message_start", data: { type: "message_start", message: { id: "msg_1", model: "claude-test", usage: { input_tokens: 12, output_tokens: 0 } } } },
		{ event: "content_block_start", data: { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } } },
		{ event: "content_block_delta", data: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "partial" } } },
		{ event: "error", data: { type: "error", error: { type: "overloaded_error", message: "Overloaded" } } },
	]);

	function claudeStream(protocol: "openai.chat.completions" | "openai.responses" | "anthropic.messages") {
		const responses = sseResponse(anthropicFailure).body!.pipeThrough(createAnthropicToResponsesStreamTransformer("req_midstream", "claude-test"));
		return resolveStreamForProtocol(
			new Response(responses, { headers: { "Content-Type": "text/event-stream" } }),
			args(protocol, "anthropic"),
			"responses",
			{ canonicalResponsesEvents: true },
		);
	}

	it("turns the Anthropic error event into response.failed with the usage seen so far", async () => {
		const events = frames(await new Response(claudeStream("openai.responses")).text());
		expect(events.map((frame) => frame.event)).not.toContain("response.completed");
		const failed = events.find((frame) => frame.event === "response.failed");
		expect(failed?.data.response).toMatchObject({
			status: "failed",
			error: { code: "overloaded_error", message: "Overloaded" },
			usage: expect.objectContaining({ input_tokens: 12 }),
		});
	});

	it("keeps the Anthropic error type for Messages clients", async () => {
		const events = frames(await new Response(claudeStream("anthropic.messages")).text());
		expect(events.map((frame) => frame.event)).not.toContain("message_stop");
		expect(events.at(-1)?.data).toEqual({ type: "error", error: { type: "overloaded_error", message: "Overloaded" } });
	});

	it("gives Chat clients an error frame", async () => {
		const events = frames(await new Response(claudeStream("openai.chat.completions")).text());
		expect(events.at(-1)?.data).toMatchObject({
			object: "error",
			message: "Overloaded",
			code: "overloaded_error",
			error: { message: "Overloaded", type: "overloaded", code: "overloaded_error", param: null },
		});
	});

	it("opens with response.created when Anthropic fails before message_start", async () => {
		const immediate = sse([{ event: "error", data: { type: "error", error: { type: "overloaded_error", message: "Overloaded" } } }]);
		const responses = sseResponse(immediate).body!.pipeThrough(createAnthropicToResponsesStreamTransformer("req_immediate", "claude-test"));
		const events = frames(await new Response(responses).text()).map((frame) => frame.event ?? frame.data?.type);
		expect(events[0]).toBe("response.created");
		expect(events).toContain("response.failed");
	});
});
