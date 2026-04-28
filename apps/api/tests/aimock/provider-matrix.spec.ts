import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readSseFrames } from "../helpers/sse";
import {
    AIMOCK_CHAT_PROVIDERS,
    AIMOCK_EMBEDDING_PROVIDERS,
    AIMOCK_IMAGE_PROVIDERS,
    AIMOCK_MESSAGES_PROVIDERS,
    AIMOCK_MODERATION_PROVIDERS,
    AIMOCK_RESPONSE_PROVIDERS,
    AIMOCK_RERANK_PROVIDERS,
    AIMOCK_SEQUENCE_PROVIDERS,
    AIMOCK_SPEECH_PROVIDERS,
    AIMOCK_STREAM_PROVIDERS,
    AIMOCK_STRUCTURED_PROVIDERS,
    AIMOCK_TRANSCRIPTION_PROVIDERS,
    AIMOCK_TOOL_PROVIDERS,
    AIMOCK_USAGE_PROVIDERS,
    AIMOCK_VIDEO_PROVIDERS,
} from "./matrix";
import {
    executeCapabilityScenario,
    executeEmbeddingScenario,
    executeTextProtocol,
    expectCompleted,
    extractProtocolText,
    getAimock,
    isProviderEnabled,
    isScenarioEnabled,
    readStreamFromResult,
    resetAimockState,
    startAimock,
    stopAimock,
} from "./harness";

function assertLastRequestTestId(testId: string) {
    const entry = getAimock().getLastRequest();
    expect(entry).toBeTruthy();
    expect(entry?.headers["x-test-id"]).toBe(testId);
}

function parseJsonText(value: string) {
    return JSON.parse(value) as Record<string, unknown>;
}

function usageTotals(usage: Record<string, any> | null | undefined) {
    const input = Number(usage?.input_tokens ?? usage?.prompt_tokens ?? usage?.inputTokens ?? 0);
    const output = Number(usage?.output_tokens ?? usage?.completion_tokens ?? usage?.outputTokens ?? 0);
    const total = Number(usage?.total_tokens ?? usage?.totalTokens ?? (input + output));
    return { input, output, total };
}

