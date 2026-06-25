import { describe, expect, it } from "vitest";
import { sanitizeForAxiom, sanitizeJsonStringForAxiom, stringifyForAxiom } from "../privacy";

describe("observability privacy sanitization", () => {
	it("redacts prompt-like request fields while keeping routing params", () => {
		const sanitized = sanitizeForAxiom({
			model: "openai/gpt-5-mini",
			temperature: 0.2,
			max_output_tokens: 64,
			instructions: "You are helpful.",
			messages: [
				{ role: "system", content: "do thing" },
				{ role: "user", content: "secret prompt" },
			],
		}) as any;

		expect(sanitized.model).toBe("openai/gpt-5-mini");
		expect(sanitized.temperature).toBe(0.2);
		expect(sanitized.max_output_tokens).toBe(64);
		expect(String(sanitized.instructions)).toContain("[redacted");
		expect(String(sanitized.messages[0].content)).toContain("[redacted");
		expect(String(sanitized.messages[1].content)).toContain("[redacted");
	});

	it("sanitizes JSON-string payloads", () => {
		const sanitized = sanitizeJsonStringForAxiom(
			JSON.stringify({
				model: "claude-sonnet",
				input: [{ role: "user", content: [{ type: "input_text", text: "hello world" }] }],
			})
		) as any;

		expect(sanitized.model).toBe("claude-sonnet");
		expect(String(sanitized.input[0].content)).toContain("[redacted");
	});

	it("bounds serialized payload size", () => {
		const raw = stringifyForAxiom({ text: "x".repeat(50000) }, 200);
		expect(raw).not.toBeNull();
		expect(raw!.length).toBeGreaterThan(0);
		expect(raw).toContain("[truncated");
	});

	it("keeps non-prompt telemetry fields such as urls and binary metadata", () => {
		const sanitized = sanitizeForAxiom({
			output: {
				url: "https://example.com/file.png",
				bytes: "ZmFrZQ==",
				data: { size: 128, mime: "image/png" },
			},
			prompt: "draw a cat",
		}) as any;

		expect(sanitized.output.url).toBe("https://example.com/file.png");
		expect(sanitized.output.bytes).toBe("ZmFrZQ==");
		expect(sanitized.output.data.size).toBe(128);
		expect(String(sanitized.prompt)).toContain("[redacted");
	});

	it("keeps provider diagnostics visible while redacting only model text bodies", () => {
		const sanitized = sanitizeForAxiom({
			error: {
				code: "PERMISSION_DENIED",
				message: "The caller does not have permission.",
				content: "Provider diagnostic content should remain visible.",
				details: [{ text: "Diagnostic text should remain visible." }],
			},
			output: [
				{
					type: "message",
					role: "assistant",
					content: [{ type: "output_text", text: "completion body" }],
				},
			],
			stream_event: {
				event: "response.output_text.delta",
				delta: "streamed completion",
			},
		}) as any;

		expect(sanitized.error.message).toBe("The caller does not have permission.");
		expect(sanitized.error.content).toBe("Provider diagnostic content should remain visible.");
		expect(sanitized.error.details[0].text).toBe("Diagnostic text should remain visible.");
		expect(String(sanitized.output[0].content)).toContain("[redacted");
		expect(String(sanitized.stream_event.delta)).toContain("[redacted");
	});

	it("keeps token usage but redacts credentials", () => {
		const sanitized = sanitizeForAxiom({
			usage: {
				input_tokens: 10,
				output_tokens: 5,
			},
			authorization: "Bearer secret",
			api_key: "sk-secret",
			token: "opaque-token",
		}) as any;

		expect(sanitized.usage.input_tokens).toBe(10);
		expect(sanitized.usage.output_tokens).toBe(5);
		expect(String(sanitized.authorization)).toContain("[redacted");
		expect(String(sanitized.api_key)).toContain("[redacted");
		expect(String(sanitized.token)).toContain("[redacted");
	});
});
