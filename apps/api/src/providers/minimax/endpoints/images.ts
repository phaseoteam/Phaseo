// Purpose: MiniMax native text-to-image and reference-image generation.
// Why: MiniMax uses one JSON /image_generation route for both capabilities,
// not OpenAI's /images/generations and multipart /images/edits routes.

import { ImagesEditSchema, ImagesGenerationSchema } from "@core/schemas";
import { buildImagePricingRequestOptions } from "@core/image-request-options";
import { computeBillAfterProviderCharge } from "@pipeline/pricing/engine";
import { upstreamTestHeaders } from "@providers/shared/testing";
import type { AdapterResult, ProviderExecuteArgs } from "../../types";
import { openAICompatHeaders, openAICompatUrl, resolveOpenAICompatKey } from "../../openai-compatible/config";
import { sanitizePayload } from "../../utils";

const ASPECT_RATIOS = new Set(["1:1", "16:9", "4:3", "3:2", "2:3", "3:4", "9:16", "21:9"]);

function errorResult(status: number, message: string, param?: string): AdapterResult {
	const normalized = { error: { type: "invalid_request_error", message, ...(param ? { param } : {}) } };
	const upstream = new Response(JSON.stringify(normalized), {
		status,
		headers: { "content-type": "application/json" },
	});
	return {
		kind: "completed",
		upstream,
		normalized,
		bill: { cost_cents: 0, currency: "USD", usage: undefined, upstream_id: null, finish_reason: null },
		keySource: null,
		byokKeyId: null,
	};
}

