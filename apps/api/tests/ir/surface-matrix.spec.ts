import { beforeAll, afterAll, describe, expect, it } from "vitest";
import type { Endpoint } from "@core/types";
import type { IRChatRequest } from "@core/ir";
import { allProviderNames } from "@providers/index";
import { decodeProtocol, encodeProtocol } from "@protocols/index";
import { getSurfaceIdForProvider, getSurface } from "@surfaces/index";
import { enrichSuccessPayload, formatClientPayload } from "@pipeline/after/payload";
import { setupTestRuntime, teardownTestRuntime } from "../helpers/runtime";
import { installFetchMock } from "../helpers/mock-fetch";
import { sseResponse, parseSseJson, readSseFrames } from "../helpers/sse";

const CHAT_PROTOCOL = "openai.chat.completions" as const;
const RESPONSES_PROTOCOL = "openai.responses" as const;
const ANTHROPIC_PROTOCOL = "anthropic.messages" as const;

const REQUEST_ID = "req_test_123";
const TEAM_ID = "team_test_123";

const BASE_CHAT_BODY = {
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: "Hello from gateway" }],
    max_output_tokens: 32,
    temperature: 0.2,
    top_p: 0.9,
    user_id: "user_test_1",
};

const TOOL_CHAT_BODY = {
    ...BASE_CHAT_BODY,
    tools: [
        {
            type: "function",
            function: {
                name: "get_weather",
                description: "Get weather",
                parameters: {
                    type: "object",
                    properties: { city: { type: "string" } },
                    required: ["city"],
                },
            },
        },
    ],
    tool_choice: "auto",
};

const MULTIMODAL_URL_CHAT_BODY = {
    ...BASE_CHAT_BODY,
    messages: [
        {
            role: "user",
            content: [
                { type: "text", text: "Describe this image" },
                { type: "image_url", image_url: { url: "https://example.com/test.png" } },
            ],
        },
    ],
};

const MULTIMODAL_B64_CHAT_BODY = {
    ...BASE_CHAT_BODY,
    messages: [
        {
            role: "user",
            content: [
                { type: "text", text: "Describe this image" },
                { type: "image_url", image_url: { url: "data:image/png;base64,AAA=" } },
            ],
        },
    ],
};

const STRUCTURED_CHAT_BODY = {
    ...BASE_CHAT_BODY,
    response_format: {
        type: "json_schema",
        schema: {
            type: "object",
            properties: {
                answer: { type: "string" },
            },
            required: ["answer"],
        },
    },
};

const BASE_RESPONSES_BODY = {
    model: "gpt-4o-mini",
    input: "Hello from responses",
    max_output_tokens: 32,
    temperature: 0.2,
    top_p: 0.9,
};

const TOOL_RESPONSES_BODY = {
    ...BASE_RESPONSES_BODY,
    tools: [
        {
            type: "function",
            function: {
                name: "get_weather",
                description: "Get weather",
                parameters: {
                    type: "object",
                    properties: { city: { type: "string" } },
                    required: ["city"],
                },
            },
        },
    ],
    tool_choice: "auto",
};

const MULTIMODAL_URL_RESPONSES_BODY = {
    ...BASE_RESPONSES_BODY,
    input: [
        {
            type: "message",
            role: "user",
            content: [
                { type: "input_text", text: "Describe this image" },
                { type: "input_image", image_url: "https://example.com/test.png" },
            ],
        },
    ],
};

const MULTIMODAL_B64_RESPONSES_BODY = {
    ...BASE_RESPONSES_BODY,
    input: [
        {
            type: "message",
            role: "user",
            content: [
                { type: "input_text", text: "Describe this image" },
                { type: "input_image", image_url: "data:image/png;base64,AAA=" },
            ],
        },
    ],
};

const STRUCTURED_RESPONSES_BODY = {
    ...BASE_RESPONSES_BODY,
    text: {
        format: {
            type: "json_schema",
            schema: {
                type: "object",
                properties: {
                    answer: { type: "string" },
                },
                required: ["answer"],
            },
        },
    },
};

const BASE_ANTHROPIC_BODY = {
    model: "claude-3-5-sonnet-20241022",
    messages: [{ role: "user", content: "Hello from anthropic" }],
    max_tokens: 128,
};

