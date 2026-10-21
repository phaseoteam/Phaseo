// Purpose: Provider adapter module.
// Why: Encapsulates provider-specific configuration and endpoint mapping.
// How: Exposes provider-specific helpers for routing and execution.

import type { AdapterResult, ProviderExecuteArgs } from "../../types";
import { AudioTranscriptionSchema, type AudioTranscriptionRequest } from "@core/schemas";
import { buildAdapterPayload } from "../../utils";
import { resolveProviderKey } from "../../keys";
import { getBindings } from "@/runtime/env";
import { computeBillAfterProviderCharge } from "@pipeline/pricing/engine";
import { estimateAudioDurationSeconds } from "../../openai/endpoints/audio-transcription-usage";

const ELEVENLABS_TIMESTAMP_GRANULARITIES = new Set(["none", "word", "character"]);

function invalidParameterResponse(param: string, message: string): Response {
	return new Response(JSON.stringify({ error: { type: "invalid_request_error", message, param } }), {
		status: 400,
		headers: { "Content-Type": "application/json" },
	});
}

function responseAudioDurationSeconds(json: Record<string, any>): number | undefined {
	for (const value of [json.usage?.input_audio_seconds, json.audio_duration, json.duration, json.duration_seconds]) {
		if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
	}
	if (Array.isArray(json.words)) {
		const maxEnd = Math.max(0, ...json.words.map((word: any) => Number(word?.end ?? word?.end_time ?? 0)));
		if (Number.isFinite(maxEnd) && maxEnd > 0) return maxEnd;
	}
	return undefined;
}

function resolveElevenLabsModelSlug(requestedModel: string, providerModelSlug?: string | null): string {
	if (providerModelSlug && providerModelSlug.trim().length > 0) {
		return providerModelSlug.trim();
	}
	const tail = requestedModel.includes("/") ? requestedModel.split("/").pop() ?? requestedModel : requestedModel;
	const normalized = tail.replace(/-\d{4}-\d{2}-\d{2}$/i, "");
	return normalized.replace(/-/g, "_");
}

