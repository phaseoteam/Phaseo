import { describe, expect, it } from "vitest";
import { estimateDrainProgressUsage, requestTextChars } from "./drain-progress";

describe("estimateDrainProgressUsage", () => {
	it("counts prompt text only, not media or settings", () => {
		const body = {
			model: "m",
			instructions: "abcde",
			messages: [
				{ role: "user", content: [{ type: "text", text: "0123456789" }, { type: "image_url", image_url: { url: `data:image/png;base64,${"A".repeat(10_000)}` } }] },
				{ role: "assistant", content: "hello" },
			],
			tools: [{ type: "function", function: { name: "f", description: "x".repeat(1_000) } }],
			metadata: { text: "x".repeat(1_000) },
		};
		expect(requestTextChars(body)).toBe(5 + 10 + 5);
	});

	it("estimates input from the request and output from the streamed text when nothing is reported", () => {
		expect(estimateDrainProgressUsage({ usage: null, outputChars: 1_000, body: { input: "x".repeat(500) } }))
			.toEqual({ input_tokens: 100, output_tokens: 200 });
	});

	it("keeps reported input and cache counts and never lowers reported output", () => {
		const usage = { input_tokens: 40, cache_read_input_tokens: 900, output_tokens: 300 };
		expect(estimateDrainProgressUsage({ usage, outputChars: 500, body: {} })).toEqual({ ...usage, output_tokens: 300 });
		expect(estimateDrainProgressUsage({ usage: { prompt_tokens: 40 }, outputChars: 500, body: {} }))
			.toEqual({ prompt_tokens: 40, completion_tokens: 100 });
	});

	it("returns nothing when there is nothing to charge", () => {
		expect(estimateDrainProgressUsage({ usage: null, outputChars: 0, body: {} })).toBeNull();
	});
});
