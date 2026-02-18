// Purpose: Provider adapter module.
// Why: Encapsulates provider-specific configuration and endpoint mapping.
// How: Exposes provider-specific helpers for routing and execution.

import type { AdapterResult, ProviderExecuteArgs } from "../../types";
import { AudioSpeechSchema, type AudioSpeechRequest } from "@core/schemas";
import { buildAdapterPayload } from "../../utils";
import { resolveProviderKey } from "../../keys";
import { getBindings } from "@/runtime/env";
import { computeBill } from "@pipeline/pricing/engine";

function resolveElevenLabsModelSlug(requestedModel: string, providerModelSlug?: string | null): string {
	if (providerModelSlug && providerModelSlug.trim().length > 0) {
		return providerModelSlug.trim();
	}
	const tail = requestedModel.includes("/") ? requestedModel.split("/").pop() ?? requestedModel : requestedModel;
	return tail.replace(/-/g, "_");
}

function resolveOutputFormat(
	responseFormat?: AudioSpeechRequest["response_format"],
	format?: AudioSpeechRequest["format"],
	explicitOutputFormat?: string,
): string | undefined {
	const explicit = explicitOutputFormat?.trim();
	if (explicit) return explicit;

	const target = responseFormat ?? format;
	if (target === "mp3") return "mp3_44100_128";
	if (target === "wav" || target === "pcm") return "pcm_44100";
	return undefined;
}

function missingVoiceResponse(): Response {
	return new Response(
		JSON.stringify({
			error: {
				type: "invalid_request_error",
				message: 'ElevenLabs audio.speech requires a "voice" (voice_id).',
			},
		}),
		{
			status: 400,
			headers: { "Content-Type": "application/json" },
		},
	);
}

export async function exec(args: ProviderExecuteArgs): Promise<AdapterResult> {
	const keyInfo = resolveProviderKey(args, () => {
		const bindings = getBindings() as any;
		return bindings.ELEVENLABS_API_KEY;
	});

	const { adapterPayload } = buildAdapterPayload(AudioSpeechSchema, args.body, []);
	const typedPayload = adapterPayload as AudioSpeechRequest;
	const bindings = getBindings() as unknown as Record<string, string | undefined>;
	const baseUrl = String(bindings.ELEVENLABS_BASE_URL || "https://api.elevenlabs.io").replace(/\/+$/, "");
	const elevenlabsParams = (typedPayload.config?.elevenlabs ?? {}) as Record<string, any>;

	const voiceId = (typedPayload.voice ?? "").trim();
	if (!voiceId) {
		return {
			kind: "completed",
			upstream: missingVoiceResponse(),
			bill: {
				cost_cents: 0,
				currency: "USD",
				usage: undefined,
				upstream_id: null,
				finish_reason: null,
			},
			keySource: keyInfo.source,
			byokKeyId: keyInfo.byokId,
		};
	}

	const modelId = resolveElevenLabsModelSlug(typedPayload.model, args.providerModelSlug);
	const outputFormat = resolveOutputFormat(
		typedPayload.response_format,
		typedPayload.format,
		typeof elevenlabsParams.output_format === "string" ? elevenlabsParams.output_format : undefined,
	);
	const queryParams = new URLSearchParams();
	if (outputFormat) {
		queryParams.set("output_format", outputFormat);
	}
	if (typeof elevenlabsParams.enable_logging === "boolean") {
		queryParams.set("enable_logging", elevenlabsParams.enable_logging ? "true" : "false");
	}
	const query = queryParams.toString();

	const requestBody: Record<string, any> = {
		text: typedPayload.input,
		model_id: modelId,
	};
	if (typeof elevenlabsParams.language_code === "string" && elevenlabsParams.language_code.trim()) {
		requestBody.language_code = elevenlabsParams.language_code.trim();
	}
	const voiceSettings =
		elevenlabsParams.voice_settings && typeof elevenlabsParams.voice_settings === "object"
			? { ...elevenlabsParams.voice_settings }
			: undefined;
	if (
		typeof typedPayload.speed === "number" &&
		Number.isFinite(typedPayload.speed) &&
		typedPayload.speed > 0
	) {
		const settings = voiceSettings ?? {};
		if (settings.speed == null) {
			settings.speed = typedPayload.speed;
		}
		if (Object.keys(settings).length > 0) {
			requestBody.voice_settings = settings;
		}
	} else if (voiceSettings && Object.keys(voiceSettings).length > 0) {
		requestBody.voice_settings = voiceSettings;
	}
	if (typeof elevenlabsParams.seed === "number" && Number.isInteger(elevenlabsParams.seed)) {
		requestBody.seed = elevenlabsParams.seed;
	}
	if (Array.isArray(elevenlabsParams.pronunciation_dictionary_locators)) {
		requestBody.pronunciation_dictionary_locators = elevenlabsParams.pronunciation_dictionary_locators;
	}

	const res = await fetch(
		`${baseUrl}/v1/text-to-speech/${encodeURIComponent(voiceId)}${query ? `?${query}` : ""}`,
		{
		method: "POST",
		headers: {
			"xi-api-key": keyInfo.key,
			"Content-Type": "application/json",
		},
		body: JSON.stringify(requestBody),
	},
	);

	const bill = {
		cost_cents: 0,
		currency: "USD" as const,
		usage: undefined as any,
		upstream_id: res.headers.get("request-id") || res.headers.get("x-request-id"),
		finish_reason: null,
	};

	if (res.ok && args.pricingCard) {
		const usageMeters = { requests: 1 };
		const pricedUsage = computeBill(usageMeters, args.pricingCard, { model: modelId });
		bill.cost_cents = pricedUsage.pricing.total_cents;
		bill.currency = pricedUsage.pricing.currency;
		bill.usage = pricedUsage;
	}

	return {
		kind: "completed",
		upstream: res,
		bill,
		keySource: keyInfo.source,
		byokKeyId: keyInfo.byokId,
	};
}