export async function exec(args: ProviderExecuteArgs): Promise<AdapterResult> {
	const keyInfo = resolveProviderKey(args, () => {
		const bindings = getBindings() as any;
		return bindings.ELEVENLABS_API_KEY;
	});

	const { adapterPayload } = buildAdapterPayload(AudioTranscriptionSchema, args.body, []);
	const typedPayload = adapterPayload as AudioTranscriptionRequest;
	const bindings = getBindings() as unknown as Record<string, string | undefined>;
	const baseUrl = String(bindings.ELEVENLABS_BASE_URL || "https://api.elevenlabs.io").replace(/\/+$/, "");
	const modelId = resolveElevenLabsModelSlug(typedPayload.model, args.providerModelSlug);
	const raw = typedPayload as AudioTranscriptionRequest & { config?: { elevenlabs?: Record<string, unknown> } };
	const elevenlabs = raw.config?.elevenlabs ?? {};
	const nativeTimestampGranularity = elevenlabs.timestamps_granularity;
	const invalidTimestampParam = typedPayload.timestamp_granularities?.includes("segment")
		? "timestamp_granularities"
		: typeof nativeTimestampGranularity === "string" &&
			!ELEVENLABS_TIMESTAMP_GRANULARITIES.has(nativeTimestampGranularity)
			? "timestamps_granularity"
			: null;
	if (invalidTimestampParam) {
		return {
			kind: "completed",
			upstream: invalidParameterResponse(
				invalidTimestampParam,
				"ElevenLabs Scribe does not support segment timestamps; use word timestamps or config.elevenlabs.timestamps_granularity with none, word, or character.",
			),
			bill: { cost_cents: 0, currency: "USD", usage: undefined, upstream_id: null, finish_reason: null },
			normalized: undefined,
			keySource: keyInfo.source,
			byokKeyId: keyInfo.byokId,
		};
	}
	const requiresAudioDuration = Boolean(args.pricingCard?.rules?.some((rule: any) => rule.meter === "input_audio_seconds"));
	if (requiresAudioDuration && keyInfo.source !== "byok" && !typedPayload.file) {
		return {
			kind: "completed",
			upstream: new Response(JSON.stringify({ error: { message: "Gateway-managed ElevenLabs transcription requires an uploaded file so usage can be measured" } }), {
				status: 400,
				headers: { "content-type": "application/json" },
			}),
			bill: { cost_cents: 0, currency: "USD", usage: undefined, upstream_id: null, finish_reason: null },
			normalized: undefined,
			keySource: keyInfo.source,
			byokKeyId: keyInfo.byokId,
		};
	}
	const estimatedAudioSeconds = typedPayload.file
		? await estimateAudioDurationSeconds(typedPayload.file)
		: undefined;

	const form = new FormData();
	form.append("model_id", modelId);
	if (typedPayload.language) {
		form.append("language_code", typedPayload.language);
	}
	if (typedPayload.file) {
		const filename = typeof File !== "undefined" && typedPayload.file instanceof File && typedPayload.file.name
			? typedPayload.file.name
			: "audio";
		form.append("file", typedPayload.file, filename);
	} else {
		const sourceUrl = typedPayload.file_url ?? typedPayload.s3_presigned_url;
		if (sourceUrl) form.append("source_url", sourceUrl);
	}
	if (typedPayload.keywords?.length) {
		for (const keyterm of typedPayload.keywords) form.append("keyterms", keyterm);
	}
	if (typeof typedPayload.temperature === "number") form.append("temperature", String(typedPayload.temperature));
	if (typeof typedPayload.diarize === "boolean") form.append("diarize", String(typedPayload.diarize));
	if (typeof nativeTimestampGranularity === "string") {
		form.append("timestamps_granularity", nativeTimestampGranularity);
	} else if (typedPayload.timestamp_granularities?.includes("word")) {
		form.append("timestamps_granularity", "word");
	}
	for (const [key, value] of Object.entries(elevenlabs)) {
		if (value == null || ["model_id", "file", "source_url", "language_code", "keyterms", "enable_logging", "timestamps_granularity"].includes(key)) continue;
		form.append(key, typeof value === "object" ? JSON.stringify(value) : String(value));
	}
	const query = typeof elevenlabs.enable_logging === "boolean"
		? `?enable_logging=${elevenlabs.enable_logging ? "true" : "false"}`
		: "";

	const res = await (args.upstreamTiming?.fetch ?? fetch)(`${baseUrl}/v1/speech-to-text${query}`, {
		method: "POST",
		headers: {
			"xi-api-key": keyInfo.key,
		},
		body: form,
	});

	const bill = {
		cost_cents: 0,
		currency: "USD" as const,
		usage: undefined as any,
		upstream_id: res.headers.get("request-id") || res.headers.get("x-request-id"),
		finish_reason: null,
	};

	let normalized: any = undefined;

	if (res.ok) {
		const json = await res.clone().json().catch(() => undefined);
		if (json && typeof json === "object") {
			const inputAudioSeconds = responseAudioDurationSeconds(json) ?? estimatedAudioSeconds;
			const usageMeters = {
				requests: 1,
				...(json.usage && typeof json.usage === "object" ? json.usage : {}),
				...(typeof inputAudioSeconds === "number" ? { input_audio_seconds: inputAudioSeconds } : {}),
			};
			normalized = {
				...json,
				usage: usageMeters,
			};
			if (args.pricingCard) {
				const pricedUsage = computeBillAfterProviderCharge(usageMeters, args.pricingCard, { model: modelId, pricing_plan: "standard" }, "standard");
				bill.cost_cents = Number(pricedUsage.pricing.total_nanos ?? 0) / 10_000_000;
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
