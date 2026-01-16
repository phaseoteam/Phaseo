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

    const { canonical, adapterPayload } = buildAdapterPayload(MusicGenerateSchema, args.body, []);
    const typedPayload = adapterPayload as MusicGenerateRequest;
    const sunoParams = (canonical as MusicGenerateRequest).suno ?? {};

    // Get base URL from environment (defaults to a common third-party API)     
    const bindings = getBindings() as any;
    const baseUrl = bindings.SUNO_BASE_URL || "https://api.sunoapi.org";

    // Prepare request for common third-party API format
    const requestBody: Record<string, unknown> = {
        customMode: sunoParams.customMode ?? false,
        instrumental: sunoParams.instrumental ?? false,
        callBackUrl: sunoParams.callBackUrl ?? undefined,
        model: sunoParams.model ?? args.providerModelSlug ?? typedPayload.model,
    };
    const prompt =
        sunoParams.prompt ??
        typedPayload.prompt ??
        undefined;
    if (prompt) requestBody.prompt = prompt;
    if (sunoParams.style) requestBody.style = sunoParams.style;
    if (sunoParams.title) requestBody.title = sunoParams.title;
    if (sunoParams.personaId) requestBody.personaId = sunoParams.personaId;
    if (sunoParams.negativeTags) requestBody.negativeTags = sunoParams.negativeTags;
    if (sunoParams.vocalGender) requestBody.vocalGender = sunoParams.vocalGender;
    if (typeof sunoParams.styleWeight === "number") requestBody.styleWeight = sunoParams.styleWeight;
    if (typeof sunoParams.weirdnessConstraint === "number") requestBody.weirdnessConstraint = sunoParams.weirdnessConstraint;
    if (typeof sunoParams.audioWeight === "number") requestBody.audioWeight = sunoParams.audioWeight;

    const res = await fetch(`${baseUrl}/api/v1/generate`, {
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