const TOOL_ANTHROPIC_BODY = {
    ...BASE_ANTHROPIC_BODY,
    tools: [
        {
            name: "get_weather",
            description: "Get weather",
            input_schema: {
                type: "object",
                properties: { city: { type: "string" } },
                required: ["city"],
            },
        },
    ],
};

const MULTIMODAL_URL_ANTHROPIC_BODY = {
    ...BASE_ANTHROPIC_BODY,
    messages: [
        {
            role: "user",
            content: [
                { type: "text", text: "Describe this image" },
                { type: "image", source: { type: "url", url: "https://example.com/test.png" } },
            ],
        },
    ],
};

const MULTIMODAL_B64_ANTHROPIC_BODY = {
    ...BASE_ANTHROPIC_BODY,
    messages: [
        {
            role: "user",
            content: [
                { type: "text", text: "Describe this image" },
                { type: "image", source: { type: "base64", media_type: "image/png", data: "AAA=" } },
            ],
        },
    ],
};

const PROVIDERS = allProviderNames().filter(
    (provider) => !["amazon-bedrock", "google-vertex", "suno"].includes(provider)
);
const PROVIDER_ALIASES: Record<string, string> = {
    atlascloud: "atlas-cloud",
    "moonshot-ai": "moonshotai",
};

function resolveProviderId(providerId: string) {
    return PROVIDER_ALIASES[providerId] ?? providerId;
}

function openAiChatFrames() {
    return [
        {
            id: "chatcmpl_mock",
            created: 1710000000,
            choices: [
                { index: 0, delta: { content: "Hello" } },
            ],
        },
        {
            id: "chatcmpl_mock",
            created: 1710000000,
            choices: [
                { index: 0, delta: { content: " world" }, finish_reason: "stop" },
            ],
            usage: {
                prompt_tokens: 4,
                completion_tokens: 2,
                total_tokens: 6,
            },
        },
        "[DONE]",
    ];
}

function openAiToolFrames() {
    return [
        {
            id: "chatcmpl_tool",
            created: 1710000001,
            choices: [
                {
                    index: 0,
                    delta: {
                        tool_calls: [
                            {
                                index: 0,
                                id: "call_1",
                                function: { name: "get_weather", arguments: "{\"city\":" },
                            },
                        ],
                    },
                },
            ],
        },
        {
            id: "chatcmpl_tool",
            created: 1710000001,
            choices: [
                {
                    index: 0,
                    delta: {
                        tool_calls: [
                            {
                                index: 0,
                                id: "call_1",
                                function: { arguments: "\"SF\"}" },
                            },
                        ],
                    },
                    finish_reason: "tool_calls",
                },
            ],
            usage: {
                prompt_tokens: 8,
                completion_tokens: 4,
                total_tokens: 12,
            },
        },
        "[DONE]",
    ];
}

function openAiResponsesFrames() {
    return [
        {
            response: {
                id: "resp_mock",
                object: "response",
                created: 1710000002,
                model: "gpt-4o-mini",
                output: [
                    {
                        type: "message",
                        role: "assistant",
                        content: [
                            { type: "output_text", text: "Hello world", annotations: [] },
                        ],
                    },
                ],
                usage: {
                    input_tokens: 4,
                    output_tokens: 2,
                    total_tokens: 6,
                },
            },
        },
        "[DONE]",
    ];
}

function anthropicJson(tool = false) {
    return {
        id: "msg_mock",
        type: "message",
        role: "assistant",
        model: "claude-3-5-sonnet-20241022",
        stop_reason: tool ? "tool_use" : "end_turn",
        stop_sequence: null,
        content: tool
            ? [
                { type: "text", text: "Calling tool" },
                { type: "tool_use", id: "tool_1", name: "get_weather", input: { city: "SF" } },
            ]
            : [{ type: "text", text: "Hello world" }],
        usage: { input_tokens: 4, output_tokens: 2 },
    };
}

function buildCtx(endpoint: Endpoint, protocol: string) {
    return {
        endpoint,
        protocol,
        requestId: REQUEST_ID,
        teamId: TEAM_ID,
        model: "gpt-4o-mini",
        stream: false,
        meta: {
            requestId: REQUEST_ID,
            apiKeyId: "key_test",
            apiKeyRef: "kid_test",
            apiKeyKid: "kid_test",
        },
    } as any;
}

