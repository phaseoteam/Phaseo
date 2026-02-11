// Purpose: Provider adapter module.
// Why: Encapsulates provider-specific configuration and endpoint mapping.
// How: Exposes provider-specific helpers for routing and execution.

import type { AdapterResult, ProviderExecuteArgs } from "../../types";
import { AudioTranscriptionSchema, type AudioTranscriptionRequest } from "@core/schemas";
import { buildAdapterPayload } from "../../utils";
import { resolveProviderKey } from "../../keys";
import { getBindings } from "@/runtime/env";
import { computeBill } from "@pipeline/pricing/engine";

function resolveElevenLabsModelSlug(requestedModel: string, providerModelSlug?: string | null): string {
	if (providerModelSlug && providerModelSlug.trim().length > 0) {
		return providerModelSlug.trim();
	}
	const tail = requestedModel.includes("/") ? requestedModel.split("/").pop() ?? requestedModel : requestedModel;
	const normalized = tail.replace(/-\d{4}-\d{2}-\d{2}$/i, "");
	return normalized.replace(/-/g, "_");
}

function decodeAudioBase64(input: string): { bytes: Uint8Array; mimeType: string; filename: string } {
	const trimmed = input.trim();
	const dataUrl = trimmed.match(/^data:([^;]+);base64,(.+)$/);
	let base64 = trimmed;
	let mimeType = "audio/wav";

	if (dataUrl) {
		mimeType = dataUrl[1] || mimeType;
		base64 = dataUrl[2] || "";
	}

	const binary = atob(base64);
	const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
	let ext = "wav";
	if (mimeType.includes("mpeg") || mimeType.includes("mp3")) ext = "mp3";
	else if (mimeType.includes("ogg")) ext = "ogg";
	else if (mimeType.includes("aac")) ext = "aac";
	else if (mimeType.includes("flac")) ext = "flac";
	return { bytes, mimeType, filename: `audio.${ext}` };
}

function invalidAudioResponse(): Response {
	return new Response(
		JSON.stringify({
			error: {
				type: "invalid_request_error",
				message: 'Invalid "audio_b64" value for ElevenLabs audio.transcription.',
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

	const { adapterPayload } = buildAdapterPayload(AudioTranscriptionSchema, args.body, []);
	const typedPayload = adapterPayload as AudioTranscriptionRequest;
	const bindings = getBindings() as unknown as Record<string, string | undefined>;
	const baseUrl = String(bindings.ELEVENLABS_BASE_URL || "https://api.elevenlabs.io").replace(/\/+$/, "");
	const modelId = resolveElevenLabsModelSlug(typedPayload.model, args.providerModelSlug);

	const form = new FormData();
	form.append("model_id", modelId);
	if (typedPayload.language) {
		form.append("language_code", typedPayload.language);
	}

	if (typedPayload.audio_url) {
		form.append("cloud_storage_url", typedPayload.audio_url);
	} else if (typedPayload.audio_b64) {
		let decoded: { bytes: Uint8Array; mimeType: string; filename: string };
		try {
			decoded = decodeAudioBase64(typedPayload.audio_b64);
		} catch {
			return {
				kind: "completed",
				upstream: invalidAudioResponse(),
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
		form.append("file", new Blob([Uint8Array.from(decoded.bytes)], { type: decoded.mimeType }), decoded.filename);
	}

	const res = await fetch(`${baseUrl}/v1/speech-to-text`, {
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
			const usageMeters = {
				requests: 1,
				...(json.usage && typeof json.usage === "object" ? json.usage : {}),
			};
			normalized = {
				...json,
				usage: usageMeters,
			};
			if (args.pricingCard) {
				const pricedUsage = computeBill(usageMeters, args.pricingCard, { model: modelId });
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
