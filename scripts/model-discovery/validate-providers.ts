import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
    PLATFORM_DISCOVERY_RULES,
    PROVIDER_DISCOVERY_RULES,
    type ProviderDiscoveryRule,
} from "./providers/discovery-policy";
import type { ProviderDefinition } from "./providers/_shared";

const EXPECTED_PLATFORM_NAMES = [
    "AI21",
    "AionLabs",
    "Alibaba Cloud",
    "Amazon Bedrock",
    "Anthropic",
    "Arcee AI",
    "AtlasCloud",
    "Azure",
    "Baseten",
    "Black Forest Labs",
    "ByteDance Seed",
    "Cerebras",
    "Chutes",
    "Clarifai",
    "Cloudflare",
    "Cohere",
    "Crusoe",
    "DeepInfra",
    "DeepSeek",
    "ElevenLabs",
    "Fireworks",
    "Friendli",
    "GMICloud",
    "Google AI Studio",
    "Google Vertex",
    "Groq",
    "Hyperbolic",
    "Inception",
    "Inceptron",
    "Infermatic",
    "Inflection",
    "MiniMax",
    "Mistral",
    "Moonshot AI",
    "Morph",
    "Nebius Token Factory",
    "NextBit",
    "NovitaAI",
    "Nvidia",
    "OpenAI",
    "Parasail",
    "Perplexity",
    "Phala",
    "Sambanova",
    "SiliconFlow",
    "Sourceful",
    "StepFun",
    "Suno",
    "Together",
    "Venice",
    "Weights & Biases",
    "xAI",
    "Xiaomi",
    "z.AI",
] as const;

function isProviderDefinition(value: unknown): value is ProviderDefinition {
    return (
        typeof value === "object" &&
        value !== null &&
        typeof (value as ProviderDefinition).id === "string" &&
        typeof (value as ProviderDefinition).name === "string" &&
        typeof (value as ProviderDefinition).fetchModels === "function"
    );
}

function unwrapDefaultExport(value: unknown): unknown {
    let current = value;
    const seen = new Set<unknown>();

    while (
        current &&
        typeof current === "object" &&
        !Array.isArray(current) &&
        "default" in (current as Record<string, unknown>)
    ) {
        if (seen.has(current)) {
            break;
        }
        seen.add(current);

        const keys = Object.keys(current as Record<string, unknown>);
        if (keys.length !== 1) {
            break;
        }

        current = (current as { default: unknown }).default;
    }

    return current;
}

function isValidHttpsUrl(value: string): boolean {
    try {
        const parsed = new URL(value);
        return parsed.protocol === "https:";
    } catch {
        return false;
    }
}

function payloadForProvider(providerId: string): unknown {
    if (providerId === "google-ai-studio") {
        return { models: [{ name: "models/test-model" }] };
    }

    if (providerId === "elevenlabs") {
        return { models: [{ model_id: "test-model" }] };
    }

    if (providerId === "clarifai") {
        return { models: [{ id: "test-model" }] };
    }

    return { data: [{ id: "test-model" }] };
}

