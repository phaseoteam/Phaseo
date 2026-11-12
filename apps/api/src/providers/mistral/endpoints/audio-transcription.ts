// Purpose: Native Mistral audio transcription transport.
// Why: Mistral's Voxtral request and response contract differs from OpenAI's transcription models.
// How: Maps the shared transcription request to Mistral multipart fields and preserves JSON/SSE responses.

import type { AdapterResult, ProviderExecuteArgs } from "../../types";
import { AudioTranscriptionSchema, type AudioTranscriptionRequest } from "@core/schemas";
import { buildAdapterPayload } from "../../utils";
import {
	openAICompatHeaders,
	openAICompatUrl,
	resolveOpenAICompatKey,
} from "../../openai-compatible/config";
import { upstreamTestHeaders } from "@providers/shared/testing";
import { computeBillAfterProviderCharge } from "@pipeline/pricing/engine";

function invalidParameterResponse(param: string, message: string): Response {
	return new Response(
		JSON.stringify({ error: { type: "invalid_request_error", message, param } }),
		{ status: 400, headers: { "Content-Type": "application/json" } },
	);
}

function usageMeters(usage: unknown): Record<string, any> {
	const source = usage && typeof usage === "object" ? usage as Record<string, any> : {};
	const audioSeconds = Number(source.prompt_audio_seconds ?? 0);
	return {
		...source,
		requests: Number(source.request_count ?? 1),
		...(Number.isFinite(audioSeconds) && audioSeconds >= 0
			? { input_audio_seconds: audioSeconds, input_audio_minutes: audioSeconds / 60 }
			: {}),
	};
}

function pricedBill(usage: unknown, args: ProviderExecuteArgs, upstreamId: string | null) {
	const meters = usageMeters(usage);
	const pricedUsage = computeBillAfterProviderCharge(meters, args.pricingCard);
	return {
		cost_cents: Number(pricedUsage?.pricing?.total_cents ?? 0),
		currency: "USD" as const,
		usage: pricedUsage as any,
		upstream_id: upstreamId,
		finish_reason: null,
	};
}

async function collectStreamUsage(stream: ReadableStream<Uint8Array>): Promise<Record<string, any> | undefined> {
	const reader = stream.getReader();
	const decoder = new TextDecoder();
	let buffer = "";
	let usage: Record<string, any> | undefined;
	const consume = (frame: string) => {
		const data = frame
			.split(/\r?\n/)
			.filter((line) => line.startsWith("data:"))
			.map((line) => line.slice(5).trim())
			.join("\n");
		if (!data) return;
		try {
			const event = JSON.parse(data);
			if (event?.usage && typeof event.usage === "object") usage = event.usage;
		} catch {
			// Preserve malformed provider events for the client while accounting remains best effort.
		}
	};
	while (true) {
		const { value, done } = await reader.read();
		buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
		let boundary: number;
		while ((boundary = buffer.search(/\r?\n\r?\n/)) >= 0) {
			consume(buffer.slice(0, boundary));
			buffer = buffer.slice(boundary).replace(/^\r?\n\r?\n/, "");
		}
		if (done) break;
	}
	if (buffer.trim()) consume(buffer);
	return usage;
}

export async function exec(args: ProviderExecuteArgs): Promise<AdapterResult> {
	const keyInfo = await resolveOpenAICompatKey(args);
	const adapterPayload = buildAdapterPayload(AudioTranscriptionSchema, args.body, []).adapterPayload as AudioTranscriptionRequest;
	const body: AudioTranscriptionRequest = {
		...adapterPayload,
		model: args.providerModelSlug || adapterPayload.model,
	};

	const unsupported: Array<[string, unknown]> = [
		["response_format", body.response_format],
		["prompt", body.prompt],
		["languages", body.languages],
		["keywords", body.keywords],
		["include", body.include],
		["chunking_strategy", body.chunking_strategy],
		["known_speaker_names", body.known_speaker_names],
		["known_speaker_references", body.known_speaker_references],
	];
	const invalid = unsupported.find(([, value]) => value !== undefined);
	if (invalid) {
		return {
			kind: "completed",
			upstream: invalidParameterResponse(invalid[0], `${invalid[0]} is not supported by Mistral audio transcriptions.`),
			bill: pricedBill(undefined, args, null),
			keySource: keyInfo.source,
			byokKeyId: keyInfo.byokId,
		};
	}

	const form = new FormData();
	form.append("model", body.model);
	if (body.file) {
		const filename = typeof File !== "undefined" && body.file instanceof File && body.file.name
			? body.file.name
			: "audio";
		form.append("file", body.file, filename);
	}
	if (body.file_url) form.append("file_url", body.file_url);
	if (body.file_id) form.append("file_id", body.file_id);
	if (body.language) form.append("language", body.language);
	if (typeof body.temperature === "number") form.append("temperature", String(body.temperature));
	if (typeof body.stream === "boolean") form.append("stream", String(body.stream));
	if (typeof body.diarize === "boolean") form.append("diarize", String(body.diarize));
	for (const value of body.context_bias ?? []) form.append("context_bias", value);
	for (const value of body.timestamp_granularities ?? []) form.append("timestamp_granularities", value);

	const headers = openAICompatHeaders(args.providerId, keyInfo.key, upstreamTestHeaders(args.meta));
	delete headers["Content-Type"];
	const res = await (args.upstreamTiming?.fetch ?? fetch)(openAICompatUrl(args.providerId, "/audio/transcriptions"), {
		method: "POST",
		headers,
		body: form,
	});
	const upstreamId = res.headers.get("x-request-id") || res.headers.get("request-id");

	if (res.ok && body.stream === true && res.body) {
		const [clientStream, accountingStream] = res.body.tee();
		return {
			kind: "stream",
			upstream: res,
			stream: clientStream,
			usageFinalizer: async () => pricedBill(await collectStreamUsage(accountingStream), args, upstreamId),
			bill: pricedBill(undefined, args, upstreamId),
			keySource: keyInfo.source,
			byokKeyId: keyInfo.byokId,
		};
	}

	const json = await res.clone().json().catch(() => undefined);
	const meters = usageMeters(json?.usage);
	return {
		kind: "completed",
		upstream: res,
		bill: pricedBill(json?.usage, args, upstreamId),
		normalized: json && typeof json === "object" ? { ...json, usage: meters } : undefined,
		keySource: keyInfo.source,
		byokKeyId: keyInfo.byokId,
	};
}
