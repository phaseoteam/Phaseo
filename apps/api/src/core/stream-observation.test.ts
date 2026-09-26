import { describe, expect, it } from "vitest";
import { normalizeStreamFinishReason } from "./stream-observation";

describe("stream finish reason cardinality", () => {
    it.each([
        ["stop", "stop"], ["end_turn", "stop"], ["stop_sequence", "stop"],
        ["length", "length"], ["max_tokens", "length"], ["max_output_tokens", "length"],
        ["tool_calls", "tool_calls"], ["tool_use", "tool_calls"], ["function_call", "tool_calls"],
        ["content_filter", "content_filter"], ["refusal", "content_filter"],
        ["error", "error"], ["failed", "error"], ["constructor", "other"],
        ["private user content", "other"], [null, null], [undefined, null], ["", null],
    ])("normalizes %s to %s", (input, expected) => expect(normalizeStreamFinishReason(input)).toBe(expected));
    it("does not invoke untrusted object coercion", () => {
        expect(normalizeStreamFinishReason({ toString() { throw new Error("must not coerce"); } })).toBe("other");
    });
});
