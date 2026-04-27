import { contextSchema, presetConfigSchema } from "./schemas";

describe("presetConfigSchema", () => {
    it("parses snake_case preset config fields from the web app shape", () => {
        const result = presetConfigSchema.parse({
            system_prompt: "Be terse",
            models: ["openai/gpt-5.4-nano"],
            only_providers: ["openai", "openai"],
            ignore_providers: ["anthropic"],
            parameters: { temperature: 0.2 },
            reasoning: { effort: "medium" },
            provider_preferences: { openai: 2 },
        });

        expect(result).toEqual({
            systemPrompt: "Be terse",
            allowedModels: ["openai/gpt-5.4-nano"],
            defaultModel: "openai/gpt-5.4-nano",
            model: null,
            allowedProviders: ["openai", "openai"],
            deniedProviders: ["anthropic"],
            defaultParams: {
                temperature: 0.2,
                reasoning: { effort: "medium" },
            },
            providerPreferences: { openai: 2 },
        });
    });

    it("prefers camelCase values when both shapes are present", () => {
        const result = presetConfigSchema.parse({
            systemPrompt: "camel",
            system_prompt: "snake",
            allowedModels: ["camel-model"],
            models: ["snake-model"],
            defaultModel: "camel-default",
            default_model: "snake-default",
            allowedProviders: ["camel-provider"],
            only_providers: ["snake-provider"],
            deniedProviders: ["camel-deny"],
            ignore_providers: ["snake-deny"],
            defaultParams: { top_p: 0.9 },
            parameters: { temperature: 0.7 },
            providerPreferences: { openai: 3 },
            provider_preferences: { openai: 1 },
        });

        expect(result).toEqual({
            systemPrompt: "camel",
            allowedModels: ["camel-model"],
            defaultModel: "camel-default",
            model: null,
            allowedProviders: ["camel-provider"],
            deniedProviders: ["camel-deny"],
            defaultParams: { top_p: 0.9 },
            providerPreferences: { openai: 3 },
        });
    });
});

describe("contextSchema preset parsing", () => {
    it("parses preset payloads returned by gateway context SQL", () => {
        const parsed = contextSchema.parse({
            workspaceId: "ws_123",
            apiKeyId: "key_123",
            resolvedModel: "openai/gpt-5.4-nano",
            providers: [],
            pricing: {},
            preset: {
                id: "preset_123",
                name: "Fast preset",
                description: "A fast preset",
                visibility: "team",
                config: {
                    system_prompt: "Be fast",
                    models: ["openai/gpt-5.4-nano"],
                    only_providers: ["openai"],
                    parameters: { temperature: 0.1 },
                },
            },
        });

        expect(parsed.preset).toEqual({
            id: "preset_123",
            name: "Fast preset",
            description: "A fast preset",
            visibility: "team",
            config: {
                systemPrompt: "Be fast",
                allowedModels: ["openai/gpt-5.4-nano"],
                defaultModel: "openai/gpt-5.4-nano",
                model: null,
                allowedProviders: ["openai"],
                deniedProviders: null,
                defaultParams: { temperature: 0.1 },
                providerPreferences: null,
            },
        });
    });
});