async function loadProviderMap(): Promise<Map<string, ProviderDefinition>> {
    const providersDir = path.join(process.cwd(), "scripts", "model-discovery", "providers");
    const files = fs
        .readdirSync(providersDir, { withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name)
        .filter(
            (name) =>
                name.endsWith(".ts") &&
                !name.startsWith("_") &&
                name !== "discovery-policy.ts"
        )
        .sort();

    const providerMap = new Map<string, ProviderDefinition>();

    for (const file of files) {
        const moduleUrl = pathToFileURL(path.join(providersDir, file)).href;
        const imported = (await import(moduleUrl)) as { default?: unknown };
        const exported = unwrapDefaultExport(imported.default);

        const providers = Array.isArray(exported) ? exported : [exported];
        for (const provider of providers) {
            if (!isProviderDefinition(provider)) {
                throw new Error(`Invalid provider export in ${file}`);
            }
            if (providerMap.has(provider.id)) {
                throw new Error(`Duplicate provider id in modules: ${provider.id}`);
            }
            providerMap.set(provider.id, provider);
        }
    }

    return providerMap;
}

function endpointMatches(actual: string, expected: string): boolean {
    const normalizedActual = actual.trim();
    const normalizedExpected = expected.trim();

    if (normalizedExpected.startsWith("https://generativelanguage.googleapis.com/")) {
        return normalizedActual.startsWith(normalizedExpected);
    }

    return normalizedActual === normalizedExpected;
}

function setRequiredEnv(provider: ProviderDefinition, expectedEndpoint: string): void {
    for (const key of provider.requiredEnv ?? []) {
        if (key.endsWith("BASE_URL")) {
            const url = new URL(expectedEndpoint);
            process.env[key] = `${url.protocol}//${url.host}`;
            continue;
        }

        process.env[key] = process.env[key] || "test-key";
    }
}

async function validateProviderEndpoint(
    provider: ProviderDefinition,
    rule: ProviderDiscoveryRule,
    errors: string[]
): Promise<void> {
    if (!rule.modelsEndpoint) {
        errors.push(`Provider ${provider.id} is active but missing models endpoint in policy.`);
        return;
    }

    setRequiredEnv(provider, rule.modelsEndpoint);

    const originalFetch = globalThis.fetch;
    let requestedUrl = "";

    globalThis.fetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
        requestedUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

        void init;

        return new Response(JSON.stringify(payloadForProvider(provider.id)), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    }) as typeof fetch;

    try {
        await provider.fetchModels();
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`Provider ${provider.id} failed fetchModels under stubbed response: ${message}`);
        return;
    } finally {
        globalThis.fetch = originalFetch;
    }

    if (!requestedUrl) {
        errors.push(`Provider ${provider.id} did not perform an HTTP request in fetchModels.`);
        return;
    }

    if (!endpointMatches(requestedUrl, rule.modelsEndpoint)) {
        errors.push(`Provider ${provider.id} requested ${requestedUrl}, expected ${rule.modelsEndpoint}`);
    }
}

async function main(): Promise<void> {
    const errors: string[] = [];

    const platformNames = new Set(PLATFORM_DISCOVERY_RULES.map((rule) => rule.platformName));
    const expectedPlatformNames = new Set<string>(EXPECTED_PLATFORM_NAMES);

    for (const name of expectedPlatformNames) {
        if (!platformNames.has(name)) {
            errors.push(`Missing platform discovery rule for platform name: ${name}`);
        }
    }

    for (const name of platformNames) {
        if (!expectedPlatformNames.has(name)) {
            errors.push(`Unexpected platform discovery rule not in expected list: ${name}`);
        }
    }

    for (const rule of PLATFORM_DISCOVERY_RULES) {
        if (rule.active && !rule.modelsEndpoint) {
            errors.push(`Platform ${rule.platformName} is active but has no models endpoint.`);
        }

        if (!rule.active && !rule.reason) {
            errors.push(`Platform ${rule.platformName} is inactive but missing reason.`);
        }

        if (rule.modelsEndpoint && !isValidHttpsUrl(rule.modelsEndpoint)) {
            errors.push(`Platform ${rule.platformName} has invalid endpoint URL: ${rule.modelsEndpoint}`);
        }
    }

    const providers = await loadProviderMap();

    for (const platformRule of PLATFORM_DISCOVERY_RULES) {
        if (platformRule.active && platformRule.providerIds.length === 0) {
            errors.push(`Platform ${platformRule.platformName} is active but has no provider module mapping.`);
        }

        for (const providerId of platformRule.providerIds) {
            if (!providers.has(providerId)) {
                errors.push(`Platform ${platformRule.platformName} references missing provider module id: ${providerId}`);
            }
        }
    }

    for (const [providerId, providerRule] of PROVIDER_DISCOVERY_RULES.entries()) {
        const provider = providers.get(providerId);
        if (!provider) {
            continue;
        }

        if (!providerRule.active) {
            continue;
        }

        await validateProviderEndpoint(provider, providerRule, errors);
    }

    if (errors.length > 0) {
        throw new Error(`Model discovery provider validation failed with ${errors.length} issue(s):\n- ${errors.join("\n- ")}`);
    }

    console.log(
        `[model-discovery] Provider validation passed for ${PLATFORM_DISCOVERY_RULES.length} platform rules and ${PROVIDER_DISCOVERY_RULES.size} provider mappings.`
    );
}

main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
});
