// Purpose: Unit tests for the harness's SSE frame parser and frame markers.
// Why: Stream-order mismatches depend on every frame being seen once and in order.
// How: Hand-written SSE bodies in the Chat, Responses and error shapes.

import { describe, expect, it } from "vitest";
import { parseSse, sseMarker } from "../sse";

describe("parseSse", () => {
	it("keeps frames in order, parses JSON and keeps [DONE]", () => {
		const text = [
			"data: {\"choices\":[{\"delta\":{\"content\":\"a\"}}]}",
			"",
			"event: response.completed",
			"data: {\"type\":\"response.completed\"}",
			"",
			"data: [DONE]",
			"",
			"",
		].join("\r\n");
		const frames = parseSse(text);
		expect(frames).toHaveLength(3);
		expect(frames[1]).toEqual({ event: "response.completed", data: { type: "response.completed" } });
		expect(frames[2].data).toBe("[DONE]");
	});

	it("joins multi-line data and keeps non-JSON data as text", () => {
		const frames = parseSse("data: line one\ndata: line two\n\n");
		expect(frames[0].data).toBe("line one\nline two");
	});
});

describe("sseMarker", () => {
	it("labels Chat chunks, typed events and errors", () => {
		expect(sseMarker({ event: null, data: { choices: [{ delta: { content: "x" }, finish_reason: null }] } })).toBe("chunk:content");
		expect(sseMarker({ event: null, data: { choices: [{ delta: {}, finish_reason: "stop" }] } })).toBe("chunk:finish:stop");
		expect(sseMarker({ event: null, data: { choices: [], usage: { prompt_tokens: 1 } } })).toBe("chunk:usage");
		expect(sseMarker({ event: "message_stop", data: { type: "message_stop" } })).toBe("message_stop");
		expect(sseMarker({ event: null, data: { error: { message: "boom" } } })).toBe("error");
		expect(sseMarker({ event: null, data: "[DONE]" })).toBe("[DONE]");
	});
});
