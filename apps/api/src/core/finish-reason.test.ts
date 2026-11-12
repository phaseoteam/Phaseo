import { describe, expect, it } from "vitest";
import {
	GATEWAY_STOP_KEY,
	anthropicStopReasonFor,
	gatewayStopEntry,
	normalizeFinishReason,
	readGatewayStop,
	responsesStatusFor,
	stripGatewayStop,
} from "./finish-reason";

describe("normalizeFinishReason", () => {
	it.each([
		["stop", { finishReason: "stop" }],
		["end_turn", { finishReason: "stop" }],
		["completed", { finishReason: "stop" }],
		[null, { finishReason: "stop" }],
		["stop_sequence", { finishReason: "stop", finishDetail: "stop_sequence" }],
		["pause_turn", { finishReason: "stop", finishDetail: "pause_turn" }],
		["refusal", { finishReason: "content_filter", finishDetail: "refusal" }],
		["length", { finishReason: "length" }],
		["max_tokens", { finishReason: "length" }],
		["max_output_tokens", { finishReason: "length" }],
		["model_context_window_exceeded", { finishReason: "length" }],
		["tool_use", { finishReason: "tool_calls" }],
		["tool_calls", { finishReason: "tool_calls" }],
		["content_filter", { finishReason: "content_filter" }],
		["SAFETY", { finishReason: "content_filter" }],
		["error", { finishReason: "error" }],
		["something_new", { finishReason: "stop" }],
	])("maps %s", (raw, expected) => {
		expect(normalizeFinishReason(raw)).toEqual(expected);
	});
});

describe("anthropicStopReasonFor", () => {
	it.each([
		["stop", undefined, "end_turn"],
		["stop", "stop_sequence", "stop_sequence"],
		["stop", "pause_turn", "pause_turn"],
		["stop", "refusal", "refusal"],
		["content_filter", undefined, "refusal"],
		["length", undefined, "max_tokens"],
		["tool_calls", "pause_turn", "tool_use"],
		["error", undefined, null],
	] as const)("maps %s/%s to %s", (reason, detail, expected) => {
		expect(anthropicStopReasonFor(reason, detail)).toBe(expected);
	});
});

describe("responsesStatusFor", () => {
	it("marks length and content filter incomplete with the documented reason", () => {
		expect(responsesStatusFor("length")).toEqual({ status: "incomplete", incompleteDetails: { reason: "max_output_tokens" } });
		expect(responsesStatusFor("content_filter")).toEqual({ status: "incomplete", incompleteDetails: { reason: "content_filter" } });
		expect(responsesStatusFor("stop")).toEqual({ status: "completed" });
		expect(responsesStatusFor("tool_calls")).toEqual({ status: "completed" });
		expect(responsesStatusFor("error")).toEqual({ status: "failed" });
	});
});

describe("gateway stop carrier", () => {
	it("round-trips and is stripped from client frames", () => {
		const response = { status: "completed", ...gatewayStopEntry("stop_sequence", "###") };
		expect(readGatewayStop(response)).toEqual({ reason: "stop_sequence", sequence: "###" });
		expect(gatewayStopEntry(undefined)).toEqual({});

		const frame = { type: "response.completed", response };
		const stripped = stripGatewayStop(frame);
		expect(stripped.response).toEqual({ status: "completed" });
		expect(GATEWAY_STOP_KEY in frame.response).toBe(true);
		expect(stripGatewayStop({ status: "completed", ...gatewayStopEntry("pause_turn") })).toEqual({ status: "completed" });
		const untouched = { object: "chat.completion.chunk" };
		expect(stripGatewayStop(untouched)).toBe(untouched);
	});

	it("ignores unknown carrier values", () => {
		expect(readGatewayStop({ [GATEWAY_STOP_KEY]: { reason: "bogus" } })).toBeNull();
		expect(readGatewayStop(null)).toBeNull();
	});
});
