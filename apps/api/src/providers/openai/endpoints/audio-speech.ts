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

    const res = await fetch(openAICompatUrl(args.providerId, "/audio/speech"), {
        method: "POST",
        headers: openAICompatHeaders(args.providerId, keyInfo.key),
        body: JSON.stringify(body),
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

