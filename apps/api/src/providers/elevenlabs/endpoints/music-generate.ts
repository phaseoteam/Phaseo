// ElevenLabs Music Generation endpoint
import type { AdapterResult, ProviderExecuteArgs } from "../../types";
import { MusicGenerateSchema, type MusicGenerateRequest } from "@core/schemas";
import { buildAdapterPayload } from "../../utils";
import { resolveProviderKey } from "../../keys";
import { getBindings } from "@/runtime/env";
import { computeBill } from "@pipeline/pricing/engine";

/**
 * ElevenLabs Music/Sound Generation API
 * Docs: https://elevenlabs.io/docs/api-reference/sound-generation
 */
export async function exec(args: ProviderExecuteArgs): Promise<AdapterResult> {
    const keyInfo = resolveProviderKey(args, () => {
        const bindings = getBindings() as any;
        return bindings.ELEVENLABS_API_KEY;
    });

    const adapterPayload = buildAdapterPayload(MusicGenerateSchema, args.body, []).adapterPayload as MusicGenerateRequest;

    // Map duration constraints:
    // - Sound effects: 0.5 to 30 seconds
    // - Music: 10 to 300 seconds (5 minutes)
    // Default to music generation for longer durations
    const duration = adapterPayload.duration || 30;
    const isMusicGeneration = duration >= 10;

    // Prepare request body for ElevenLabs API
    const requestBody: any = {
        text: adapterPayload.prompt,
        duration_seconds: duration,
    };

    // Map format if specified (ElevenLabs outputs MP3 by default)
    if (adapterPayload.format) {
        requestBody.output_format = adapterPayload.format === "mp3" ? "mp3_44100_128" : "mp3_44100_128";
    }

    // Use appropriate endpoint based on duration/type
    const endpoint = isMusicGeneration ? "/v1/music/generate" : "/v1/sound-generation";

    const res = await fetch(`https://api.elevenlabs.io${endpoint}`, {
        method: "POST",
        headers: {
            "xi-api-key": keyInfo.key,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
    });

    const bill = {
        cost_cents: 0,
        currency: "USD" as const,
        usage: undefined as any,
        upstream_id: res.headers.get("request-id") || res.headers.get("x-request-id"),
        finish_reason: null,
    };

    let normalized: any;

    if (res.ok) {
        // ElevenLabs returns audio binary data or JSON with audio URL
        const contentType = res.headers.get("content-type") || "";

        if (contentType.includes("application/json")) {
            // JSON response with audio URL or metadata
            const json = await res.clone().json().catch(() => null);
            normalized = {
                audio_url: json?.audio_url,
                duration: json?.duration_seconds || duration,
                format: adapterPayload.format || "mp3",
            };

            // Track usage if available
            if (json?.usage) {
                const pricedUsage = computeBill(json.usage, args.pricingCard);
                bill.cost_cents = pricedUsage.pricing.total_cents;
                bill.currency = pricedUsage.pricing.currency;
                bill.usage = pricedUsage;
            }
        } else if (contentType.includes("audio/")) {
            // Binary audio response - convert to base64 for transport
            const audioBuffer = await res.clone().arrayBuffer();
            const base64Audio = Buffer.from(audioBuffer).toString("base64");

            normalized = {
                audio_base64: base64Audio,
                duration: duration,
                format: adapterPayload.format || "mp3",
                content_type: contentType,
            };

            // Estimate usage based on duration (rough estimate: ~100 chars per second)
            const estimatedUsage = {
                characters: Math.ceil(adapterPayload.prompt.length + duration * 100),
                duration_seconds: duration,
            };

            const pricedUsage = computeBill(estimatedUsage, args.pricingCard);
            bill.cost_cents = pricedUsage.pricing.total_cents;
            bill.currency = pricedUsage.pricing.currency;
            bill.usage = pricedUsage;
        }
    }

    return {
        kind: "completed",
        upstream: res,
        bill,
        normalized,
        keySource: keyInfo.source,
        byokKeyId: keyInfo.byokId,
    };
}
