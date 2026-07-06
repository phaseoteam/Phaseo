import { describe, expect, it } from "vitest";
import { isIRNativeToolDefinition } from "../nativeTools";

describe("isIRNativeToolDefinition", () => {
	it("does not treat gateway-managed Phaseo tools as provider-native tools", () => {
		expect(isIRNativeToolDefinition({ type: "phaseo:web_search" })).toBe(false);
		expect(isIRNativeToolDefinition({ type: "phaseo:advisor" })).toBe(false);
		expect(isIRNativeToolDefinition({ type: "phaseo:apply_patch" })).toBe(false);
	});

	it("accepts provider-native tool definitions", () => {
		expect(isIRNativeToolDefinition({ type: "web_search_20250305" })).toBe(true);
	});
});
