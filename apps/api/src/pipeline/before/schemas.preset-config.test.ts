import { contextSchema, presetConfigSchema } from "./schemas";
import { describe, expect, it } from "vitest";

describe("presetConfigSchema", () => {
    it("parses snake_case preset config fields from the web app shape", () => {
        const result = presetConfigSchema.parse({
            system_prompt: "Be terse",
            models: ["openai/gpt-5.4-nano"],
            only_providers: ["openai", "openai"],
            ignore_providers: ["anthropic"],
            provider: {
                order: ["openai", "anthropic"],
                required_execution_region: "eu",
                required_data_region: "us",
                require_zero_data_retention: true,
                max_price: { prompt: 0.25, completion: 1.5 },
                preferred_min_throughput: { p50: 100, p95: 80 },
                preferred_max_latency: { p50: 5, p95: 8 },
            },
            plugins: [{ id: "response-healing" }],
            parameters: { temperature: 0.2 },
            reasoning: { effort: "medium" },
            provider_preferences: { openai: 2 },
            routing_mode: "latency",
            response_caching: { enabled: true, ttl_seconds: 600 },
        });

        expect(result).toEqual({
            systemPrompt: "Be terse",
            allowedModels: ["openai/gpt-5.4-nano"],
            defaultModel: "openai/gpt-5.4-nano",
            model: null,
            allowedProviders: ["openai", "openai"],
            deniedProviders: ["anthropic"],
            provider: {
                order: ["openai", "anthropic"],
                only: ["openai", "anthropic"],
                ignore: null,
                requiredExecutionRegion: "eu",
                requiredDataRegion: "us",
                requireZeroDataRetention: true,
                maxPrice: { prompt: 0.25, completion: 1.5 },
                preferredMinThroughput: { p50: 100, p95: 80 },
                preferredMaxLatency: { p50: 5, p95: 8 },
            },
            plugins: [{ id: "response-healing", enabled: true, preventOverrides: false, config: {} }],
            defaultParams: {
                temperature: 0.2,
                reasoning: { effort: "medium" },
            },
            providerPreferences: { openai: 2 },
            routingMode: "latency",
            responseCaching: {
                enabled: true,
                ttlSeconds: 600,
            },
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
            provider: {
                order: ["camel-provider", "anthropic"],
                only: ["camel-provider"],
                ignore: ["snake-deny"],
                requiredExecutionRegion: "eu",
                requiredDataRegion: "us",
                requireZeroDataRetention: false,
                maxPrice: { prompt: 0.2 },
                preferredMinThroughput: { p50: 120 },
                preferredMaxLatency: { p50: 4 },
            },
            defaultParams: { top_p: 0.9 },
            parameters: { temperature: 0.7 },
            providerPreferences: { openai: 3 },
            provider_preferences: { openai: 1 },
            routingMode: "throughput",
            routing_mode: "price",
            responseCaching: { enabled: true, ttlSeconds: 120 },
            response_caching: { enabled: true, ttl_seconds: 600 },
        });

        expect(result).toEqual({
            systemPrompt: "camel",
            allowedModels: ["camel-model"],
            defaultModel: "camel-default",
            model: null,
            allowedProviders: ["camel-provider"],
            deniedProviders: ["camel-deny"],
            provider: {
                order: ["camel-provider", "anthropic"],
                only: ["camel-provider"],
                ignore: ["snake-deny"],
                requiredExecutionRegion: "eu",
                requiredDataRegion: "us",
                requireZeroDataRetention: false,
                maxPrice: { prompt: 0.2 },
                preferredMinThroughput: { p50: 120 },
                preferredMaxLatency: { p50: 4 },
            },
            defaultParams: { top_p: 0.9 },
            providerPreferences: { openai: 3 },
            routingMode: "throughput",
            plugins: null,
            responseCaching: {
                enabled: true,
                ttlSeconds: 120,
            },
        });
    });
});

describe("contextSchema preset parsing", () => {
    it("parses preset payloads returned by gateway context SQL", () => {
        const parsed = contextSchema.parse({
            workspace_id: "ws_123",
            resolvedModel: "openai/gpt-5.4-nano",
            key_ok: true,
            key_limit_ok: true,
            credit_ok: true,
            providers: [],
            pricing: {},
            preset: {
                id: "preset_123",
                name: "Fast preset",
                slug: "fast-preset",
                description: "A fast preset",
                visibility: "team",
                config: {
                    system_prompt: "Be fast",
                    models: ["openai/gpt-5.4-nano"],
                    provider: {
                        order: ["openai", "anthropic"],
                        only: ["openai"],
                        required_data_region: "us",
                        require_zero_data_retention: true,
                        max_price: { prompt: 0.25, completion: 1.5 },
                        preferred_min_throughput: { p50: 100 },
                        preferred_max_latency: { p50: 5 },
                    },
                    plugins: [{ id: "response-healing", enabled: false, mode: "strict" }],
                    parameters: { temperature: 0.1 },
                    preferred_performance: "latency",
                    response_caching: { enabled: true, ttl_seconds: 900 },
                },
            },
        });

        expect(parsed.preset).toEqual({
            id: "preset_123",
            name: "Fast preset",
            slug: "fast-preset",
            description: "A fast preset",
            visibility: "team",
            config: {
                systemPrompt: "Be fast",
                allowedModels: ["openai/gpt-5.4-nano"],
                defaultModel: "openai/gpt-5.4-nano",
                model: null,
                allowedProviders: ["openai"],
                deniedProviders: null,
                provider: {
                    order: ["openai", "anthropic"],
                    only: ["openai"],
                    ignore: null,
                    requiredExecutionRegion: null,
                    requiredDataRegion: "us",
                    requireZeroDataRetention: true,
                    maxPrice: { prompt: 0.25, completion: 1.5 },
                    preferredMinThroughput: { p50: 100 },
                    preferredMaxLatency: { p50: 5 },
                },
                plugins: [{
                    id: "response-healing",
                    enabled: false,
                    preventOverrides: false,
                    config: { mode: "strict" },
                }],
                defaultParams: { temperature: 0.1 },
                providerPreferences: null,
                routingMode: "latency",
                responseCaching: {
                    enabled: true,
                    ttlSeconds: 900,
                },
            },
        });
    });
});
