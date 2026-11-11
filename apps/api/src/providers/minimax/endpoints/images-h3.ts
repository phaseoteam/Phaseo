// Purpose: MiniMax H3-Image text-to-image and reference-image editing.
// Why: H3-Image uses MiniMax's OpenAI-style /images/generations and JSON
// /images/edits routes, bills by tokens, and returns per-image failures inside
// an HTTP 200 response. Image-01's native /image_generation contract does not apply.
// https://platform.minimax.io/docs/api-reference/image-generation-h3-generations
// https://platform.minimax.io/docs/api-reference/image-generation-h3-edits

import { ImagesEditSchema, ImagesGenerationSchema } from "@core/schemas";
import { buildImagePricingRequestOptions, normalizeOpenAIImageTokenUsage } from "@core/image-request-options";
import { computeBillAfterProviderCharge } from "@pipeline/pricing/engine";
import { upstreamTestHeaders } from "@providers/shared/testing";
import type { AdapterResult, ProviderExecuteArgs } from "../../types";
import { openAICompatHeaders, openAICompatUrl, resolveOpenAICompatKey } from "../../openai-compatible/config";
import { sanitizePayload } from "../../utils";

const H3_IMAGE_MODELS = new Set(["minimax-h3-image", "minimax-h3-image-highspeed"]);
const AREAS = new Set(["1K", "2K", "4K"]);
const MIN_PIXELS = 655_360;
const MAX_PIXELS = 20_000_000;
const MAX_PROMPT_CHARS = 32_000;
const MAX_REFERENCE_IMAGES = 16;

/** True for MiniMax's H3-Image upstream model IDs (standard and Highspeed). */
export function isMiniMaxH3ImageModel(model: string | null | undefined): boolean {
	const normalized = String(model ?? "").trim().toLowerCase().replace(/^minimax\//, "");
	return H3_IMAGE_MODELS.has(normalized);
}

function errorResult(status: number, message: string, param?: string, type = "invalid_request_error"): AdapterResult {
	const normalized = { error: { type, message, ...(param ? { param } : {}) } };
	return {
		kind: "completed",
		upstream: new Response(JSON.stringify(normalized), { status, headers: { "content-type": "application/json" } }),
		normalized,
		bill: { cost_cents: 0, currency: "USD", usage: undefined, upstream_id: null, finish_reason: null },
		keySource: null,
		byokKeyId: null,
	};
}

function isRatioInRange(width: number, height: number): boolean {
	return width * 3 >= height && height * 3 >= width;
}

/** `X:Y` with integers from 1 to 300 and a ratio between 1:3 and 3:1. */
function isValidAspectRatio(value: string): boolean {
	const match = /^(\d{1,3}):(\d{1,3})$/.exec(value);
	if (!match) return false;
	const [x, y] = [Number(match[1]), Number(match[2])];
	return x >= 1 && x <= 300 && y >= 1 && y <= 300 && isRatioInRange(x, y);
}

type SizeFields = { size?: string; aspect_ratio?: string; area?: string };

/**
 * Map the gateway's size fields onto MiniMax's three: `size` (`auto` or
 * WIDTHxHEIGHT), `aspect_ratio` and `area`. As a convenience, `size` may also
 * be an aspect ratio (16:9) or an area (2K), and `width` + `height` or
 * `resolution` are accepted.
 */
function mapSize(raw: Record<string, any>): SizeFields | AdapterResult {
	const out: SizeFields = {};
	const sizeValue = typeof raw.size === "string" ? raw.size.trim() : undefined;
	const resolution = typeof raw.resolution === "string" ? raw.resolution.trim().toUpperCase() : undefined;
	let aspectRatio = typeof raw.aspect_ratio === "string" ? raw.aspect_ratio.trim() : undefined;
	let area = typeof raw.area === "string" ? raw.area.trim().toUpperCase() : undefined;
	let explicit: { width: number; height: number } | undefined;

	if ((raw.width == null) !== (raw.height == null)) {
		return errorResult(400, "MiniMax width and height must be provided together", raw.width == null ? "width" : "height");
	}
	if (raw.width != null) explicit = { width: Number(raw.width), height: Number(raw.height) };

	if (sizeValue && sizeValue.toLowerCase() !== "auto") {
		const dims = /^(\d+)x(\d+)$/i.exec(sizeValue);
		if (dims) explicit = { width: Number(dims[1]), height: Number(dims[2]) };
		else if (AREAS.has(sizeValue.toUpperCase())) area = area ?? sizeValue.toUpperCase();
		else if (sizeValue.includes(":")) aspectRatio = aspectRatio ?? sizeValue;
		else return errorResult(400, "MiniMax size must be auto, WIDTHxHEIGHT, an aspect ratio such as 16:9, or 1K, 2K or 4K", "size");
	}
	if (resolution && resolution !== "AUTO") {
		if (!AREAS.has(resolution)) return errorResult(400, "MiniMax resolution must be 1K, 2K or 4K", "resolution");
		area = area ?? resolution;
	}

	if (explicit) {
		const { width, height } = explicit;
		if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
			return errorResult(400, "MiniMax width and height must be positive integers", "size");
		}
		const pixels = width * height;
		if (pixels < MIN_PIXELS || pixels > MAX_PIXELS) {
			return errorResult(400, "MiniMax H3-Image sizes must cover 655,360 to 20,000,000 pixels", "size");
		}
		if (!isRatioInRange(width, height)) {
			return errorResult(400, "MiniMax H3-Image sizes must have an aspect ratio between 1:3 and 3:1", "size");
		}
		if ((aspectRatio && aspectRatio !== "auto") || area) {
			return errorResult(400, "MiniMax H3-Image does not accept aspect_ratio or area with an explicit WIDTHxHEIGHT size", "size");
		}
		out.size = `${width}x${height}`;
		return out;
	}

	if (aspectRatio && aspectRatio !== "auto") {
		if (!isValidAspectRatio(aspectRatio)) {
			return errorResult(400, "MiniMax aspect_ratio must be X:Y with integers from 1 to 300 and a ratio between 1:3 and 3:1", "aspect_ratio");
		}
		out.aspect_ratio = aspectRatio;
	}
	if (area) {
		if (!AREAS.has(area)) return errorResult(400, "MiniMax area must be 1K, 2K or 4K", "area");
		out.area = area;
	}
	return out;
}

