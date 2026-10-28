// Purpose: Provider adapter module.
// Why: Encapsulates provider-specific configuration and endpoint mapping.
// How: Exposes provider-specific helpers for routing and execution.

// ElevenLabs Music Generation endpoint
import type { AdapterResult, ProviderExecuteArgs } from "../../types";
import { MusicGenerateSchema, type MusicGenerateRequest } from "@core/schemas";
import { buildAdapterPayload } from "../../utils";
import { resolveProviderKey } from "../../keys";
import { getBindings } from "@/runtime/env";
import { computeBillAfterProviderCharge } from "@pipeline/pricing/engine";

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
	if (normalized === "ogg") return "opus_48000_128";
	return undefined;
}

/**
 * Length in seconds of the audio ElevenLabs returned. `music_length_ms` is optional ("if not
 * provided, the model will choose a length based on the prompt") and the response is the audio
 * file alone (https://elevenlabs.io/docs/api-reference/music/compose), so the length is read
 * from the audio. `output_format` names the encoding (`mp3_44100_128`, `pcm_44100`, ...);
 * `auto`, the default, is mp3_44100_128 for v1 models and mp3_48000_192 for v2 models.
 */
export async function measureMusicDurationSeconds(
	bytes: Uint8Array,
	contentType: string,
	outputFormat: string | undefined,
	modelId: string,
): Promise<number | undefined> {
	if (bytes.length === 0) return undefined;
	const format = String(outputFormat ?? "").trim().toLowerCase();
	const pcm = /^pcm_(\d+)$/.exec(format);
	// Raw PCM is signed 16-bit mono; μ-law and A-law are 8-bit mono.
	if (pcm) return bytes.length / (Number(pcm[1]) * 2);
	const law = /^(?:ulaw|alaw)_(\d+)$/.exec(format);
	if (law) return bytes.length / Number(law[1]);
	try {
		const { parseBuffer } = await import("music-metadata");
		const parsed = await parseBuffer(bytes, { mimeType: contentType.split(";")[0].trim() || undefined, size: bytes.length }, { duration: true, skipCovers: true });
		const duration = parsed.format.duration;
		if (typeof duration === "number" && Number.isFinite(duration) && duration > 0) return duration;
	} catch {
		// Fall back to the bitrate below.
	}
	const bitrate = /^(?:mp3|opus)_\d+_(\d+)$/.exec(format);
	const kbps = bitrate
		? Number(bitrate[1])
		: contentType.toLowerCase().includes("mpeg") ? (/v1/i.test(modelId) ? 128 : 192) : undefined;
	return kbps ? (bytes.length * 8) / (kbps * 1000) : undefined;
}

function invalidParameterResponse(param: string, message: string): Response {
	return new Response(JSON.stringify({ error: { type: "invalid_request_error", message, param } }), {
		status: 400,
		headers: { "Content-Type": "application/json" },
	});
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
	const seed = elevenParams.seed ?? null;
	if (prompt !== null && (compositionPlan !== null || seed !== null)) {
		const param = compositionPlan !== null ? "composition_plan" : "seed";
		return {
			kind: "completed",
			upstream: invalidParameterResponse(
				param,
				"ElevenLabs Music prompt cannot be combined with composition_plan or seed.",
			),
			bill: { cost_cents: 0, currency: "USD", usage: undefined, upstream_id: null, finish_reason: null },
			normalized: undefined,
			keySource: keyInfo.source,
			byokKeyId: keyInfo.byokId,
		};
	}
	if (elevenParams.with_timestamps === true) {
		return {
			kind: "completed",
			upstream: invalidParameterResponse(
				"with_timestamps",
				"ElevenLabs Music timestamps require the detailed compose endpoint, which this gateway adapter does not support.",
			),
			bill: { cost_cents: 0, currency: "USD", usage: undefined, upstream_id: null, finish_reason: null },
			normalized: undefined,
			keySource: keyInfo.source,
			byokKeyId: keyInfo.byokId,
		};
	}
	if (typedPayload.format === "aac") {
		return {
			kind: "completed",
			upstream: invalidParameterResponse(
				"format",
				"ElevenLabs Music does not provide AAC output; use mp3, wav, ogg, or a documented native output_format.",
			),
			bill: { cost_cents: 0, currency: "USD", usage: undefined, upstream_id: null, finish_reason: null },
			normalized: undefined,
			keySource: keyInfo.source,
			byokKeyId: keyInfo.byokId,
		};
	}

	const musicLengthMs =
        elevenParams.music_length_ms ??
        (typeof typedPayload.duration === "number" ? typedPayload.duration * 1000 : null);

    const requestBody: any = {
        ...pruneUndefined({ ...elevenParams }),
        prompt,
        composition_plan: compositionPlan,
        music_length_ms: musicLengthMs,
        model_id: elevenParams.model_id ?? args.providerModelSlug ?? "music_v2",
        force_instrumental: elevenParams.force_instrumental ?? false,
        store_for_inpainting: elevenParams.store_for_inpainting ?? false,
        sign_with_c2pa: elevenParams.sign_with_c2pa ?? false,
    };

	if (requestBody.prompt == null && requestBody.composition_plan == null && requestBody.seed == null) {
		requestBody.prompt = "";
	}

    const outputFormat =
        elevenParams.output_format ??
        defaultOutputFormatForGatewayFormat(typedPayload.format);
    delete requestBody.output_format;
	// The binary endpoint does not accept this field; true requests are rejected above.
    delete requestBody.with_timestamps;
    const query = outputFormat ? `?output_format=${encodeURIComponent(outputFormat)}` : "";
    const bindings = getBindings() as any;
    const baseUrl = String(bindings.ELEVENLABS_BASE_URL || "https://api.elevenlabs.io").replace(/\/+$/, "");

    // The plain compose endpoint returns the generated audio directly. The detailed
    // endpoint is multipart/mixed and must not be treated as a single audio blob.
    const res = await (args.upstreamTiming?.fetch ?? fetch)(`${baseUrl}/v1/music${query}`, {
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
        upstream_id: res.headers.get("song-id") || res.headers.get("request-id") || res.headers.get("x-request-id"),
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
                const pricedUsage = computeBillAfterProviderCharge(usageMeters, args.pricingCard, {
                    model: requestBody.model_id,
                });
                bill.cost_cents = pricedUsage.pricing.total_cents;
                bill.currency = pricedUsage.pricing.currency;
                bill.usage = pricedUsage;
            }
        } else {
            const audioBuffer = await res.clone().arrayBuffer();
            const base64Audio = toBase64(audioBuffer);
            // The requested length when the client set one, else the length of the returned audio.
            const outputAudioSeconds = typeof musicLengthMs === "number"
                ? musicLengthMs / 1000
                : await measureMusicDurationSeconds(new Uint8Array(audioBuffer), contentType, outputFormat, requestBody.model_id);
            const usageMeters = {
				requests: 1,
				...(typeof outputAudioSeconds === "number" ? { output_audio_seconds: outputAudioSeconds } : {}),
			};
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
                const pricedUsage = computeBillAfterProviderCharge(usageMeters, args.pricingCard, {
                    model: requestBody.model_id,
                });
                bill.cost_cents = pricedUsage.pricing.total_cents;
                bill.currency = pricedUsage.pricing.currency;
                bill.usage = pricedUsage;
            }
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
