import { describe, expect, it } from "vitest";
import { createToolTraceRetention } from "./server-tool-trace";

describe("tool trace retention", () => {
	it("preserves ordinary results without mutating the caller's binary output", () => {
		const input = { text: "result", b64_json: "image bytes" };
		expect(createToolTraceRetention()(input)).toEqual({ text: "result", b64_json: "[binary omitted]" });
		expect(input.b64_json).toBe("image bytes");
	});
	it("bounds strings and the aggregate retained output across calls", () => {
		const retain = createToolTraceRetention();
		const results = Array.from({ length: 100 }, () => retain("x".repeat(100000)));
		expect(JSON.stringify(results).length).toBeLessThan(70000);
		expect(results[0]).toHaveLength(8192 + "[truncated]".length);
	});
	it("bounds deeply nested output and omits data URLs", () => {
		expect(createToolTraceRetention()({ url: "data:image/png;base64,abc" })).toEqual({ url: "[binary omitted]" });
		let nested: unknown = "leaf";
		for (let i = 0; i < 100; i++) nested = { nested };
		expect(JSON.stringify(createToolTraceRetention()(nested)).length).toBeLessThan(200);
	});
});
