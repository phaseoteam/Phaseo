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
});