function toDataUrl(blob: Blob): Promise<string> {
	return blob.arrayBuffer().then((buffer) => {
		const bytes = new Uint8Array(buffer);
		let binary = "";
		for (let offset = 0; offset < bytes.length; offset += 0x8000) {
			binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
		}
		return `data:${blob.type || "image/jpeg"};base64,${btoa(binary)}`;
	});
}

async function mapRequest(args: ProviderExecuteArgs, model: string): Promise<Record<string, any> | AdapterResult> {
	const raw = (args.body ?? {}) as Record<string, any>;
	const isEdit = args.endpoint === "images.edits";
	const canonical: any = isEdit
		? sanitizePayload(ImagesEditSchema, raw)
		: sanitizePayload(ImagesGenerationSchema, raw);

	const prompt = String(canonical.prompt ?? "").trim();
	if (!prompt) return errorResult(400, "MiniMax image prompts must not be empty", "prompt");
	if (prompt.length > MAX_PROMPT_CHARS) return errorResult(400, "MiniMax H3-Image prompts must be at most 32,000 characters", "prompt");
	if (canonical.n != null && (canonical.n < 1 || canonical.n > 10)) return errorResult(400, "MiniMax H3-Image supports between 1 and 10 images", "n");

	for (const field of ["mask", "markup", "partial_images", "moderation", "style", "input_fidelity", "seed", "subject_reference"] as const) {
		if (raw[field] != null) return errorResult(400, `MiniMax H3-Image does not support ${field}`, field);
	}
	// The gateway returns a buffered response; MiniMax's SSE events are not relayed.
	if (raw.stream === true || raw.stream === "true") return errorResult(400, "MiniMax H3-Image streaming is not supported", "stream");
	if (raw.quality != null && raw.quality !== "auto") {
		return errorResult(400, "MiniMax H3-Image has no quality setting; use area (1K, 2K or 4K) instead", "quality");
	}
	if (raw.background != null && raw.background !== "auto" && raw.background !== "opaque") {
		return errorResult(400, "MiniMax H3-Image does not support transparent backgrounds", "background");
	}

	const sizeFields = mapSize(raw);
	if ("kind" in sizeFields) return sizeFields as AdapterResult;

	const responseFormat = canonical.response_format === "base64" ? "b64_json" : canonical.response_format;
	if (responseFormat != null && responseFormat !== "url" && responseFormat !== "b64_json") {
		return errorResult(400, "MiniMax response_format must be url or b64_json", "response_format");
	}
	const rawOutputFormat = typeof raw.output_format === "string" ? raw.output_format.trim().toLowerCase() : undefined;
	const outputFormat = rawOutputFormat === "jpg" ? "jpeg" : rawOutputFormat;
	if (outputFormat != null && !["jpeg", "png", "webp"].includes(outputFormat)) {
		return errorResult(400, "MiniMax output_format must be jpeg, png or webp", "output_format");
	}

	// `prompt_optimizer: false` is Image-01's switch; map it to H3's flag.
	const disableEnhancement = raw.disable_prompt_enhanced === true || raw.disable_prompt_enhanced === "true"
		|| raw.prompt_optimizer === false || raw.prompt_optimizer === "false";
	if (disableEnhancement) {
		if (isEdit) return errorResult(400, "MiniMax H3-Image always enhances edit prompts", "disable_prompt_enhanced");
		if (!sizeFields.size && !sizeFields.aspect_ratio) {
			return errorResult(400, "MiniMax H3-Image needs a WIDTHxHEIGHT size or an X:Y aspect_ratio when prompt enhancement is off", "disable_prompt_enhanced");
		}
	}

	const request: Record<string, any> = {
		model,
		prompt,
		...sizeFields,
		...(canonical.n != null ? { n: canonical.n } : {}),
		...(outputFormat ? { output_format: outputFormat } : {}),
		...(Number.isInteger(canonical.output_compression) ? { output_compression: canonical.output_compression } : {}),
		...(responseFormat ? { response_format: responseFormat } : {}),
		...(disableEnhancement ? { disable_prompt_enhanced: true } : {}),
	};

	if (isEdit) {
		const images = Array.isArray(canonical.image) ? canonical.image : [canonical.image];
		if (images.length < 1 || images.length > MAX_REFERENCE_IMAGES) {
			return errorResult(400, "MiniMax H3-Image edits take 1 to 16 reference images", "image");
		}
		request.images = await Promise.all(images.map(async (image: string | Blob) => ({
			image_url: typeof image === "string" ? image : await toDataUrl(image),
		})));
	}
	return request;
}

