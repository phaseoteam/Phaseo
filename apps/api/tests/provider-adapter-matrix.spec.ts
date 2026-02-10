import { beforeAll, afterAll, describe, expect, it } from "vitest";
import type { Endpoint } from "@core/types";
import { allProviderNames, adapterById } from "@providers/index";
import { setupTestRuntime, teardownTestRuntime } from "./helpers/runtime";
import { installFetchMock, jsonResponse } from "./helpers/mock-fetch";

const REQUEST_ID = "req_test_123";
const TEAM_ID = "team_test_123";

const ADAPTER_ENDPOINTS: Endpoint[] = [
    "moderations",
    "embeddings",
    "images.generations",
    "images.edits",
    "audio.speech",
    "audio.transcription",
    "audio.translations",
    "video.generation",
    "batch",
    "ocr",
    "music.generate",
    "files.upload",
    "files.list",
    "files.retrieve",
];

const OPENAI_COMPAT_ENDPOINTS = new Set<Endpoint>([
    "moderations",
    "embeddings",
    "images.generations",
    "images.edits",
    "audio.speech",
    "audio.transcription",
    "audio.translations",
    "video.generation",
    "batch",
]);

const GOOGLE_ENDPOINTS = new Set<Endpoint>([
    "embeddings",
    "images.generations",
    "video.generation",
]);

const AZURE_ENDPOINTS = new Set<Endpoint>(["embeddings"]);

type Scenario = {
    requestBody: any;
    responseBody?: any;
    responseHeaders?: Record<string, string>;
    urlMatch: (url: string) => boolean;
    expectNormalized?: (normalized: any, providerId: string) => void;
    expectRequest?: (body: any) => void;
    expectsNormalized?: boolean;
};

const SCENARIOS: Partial<Record<Endpoint, Scenario>> = {
    moderations: {
        requestBody: { model: "omni-moderation-latest", input: "Hello" },
        responseBody: { id: "mod_1", model: "omni-moderation-latest", results: [] },
        urlMatch: (url) => url.includes("/moderations"),
        expectNormalized: (normalized, providerId) => {
            expect(normalized.id).toBe(REQUEST_ID);
            expect(normalized.provider).toBe(providerId);
        },
        expectRequest: (body) => {
            expect(body).toEqual({ input: "Hello", model: "omni-moderation-latest" });
        },
    },
    embeddings: {
        requestBody: { model: "text-embedding-3-small", input: "Hello", user: "user_test" },
        responseBody: {
            object: "list",
            data: [{ object: "embedding", embedding: [0.1, 0.2], index: 0 }],
            model: "text-embedding-3-small",
            usage: { prompt_tokens: 2, total_tokens: 2 },
        },
        urlMatch: (url) => url.includes("/embeddings") || url.includes(":embedContent"),
        expectNormalized: (normalized) => {
            expect(normalized.object).toBe("list");
            expect(normalized.data?.length ?? 0).toBeGreaterThan(0);
        },
    },
    "images.generations": {
        requestBody: { model: "gpt-image-1", prompt: "A cat", n: 1, size: "1024x1024" },
        responseBody: { created: 1710000000, data: [{ b64_json: "AAA" }] },
        urlMatch: (url) => url.includes("/images/generations") || url.includes(":generateImage"),
        expectNormalized: (normalized) => {
            expect(normalized.data?.length ?? 0).toBeGreaterThan(0);
        },
    },
    "images.edits": {
        requestBody: { model: "gpt-image-1", image: "data:image/png;base64,AAA=", prompt: "Make it blue", n: 1 },
        responseBody: { created: 1710000001, data: [{ url: "https://example.com/edited.png" }] },
        urlMatch: (url) => url.includes("/images/edits"),
        expectNormalized: (normalized) => {
            expect(normalized.data?.length ?? 0).toBeGreaterThan(0);
        },
    },
    "audio.speech": {
        requestBody: { model: "gpt-4o-mini-tts", input: "Hello", voice: "alloy", format: "mp3" },
        responseBody: "SPEECH",
        responseHeaders: { "Content-Type": "audio/mpeg" },
        urlMatch: (url) => url.includes("/audio/speech"),
        expectsNormalized: false,
    },
    "audio.transcription": {
        requestBody: { model: "whisper-1", audio_url: "https://example.com/audio.wav" },
        responseBody: { text: "Transcribed" },
        urlMatch: (url) => url.includes("/audio/transcriptions"),
        expectNormalized: (normalized) => {
            expect(normalized.text).toBe("Transcribed");
        },
    },
    "audio.translations": {
        requestBody: { model: "whisper-1", audio_url: "https://example.com/audio.wav", language: "en" },
        responseBody: { text: "Translated" },
        urlMatch: (url) => url.includes("/audio/translations"),
        expectNormalized: (normalized) => {
            expect(normalized.text).toBe("Translated");
        },
    },
    "video.generation": {
        requestBody: { model: "sora-mini", prompt: "A cat", duration: 2 },
        responseBody: { id: "video_1", responseId: "video_1" },
        urlMatch: (url) => url.includes("/videos") || url.includes(":generateContent"),
        expectNormalized: (normalized, providerId) => {
            if (providerId === "google-ai-studio") {
                expect(normalized.provider).toBe("google-ai-studio");
            } else {
                expect(normalized.id ?? normalized.responseId ?? normalized.result).toBeDefined();
            }
        },
    },
    batch: {
        requestBody: { input_file_id: "file_123", endpoint: "/v1/chat/completions" },
        responseBody: { id: "batch_1", status: "completed" },
        urlMatch: (url) => url.includes("/batches"),
        expectNormalized: (normalized) => {
            expect(normalized.id).toBe("batch_1");
        },
    },
};

