// Purpose: Provider adapter module.
// Why: Encapsulates provider-specific configuration and endpoint mapping.
// How: Exposes provider-specific helpers for routing and execution.

// ElevenLabs Music Generation endpoint
import type { AdapterResult, ProviderExecuteArgs } from "../../types";
import { MusicGenerateSchema, type MusicGenerateRequest } from "@core/schemas";
import { buildAdapterPayload } from "../../utils";
import { resolveProviderKey } from "../../keys";
import { getBindings } from "@/runtime/env";
import { computeBill } from "@pipeline/pricing/engine";
import { saveMusicJobMeta } from "@core/music-jobs";

function toBase64(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	let binary = "";
	const chunk = 0x8000;
	for (let i = 0; i < bytes.length; i += chunk) {
		const slice = bytes.subarray(i, i + chunk);
		binary += String.fromCharCode(...slice);
	}
	return btoa(binary);
}

function normalizeStatus(value: unknown): "queued" | "in_progress" | "completed" | "failed" {
	const status = String(value ?? "").toLowerCase();
	if (status === "completed" || status === "succeeded" || status === "success") return "completed";
	if (status === "failed" || status === "error") return "failed";
	if (status === "queued" || status === "pending") return "queued";
	if (status === "running" || status === "in_progress" || status === "processing") return "in_progress";
	return "completed";
}

function normalizeMusicPayload(json: any, modelId: string, fallbackId: string | null, usage?: any) {
	const id = json?.id ?? json?.track_id ?? json?.request_id ?? fallbackId;
	const audioUrl = json?.audio_url ?? json?.audioUrl ?? json?.url ?? null;
	const streamUrl = json?.stream_audio_url ?? json?.streamAudioUrl ?? null;
	const imageUrl = json?.image_url ?? json?.imageUrl ?? null;
	const durationSeconds =
		(typeof json?.duration_seconds === "number" ? json.duration_seconds : undefined) ??
		(typeof json?.duration === "number" ? json.duration : undefined);
	return {
		id: id ?? null,
		object: "music",
		status: normalizeStatus(json?.status),
		provider: "elevenlabs",
		model: modelId,
		nativeResponseId: id ?? null,
		output: [
			{
				index: 0,
				audio_url: audioUrl,
				stream_audio_url: streamUrl,
				image_url: imageUrl,
				duration: typeof durationSeconds === "number" ? durationSeconds : null,
			},
		],
		result: json,
		...(usage ? { usage } : {}),
	};
}

function pruneUndefined<T extends Record<string, unknown>>(input: T): T {
	const output: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(input)) {
		if (value !== undefined) output[key] = value;
	}
	return output as T;
}

function defaultOutputFormatForGatewayFormat(format?: string | null): string | undefined {
	const normalized = String(format ?? "").trim().toLowerCase();
	if (!normalized) return undefined;
	if (normalized === "mp3") return "mp3_44100_128";
	if (normalized === "wav") return "pcm_44100";
	if (normalized === "aac" || normalized === "ogg") return "mp3_44100_128";
	return undefined;
}

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
        ...pruneUndefined({ ...elevenParams }),
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
        defaultOutputFormatForGatewayFormat(typedPayload.format);
    delete requestBody.output_format;
    const query = outputFormat ? `?output_format=${encodeURIComponent(outputFormat)}` : "";
    const bindings = getBindings() as any;
    const baseUrl = String(bindings.ELEVENLABS_BASE_URL || "https://api.elevenlabs.io").replace(/\/+$/, "");

    const res = await fetch(`${baseUrl}/v1/music/detailed${query}`, {
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
            const usageMeters = {
                requests: 1,
                ...(json?.usage && typeof json.usage === "object" ? json.usage : {}),
            };
            normalized = normalizeMusicPayload(
                json,
                requestBody.model_id,
                bill.upstream_id ?? null,
                usageMeters,
            );
            if (args.pricingCard) {
                const pricedUsage = computeBill(usageMeters, args.pricingCard, {
                    model: requestBody.model_id,
                });
                bill.cost_cents = pricedUsage.pricing.total_cents;
                bill.currency = pricedUsage.pricing.currency;
                bill.usage = pricedUsage;
            }
        } else {
            const audioBuffer = await res.clone().arrayBuffer();
            const base64Audio = toBase64(audioBuffer);
            const usageMeters = { requests: 1 };
            normalized = {
                id: bill.upstream_id ?? null,
                object: "music",
                status: "completed",
                provider: "elevenlabs",
                model: requestBody.model_id,
                nativeResponseId: bill.upstream_id ?? null,
                audio_base64: base64Audio,
                content_type: contentType,
                usage: usageMeters,
            };
            if (args.pricingCard) {
                const pricedUsage = computeBill(usageMeters, args.pricingCard, {
                    model: requestBody.model_id,
                });
                bill.cost_cents = pricedUsage.pricing.total_cents;
                bill.currency = pricedUsage.pricing.currency;
                bill.usage = pricedUsage;
            }
        }
    }

    if (res.ok && normalized?.id) {
        try {
            const firstOutput = Array.isArray(normalized.output) ? normalized.output[0] : null;
            const durationSeconds =
                typeof firstOutput?.duration === "number"
                    ? firstOutput.duration
                    : (typeof typedPayload.duration === "number" ? typedPayload.duration : null);
            await saveMusicJobMeta(args.teamId, String(normalized.id), {
                provider: "elevenlabs",
                model: requestBody.model_id ?? null,
                duration: durationSeconds,
                format: typedPayload.format ?? null,
                status: normalized?.status ?? null,
                nativeResponseId: normalized?.nativeResponseId ?? null,
                output: Array.isArray(normalized.output) ? normalized.output : null,
                createdAt: Date.now(),
            });
        } catch (err) {
            console.error("elevenlabs_music_job_meta_store_failed", {
                error: err,
                teamId: args.teamId,
                musicId: normalized.id,
            });
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

