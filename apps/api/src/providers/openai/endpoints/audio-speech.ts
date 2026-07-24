// Purpose: Provider adapter module.
// Why: Encapsulates provider-specific configuration and endpoint mapping.
// How: Exposes provider-specific helpers for routing and execution.

import type { AdapterResult, ProviderExecuteArgs } from "../../types";
import { AudioSpeechSchema, type AudioSpeechRequest } from "@core/schemas";
import { buildAdapterPayload } from "../../utils";
import { openAICompatHeaders, openAICompatUrl, resolveOpenAICompatKey } from "../../openai-compatible/config";
import { validateOpenAIVoiceForModel } from "../voices";
import { upstreamTestHeaders } from "@providers/shared/testing";

function invalidVoiceResponse(voice: string, model: string, supported: string[]): Response {
    return new Response(
        JSON.stringify({
            error: {
                type: "invalid_request_error",
                message:
                    `Invalid voice "${voice}" for OpenAI model "${model}". ` +
                    `Supported voices: ${supported.join(", ")}`,
                param: "voice",
            },
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
    );
}

function extractVoiceCandidate(voice: AudioSpeechRequest["voice"]): string | undefined {
    if (typeof voice === "string") {
        const trimmed = voice.trim();
        return trimmed.length > 0 ? trimmed : undefined;
    }
    if (voice && typeof voice === "object") {
        const candidate =
            (voice as Record<string, any>).id ??
            (voice as Record<string, any>).voice_id ??
            (voice as Record<string, any>).voiceId ??
            (voice as Record<string, any>).name ??
            (voice as Record<string, any>).voiceName;
        if (typeof candidate === "string" && candidate.trim().length > 0) {
            return candidate.trim();
        }
    }
    return undefined;
}

function supportsSpeechSse(model: string): boolean {
    const normalized = model.trim().toLowerCase();
    return normalized !== "tts-1" && normalized !== "tts-1-hd" && !normalized.endsWith("/tts-1") && !normalized.endsWith("/tts-1-hd");
}

function requiresAuthoritativeSpeechUsage(providerId: string, model: string): boolean {
    return providerId === "openai" && supportsSpeechSse(model);
}

function mimeTypeForResponseFormat(format?: string | null): string {
    const normalized = String(format ?? "").trim().toLowerCase();
    switch (normalized) {
        case "wav":
            return "audio/wav";
        case "aac":
            return "audio/aac";
        case "flac":
            return "audio/flac";
        case "opus":
            return "audio/opus";
        case "pcm":
            return "audio/pcm";
        case "mp3":
        default:
            return "audio/mpeg";
    }
}

function decodeBase64Chunk(value: string): Uint8Array {
    const binary = atob(value);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function concatChunks(chunks: Uint8Array[]): Uint8Array {
    const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        out.set(chunk, offset);
        offset += chunk.length;
    }
    return out;
}

async function parseSpeechSseResponse(response: Response): Promise<{
    bytes: Uint8Array;
    usage?: Record<string, any>;
}> {
    if (!response.body) {
        return { bytes: new Uint8Array(0) };
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const audioChunks: Uint8Array[] = [];
    let usage: Record<string, any> | undefined;

    const processBlock = (raw: string) => {
        let data = "";
        for (const line of raw.split(/\r?\n/)) {
            const trimmed = line.replace(/\r$/, "");
            if (trimmed.startsWith("data:")) {
                data += trimmed.slice(5).trimStart();
            }
        }
        if (!data || data === "[DONE]") return;
        let json: any = null;
        try {
            json = JSON.parse(data);
        } catch {
            return;
        }
        if (json?.type === "speech.audio.delta" && typeof json?.audio === "string" && json.audio.length > 0) {
            audioChunks.push(decodeBase64Chunk(json.audio));
            return;
        }
        if (json?.type === "speech.audio.done" && json?.usage && typeof json.usage === "object") {
            const inputTokens = Number(json.usage.input_tokens ?? 0);
            const outputTokens = Number(json.usage.output_tokens ?? 0);
            const totalTokens = Number(json.usage.total_tokens ?? (inputTokens + outputTokens));
            usage = {
                input_tokens: inputTokens,
                output_tokens: outputTokens,
                total_tokens: totalTokens,
                input_text_tokens: inputTokens,
                output_audio_tokens: outputTokens,
                inputTokens: inputTokens,
                outputTokens: outputTokens,
                totalTokens: totalTokens,
                requests: 1,
            };
        }
    };

    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split(/\r?\n\r?\n/);
        buffer = parts.pop() ?? "";
        for (const raw of parts) {
            processBlock(raw);
        }
    }
    if (buffer.trim().length) {
        processBlock(buffer);
    }

    return {
        bytes: concatChunks(audioChunks),
        ...(usage ? { usage } : {}),
    };
}


export async function exec(args: ProviderExecuteArgs): Promise<AdapterResult> {
    const keyInfo = await resolveOpenAICompatKey(args);
    const adapterPayload = buildAdapterPayload(AudioSpeechSchema, args.body, []).adapterPayload as AudioSpeechRequest;
    const body: AudioSpeechRequest = {
        ...adapterPayload,
        model: args.providerModelSlug || adapterPayload.model,
    };
    if (body.format !== undefined) {
        return {
            kind: "completed",
            upstream: new Response(
                JSON.stringify({
                    error: {
                        type: "invalid_request_error",
                        message: 'OpenAI audio.speech expects "response_format" (not legacy "format").',
                        param: "format",
                    },
                }),
                { status: 400, headers: { "Content-Type": "application/json" } },
            ),
            bill: {
                cost_cents: 0,
                currency: "USD" as const,
                usage: undefined as any,
                upstream_id: null,
                finish_reason: null,
            },
            keySource: keyInfo.source,
            byokKeyId: keyInfo.byokId,
        };
    }
    const voiceCandidate = extractVoiceCandidate(body.voice);
    let resolvedVoice: string | undefined = voiceCandidate;
    if (voiceCandidate != null) {
        const validation = validateOpenAIVoiceForModel(body.model, voiceCandidate);
        if (!validation.ok) {
            return {
                kind: "completed",
                upstream: invalidVoiceResponse(voiceCandidate, body.model, validation.supported),
                bill: {
                    cost_cents: 0,
                    currency: "USD" as const,
                    usage: undefined as any,
                    upstream_id: null,
                    finish_reason: null,
                },
                keySource: keyInfo.source,
                byokKeyId: keyInfo.byokId,
            };
        }
        resolvedVoice = validation.resolved;
    }

    const requireAuthoritativeUsage = requiresAuthoritativeSpeechUsage(args.providerId, body.model);

    const requestBody = {
        model: body.model,
        input: body.input,
        voice: resolvedVoice,
        response_format: body.response_format,
        ...(requireAuthoritativeUsage ? { stream_format: "sse" as const } : {}),
        speed: body.speed,
        instructions: body.instructions,
    };

    const res = await (args.upstreamTiming?.fetch ?? fetch)(openAICompatUrl(args.providerId, "/audio/speech"), {
        method: "POST",
        headers: openAICompatHeaders(args.providerId, keyInfo.key, upstreamTestHeaders(args.meta)),
        body: JSON.stringify(requestBody),
    });

    let upstream = res;
    let usage: any;
    if (res.ok) {
        const contentType = String(res.headers.get("content-type") ?? "").toLowerCase();
        if (contentType.includes("text/event-stream")) {
            const parsed = await parseSpeechSseResponse(res);
            if (!parsed.usage && requireAuthoritativeUsage) {
                return {
                    kind: "completed",
                    upstream: new Response(
                        JSON.stringify({
                            error: {
                                type: "upstream_usage_missing",
                                message: "OpenAI audio.speech SSE completed without a speech.audio.done usage payload.",
                                param: "usage",
                            },
                        }),
                        { status: 502, headers: { "Content-Type": "application/json" } },
                    ),
                    bill: {
                        cost_cents: 0,
                        currency: "USD" as const,
                        usage: undefined as any,
                        upstream_id: res.headers.get("x-request-id"),
                        finish_reason: null,
                    },
                    keySource: keyInfo.source,
                    byokKeyId: keyInfo.byokId,
                };
            }
            usage = parsed.usage;
            const headers = new Headers(res.headers);
            const mimeType = mimeTypeForResponseFormat(body.response_format);
            const responseBytes = new Uint8Array(parsed.bytes);
            headers.set("Content-Type", mimeType);
            upstream = new Response(new Blob([responseBytes], { type: mimeType }), {
                status: res.status,
                statusText: res.statusText,
                headers,
            });
        } else if (requireAuthoritativeUsage) {
            return {
                kind: "completed",
                upstream: new Response(
                    JSON.stringify({
                        error: {
                            type: "upstream_usage_missing",
                            message: "OpenAI audio.speech must return SSE usage for accurate billing, but the upstream response was not SSE.",
                            param: "usage",
                        },
                    }),
                    { status: 502, headers: { "Content-Type": "application/json" } },
                ),
                bill: {
                    cost_cents: 0,
                    currency: "USD" as const,
                    usage: undefined as any,
                    upstream_id: res.headers.get("x-request-id"),
                    finish_reason: null,
                },
                keySource: keyInfo.source,
                byokKeyId: keyInfo.byokId,
            };
        }
    }

    const bill = {
        cost_cents: 0,
        currency: "USD" as const,
        usage,
        upstream_id: res.headers.get("x-request-id"),
        finish_reason: null,
    };

    return {
        kind: "completed",
        upstream,
        bill,
        keySource: keyInfo.source,
        byokKeyId: keyInfo.byokId,
    };
}

