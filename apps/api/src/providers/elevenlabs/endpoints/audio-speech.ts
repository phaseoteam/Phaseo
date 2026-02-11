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

function resolveOutputFormat(format?: AudioSpeechRequest["format"]): string | undefined {
	if (format === "mp3") return "mp3_44100_128";
	if (format === "wav") return "pcm_44100";
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
	const outputFormat = resolveOutputFormat(typedPayload.format);
	const query = outputFormat ? `?output_format=${encodeURIComponent(outputFormat)}` : "";

	const res = await fetch(`${baseUrl}/v1/text-to-speech/${encodeURIComponent(voiceId)}${query}`, {
		method: "POST",
		headers: {
			"xi-api-key": keyInfo.key,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			text: typedPayload.input,
			model_id: modelId,
		}),
	});

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
