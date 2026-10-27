import { describe, expect, it } from "vitest";
import { isBareChatErrorFrame, readUpstreamStreamError } from "./stream-errors";

describe("isBareChatErrorFrame", () => {
	it("matches an OpenAI-compatible mid-stream error frame", () => {
		expect(isBareChatErrorFrame({ error: { message: "reset", type: "server_error" } })).toBe(true);
	});

	it.each([
		[{ object: "chat.completion.chunk", error: { message: "x" }, choices: [] }],
		[{ type: "error", error: { message: "x" } }],
		[{ error: null }],
		[{ error: "reset" }],
		[null],
	])("does not match %j", (frame) => {
		expect(isBareChatErrorFrame(frame)).toBe(false);
	});
});

describe("readUpstreamStreamError", () => {
	it.each([
		["bare Chat frame", { error: { message: "reset", type: "server_error", code: null } }, { code: "server_error", message: "reset" }],
		["Responses error event", { type: "error", code: "server_error", message: "reset" }, { code: "server_error", message: "reset" }],
		["response.failed", { response: { status: "failed", error: { code: "rate_limit_exceeded", message: "slow down" } } }, { code: "rate_limit_exceeded", message: "slow down" }],
		["Anthropic error event", { type: "error", error: { type: "overloaded_error", message: "Overloaded" } }, { code: "overloaded_error", message: "Overloaded" }],
		["Gemini error frame", { error: { code: 500, message: "internal", status: "INTERNAL" } }, { code: "500", message: "internal" }],
		["no message", { type: "error" }, { code: null, message: "stream_error" }],
	])("reads a %s", (_name, payload, expected) => {
		expect(readUpstreamStreamError(payload)).toEqual(expected);
	});
});
