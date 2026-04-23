import { describe, expect, it } from "vitest";
import { contextSchema, presetConfigSchema } from "./schemas";

describe("presetConfigSchema", () => {
	it("parses snake_case preset config fields from the web app shape", () => {
		const result = presetConfigSchema.parse({
			system_prompt: "Be terse",
			models: ["openai/gpt-5-nano"],
			only_providers: ["openai", "openai"],
			ignore_providers: ["anthropic"],
			parameters: { temperature: 0.2 },
			reasoning: { effort: "medium" },
			provider_preferences: { openai: 10 },
		});

		expect(result).toEqual({
			systemPrompt: "Be terse",
			allowedModels: ["openai/gpt-5-nano"],
			defaultModel: "openai/gpt-5-nano",
			model: null,
			allowedProviders: ["openai", "openai"],
			deniedProviders: ["anthropic"],
			defaultParams: {
				temperature: 0.2,
				reasoning: { effort: "medium" },
			},
			providerPreferences: { openai: 10 },
		});
	});

	it("prefers explicit default_model over models[0]", () => {
		const result = presetConfigSchema.parse({
			default_model: "openai/gpt-4.1-mini",
			models: ["openai/gpt-5-nano"],
		});

		expect(result.defaultModel).toBe("openai/gpt-4.1-mini");
		expect(result.allowedModels).toEqual(["openai/gpt-5-nano"]);
	});
});

describe("contextSchema preset parsing", () => {
	it("parses preset payloads returned by gateway context SQL", () => {
		const parsed = contextSchema.parse({
			workspace_id: "6108396e-0e12-425d-91ff-a02d39a346e0",
			resolved_model: "openai/gpt-5-nano",
			preset: {
				id: "preset_123",
				name: "Fast OpenAI",
				description: "A fast preset",
				visibility: "team",
				config: {
					system_prompt: "Be fast",
					default_model: "openai/gpt-5-nano",
					only_providers: ["openai"],
					parameters: { temperature: 0.1 },
				},
			},
			key_ok: true,
			key_limit_ok: true,
			credit_ok: true,
			providers: [],
			pricing: {},
		});

		expect(parsed.workspaceId).toBe("6108396e-0e12-425d-91ff-a02d39a346e0");
		expect(parsed.resolvedModel).toBe("openai/gpt-5-nano");
		expect(parsed.preset).toEqual({
			id: "preset_123",
			name: "Fast OpenAI",
			description: "A fast preset",
			visibility: "team",
			config: {
				systemPrompt: "Be fast",
				allowedModels: null,
				defaultModel: "openai/gpt-5-nano",
				model: null,
				allowedProviders: ["openai"],
				deniedProviders: null,
				defaultParams: { temperature: 0.1 },
				providerPreferences: null,
			},
		});
	});
});
