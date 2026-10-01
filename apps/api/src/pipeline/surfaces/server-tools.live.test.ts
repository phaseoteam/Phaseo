import { describe, expect, it } from "vitest";
import { createManagedToolLiveResponse } from "./server-tools.live";

describe("managed tool live stream", () => {
	it("keeps one Responses lifecycle and includes earlier output in the final snapshot", async () => {
		const response = await createManagedToolLiveResponse({
			protocol: "openai.responses",
			requestId: "req_1",
			model: "test-model",
			async run(sink) {
				const first = sink.beginRound();
				first({ type: "delta_text", channel: "output_text", text: "Checking. ", choiceIndex: 0 });
				first({ type: "delta_tool", toolCallId: "call_1", toolName: "clock", arguments: "{}", choiceIndex: 1 });
				sink.toolResult({ id: "call_1", name: "clock", arguments: "{}", output: "10:35" });
				const second = sink.beginRound();
				second({ type: "delta_text", channel: "output_text", text: "It is 10:35.", choiceIndex: 0 });
				return new Response('event: response.completed\ndata: {"response":{"status":"completed","output":[{"type":"message","role":"assistant","content":[{"type":"output_text","text":"It is 10:35."}]}],"usage":{"input_tokens":10,"output_tokens":5}}}\n\ndata: [DONE]\n\n', { headers: { "content-type": "text/event-stream" } });
			},
		});
		const frames = (await response.text()).split("\n\n").filter(Boolean);
		expect(frames.filter((frame) => frame.includes("event: response.created"))).toHaveLength(1);
		expect(frames.filter((frame) => frame.includes("event: response.completed"))).toHaveLength(1);
		const completed = frames.find((frame) => frame.includes("event: response.completed"))!;
		const payload = JSON.parse(completed.split("data: ")[1]);
		expect(payload.response.output_text).toBe("Checking. It is 10:35.");
		expect(payload.response.output.map((item: { type: string }) => item.type)).toEqual(["message", "function_call", "message"]);
		expect(payload.response.usage).toEqual({ input_tokens: 10, output_tokens: 5 });
	});

	it("emits final text when the last provider turn was completed rather than streamed", async () => {
		const response = await createManagedToolLiveResponse({
			protocol: "openai.responses",
			requestId: "req_2",
			model: "test-model",
			async run(sink) {
				const first = sink.beginRound();
				first({ type: "delta_text", channel: "output_text", text: "Checking. ", choiceIndex: 0 });
				sink.markFinalTurnBuffered();
				return new Response('event: response.created\ndata: {"response":{"status":"in_progress"}}\n\nevent: response.output_text.delta\ndata: {"delta":"Done.","output_index":0}\n\nevent: response.completed\ndata: {"response":{"status":"completed","output":[{"type":"message","role":"assistant","content":[{"type":"output_text","text":"Done."}]}]}}\n\n', { headers: { "content-type": "text/event-stream" } });
			},
		});
		const body = await response.text();
		expect(body).toContain('"delta":"Done."');
		expect(body).toContain('"output_text":"Checking. Done."');
		const completed = body.split("\n\n").find((frame) => frame.includes("event: response.completed"))!;
		const payload = JSON.parse(completed.split("data: ")[1]);
		expect(payload.response.output.map((item: { type: string }) => item.type)).toEqual(["message", "message"]);
	});

	it("emits buffered Chat Completions text before the final chunk", async () => {
		const response = await createManagedToolLiveResponse({
			protocol: "openai.chat.completions",
			requestId: "req_3",
			model: "test-model",
			async run(sink) {
				sink.ready();
				sink.markFinalTurnBuffered();
				return new Response('data: {"choices":[{"index":0,"delta":{"content":"Done."},"finish_reason":null}]}\n\ndata: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n', { headers: { "content-type": "text/event-stream" } });
			},
		});
		const body = await response.text();
		expect(body.indexOf('"content":"Done."')).toBeLessThan(body.indexOf('"finish_reason":"stop"'));
		expect(body).toContain("data: [DONE]");
	});

	it("closes an Anthropic message after the final usage event", async () => {
		const response = await createManagedToolLiveResponse({
			protocol: "anthropic.messages",
			requestId: "req_4",
			model: "test-model",
			async run(sink) {
				const round = sink.beginRound();
				round({ type: "delta_text", channel: "output_text", text: "Done.", choiceIndex: 0 });
				return new Response('event: message_delta\ndata: {"type":"message_delta","usage":{"input_tokens":4,"output_tokens":2}}\n\n', { headers: { "content-type": "text/event-stream" } });
			},
		});
		const body = await response.text();
		expect(body).toContain("Done.");
		expect(body).toContain("event: message_stop");
	});

	it("allows the client to cancel while internal finalization continues", async () => {
		let release!: () => void;
		const gate = new Promise<void>((resolve) => { release = resolve; });
		let finalized = false;
		const response = await createManagedToolLiveResponse({
			protocol: "openai.responses",
			requestId: "req_5",
			model: "test-model",
			async run(sink) {
				sink.ready();
				await gate;
				sink.beginRound()({ type: "delta_text", channel: "output_text", text: "Late text.", choiceIndex: 0 });
				finalized = true;
				return new Response('event: response.completed\ndata: {"response":{"status":"completed"}}\n\n', { headers: { "content-type": "text/event-stream" } });
			},
		});
		const reader = response.body!.getReader();
		await reader.read();
		await reader.cancel();
		release();
		await gate;
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(finalized).toBe(true);
	});
});