async function executeSurfaceScenario(args: {
    providerId: string;
    protocol: typeof CHAT_PROTOCOL | typeof RESPONSES_PROTOCOL | typeof ANTHROPIC_PROTOCOL;
    body: any;
    upstreamKind: "openai-chat" | "openai-responses" | "anthropic";
    tool?: boolean;
    stream?: boolean;
    expectRequest?: (body: any) => void;
}) {
    const ctx = buildCtx("chat.completions", args.protocol);
    ctx.stream = Boolean(args.stream);
    ctx.body = args.body;

    const ir = decodeProtocol(args.protocol as any, args.body) as IRChatRequest;
    ir.stream = Boolean(args.stream);

    const surfaceId = getSurfaceIdForProvider(args.providerId);
    const surface = getSurface(surfaceId);

    const mock = installFetchMock([
        {
            match: (url) => {
                if (args.upstreamKind === "anthropic") {
                    return url.includes("api.anthropic.com/v1/messages");
                }
                if (args.upstreamKind === "openai-responses") {
                    return url.includes("/responses");
                }
                return url.includes("/chat/completions");
            },
            response: (() => {
                if (args.upstreamKind === "anthropic") {
                    return new Response(JSON.stringify(anthropicJson(Boolean(args.tool))), {
                        status: 200,
                        headers: { "Content-Type": "application/json" },
                    });
                }
                if (args.upstreamKind === "openai-responses") {
                    return sseResponse(openAiResponsesFrames());
                }
                return sseResponse(args.tool ? openAiToolFrames() : openAiChatFrames());
            })(),
            onRequest: (call) => {
                if (args.expectRequest) {
                    args.expectRequest(call.bodyJson);
                    return;
                }
                if (args.upstreamKind === "anthropic") {
                    expect(call.bodyJson?.model).toBe(args.body?.model);
                    expect(Array.isArray(call.bodyJson?.messages)).toBe(true);
                    return;
                }
                expect(call.bodyJson?.model).toBe(args.body?.model);
                expect(call.bodyJson?.stream).toBe(true);
            },
        },
        {
            match: (url) => url === "https://example.com/test.png",
            response: new Response(new Uint8Array([1, 2, 3, 4]), {
                status: 200,
                headers: { "Content-Type": "image/png", "Content-Length": "4" },
            }),
        },
    ]);

    const surfaceResult = await surface.execute({
        ir,
        requestId: REQUEST_ID,
        teamId: TEAM_ID,
        providerId: args.providerId,
        providerModelSlug: null,
        byokMeta: [],
        pricingCard: {
            provider: args.providerId,
            model: ir.model,
            endpoint: ctx.endpoint,
            effective_from: null,
            effective_to: null,
            currency: "USD",
            version: null,
            rules: [],
        },
        meta: {
            returnUsage: true,
            returnMeta: false,
        },
    });

    mock.restore();

    return { ctx, ir, surfaceResult };
}

async function buildFinalResponse(ctx: any, surfaceResult: any, protocol: string) {
    if (surfaceResult.kind !== "completed" || !surfaceResult.ir) {
        throw new Error("surface returned stream in non-stream test");
    }
    const protocolResponse = encodeProtocol(protocol as any, surfaceResult.ir, REQUEST_ID);
    const result: any = {
        kind: "completed",
        upstream: surfaceResult.upstream,
        provider: surfaceResult.ir.provider,
        generationTimeMs: 0,
        bill: surfaceResult.bill,
        normalized: protocolResponse,
        ir: surfaceResult.ir,
        mappedRequest: surfaceResult.mappedRequest,
        rawResponse: surfaceResult.rawResponse,
    };

    const payload = await enrichSuccessPayload(ctx as any, result);
    return formatClientPayload({
        ctx: ctx as any,
        result,
        payload,
        includeUsage: true,
        includeMeta: false,
    });
}

beforeAll(() => {
    setupTestRuntime();
});

afterAll(() => {
    teardownTestRuntime();
});