const PROVIDERS = allProviderNames();
const PROVIDER_ALIASES: Record<string, string> = {
    atlascloud: "atlas-cloud",
};

function resolveProviderId(providerId: string) {
    return PROVIDER_ALIASES[providerId] ?? providerId;
}

const PROVIDER_SCENARIO_OVERRIDES: Record<string, Partial<Record<Endpoint, Scenario>>> = {
    elevenlabs: {
        "audio.speech": {
            ...SCENARIOS["audio.speech"]!,
            urlMatch: (url) => url.includes("/v1/text-to-speech/"),
        },
        "audio.transcription": {
            ...SCENARIOS["audio.transcription"]!,
            urlMatch: (url) => url.includes("/v1/speech-to-text"),
        },
    },
};

function resolveScenario(providerId: string, endpoint: Endpoint): Scenario | undefined {
    const override = PROVIDER_SCENARIO_OVERRIDES[providerId]?.[endpoint];
    return override ?? SCENARIOS[endpoint];
}

function supportedEndpointsFor(providerId: string): Set<Endpoint> {
    switch (providerId) {
        case "openai":
            return OPENAI_COMPAT_ENDPOINTS;
        case "google-ai-studio":
            return GOOGLE_ENDPOINTS;
        case "azure":
            return AZURE_ENDPOINTS;
        case "elevenlabs":
            return new Set<Endpoint>(["audio.speech", "audio.transcription"]);
        case "anthropic":
        case "x-ai":
        case "xiaomi":
        case "ai21":
        case "amazon-bedrock":
        case "google-vertex":
        case "suno":
            return new Set();
        default:
            return OPENAI_COMPAT_ENDPOINTS;
    }
}

beforeAll(() => {
    setupTestRuntime();
});

afterAll(() => {
    teardownTestRuntime();
});

describe("Provider adapter matrix (non-IR endpoints)", () => {
    for (const providerId of PROVIDERS) {
        const adapter = adapterById(providerId);
        if (!adapter) continue;
        const resolvedProviderId = resolveProviderId(providerId);

        describe(providerId, () => {
            const supported = supportedEndpointsFor(resolvedProviderId);
            for (const endpoint of ADAPTER_ENDPOINTS) {
                const scenario = resolveScenario(providerId, endpoint);

                it(`${endpoint}`, async () => {
                    if (!supported.has(endpoint) || !scenario) {
                        await expect(async () => {
                            await adapter.execute({
                                endpoint,
                                model: "test-model",
                                body: { model: "test-model" },
                                meta: {
                                    requestId: REQUEST_ID,
                                    apiKeyId: "key_test",
                                    apiKeyRef: "kid_test",
                                    apiKeyKid: "kid_test",
                                },
                                teamId: TEAM_ID,
                                providerId: resolvedProviderId,
                                byokMeta: [],
                                pricingCard: {
                                    provider: resolvedProviderId,
                                    model: "test-model",
                                    endpoint,
                                    effective_from: null,
                                    effective_to: null,
                                    currency: "USD",
                                    version: null,
                                    rules: [],
                                },
                                providerModelSlug: null,
                                stream: false,
                            });
                        }).rejects.toBeTruthy();
                        return;
                    }

                    const mock = installFetchMock([
                        {
                            match: scenario.urlMatch,
                            response: (() => {
                                if (endpoint === "audio.speech") {
                                    return new Response(String(scenario.responseBody ?? ""), {
                                        status: 200,
                                        headers: scenario.responseHeaders,
                                    });
                                }
                                return jsonResponse(scenario.responseBody, { headers: scenario.responseHeaders });
                            })(),
                            onRequest: (call) => {
                                if (scenario.expectRequest) {
                                    scenario.expectRequest(call.bodyJson);
                                }
                            },
                        },
                    ]);

                    const result = await adapter.execute({
                        endpoint,
                        model: scenario.requestBody.model,
                        body: scenario.requestBody,
                        meta: {
                            requestId: REQUEST_ID,
                            apiKeyId: "key_test",
                            apiKeyRef: "kid_test",
                            apiKeyKid: "kid_test",
                        },
                        teamId: TEAM_ID,
                        providerId: resolvedProviderId,
                        byokMeta: [],
                        pricingCard: {
                            provider: resolvedProviderId,
                            model: scenario.requestBody.model,
                            endpoint,
                            effective_from: null,
                            effective_to: null,
                            currency: "USD",
                            version: null,
                            rules: [],
                        },
                        providerModelSlug: null,
                        stream: false,
                    });

                    mock.restore();

                    if (scenario.expectsNormalized === false) {
                        expect(result.normalized).toBeUndefined();
                        return;
                    }

                    if (scenario.expectNormalized) {
                        scenario.expectNormalized(result.normalized, resolvedProviderId);
                    } else {
                        expect(result.normalized).toBeDefined();
                    }
                });
            }
        });
    }
});
