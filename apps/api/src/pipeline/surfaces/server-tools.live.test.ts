import { describe, expect, it } from "vitest";
import { createManagedToolLiveResponse } from "./server-tools.live";
import { buildSyntheticServerToolStream } from "./server-tools.stream";

function framesOf(body: string) {
	return body.split("\n\n").filter(Boolean).map((block) => {
		const event = block.split("\n").find((line) => line.startsWith("event: "))?.slice(7) ?? null;
		const data = block.split("\n").find((line) => line.startsWith("data: "))!.slice(6);
		return { event, data: data === "[DONE]" ? data : JSON.parse(data) };
	});
}

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

	it("sends a buffered last turn's function call as a whole item and lists it in the final output", async () => {
		const response = await createManagedToolLiveResponse({
			protocol: "openai.responses",
			requestId: "req_buffered_call",
			model: "test-model",
			async run(sink) {
				sink.beginRound()({ type: "delta_tool", toolCallId: "call_dt", toolName: "gateway_datetime", arguments: "{}", choiceIndex: 0 });
				sink.toolResult({ id: "call_dt", name: "gateway_datetime", arguments: "{}", output: "10:35" });
				sink.markFinalTurnBuffered();
				return new Response(buildSyntheticServerToolStream({
					protocol: "openai.responses",
					requestId: "req_buffered_call",
					serverToolTrace: [{ id: "call_dt", name: "gateway_datetime", arguments: "{}", output: "10:35" }],
					payload: {
						id: "req_buffered_call",
						object: "response",
						status: "completed",
						output: [{ type: "function_call", call_id: "call_weather", name: "get_weather", arguments: "{\"city\":\"London\"}" }],
					},
				}), { headers: { "content-type": "text/event-stream" } });
			},
		});
		const events = framesOf(await response.text()).filter((frame) => frame.data !== "[DONE]");
		for (const frame of events) expect(frame.data.type).toBe(frame.event);
		const weather = events.filter((frame) => frame.data.item?.name === "get_weather" || frame.data.name === "get_weather").map((frame) => frame.event);
		expect(weather).toEqual(["response.output_item.added", "response.function_call_arguments.done", "response.output_item.done"]);
		// The server tool's call streamed live once, with its result; the final body does not repeat it.
		expect(events.filter((frame) => frame.event === "response.output_item.done" && frame.data.item?.call_id === "call_dt")).toHaveLength(1);
		const completed = events.at(-1)!;
		expect(completed.event).toBe("response.completed");
		expect(completed.data.response.output.map((item: any) => [item.call_id, item.output ?? null])).toEqual([
			["call_dt", "10:35"],
			["call_weather", null],
		]);
	});

	it("sends a buffered last turn's Chat tool call and hides the call the gateway ran", async () => {
		const response = await createManagedToolLiveResponse({
			protocol: "openai.chat.completions",
			requestId: "req_chat_buffered_call",
			model: "test-model",
			async run(sink) {
				sink.beginRound()({ type: "delta_tool", toolCallId: "call_dt", toolName: "gateway_datetime", argumentsDelta: "{}", choiceIndex: 0, toolIndex: 0 });
				sink.toolResult({ id: "call_dt", name: "gateway_datetime", arguments: "{}", output: "10:35" });
				sink.markFinalTurnBuffered();
				return new Response(buildSyntheticServerToolStream({
					protocol: "openai.chat.completions",
					requestId: "req_chat_buffered_call",
					serverToolTrace: [{ id: "call_dt", name: "gateway_datetime", arguments: "{}", output: "10:35" }],
					payload: {
						id: "req_chat_buffered_call",
						object: "chat.completion",
						choices: [{
							index: 0,
							message: { role: "assistant", content: null, tool_calls: [{ id: "call_weather", type: "function", function: { name: "get_weather", arguments: "{\"city\":\"London\"}" } }] },
							finish_reason: "tool_calls",
						}],
					},
				}), { headers: { "content-type": "text/event-stream" } });
			},
		});
		const chunks = framesOf(await response.text()).filter((frame) => frame.data !== "[DONE]").map((frame) => frame.data);
		const calls = chunks.flatMap((chunk) => chunk.choices?.flatMap((choice: any) => choice.delta?.tool_calls ?? []) ?? []);
		expect(calls).toEqual([{ index: 0, id: "call_weather", type: "function", function: { name: "get_weather", arguments: "{\"city\":\"London\"}" } }]);
		expect(chunks.at(-1)!.choices[0].finish_reason).toBe("tool_calls");
	});

	it("sends each held Chat tool call under the choice that made it, numbered per choice", async () => {
		const response = await createManagedToolLiveResponse({
			protocol: "openai.chat.completions",
			requestId: "req_chat_choices",
			model: "test-model",
			async run(sink) {
				const round = sink.beginRound();
				round({ type: "delta_text", channel: "output_text", text: "Checking.", choiceIndex: 0 });
				round({ type: "delta_tool", toolCallId: "call_w1", toolName: "get_weather", argumentsDelta: "{\"city\":\"Paris\"}", choiceIndex: 1, toolIndex: 0 });
				round({ type: "delta_tool", toolCallId: "call_w0", toolName: "get_weather", argumentsDelta: "{\"city\":\"London\"}", choiceIndex: 0, toolIndex: 0 });
				round({ type: "delta_tool", toolCallId: "call_t1", toolName: "get_time", argumentsDelta: "{}", choiceIndex: 1, toolIndex: 1 });
				return new Response('data: {"choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"},{"index":1,"delta":{},"finish_reason":"tool_calls"}]}\n\ndata: [DONE]\n\n', { headers: { "content-type": "text/event-stream" } });
			},
		});
		const chunks = framesOf(await response.text()).filter((frame) => frame.data !== "[DONE]").map((frame) => frame.data);
		expect(chunks.filter((chunk) => chunk.choices?.some((choice: any) => choice.delta?.tool_calls)).map((chunk) => chunk.choices)).toEqual([
			[{ index: 1, delta: { tool_calls: [{ index: 0, id: "call_w1", type: "function", function: { name: "get_weather", arguments: "{\"city\":\"Paris\"}" } }] }, finish_reason: null }],
			[{ index: 0, delta: { tool_calls: [{ index: 0, id: "call_w0", type: "function", function: { name: "get_weather", arguments: "{\"city\":\"London\"}" } }] }, finish_reason: null }],
			[{ index: 1, delta: { tool_calls: [{ index: 1, id: "call_t1", type: "function", function: { name: "get_time", arguments: "{}" } }] }, finish_reason: null }],
		]);
		expect(chunks.at(-1)!.choices.map((choice: any) => [choice.index, choice.finish_reason])).toEqual([[0, "tool_calls"], [1, "tool_calls"]]);
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
