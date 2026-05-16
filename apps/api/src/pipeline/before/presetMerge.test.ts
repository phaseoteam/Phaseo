import { mergePresetWithBody, resolvePresetRoutingMode, validatePresetModel } from "./presetMerge";
import { describe, expect, it } from "vitest";

describe("validatePresetModel", () => {
	it("allows exact model matches from the preset allowlist", () => {
		expect(
			validatePresetModel("openai/gpt-5.4-nano", {
				allowedModels: ["openai/gpt-5.4-nano", "anthropic/claude-sonnet"],
			}),
		).toBeNull();
	});

	it("allows wildcard model matches from the preset allowlist", () => {
		expect(
			validatePresetModel("openai/gpt-5.4-mini", {
				allowedModels: ["openai/gpt-5.4-*"],
			}),
		).toBeNull();
	});

	it("returns a validation error when the resolved model is outside the preset allowlist", () => {
		expect(
			validatePresetModel("google/gemini-2.5-pro", {
				allowedModels: ["openai/gpt-5.4-*"],
			}),
		).toContain("is not allowed by preset");
	});
});

describe("resolvePresetRoutingMode", () => {
	it("prefers the preset routing mode when present", () => {
		expect(
			resolvePresetRoutingMode(
				{ routingMode: "latency" },
				"balanced",
			),
		).toBe("latency");
	});

	it("falls back to the workspace routing mode when preset routing is absent", () => {
		expect(resolvePresetRoutingMode({}, "throughput")).toBe("throughput");
	});

	it("returns null when neither preset nor workspace routing mode is valid", () => {
		expect(resolvePresetRoutingMode({}, null)).toBeNull();
	});
});

describe("mergePresetWithBody", () => {
	it("applies preset plugin defaults and lets request plugins override by id", () => {
		const merged = mergePresetWithBody(
			{
				input: "Return valid JSON",
				plugins: [{ id: "response-healing", enabled: false }],
			},
			{
				id: "preset_123",
				name: "@json-safe",
				slug: "json-safe",
				description: null,
				visibility: "team",
				config: {
					plugins: [
						{ id: "response-healing", enabled: true },
						{ id: "trace-plugin", enabled: true, config: { sample_rate: 0.25 } },
					],
				},
			},
		);

		expect(merged.plugins).toEqual([
			{ id: "response-healing", enabled: false },
			{ id: "trace-plugin", enabled: true, sample_rate: 0.25 },
		]);
	});

	it("applies preset default model and provider routing hints when request omits them", () => {
		const merged = mergePresetWithBody(
			{
				input: "Hello",
			},
			{
				id: "preset_123",
				name: "@fast-router",
				slug: "fast-router",
				description: null,
				visibility: "team",
				config: {
					defaultModel: "openai/gpt-5.4-mini",
					provider: {
						order: ["openai", "anthropic"],
						only: ["openai", "anthropic"],
						maxPrice: { prompt: 0.25, completion: 1.5 },
						preferredMinThroughput: { p50: 120 },
						preferredMaxLatency: { p50: 5 },
					},
				},
			},
		);

		expect(merged.model).toBe("openai/gpt-5.4-mini");
		expect(merged.provider).toEqual({
			order: ["openai", "anthropic"],
			only: ["openai", "anthropic"],
			max_price: { prompt: 0.25, completion: 1.5 },
			preferred_min_throughput: { p50: 120 },
			preferred_max_latency: { p50: 5 },
		});
	});

	it("lets request-level provider hints override preset defaults", () => {
		const merged = mergePresetWithBody(
			{
				input: "Hello",
				provider: {
					order: ["google-ai-studio"],
					max_price: { prompt: 0.1 },
				},
			},
			{
				id: "preset_123",
				name: "@fast-router",
				slug: "fast-router",
				description: null,
				visibility: "team",
				config: {
					provider: {
						order: ["openai", "anthropic"],
						only: ["openai", "anthropic"],
						maxPrice: { prompt: 0.25, completion: 1.5 },
					},
				},
			},
		);

		expect(merged.provider).toEqual({
			order: ["google-ai-studio"],
			only: ["openai", "anthropic"],
			max_price: { prompt: 0.1 },
		});
	});
});
