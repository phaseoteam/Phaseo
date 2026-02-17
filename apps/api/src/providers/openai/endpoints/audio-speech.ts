// Purpose: Provider adapter module.
// Why: Encapsulates provider-specific configuration and endpoint mapping.
// How: Exposes provider-specific helpers for routing and execution.

import type { AdapterResult, ProviderExecuteArgs } from "../../types";
import { AudioSpeechSchema, type AudioSpeechRequest } from "@core/schemas";
import { buildAdapterPayload } from "../../utils";
import { openAICompatHeaders, openAICompatUrl, resolveOpenAICompatKey } from "../../openai-compatible/config";



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
    const requestBody = {
        model: body.model,
        input: body.input,
        voice: body.voice,
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

