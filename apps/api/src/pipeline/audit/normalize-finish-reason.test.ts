import { describe, expect, it } from "vitest";
import {
	extractProviderFinishReason,
	normalizeFinishReason,
} from "./normalize-finish-reason";

describe("provider finish reasons", () => {
	it("extracts native reasons from OpenAI, Anthropic, and Gemini payloads", () => {
		expect(extractProviderFinishReason({
			choices: [{ finish_reason: "tool_calls" }],
		})).toBe("tool_calls");
		expect(extractProviderFinishReason({ stop_reason: "pause_turn" })).toBe("pause_turn");
		expect(extractProviderFinishReason({
			candidates: [{ finishReason: "PROHIBITED_CONTENT" }],
		})).toBe("PROHIBITED_CONTENT");
	});

	it("normalizes expanded Gemini safety and malformed response reasons", () => {
		expect(normalizeFinishReason("SPII", "google-ai-studio")).toBe("content_filter");
		expect(normalizeFinishReason("PROHIBITED_CONTENT", "google-vertex")).toBe("content_filter");
		expect(normalizeFinishReason("MALFORMED_FUNCTION_CALL", "google-ai-studio")).toBe("error");
		expect(normalizeFinishReason("MALFORMED_FUNCTION_CALL", "google-vertex-eu")).toBe("error");
		expect(normalizeFinishReason("RECITATION", "google")).toBe("recitation");
		expect(normalizeFinishReason("UNEXPECTED_TOOL_CALL", "google-ai-studio")).toBe("tool_calls");
	});

	it("normalizes shared OpenAI-compatible and native provider tool reasons", () => {
		expect(normalizeFinishReason("tool_calls", "baseten")).toBe("tool_calls");
		expect(normalizeFinishReason("function_call", "together")).toBe("tool_calls");
		expect(normalizeFinishReason("tool_use", "anthropic")).toBe("tool_calls");
		expect(normalizeFinishReason("end_turn", "amazon-bedrock")).toBe("stop");
		expect(normalizeFinishReason("sensitive", "z-ai")).toBe("content_filter");
	});
});
