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

    const { canonical, adapterPayload } = buildAdapterPayload(MusicGenerateSchema, args.body, []);
    const typedPayload = adapterPayload as MusicGenerateRequest;
    const elevenParams = (canonical as MusicGenerateRequest).elevenlabs ?? {};

    const prompt = elevenParams.prompt ?? typedPayload.prompt ?? null;
    const compositionPlan = elevenParams.composition_plan ?? null;
    const musicLengthMs =
        elevenParams.music_length_ms ??
        (typeof typedPayload.duration === "number" ? typedPayload.duration * 1000 : null);

    const requestBody: any = {
        prompt,
        composition_plan: compositionPlan,
        music_length_ms: musicLengthMs,
        model_id: elevenParams.model_id ?? "music_v1",
        force_instrumental: elevenParams.force_instrumental ?? false,
        store_for_inpainting: elevenParams.store_for_inpainting ?? false,
        with_timestamps: elevenParams.with_timestamps ?? false,
        sign_with_c2pa: elevenParams.sign_with_c2pa ?? false,
    };

    if (requestBody.prompt == null && requestBody.composition_plan == null) {
        requestBody.prompt = "";
    }

    const outputFormat =
        elevenParams.output_format ??
        (typedPayload.format ? "mp3_44100_128" : undefined);
    const query = outputFormat ? `?output_format=${encodeURIComponent(outputFormat)}` : "";

    const res = await fetch(`https://api.elevenlabs.io/v1/music/detailed${query}`, {
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
        const contentType = res.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
            const json = await res.clone().json().catch(() => null);
            normalized = json;
            if (json?.usage) {
                const pricedUsage = computeBill(json.usage, args.pricingCard);
                bill.cost_cents = pricedUsage.pricing.total_cents;
                bill.currency = pricedUsage.pricing.currency;
                bill.usage = pricedUsage;
            }
        } else {
            const audioBuffer = await res.clone().arrayBuffer();
            const base64Audio = Buffer.from(audioBuffer).toString("base64");
            normalized = {
                audio_base64: base64Audio,
                content_type: contentType,
            };
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
