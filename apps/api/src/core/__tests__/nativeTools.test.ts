import { describe, expect, it } from "vitest";
import { isIRNativeToolDefinition } from "../nativeTools";

describe("isIRNativeToolDefinition", () => {
	it("does not treat gateway-managed AI Stats tools as provider-native tools", () => {
		expect(isIRNativeToolDefinition({ type: "ai-stats:web_search" })).toBe(false);
		expect(isIRNativeToolDefinition({ type: "ai-stats:advisor" })).toBe(false);
		expect(isIRNativeToolDefinition({ type: "ai-stats:apply_patch" })).toBe(false);
	});

	it("accepts provider-native tool definitions", () => {
		expect(isIRNativeToolDefinition({ type: "web_search_20250305" })).toBe(true);
	});
});
