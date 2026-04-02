// Purpose: Executor for google / music-generate.
// Why: Runs Lyria music generation via Gemini generateContent and normalizes to IR.
// How: Builds Gemini contents from prompt/image inputs and extracts inline audio output.

import type { IRContentPart, IRMusicGenerateRequest, IRMusicGenerateResponse } from "@core/ir";
import type { ExecutorExecuteArgs, ExecutorResult } from "@executors/types";
import { getBindings } from "@/runtime/env";
import { resolveProviderKey } from "@providers/keys";
import { googleUsageMetadataToIRUsage } from "@providers/google-ai-studio/usage";
import { saveMusicJobMeta } from "@core/music-jobs";
import { resolveGoogleModelCandidates } from "../shared/model";
import { irPartsToGeminiParts } from "../shared/media";
import type { ProviderExecutor } from "../../types";

const GOOGLE_API_BASE = "https://generativelanguage.googleapis.com";

type InlineAudio = {
	data?: string;
	mimeType?: string;
};

function resolveGeminiBaseUrl(bindings: Record<string, string | undefined>): string {
	const baseRoot = String(
		bindings.GOOGLE_BASE_URL || bindings.GOOGLE_AI_STUDIO_BASE_URL || GOOGLE_API_BASE,
	).replace(/\/+$/, "");
	return /\/v1(beta)?$/i.test(baseRoot) ? baseRoot : `${baseRoot}/v1beta`;
}

function nonEmptyString(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function parseDataUrl(value: string): { mimeType: string; data: string } | null {
	const match = /^data:([^;,]+)?;base64,(.+)$/i.exec(value);
	if (!match) return null;
	return {
		mimeType: match[1] || "image/png",
		data: match[2] || "",
	};
}

function toImagePart(candidate: unknown, mimeHint?: string): Extract<IRContentPart, { type: "image" }> | null {
	if (typeof candidate === "string") {
		const trimmed = candidate.trim();
		if (!trimmed) return null;
		const dataUrl = parseDataUrl(trimmed);
		if (dataUrl) {
			return {
				type: "image",
				source: "data",
				data: dataUrl.data,
				mimeType: dataUrl.mimeType,
			};
		}
		if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith("gs://")) {
			return {
				type: "image",
				source: "url",
				data: trimmed,
				mimeType: mimeHint,
			};
		}
		return {
			type: "image",
			source: "data",
			data: trimmed,
			mimeType: mimeHint || "image/png",
		};
	}

	if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
	const source = candidate as Record<string, any>;
	const mimeType =
		nonEmptyString(source.mimeType) ??
		nonEmptyString(source.mime_type) ??
		nonEmptyString(source.imageMimeType) ??
		nonEmptyString(source.image_mime_type) ??
		mimeHint;
	const data =
		nonEmptyString(source.data) ??
		nonEmptyString(source.base64) ??
		nonEmptyString(source.bytes) ??
		nonEmptyString(source.imageBytes) ??
		nonEmptyString(source.image_bytes);
	if (data) {
		const dataUrl = parseDataUrl(data);
		if (dataUrl) {
			return {
				type: "image",
				source: "data",
				data: dataUrl.data,
				mimeType: dataUrl.mimeType,
			};
		}
		return {
			type: "image",
			source: "data",
			data,
			mimeType: mimeType || "image/png",
		};
	}

	const imageUrlValue =
		source.image_url && typeof source.image_url === "object" && !Array.isArray(source.image_url)
			? nonEmptyString(source.image_url.url)
			: nonEmptyString(source.image_url);
	const url =
		imageUrlValue ??
		nonEmptyString(source.url) ??
		nonEmptyString(source.uri) ??
		nonEmptyString(source.image) ??
		nonEmptyString(source.gcsUri) ??
		nonEmptyString(source.gcs_uri);
	if (!url) return null;

	return {
		type: "image",
		source: "url",
		data: url,
		mimeType,
	};
}

function toTextPart(value: unknown): Extract<IRContentPart, { type: "text" }> | null {
	const text = nonEmptyString(value);
	if (!text) return null;
	return { type: "text", text };
}

