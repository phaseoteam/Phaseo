import { describe, expect, it } from "vitest";
import {
	normalizeImageConfig,
	normalizeOpenAIToolChoice,
	normalizeResponseFormat,
	resolveServiceTierFromSpeedAndTier,
} from "./text-normalizers";

describe("normalizeResponseFormat", () => {
	it("maps string json_object", () => {
		expect(normalizeResponseFormat("json_object")).toEqual({
			type: "json_object",
		});
	});

	it("maps json_schema and preserves strict=false", () => {
		expect(
			normalizeResponseFormat({
				type: "json_schema",
				json_schema: {
					name: "schema_name",
					strict: false,
					schema: { type: "object" },
				},
			}),
		).toEqual({
			type: "json_schema",
			name: "schema_name",
			strict: false,
			schema: { type: "object" },
		});
	});

	it("falls back to text for unsupported object types", () => {
		expect(normalizeResponseFormat({ type: "unsupported" })).toEqual({
			type: "text",
		});
	});
});

describe("normalizeImageConfig", () => {
	it("maps image_config fields to IR shape", () => {
		expect(
			normalizeImageConfig({
				aspect_ratio: "1:1",
				image_size: "2K",
				font_inputs: [{ font_url: "https://cdn/fonts/test.ttf", text: "hello" }],
				super_resolution_references: ["https://example.com/ref.png"],
			}),
		).toEqual({
			aspectRatio: "1:1",
			imageSize: "2K",
			fontInputs: [{ fontUrl: "https://cdn/fonts/test.ttf", text: "hello" }],
			superResolutionReferences: ["https://example.com/ref.png"],
		});
	});

	it("returns undefined for non-object values", () => {
		expect(normalizeImageConfig(null)).toBeUndefined();
		expect(normalizeImageConfig(undefined)).toBeUndefined();
		expect(normalizeImageConfig("foo")).toBeUndefined();
	});
});

describe("resolveServiceTierFromSpeedAndTier", () => {
	it("promotes speed=fast to priority", () => {
		expect(
			resolveServiceTierFromSpeedAndTier({
				speed: "fast",
				service_tier: "default",
			}),
		).toBe("priority");
	});

	it("keeps explicit service_tier when speed is not fast", () => {
		expect(
			resolveServiceTierFromSpeedAndTier({
				speed: "slow",
				service_tier: "flex",
			}),
		).toBe("flex");
	});

	it("returns undefined when neither value is usable", () => {
		expect(resolveServiceTierFromSpeedAndTier({})).toBeUndefined();
	});
});

describe("normalizeOpenAIToolChoice", () => {
	it("maps string values", () => {
		expect(normalizeOpenAIToolChoice("auto")).toBe("auto");
		expect(normalizeOpenAIToolChoice("none")).toBe("none");
		expect(normalizeOpenAIToolChoice("required")).toBe("required");
		expect(normalizeOpenAIToolChoice("any")).toBe("required");
	});

	it("maps function object values", () => {
		expect(
			normalizeOpenAIToolChoice({
				type: "function",
				function: { name: "get_weather" },
			}),
		).toEqual({ name: "get_weather" });
	});

	it("applies unknown string fallback when configured", () => {
		expect(
			normalizeOpenAIToolChoice("something-else", {
				unknownStringFallback: "auto",
			}),
		).toBe("auto");
	});
});
