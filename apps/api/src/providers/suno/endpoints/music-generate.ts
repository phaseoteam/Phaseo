// Suno Music Generation endpoint
// NOTE: Suno does not have an official API. This adapter is a placeholder
// for when/if they release an official API, or for third-party API wrappers.
import type { AdapterResult, ProviderExecuteArgs } from "../../types";
import { MusicGenerateSchema, type MusicGenerateRequest } from "@core/schemas";
import { buildAdapterPayload } from "../../utils";
import { resolveProviderKey } from "../../keys";
import { getBindings } from "@/runtime/env";

/**
 * Suno Music Generation (Placeholder)
 *
 * Suno does not currently provide an official API.
 * Third-party APIs exist (sunoapi.org, gcui-art/suno-api, etc.) but are unofficial.
 *
 * To use this adapter, set SUNO_API_KEY and SUNO_BASE_URL in your environment
 * pointing to a third-party API service.
 *
 * Expected third-party API format (based on common implementations):
 * POST /v1/music/generate
 * Body: { prompt, duration, model, custom_mode, tags }
 * Response: { id, status, audio_url, ... }
 */
export async function exec(args: ProviderExecuteArgs): Promise<AdapterResult> {
    const keyInfo = resolveProviderKey(args, () => {
        const bindings = getBindings() as any;
        return bindings.SUNO_API_KEY;
    });

    const adapterPayload = buildAdapterPayload(MusicGenerateSchema, args.body, []).adapterPayload as MusicGenerateRequest;

    // Get base URL from environment (defaults to a common third-party API)
    const bindings = getBindings() as any;
    const baseUrl = bindings.SUNO_BASE_URL || "https://api.sunoapi.com";

    // Prepare request for common third-party API format
    const requestBody = {
        prompt: adapterPayload.prompt,
        duration: adapterPayload.duration || 30,
        model: args.providerModelSlug || adapterPayload.model || "chirp-v3-5",
        custom_mode: false,
    };

    const res = await fetch(`${baseUrl}/v1/music/generate`, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${keyInfo.key}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
    });

    const bill = {
        cost_cents: 0,
        currency: "USD" as const,
        usage: undefined as any,
        upstream_id: res.headers.get("x-request-id"),
        finish_reason: null,
    };

    const json = await res.clone().json().catch(() => null);
    const normalized = json || undefined;

    return {
        kind: "completed",
        upstream: res,
        bill,
        normalized,
        keySource: keyInfo.source,
        byokKeyId: keyInfo.byokId,
    };
}