function extractRawInputParts(rawRequest: Record<string, any>): IRContentPart[] {
	const parts: IRContentPart[] = [];
	const input = rawRequest.input;

	const pushText = (value: unknown) => {
		const part = toTextPart(value);
		if (part) parts.push(part);
	};
	const pushImage = (value: unknown, mimeHint?: string) => {
		const part = toImagePart(value, mimeHint);
		if (part) parts.push(part);
	};

	if (typeof input === "string") {
		pushText(input);
	}
	if (Array.isArray(input)) {
		for (const item of input) {
			if (typeof item === "string") {
				pushText(item);
				continue;
			}
			if (!item || typeof item !== "object") continue;
			const record = item as Record<string, any>;
			const type = nonEmptyString(record.type)?.toLowerCase();
			if (type === "text" || type === "input_text") {
				pushText(record.text);
				continue;
			}
			if (type === "image" || type === "input_image" || type === "image_url") {
				pushImage(record);
			}
		}
	}
	if (input && typeof input === "object" && !Array.isArray(input)) {
		const inputRecord = input as Record<string, any>;
		pushText(inputRecord.text);
		pushImage(inputRecord.image, nonEmptyString(inputRecord.mimeType) ?? nonEmptyString(inputRecord.mime_type));
		pushImage(inputRecord.image_url);
		pushImage(inputRecord.url, nonEmptyString(inputRecord.mimeType) ?? nonEmptyString(inputRecord.mime_type));
		if (Array.isArray(inputRecord.images)) {
			for (const image of inputRecord.images) pushImage(image);
		}
	}

	pushImage(rawRequest.image, nonEmptyString(rawRequest.image_mime_type) ?? nonEmptyString(rawRequest.imageMimeType));
	pushImage(rawRequest.input_image);
	if (Array.isArray(rawRequest.images)) {
		for (const image of rawRequest.images) pushImage(image);
	}
	if (Array.isArray(rawRequest.input_images)) {
		for (const image of rawRequest.input_images) pushImage(image);
	}

	return parts;
}

function resolveResponseModalities(rawRequest: Record<string, any>): string[] {
	const candidates = [
		rawRequest.google?.responseModalities,
		rawRequest.google?.response_modalities,
		rawRequest.responseModalities,
		rawRequest.response_modalities,
	];
	for (const candidate of candidates) {
		if (!Array.isArray(candidate)) continue;
		const modalities = candidate
			.map((value) => nonEmptyString(value))
			.filter((value): value is string => Boolean(value))
			.map((value) => value.toUpperCase());
		if (modalities.length > 0) return modalities;
	}
	return ["AUDIO", "TEXT"];
}

async function buildRequestBody(ir: IRMusicGenerateRequest): Promise<Record<string, any> | null> {
	const rawRequest =
		ir.rawRequest && typeof ir.rawRequest === "object" && !Array.isArray(ir.rawRequest)
			? (ir.rawRequest as Record<string, any>)
			: {};
	const parts: IRContentPart[] = [];
	const promptPart = toTextPart(ir.prompt ?? rawRequest.prompt);
	if (promptPart) parts.push(promptPart);
	parts.push(...extractRawInputParts(rawRequest));

	if (!parts.length) return null;

	const geminiParts = await irPartsToGeminiParts(parts);
	if (!geminiParts.length) return null;

	const generationConfig =
		rawRequest.google?.generationConfig &&
		typeof rawRequest.google.generationConfig === "object" &&
		!Array.isArray(rawRequest.google.generationConfig)
			? { ...rawRequest.google.generationConfig }
			: rawRequest.generationConfig &&
					typeof rawRequest.generationConfig === "object" &&
					!Array.isArray(rawRequest.generationConfig)
				? { ...rawRequest.generationConfig }
				: {};
	generationConfig.responseModalities = resolveResponseModalities(rawRequest);

	return {
		contents: [{ role: "user", parts: geminiParts }],
		generationConfig,
	};
}

function extractInlineAudio(part: any): InlineAudio | null {
	if (!part || typeof part !== "object") return null;
	if (part.inlineData && typeof part.inlineData === "object") {
		return {
			data: part.inlineData.data,
			mimeType: part.inlineData.mimeType ?? part.inlineData.mime_type,
		};
	}
	if (part.inline_data && typeof part.inline_data === "object") {
		return {
			data: part.inline_data.data,
			mimeType: part.inline_data.mimeType ?? part.inline_data.mime_type,
		};
	}
	return null;
}

function extractCandidateParts(json: any): any[] {
	const candidates = Array.isArray(json?.candidates) ? json.candidates : [];
	for (const candidate of candidates) {
		const parts = candidate?.content?.parts;
		if (Array.isArray(parts)) return parts;
	}
	return [];
}

function parseGoogleMusicResponse(
	json: any,
	requestId: string,
	model: string,
	provider: string,
): IRMusicGenerateResponse | null {
	const parts = extractCandidateParts(json);
	const audioPart = parts.map((part) => extractInlineAudio(part)).find((value) => Boolean(value?.data));
	if (!audioPart?.data) return null;
	const text = parts
		.map((part) => nonEmptyString(part?.text))
		.filter((value): value is string => Boolean(value))
		.join("\n");

	return {
		id: requestId,
		nativeId: nonEmptyString(json?.responseId) ?? nonEmptyString(json?.id),
		model,
		provider,
		status: "completed",
		audioBase64: audioPart.data,
		result: text ? { ...json, text } : json,
		usage: googleUsageMetadataToIRUsage(json?.usageMetadata),
		rawResponse: json,
	};
}

function invalidRequestResponse(reason: string, message: string): Response {
	return new Response(
		JSON.stringify({
			error: {
				type: "invalid_request_error",
				reason,
				message,
			},
		}),
		{ status: 400, headers: { "Content-Type": "application/json" } },
	);
}

