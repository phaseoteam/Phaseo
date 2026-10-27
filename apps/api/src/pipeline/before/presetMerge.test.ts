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
	it("applies preset instructions to Responses API requests", () => {
		const preset = { id: "preset_123", name: "@brief", slug: "brief", description: null, visibility: "team" as const, config: { systemPrompt: "Be concise" } };
		expect(mergePresetWithBody({ input: "Hello" }, preset).instructions).toBe("Be concise");
		expect(mergePresetWithBody({ input: "Hello", instructions: "Use JSON" }, preset).instructions).toBe("Be concise\n\nUse JSON");
	});
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

	const systemPreset = { id: "preset_sys", name: "@sys", slug: "sys", description: null, visibility: "team" as const, config: { systemPrompt: "Be concise", defaultParams: { temperature: 0.37 } } };

	it("puts the preset prompt in top-level system on Messages requests without one", () => {
		const merged = mergePresetWithBody({ model: "anthropic/claude-sonnet-5", max_tokens: 64, messages: [{ role: "user", content: "Hello" }] }, systemPreset, "messages");
		expect(merged.system).toBe("Be concise");
		expect(merged.messages).toEqual([{ role: "user", content: "Hello" }]);
	});

	it("prepends the preset prompt to an existing Messages system prompt", () => {
		const stringSystem = mergePresetWithBody({ system: "Use JSON", messages: [{ role: "user", content: "Hello" }] }, systemPreset, "messages");
		expect(stringSystem.system).toBe("Be concise\n\nUse JSON");
		const arraySystem = mergePresetWithBody({ system: [{ type: "text", text: "Use JSON" }], messages: [{ role: "user", content: "Hello" }] }, systemPreset, "messages");
		expect(arraySystem.system).toEqual([{ type: "text", text: "Be concise\n\n" }, { type: "text", text: "Use JSON" }]);
	});

	it("keeps adding a system message on Chat requests", () => {
		const merged = mergePresetWithBody({ messages: [{ role: "user", content: "Hello" }] }, systemPreset, "chat.completions");
		expect(merged.messages[0]).toEqual({ role: "system", content: "Be concise" });
		expect(merged.system).toBeUndefined();
	});

	it("fills a preset temperature only when the request has none", () => {
		expect(mergePresetWithBody({ messages: [{ role: "user", content: "Hello" }] }, systemPreset, "chat.completions").temperature).toBe(0.37);
		expect(mergePresetWithBody({ messages: [{ role: "user", content: "Hello" }], temperature: 0.9 }, systemPreset, "chat.completions").temperature).toBe(0.9);
	});
});