describe("AIMock provider matrix", () => {
    beforeAll(async () => {
        await startAimock();
    });

    afterAll(async () => {
        await stopAimock();
    });

    beforeEach(() => {
        resetAimockState();
    });

    if (isScenarioEnabled("chat_text")) {
        for (const providerId of AIMOCK_CHAT_PROVIDERS) {
            if (!isProviderEnabled(providerId)) continue;

            it(`${providerId} returns deterministic chat text`, async () => {
                const { result, encoded, testId } = await executeTextProtocol({
                    providerId,
                    protocol: "openai.chat.completions",
                    body: {
                        model: providerId === "google-ai-studio" ? "gemini-2.5-flash" : "aimock-openai-model",
                        messages: [{ role: "user", content: "[aimock-chat] hello" }],
                    },
                });

                const completed = expectCompleted(result);
                expect(completed.ir?.provider).toBe(providerId);
                expect(extractProtocolText("openai.chat.completions", encoded)).toContain("Hello from AIMock");
                assertLastRequestTestId(testId);
            });
        }
    }

    if (isScenarioEnabled("chat_tool")) {
        for (const providerId of AIMOCK_TOOL_PROVIDERS) {
            if (!isProviderEnabled(providerId)) continue;

            it(`${providerId} preserves chat tool calls`, async () => {
                const { encoded, testId } = await executeTextProtocol({
                    providerId,
                    protocol: "openai.chat.completions",
                    body: {
                        model: providerId === "google-ai-studio" ? "gemini-2.5-flash" : "aimock-openai-model",
                        messages: [{ role: "user", content: "[aimock-tool] weather" }],
                        tools: [{
                            type: "function",
                            function: {
                                name: "get_weather",
                                description: "Get weather by city",
                                parameters: {
                                    type: "object",
                                    properties: {
                                        city: { type: "string" },
                                        unit: { type: "string" },
                                    },
                                    required: ["city"],
                                },
                            },
                        }],
                        tool_choice: "required",
                    },
                });

                const toolCalls = encoded?.choices?.[0]?.message?.tool_calls;
                expect(Array.isArray(toolCalls) ? toolCalls.length : 0).toBeGreaterThan(0);
                expect(toolCalls?.[0]?.function?.name).toBe("get_weather");
                assertLastRequestTestId(testId);
            });
        }
    }

    if (isScenarioEnabled("responses_text")) {
        for (const providerId of AIMOCK_RESPONSE_PROVIDERS) {
            if (!isProviderEnabled(providerId)) continue;

            it(`${providerId} returns deterministic openai.responses text`, async () => {
                const { result, encoded, testId } = await executeTextProtocol({
                    providerId,
                    protocol: "openai.responses",
                    body: {
                        model: providerId === "google-ai-studio" ? "gemini-2.5-flash" : "aimock-openai-model",
                        input: "[aimock-responses] hello",
                    },
                });

                const completed = expectCompleted(result);
                expect(completed.ir?.provider).toBe(providerId);
                expect(extractProtocolText("openai.responses", encoded)).toContain("Hello from AIMock");
                assertLastRequestTestId(testId);
            });
        }
    }

    if (isScenarioEnabled("messages_text")) {
        for (const providerId of AIMOCK_MESSAGES_PROVIDERS) {
            if (!isProviderEnabled(providerId)) continue;

            it(`${providerId} returns deterministic messages text`, async () => {
                const { encoded, testId } = await executeTextProtocol({
                    providerId,
                    protocol: "anthropic.messages",
                    body: {
                        model: "aimock-anthropic-model",
                        max_tokens: 128,
                        messages: [{ role: "user", content: "[aimock-chat] hello" }],
                    },
                });

                expect(extractProtocolText("anthropic.messages", encoded)).toContain("Hello from AIMock");
                assertLastRequestTestId(testId);
            });
        }
    }

    if (isScenarioEnabled("embeddings")) {
        for (const providerId of AIMOCK_EMBEDDING_PROVIDERS) {
            if (!isProviderEnabled(providerId)) continue;

            it(`${providerId} returns deterministic embeddings`, async () => {
                const { result, testId } = await executeEmbeddingScenario({
                    providerId,
                    model: providerId === "google-ai-studio" ? "text-embedding-004" : "aimock-openai-model",
                    input: "[aimock-embedding] hello",
                });

                const completed = expectCompleted(result);
                const vectors = completed.ir?.data ?? [];
                expect(vectors.length).toBeGreaterThan(0);
                expect(vectors[0]?.embedding?.slice(0, 4)).toEqual([0.11, 0.22, 0.33, 0.44]);
                assertLastRequestTestId(testId);
            });
        }
    }

    if (isScenarioEnabled("image_generation")) {
        for (const providerId of AIMOCK_IMAGE_PROVIDERS) {
            if (!isProviderEnabled(providerId)) continue;

            it(`${providerId} returns deterministic image generation`, async () => {
                const { result, testId } = await executeCapabilityScenario({
                    providerId,
                    capability: "image.generate",
                    ir: {
                        model: "gpt-image-1",
                        prompt: "[aimock-image] skyline",
                        n: 1,
                        size: "1024x1024",
                    },
                });

                const completed = expectCompleted(result);
                expect(completed.ir?.provider).toBe(providerId);
                expect((completed.ir as any)?.data?.[0]).toMatchObject({
                    url: "https://example.com/aimock/skyline.png",
                    revisedPrompt: "Deterministic AIMock skyline",
                });
                assertLastRequestTestId(testId);
            });
        }
    }

    if (isScenarioEnabled("audio_speech")) {
        for (const providerId of AIMOCK_SPEECH_PROVIDERS) {
            if (!isProviderEnabled(providerId)) continue;

            it(`${providerId} returns deterministic speech output`, async () => {
                const input = "[aimock-speech] hello";
                const { result, testId } = await executeCapabilityScenario({
                    providerId,
                    capability: "audio.speech",
                    ir: {
                        model: "tts-1",
                        input,
                        voice: "alloy",
                        responseFormat: "mp3",
                    },
                });

                const completed = expectCompleted(result);
                expect(completed.ir?.provider).toBe(providerId);
                expect((completed.ir as any)?.audio?.mimeType).toBe("audio/mpeg");
                expect((completed.ir as any)?.audio?.data).toBe(Buffer.from("AIMOCK_TTS_AUDIO").toString("base64"));
                expect((completed.ir as any)?.usage?.input_characters).toBe(input.length);
                assertLastRequestTestId(testId);
            });
        }
    }

    if (isScenarioEnabled("audio_transcription")) {
        for (const providerId of AIMOCK_TRANSCRIPTION_PROVIDERS) {
            if (!isProviderEnabled(providerId)) continue;

            it(`${providerId} returns deterministic transcription output`, async () => {
                const file = new File([Buffer.from("aimock audio bytes")], "sample.wav", { type: "audio/wav" });
                const { result, testId } = await executeCapabilityScenario({
                    providerId,
                    capability: "audio.transcription",
                    ir: {
                        model: "whisper-1",
                        file,
                        responseFormat: "verbose_json",
                        timestampGranularities: ["word", "segment"],
                    },
                });

                const completed = expectCompleted(result);
                expect(completed.ir?.provider).toBe(providerId);
                expect((completed.ir as any)?.text).toBe("Deterministic transcription from AIMock.");
                expect(Array.isArray((completed.ir as any)?.segments)).toBe(true);
                expect((completed.ir as any)?.segments?.[0]?.text).toContain("Deterministic transcription");
                assertLastRequestTestId(testId);
            });
        }
    }

    if (isScenarioEnabled("stream_smoke")) {
        for (const providerId of AIMOCK_STREAM_PROVIDERS) {
            if (!isProviderEnabled(providerId)) continue;

            const protocol = providerId === "anthropic"
                ? "anthropic.messages"
                : "openai.chat.completions";

            it(`${providerId} streams deterministic SSE`, async () => {
                const { result, testId } = await executeTextProtocol({
                    providerId,
                    protocol,
                    stream: true,
                    body: protocol === "anthropic.messages"
                        ? {
                            model: "aimock-anthropic-model",
                            max_tokens: 128,
                            messages: [{ role: "user", content: "[aimock-chat] stream" }],
                            stream: true,
                        }
                        : {
                            model: providerId === "google-ai-studio" ? "gemini-2.5-flash" : "aimock-openai-model",
                            messages: [{ role: "user", content: "[aimock-chat] stream" }],
                            stream: true,
                        },
                });

                const frames = await readSseFrames(new Response(readStreamFromResult(result)));
                expect(frames.length).toBeGreaterThan(0);
                expect(frames.some((frame) => frame.includes("data:"))).toBe(true);
                assertLastRequestTestId(testId);
            });
        }
    }

    if (isScenarioEnabled("moderation")) {
        for (const providerId of AIMOCK_MODERATION_PROVIDERS) {
            if (!isProviderEnabled(providerId)) continue;

            it(`${providerId} returns deterministic moderation results`, async () => {
                const { result, testId } = await executeCapabilityScenario({
                    providerId,
                    capability: "moderations",
                    ir: {
                        model: "omni-moderation-latest",
                        input: "[aimock-moderation] violence",
                    },
                });

                const completed = expectCompleted(result);
                expect((completed.ir as any)?.results?.[0]).toMatchObject({
                    flagged: true,
                    categories: {
                        violence: true,
                    },
                });
                assertLastRequestTestId(testId);
            });
        }
    }

    if (isScenarioEnabled("rerank")) {
        for (const providerId of AIMOCK_RERANK_PROVIDERS) {
            if (!isProviderEnabled(providerId)) continue;

            it(`${providerId} returns deterministic rerank ordering`, async () => {
                const { result, testId } = await executeCapabilityScenario({
                    providerId,
                    capability: "rerank",
                    ir: {
                        model: "rerank-v1",
                        query: "[aimock-rerank] pets",
                        documents: ["Dogs are loyal", "Cats are independent", "Birds can fly"],
                        topN: 2,
                        returnDocuments: true,
                    },
                });

                const completed = expectCompleted(result);
                expect((completed.ir as any)?.results?.slice(0, 2)).toEqual([
                    {
                        index: 1,
                        relevanceScore: 0.92,
                        document: { text: "Cats are independent" },
                    },
                    {
                        index: 0,
                        relevanceScore: 0.41,
                        document: { text: "Dogs are loyal" },
                    },
                ]);
                assertLastRequestTestId(testId);
            });
        }
    }

    if (isScenarioEnabled("video_generation")) {
        for (const providerId of AIMOCK_VIDEO_PROVIDERS) {
            if (!isProviderEnabled(providerId)) continue;

            it(`${providerId} returns deterministic video generation`, async () => {
                const { result, testId } = await executeCapabilityScenario({
                    providerId,
                    capability: "video.generate",
                    ir: {
                        model: "aimock-video-model",
                        prompt: "[aimock-video] orbit",
                        duration: 5,
                        size: "1280x720",
                    },
                });

                const completed = expectCompleted(result);
                expect(completed.ir?.provider).toBe(providerId);
                expect((completed.ir as any)?.status).toBe("completed");
                expect((completed.ir as any)?.result).toMatchObject({
                    id: "video_aimock_123",
                    status: "completed",
                    url: "https://example.com/aimock/video.mp4",
                });
                assertLastRequestTestId(testId);
            });
        }
    }

    if (isScenarioEnabled("structured_json")) {
        for (const providerId of AIMOCK_STRUCTURED_PROVIDERS) {
            if (!isProviderEnabled(providerId)) continue;

            it(`${providerId} preserves structured json output`, async () => {
                const { result, encoded, testId } = await executeTextProtocol({
                    providerId,
                    protocol: "openai.chat.completions",
                    body: {
                        model: providerId === "google-ai-studio" ? "gemini-2.5-flash" : "aimock-openai-model",
                        messages: [{ role: "user", content: "[aimock-structured] person" }],
                        response_format: {
                            type: "json_schema",
                            schema: {
                                name: "person",
                                schema: {
                                    type: "object",
                                    properties: {
                                        name: { type: "string" },
                                        city: { type: "string" },
                                    },
                                    required: ["name", "city"],
                                },
                                strict: true,
                            },
                        },
                    },
                });

                const completed = expectCompleted(result);
                expect(completed.ir?.provider).toBe(providerId);
                const parsed = parseJsonText(extractProtocolText("openai.chat.completions", encoded));
                expect(parsed).toMatchObject({
                    name: "Ava",
                    city: "London",
                });
                assertLastRequestTestId(testId);
            });
        }
    }

    if (isScenarioEnabled("usage_accounting")) {
        for (const providerId of AIMOCK_USAGE_PROVIDERS) {
            if (!isProviderEnabled(providerId)) continue;

            it(`${providerId} normalizes explicit upstream usage`, async () => {
                const { result, encoded, testId } = await executeTextProtocol({
                    providerId,
                    protocol: "openai.responses",
                    body: {
                        model: providerId === "google-ai-studio" ? "gemini-2.5-flash" : "aimock-openai-model",
                        input: "[aimock-usage] tokens",
                    },
                });

                const completed = expectCompleted(result);
                expect(completed.bill.usage).toMatchObject({
                    input_tokens: 11,
                    input_text_tokens: 11,
                    output_tokens: 7,
                    output_text_tokens: 7,
                    total_tokens: 18,
                });
                expect(usageTotals(encoded?.usage)).toEqual({
                    input: 11,
                    output: 7,
                    total: 18,
                });
                assertLastRequestTestId(testId);
            });
        }
    }

    if (isScenarioEnabled("sequence_tool_loop")) {
        for (const providerId of AIMOCK_SEQUENCE_PROVIDERS) {
            if (!isProviderEnabled(providerId)) continue;

            it(`${providerId} supports deterministic multi-step tool loop fixtures`, async () => {
                const model = providerId === "google-ai-studio" ? "gemini-2.5-flash" : "aimock-openai-model";
                const testId = `aimock-sequence-${crypto.randomUUID()}`;
                const body = {
                    model,
                    messages: [{ role: "user", content: "[aimock-sequence] weather" }],
                    tools: [{
                        type: "function",
                        function: {
                            name: "get_weather",
                            description: "Get weather by city",
                            parameters: {
                                type: "object",
                                properties: {
                                    city: { type: "string" },
                                    unit: { type: "string" },
                                },
                                required: ["city"],
                            },
                        },
                    }],
                    tool_choice: "required",
                };

                const first = await executeTextProtocol({
                    providerId,
                    protocol: "openai.chat.completions",
                    body,
                    testId,
                });
                const firstToolCalls = first.encoded?.choices?.[0]?.message?.tool_calls;
                expect(Array.isArray(firstToolCalls) ? firstToolCalls.length : 0).toBeGreaterThan(0);
                expect(firstToolCalls?.[0]?.function?.name).toBe("get_weather");

                const second = await executeTextProtocol({
                    providerId,
                    protocol: "openai.chat.completions",
                    body,
                    testId,
                });
                expect(extractProtocolText("openai.chat.completions", second.encoded))
                    .toContain("workflow completed");

                const requests = getAimock().getRequests();
                expect(requests.length).toBe(2);
                expect(requests[0]?.headers["x-test-id"]).toBe(testId);
                expect(requests[1]?.headers["x-test-id"]).toBe(testId);
            });
        }
    }
});