function shouldRetryWithNextModel(upstream: Response, errorJson: any): boolean {
	if (upstream.status === 404) return true;
	if (upstream.status !== 400) return false;
	const message = String(
		errorJson?.error?.message ??
		errorJson?.error?.status ??
		errorJson?.message ??
		"",
	).toLowerCase();
	if (!message) return false;
	return (
		message.includes("model") &&
		(
			message.includes("not found") ||
			message.includes("not support") ||
			message.includes("unsupported") ||
			message.includes("does not exist") ||
			message.includes("invalid")
		)
	);
}

export async function execute(args: ExecutorExecuteArgs): Promise<ExecutorResult> {
	const ir = args.ir as IRMusicGenerateRequest;
	const requestedModel = args.providerModelSlug || ir.model || "lyria-3-pro-preview";
	const modelCandidates = resolveGoogleModelCandidates(requestedModel);
	const models = modelCandidates.length > 0 ? modelCandidates : [requestedModel];
	const bodyObject = await buildRequestBody(ir);
	if (!bodyObject) {
		return {
			kind: "completed",
			ir: undefined,
			bill: {
				cost_cents: 0,
				currency: "USD",
				usage: undefined as any,
				upstream_id: undefined,
				finish_reason: null,
			},
			upstream: invalidRequestResponse(
				"missing_prompt_or_input",
				"music.generate for Google requires prompt text or image input.",
			),
			keySource: "gateway",
			byokKeyId: null,
		};
	}

	const requestBody = JSON.stringify(bodyObject);
	const mappedRequest = (args.meta.echoUpstreamRequest || args.meta.returnUpstreamRequest)
		? requestBody
		: undefined;
	const bindings = getBindings() as unknown as Record<string, string | undefined>;
	const keyInfo = resolveProviderKey(
		{ providerId: args.providerId, byokMeta: args.byokMeta, forceGatewayKey: args.meta.forceGatewayKey },
		() => bindings.GOOGLE_AI_STUDIO_API_KEY,
	);
	const baseUrl = resolveGeminiBaseUrl(bindings);
	let lastUpstream: Response | null = null;
	let lastErrorJson: any = null;

	for (let index = 0; index < models.length; index += 1) {
		const model = models[index] || requestedModel;
		const isLastCandidate = index >= models.length - 1;
		const upstream = await fetch(
			`${baseUrl}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(keyInfo.key)}`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: requestBody,
			},
		);
		lastUpstream = upstream;

		const bill = {
			cost_cents: 0,
			currency: "USD",
			usage: undefined as any,
			upstream_id: upstream.headers.get("x-request-id") ?? undefined,
			finish_reason: null as string | null,
		};

		if (!upstream.ok) {
			const errorJson = await upstream.clone().json().catch(() => null);
			lastErrorJson = errorJson;
			if (!isLastCandidate && shouldRetryWithNextModel(upstream, errorJson)) {
				continue;
			}
			return {
				kind: "completed",
				ir: undefined,
				bill,
				upstream,
				keySource: keyInfo.source,
				byokKeyId: keyInfo.byokId,
				mappedRequest,
				rawResponse: errorJson ?? undefined,
			};
		}

		const json = await upstream.json().catch(() => ({}));
		const irResponse = parseGoogleMusicResponse(json, args.requestId, model, args.providerId);
		if (!irResponse) {
			return {
				kind: "completed",
				ir: undefined,
				bill,
				upstream: new Response(
					JSON.stringify({
						error: {
							type: "upstream_protocol_error",
							message: "google_music_audio_output_missing",
						},
					}),
					{ status: 502, headers: { "Content-Type": "application/json" } },
				),
				keySource: keyInfo.source,
				byokKeyId: keyInfo.byokId,
				mappedRequest,
				rawResponse: json,
			};
		}

		try {
			await saveMusicJobMeta(args.teamId, args.requestId, {
				provider: args.providerId,
				model,
				status: irResponse.status,
				nativeResponseId: irResponse.nativeId ?? null,
				audioBase64: irResponse.audioBase64 ?? null,
				result: irResponse.result ?? null,
				rawResponse: irResponse.rawResponse ?? null,
				createdAt: Date.now(),
			});
		} catch (storeErr) {
			console.error("google_music_job_meta_store_failed", {
				error: storeErr,
				teamId: args.teamId,
				musicId: args.requestId,
			});
		}

		return {
			kind: "completed",
			ir: irResponse,
			bill,
			upstream,
			keySource: keyInfo.source,
			byokKeyId: keyInfo.byokId,
			mappedRequest,
			rawResponse: json,
		};
	}

	return {
		kind: "completed",
		ir: undefined,
		bill: {
			cost_cents: 0,
			currency: "USD",
			usage: undefined as any,
			upstream_id: lastUpstream?.headers.get("x-request-id") ?? undefined,
			finish_reason: null,
		},
		upstream:
			lastUpstream ??
			new Response(
				JSON.stringify({
					error: {
						type: "upstream_error",
						message: "google_music_request_failed",
					},
				}),
				{ status: 502, headers: { "Content-Type": "application/json" } },
			),
		keySource: keyInfo.source,
		byokKeyId: keyInfo.byokId,
		mappedRequest,
		rawResponse: lastErrorJson ?? undefined,
	};
}

export const executor: ProviderExecutor = execute;
