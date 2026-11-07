import { describe, expect, it } from "vitest";
import { GeminiArgumentStream, supportsGeminiArgumentStreaming } from "./function-call-stream";

describe("Gemini typed argument streaming", () => {
	it("emits escaped string fragments before the argument completes", () => {
		const stream = new GeminiArgumentStream();
		const first = stream.append([{ jsonPath: "$.body", stringValue: 'hello "', willContinue: true }], false);
		expect(first).toBe('{"body":"hello \\"');
		const second = stream.append([{ jsonPath: "$.body", stringValue: "world\n", willContinue: true }], false);
		const last = stream.append([{ jsonPath: "$.body" }], true);
		expect(JSON.parse(first + second + last)).toEqual({ body: 'hello "world\n' });
	});

	it("serializes nested objects, arrays, nulls, booleans, and empty strings", () => {
		const stream = new GeminiArgumentStream();
		const first = stream.append([
			{ jsonPath: "$.items[0].name", stringValue: "first" },
			{ jsonPath: "$.items[0].count", numberValue: 2 },
			{ jsonPath: "$.items[1].name", stringValue: "" },
		], false);
		const second = stream.append([
			{ jsonPath: "$.items[1].count", nullValue: "NULL_VALUE" },
			{ jsonPath: '$["ready"]', boolValue: false },
		], true);
		expect(JSON.parse(first + second)).toEqual({ items: [{ name: "first", count: 2 }, { name: "", count: null }], ready: false });
	});

	it("treats prototype-like names as JSON text without mutating prototypes", () => {
		const stream = new GeminiArgumentStream();
		const json = stream.append([{ jsonPath: "$.__proto__.polluted", boolValue: true }], true);
		expect(Object.hasOwn(JSON.parse(json), "__proto__")).toBe(true);
		expect(({} as Record<string, unknown>).polluted).toBeUndefined();
	});

	it.each(["$..body", "$.items[999999999]", "$[?(@.secret)]", "$", `$.${"a.".repeat(65)}last`])("rejects invalid or unbounded paths: %s", (jsonPath) => {
		expect(() => new GeminiArgumentStream().append([{ jsonPath, stringValue: "x" }], true)).toThrow();
	});

	it("rejects duplicate fields and incomplete strings", () => {
		const stream = new GeminiArgumentStream();
		stream.append([{ jsonPath: "$.x", numberValue: 1 }], false);
		expect(() => stream.append([{ jsonPath: "$.x", numberValue: 2 }], true)).toThrow("google_invalid_function_argument_order");
		expect(() => new GeminiArgumentStream().append([{ jsonPath: "$.x", stringValue: "unfinished", willContinue: true }], true)).toThrow("google_incomplete_function_arguments");
	});

	it("decodes quoted keys without evaluating JSONPath expressions", () => {
		const stream = new GeminiArgumentStream();
		const json = stream.append([
			{ jsonPath: "$['line\\nname']", stringValue: "x" },
			{ jsonPath: "$['quote\\'name']", numberValue: 1 },
		], true);
		expect(JSON.parse(json)).toEqual({ "line\nname": "x", "quote'name": 1 });
	});

	it("handles an empty argument object", () => {
		expect(new GeminiArgumentStream().append([], true)).toBe("{}");
	});

	it.each([
		["google/gemini-3.5-flash", true], ["gemini-4-argon", true],
		["gemini-2.5-flash", false], ["gemini-3.1-flash-lite-preview", false],
		["gemini-3-pro-image-preview", false], ["gemma-4-31b-it", false],
	])("gates supported models: %s", (model, expected) => {
		expect(supportsGeminiArgumentStreaming(model)).toBe(expected);
	});
});