function dimensions(body: Record<string, any>): Record<string, unknown> {
	if (typeof body.aspect_ratio === "string") return { aspect_ratio: body.aspect_ratio };
	if (Number.isInteger(body.width) || Number.isInteger(body.height)) {
		return { width: body.width, height: body.height };
	}
	if (typeof body.size !== "string") return {};
	if (ASPECT_RATIOS.has(body.size)) return { aspect_ratio: body.size };
	const match = /^(\d+)x(\d+)$/i.exec(body.size);
	return match ? { width: Number(match[1]), height: Number(match[2]) } : {};
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

async function imageValue(value: string | Blob): Promise<string> {
	return typeof value === "string" ? value : toDataUrl(value);
}

async function mapRequest(args: ProviderExecuteArgs): Promise<Record<string, any> | AdapterResult> {
	const raw = args.body as Record<string, any>;
	const isEdit = args.endpoint === "images.edits";
	const canonical: any = isEdit
		? sanitizePayload(ImagesEditSchema, raw)
		: sanitizePayload(ImagesGenerationSchema, raw);
	const model = args.providerModelSlug || args.model || canonical.model;

	if (canonical.prompt.length > 1500) return errorResult(400, "MiniMax image prompts must be at most 1500 characters", "prompt");
	if (canonical.n != null && canonical.n > 9) return errorResult(400, "MiniMax supports between 1 and 9 images", "n");
	if (!isEdit && model !== "image-01") return errorResult(400, "MiniMax text-to-image supports model image-01", "model");
	if (isEdit && model !== "image-01" && model !== "image-01-live") {
		return errorResult(400, "MiniMax image-to-image supports image-01 and image-01-live", "model");
	}
	if (raw.mask != null) return errorResult(400, "MiniMax image-to-image does not support masks", "mask");
	if (raw.aspect_ratio != null && !ASPECT_RATIOS.has(raw.aspect_ratio)) {
		return errorResult(400, "MiniMax aspect_ratio is not supported", "aspect_ratio");
	}
	if ((raw.width == null) !== (raw.height == null)) {
		return errorResult(400, "MiniMax width and height must be provided together", raw.width == null ? "width" : "height");
	}
	for (const field of ["width", "height"] as const) {
		if (raw[field] != null && (!Number.isInteger(raw[field]) || raw[field] < 512 || raw[field] > 2048 || raw[field] % 8 !== 0)) {
			return errorResult(400, `MiniMax ${field} must be an integer from 512 to 2048 divisible by 8`, field);
		}
	}
	for (const field of ["quality", "stream", "partial_images", "output_format", "output_compression", "background", "moderation", "style", "input_fidelity"] as const) {
		if (raw[field] != null) return errorResult(400, `MiniMax image generation does not support ${field}`, field);
	}

	const responseFormat = canonical.response_format === "b64_json" ? "base64" : canonical.response_format;
	if (responseFormat != null && responseFormat !== "url" && responseFormat !== "base64") {
		return errorResult(400, "MiniMax response_format must be url or base64", "response_format");
	}
	const request: Record<string, any> = {
		model,
		prompt: canonical.prompt,
		...dimensions(raw),
		...(responseFormat != null ? { response_format: responseFormat } : {}),
		...(canonical.n != null ? { n: canonical.n } : {}),
		...(Number.isInteger(raw.seed) ? { seed: raw.seed } : {}),
		...(typeof raw.prompt_optimizer === "boolean" ? { prompt_optimizer: raw.prompt_optimizer } : {}),
	};

	if (isEdit) {
		const supplied = Array.isArray(raw.subject_reference) ? raw.subject_reference : null;
		if (supplied) {
			request.subject_reference = supplied;
		} else {
			const images = Array.isArray(canonical.image) ? canonical.image : [canonical.image];
			request.subject_reference = await Promise.all(images.map(async (image) => ({
				type: "character",
				image_file: await imageValue(image),
			})));
		}
	}

	return request;
}

function mapStatus(code: number): number {
	if (code === 1002) return 429;
	if (code === 1004 || code === 2049) return 401;
	if (code === 1008) return 402;
	if (code === 1026 || code === 2013) return 400;
	return 502;
}

function normalize(json: any): any {
	const urls = Array.isArray(json?.data?.image_urls) ? json.data.image_urls : [];
	const base64 = Array.isArray(json?.data?.image_base64) ? json.data.image_base64 : [];
	return {
		id: json?.id,
		created: Math.floor(Date.now() / 1000),
		data: [
			...urls.map((url: string) => ({ url })),
			...base64.map((b64_json: string) => ({ b64_json })),
		],
		usage: {
			requests: 1,
			output_image: Number(json?.metadata?.success_count) || urls.length + base64.length,
		},
		metadata: json?.metadata,
		base_resp: json?.base_resp,
	};
}

export async function exec(args: ProviderExecuteArgs): Promise<AdapterResult> {
	const mapped = await mapRequest(args);
	if (mapped.kind === "completed" || mapped.kind === "stream") return mapped as AdapterResult;
	const keyInfo = await resolveOpenAICompatKey(args);
	const fetcher = args.upstreamTiming?.fetch ?? fetch;
	const response = await fetcher(openAICompatUrl(args.providerId, "/image_generation"), {
		method: "POST",
		headers: openAICompatHeaders(args.providerId, keyInfo.key, upstreamTestHeaders(args.meta)),
		body: JSON.stringify(mapped),
	});
	const json = await response.clone().json().catch(() => null);
	const providerCode = Number(json?.base_resp?.status_code ?? 0);
	if (response.ok && providerCode !== 0) {
		const normalized = { error: { type: `minimax_${providerCode}`, message: json?.base_resp?.status_msg || "MiniMax image generation failed" } };
		const upstream = new Response(JSON.stringify(normalized), {
			status: mapStatus(providerCode),
			headers: { "content-type": "application/json" },
		});
		return {
			kind: "completed", upstream, normalized,
			bill: { cost_cents: 0, currency: "USD", usage: undefined, upstream_id: json?.id ?? null, finish_reason: null },
			keySource: keyInfo.source, byokKeyId: keyInfo.byokId,
		};
	}

	const normalized = normalize(json);
	const bill = {
		cost_cents: 0,
		currency: "USD" as const,
		usage: undefined as any,
		upstream_id: json?.id ?? response.headers.get("x-request-id"),
		finish_reason: null,
	};
	if (response.ok && args.pricingCard) {
		const priced = computeBillAfterProviderCharge(normalized.usage, args.pricingCard, buildImagePricingRequestOptions(args.body, normalized.usage));
		bill.cost_cents = priced.pricing.total_cents;
		bill.currency = priced.pricing.currency;
		bill.usage = priced;
	}
	return { kind: "completed", upstream: response, normalized, bill, keySource: keyInfo.source, byokKeyId: keyInfo.byokId };
}
