// Purpose: Provider adapter module.
// Why: Encapsulates provider-specific configuration and endpoint mapping.
// How: Exposes provider-specific helpers for routing and execution.

import type { AdapterResult, ProviderExecuteArgs } from "../../types";
import { AudioSpeechSchema, type AudioSpeechRequest } from "@core/schemas";
import { buildAdapterPayload } from "../../utils";
import { openAICompatHeaders, openAICompatUrl, resolveOpenAICompatKey } from "../../openai-compatible/config";
import { validateOpenAIVoiceForModel } from "../voices";

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

    const requestBody = {
        model: body.model,
        input: body.input,
        voice: resolvedVoice,
        response_format: body.response_format,
        stream_format: body.stream_format,
        speed: body.speed,
        instructions: body.instructions,
    };

    const res = await fetch(openAICompatUrl(args.providerId, "/audio/speech"), {
        method: "POST",
        headers: openAICompatHeaders(args.providerId, keyInfo.key),
        body: JSON.stringify(requestBody),
    });

    const bill = {
        cost_cents: 0,
        currency: "USD" as const,
        usage: undefined as any,
        upstream_id: res.headers.get("x-request-id"),
        finish_reason: null,
    };

    return {
        kind: "completed",
        upstream: res,
        bill,
        keySource: keyInfo.source,
        byokKeyId: keyInfo.byokId,
    };
}