/**
 * MiniMax answers 402 when *its* account balance runs out. That is Phaseo's
 * upstream account, not the caller's, so it is reported as an upstream error.
 */
function mapErrorStatus(status: number): number {
	if (status === 402) return 502;
	return status;
}

function normalizeSuccess(json: any): any {
	const items = Array.isArray(json?.data) ? json.data : [];
	const data: Array<Record<string, unknown>> = [];
	const errors: Array<Record<string, unknown>> = [];
	items.forEach((item: any, index: number) => {
		if (item?.error) {
			errors.push({ index, code: item.error.code ?? null, message: item.error.message ?? null });
			return;
		}
		data.push({
			...(item?.url ? { url: item.url } : {}),
			...(item?.b64_json ? { b64_json: item.b64_json } : {}),
			...(item?.revised_prompt ? { revised_prompt: item.revised_prompt } : {}),
			...(item?.size ? { size: item.size } : {}),
		});
	});
	return {
		created: Number(json?.created) || Math.floor(Date.now() / 1000),
		data,
		...(json?.output_format ? { output_format: json.output_format } : {}),
		...(errors.length ? { errors } : {}),
		usage: json?.usage ?? null,
	};
}

export async function execH3(args: ProviderExecuteArgs): Promise<AdapterResult> {
	const model = args.providerModelSlug || args.model;
	const mapped = await mapRequest(args, model);
	if ((mapped as AdapterResult).kind === "completed") return mapped as AdapterResult;

	const keyInfo = await resolveOpenAICompatKey(args);
	const fetcher = args.upstreamTiming?.fetch ?? fetch;
	const path = args.endpoint === "images.edits" ? "/images/edits" : "/images/generations";
	// Neither MiniMax route is idempotent: a resubmitted request generates and
	// bills again. When the outcome is unknown, stop retries and fallbacks.
	const uncertain = (message: string): AdapterResult => {
		const normalized = { error: { type: "upstream_error", message } };
		return {
			kind: "completed",
			terminal: true,
			upstream: new Response(JSON.stringify(normalized), { status: 502, headers: { "content-type": "application/json" } }),
			normalized,
			bill: { cost_cents: 0, currency: "USD", usage: undefined, upstream_id: null, finish_reason: null },
			keySource: keyInfo.source,
			byokKeyId: keyInfo.byokId,
		};
	};
	let response: Response;
	try {
		response = await fetcher(openAICompatUrl(args.providerId, path), {
			method: "POST",
			headers: openAICompatHeaders(args.providerId, keyInfo.key, upstreamTestHeaders(args.meta)),
			body: JSON.stringify(mapped),
		});
	} catch {
		return uncertain("MiniMax image request outcome is uncertain; do not automatically resubmit.");
	}
	const json = await response.clone().json().catch(() => null);
	// A non-JSON reply (for example a proxy timeout) does not say whether MiniMax generated and billed.
	if (!json) return uncertain("MiniMax returned an unreadable image response; do not automatically resubmit.");
	const upstreamId = json?.request_id ?? response.headers.get("x-request-id") ?? null;

	const succeeded = Array.isArray(json?.data) && json.data.some((item: any) => item && !item.error && (item.url || item.b64_json));
	if (!response.ok || !succeeded) {
		const firstItemError = Array.isArray(json?.data) ? json.data.find((item: any) => item?.error)?.error : null;
		const message = json?.error?.message ?? firstItemError?.message ?? "MiniMax image generation failed";
		const type = firstItemError?.code ? `minimax_${firstItemError.code}` : (json?.error?.type ?? "upstream_error");
		const status = response.ok ? 502 : mapErrorStatus(response.status);
		const normalized = { error: { type, message } };
		return {
			kind: "completed",
			upstream: new Response(JSON.stringify(normalized), { status, headers: { "content-type": "application/json" } }),
			normalized,
			// MiniMax bills successful images only, so a total failure costs nothing.
			bill: { cost_cents: 0, currency: "USD", usage: undefined, upstream_id: upstreamId, finish_reason: null },
			keySource: keyInfo.source,
			byokKeyId: keyInfo.byokId,
		};
	}

	const normalized = normalizeSuccess(json);
	const usageMeters: Record<string, unknown> = normalizeOpenAIImageTokenUsage(json?.usage);
	usageMeters.requests = 1;
	usageMeters.output_image = Number(json?.usage?.generated_images) || normalized.data.length;
	normalized.usage = usageMeters;

	const bill = {
		cost_cents: 0,
		currency: "USD" as const,
		usage: undefined as any,
		upstream_id: upstreamId,
		finish_reason: null,
	};
	if (args.pricingCard) {
		const priced = computeBillAfterProviderCharge(
			usageMeters as Record<string, any>,
			args.pricingCard,
			buildImagePricingRequestOptions(args.body as any, usageMeters as any),
		);
		bill.cost_cents = priced.pricing.total_cents;
		bill.currency = priced.pricing.currency;
		bill.usage = priced;
	}
	return { kind: "completed", upstream: response, normalized, bill, keySource: keyInfo.source, byokKeyId: keyInfo.byokId };
}