describe("IR surface matrix", () => {
    const openAiCompatProviders = PROVIDERS.filter((provider) => provider !== "anthropic");

    for (const providerId of openAiCompatProviders) {
        const resolvedProviderId = resolveProviderId(providerId);
        describe(`${providerId} openai protocols`, () => {
            it("chat.completions basic text", async () => {
                const useResponses = resolvedProviderId === "openai";
                const { ctx, surfaceResult } = await executeSurfaceScenario({
                    providerId: resolvedProviderId,
                    protocol: CHAT_PROTOCOL,
                    body: BASE_CHAT_BODY,
                    upstreamKind: useResponses ? "openai-responses" : "openai-chat",
                });

                const response = await buildFinalResponse(ctx, surfaceResult, CHAT_PROTOCOL);
                expect(response.id).toBe(REQUEST_ID);
                expect(response.nativeResponseId).toBe(useResponses ? "resp_mock" : "chatcmpl_mock");
                expect(response.object).toBe("chat.completion");
                expect(response.choices?.[0]?.message?.content).toContain("Hello");
            });

            it("chat.completions tool call", async () => {
                const useResponses = resolvedProviderId === "openai";
                const { ctx, surfaceResult } = await executeSurfaceScenario({
                    providerId: resolvedProviderId,
                    protocol: CHAT_PROTOCOL,
                    body: TOOL_CHAT_BODY,
                    upstreamKind: useResponses ? "openai-responses" : "openai-chat",
                    tool: true,
                });

                const response = await buildFinalResponse(ctx, surfaceResult, CHAT_PROTOCOL);
                expect(response.choices?.[0]?.message?.tool_calls?.[0]?.function?.name).toBe("get_weather");
            });

            it("chat.completions multimodal (url)", async () => {
                const useResponses = resolvedProviderId === "openai";
                const { ctx, surfaceResult } = await executeSurfaceScenario({
                    providerId: resolvedProviderId,
                    protocol: CHAT_PROTOCOL,
                    body: MULTIMODAL_URL_CHAT_BODY,
                    upstreamKind: useResponses ? "openai-responses" : "openai-chat",
                });

                const response = await buildFinalResponse(ctx, surfaceResult, CHAT_PROTOCOL);
                expect(response.choices?.[0]?.message?.content).toContain("Hello");
            });

            it("chat.completions multimodal (base64)", async () => {
                const useResponses = resolvedProviderId === "openai";
                const { ctx, surfaceResult } = await executeSurfaceScenario({
                    providerId: resolvedProviderId,
                    protocol: CHAT_PROTOCOL,
                    body: MULTIMODAL_B64_CHAT_BODY,
                    upstreamKind: useResponses ? "openai-responses" : "openai-chat",
                });

                const response = await buildFinalResponse(ctx, surfaceResult, CHAT_PROTOCOL);
                expect(response.choices?.[0]?.message?.content).toContain("Hello");
            });

            it("chat.completions structured output", async () => {
                const useResponses = resolvedProviderId === "openai";
                const { ctx, surfaceResult } = await executeSurfaceScenario({
                    providerId: resolvedProviderId,
                    protocol: CHAT_PROTOCOL,
                    body: STRUCTURED_CHAT_BODY,
                    upstreamKind: useResponses ? "openai-responses" : "openai-chat",
                });

                const response = await buildFinalResponse(ctx, surfaceResult, CHAT_PROTOCOL);
                expect(response.id).toBe(REQUEST_ID);
            });

            it("responses basic text", async () => {
                const useResponses = resolvedProviderId === "openai";
                const { ctx, surfaceResult } = await executeSurfaceScenario({
                    providerId: resolvedProviderId,
                    protocol: RESPONSES_PROTOCOL,
                    body: BASE_RESPONSES_BODY,
                    upstreamKind: useResponses ? "openai-responses" : "openai-chat",
                });

                ctx.endpoint = "responses";
                const response = await buildFinalResponse(ctx, surfaceResult, RESPONSES_PROTOCOL);
                expect(response.id).toBe(REQUEST_ID);
                expect(response.nativeResponseId).toBe(useResponses ? "resp_mock" : "chatcmpl_mock");
                expect(response.object).toBe("response");
            });

            it("responses tool call", async () => {
                const useResponses = resolvedProviderId === "openai";
                const { ctx, surfaceResult } = await executeSurfaceScenario({
                    providerId: resolvedProviderId,
                    protocol: RESPONSES_PROTOCOL,
                    body: TOOL_RESPONSES_BODY,
                    upstreamKind: useResponses ? "openai-responses" : "openai-chat",
                    tool: true,
                });

                ctx.endpoint = "responses";
                const response = await buildFinalResponse(ctx, surfaceResult, RESPONSES_PROTOCOL);
                expect(response.output?.length ?? 0).toBeGreaterThan(0);
            });

            it("responses multimodal (url)", async () => {
                const useResponses = resolvedProviderId === "openai";
                const { ctx, surfaceResult } = await executeSurfaceScenario({
                    providerId: resolvedProviderId,
                    protocol: RESPONSES_PROTOCOL,
                    body: MULTIMODAL_URL_RESPONSES_BODY,
                    upstreamKind: useResponses ? "openai-responses" : "openai-chat",
                });

                ctx.endpoint = "responses";
                const response = await buildFinalResponse(ctx, surfaceResult, RESPONSES_PROTOCOL);
                expect(response.output?.length ?? 0).toBeGreaterThan(0);
            });

            it("responses multimodal (base64)", async () => {
                const useResponses = resolvedProviderId === "openai";
                const { ctx, surfaceResult } = await executeSurfaceScenario({
                    providerId: resolvedProviderId,
                    protocol: RESPONSES_PROTOCOL,
                    body: MULTIMODAL_B64_RESPONSES_BODY,
                    upstreamKind: useResponses ? "openai-responses" : "openai-chat",
                });

                ctx.endpoint = "responses";
                const response = await buildFinalResponse(ctx, surfaceResult, RESPONSES_PROTOCOL);
                expect(response.output?.length ?? 0).toBeGreaterThan(0);
            });

            it("responses structured output", async () => {
                const useResponses = resolvedProviderId === "openai";
                const { ctx, surfaceResult } = await executeSurfaceScenario({
                    providerId: resolvedProviderId,
                    protocol: RESPONSES_PROTOCOL,
                    body: STRUCTURED_RESPONSES_BODY,
                    upstreamKind: useResponses ? "openai-responses" : "openai-chat",
                });

                ctx.endpoint = "responses";
                const response = await buildFinalResponse(ctx, surfaceResult, RESPONSES_PROTOCOL);
                expect(response.id).toBe(REQUEST_ID);
            });
        });
    }

    describe("anthropic messages protocol", () => {
        const providerId = "anthropic";

        it("messages basic text", async () => {
            const { ctx, surfaceResult } = await executeSurfaceScenario({
                providerId,
                protocol: ANTHROPIC_PROTOCOL,
                body: BASE_ANTHROPIC_BODY,
                upstreamKind: "anthropic",
            });

            const response = await buildFinalResponse(ctx, surfaceResult, ANTHROPIC_PROTOCOL);
            expect(response.id).toBe(REQUEST_ID);
            expect(response.nativeResponseId).toBe("msg_mock");
            expect(response.type).toBe("message");
        });

        it("messages tool call", async () => {
            const { ctx, surfaceResult } = await executeSurfaceScenario({
                providerId,
                protocol: ANTHROPIC_PROTOCOL,
                body: TOOL_ANTHROPIC_BODY,
                upstreamKind: "anthropic",
                tool: true,
            });

            const response = await buildFinalResponse(ctx, surfaceResult, ANTHROPIC_PROTOCOL);
            const toolUse = response.content?.find((item: any) => item.type === "tool_use");
            expect(toolUse?.name).toBe("get_weather");
        });

        it("messages multimodal (url)", async () => {
            const { ctx, surfaceResult } = await executeSurfaceScenario({
                providerId,
                protocol: ANTHROPIC_PROTOCOL,
                body: MULTIMODAL_URL_ANTHROPIC_BODY,
                upstreamKind: "anthropic",
            });

            const response = await buildFinalResponse(ctx, surfaceResult, ANTHROPIC_PROTOCOL);
            expect(response.content?.[0]?.type).toBe("text");
        });

        it("messages multimodal (base64)", async () => {
            const { ctx, surfaceResult } = await executeSurfaceScenario({
                providerId,
                protocol: ANTHROPIC_PROTOCOL,
                body: MULTIMODAL_B64_ANTHROPIC_BODY,
                upstreamKind: "anthropic",
            });

            const response = await buildFinalResponse(ctx, surfaceResult, ANTHROPIC_PROTOCOL);
            expect(response.content?.[0]?.type).toBe("text");
        });
    });

    describe("anthropic provider openai protocols", () => {
        const providerId = "anthropic";

        it("chat.completions basic text", async () => {
            const { ctx, surfaceResult } = await executeSurfaceScenario({
                providerId,
                protocol: CHAT_PROTOCOL,
                body: BASE_CHAT_BODY,
                upstreamKind: "anthropic",
            });

            const response = await buildFinalResponse(ctx, surfaceResult, CHAT_PROTOCOL);
            expect(response.id).toBe(REQUEST_ID);
            expect(response.object).toBe("chat.completion");
        });

        it("chat.completions tool call", async () => {
            const { ctx, surfaceResult } = await executeSurfaceScenario({
                providerId,
                protocol: CHAT_PROTOCOL,
                body: TOOL_CHAT_BODY,
                upstreamKind: "anthropic",
                tool: true,
            });

            const response = await buildFinalResponse(ctx, surfaceResult, CHAT_PROTOCOL);
            expect(response.choices?.[0]?.message?.content).toContain("Calling");
        });

        it("chat.completions multimodal (url)", async () => {
            const { ctx, surfaceResult } = await executeSurfaceScenario({
                providerId,
                protocol: CHAT_PROTOCOL,
                body: MULTIMODAL_URL_CHAT_BODY,
                upstreamKind: "anthropic",
            });

            const response = await buildFinalResponse(ctx, surfaceResult, CHAT_PROTOCOL);
            expect(response.choices?.length ?? 0).toBeGreaterThan(0);
        });

        it("chat.completions structured output", async () => {
            const { ctx, surfaceResult } = await executeSurfaceScenario({
                providerId,
                protocol: CHAT_PROTOCOL,
                body: STRUCTURED_CHAT_BODY,
                upstreamKind: "anthropic",
            });

            const response = await buildFinalResponse(ctx, surfaceResult, CHAT_PROTOCOL);
            expect(response.id).toBe(REQUEST_ID);
        });

        it("responses basic text", async () => {
            const { ctx, surfaceResult } = await executeSurfaceScenario({
                providerId,
                protocol: RESPONSES_PROTOCOL,
                body: BASE_RESPONSES_BODY,
                upstreamKind: "anthropic",
            });

            ctx.endpoint = "responses";
            const response = await buildFinalResponse(ctx, surfaceResult, RESPONSES_PROTOCOL);
            expect(response.id).toBe(REQUEST_ID);
            expect(response.object).toBe("response");
        });

        it("responses tool call", async () => {
            const { ctx, surfaceResult } = await executeSurfaceScenario({
                providerId,
                protocol: RESPONSES_PROTOCOL,
                body: TOOL_RESPONSES_BODY,
                upstreamKind: "anthropic",
                tool: true,
            });

            ctx.endpoint = "responses";
            const response = await buildFinalResponse(ctx, surfaceResult, RESPONSES_PROTOCOL);
            expect(response.output?.length ?? 0).toBeGreaterThan(0);
        });
    });

    describe("streaming SSE passthrough", () => {
        it("rewrites streaming frames with gateway id/nativeResponseId", async () => {
            const frames = openAiChatFrames();
            const upstream = sseResponse(frames);
            const ctx = buildCtx("chat.completions", CHAT_PROTOCOL);
            ctx.stream = true;
            const { passthroughWithPricing } = await import("@pipeline/after/streaming");

            const response = await passthroughWithPricing({
                upstream,
                ctx,
                provider: "openai",
                priceCard: null,
                rewriteFrame: (frame) => {
                    frame.id = REQUEST_ID;
                    frame.nativeResponseId = frame.id === REQUEST_ID ? "chatcmpl_mock" : frame.nativeResponseId;
                    return frame;
                },
            });

            const parsedFrames = parseSseJson(await readSseFrames(response));
            const jsonFrames = parsedFrames.filter((entry) => typeof entry === "object") as any[];
            expect(jsonFrames[0]?.id).toBe(REQUEST_ID);
        });
    });
});
