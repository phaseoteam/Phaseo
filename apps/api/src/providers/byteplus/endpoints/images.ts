// Purpose: Provider endpoint adapter for BytePlus ModelArk image generation.
// Why: Seedream image editing uses the Image generation API JSON endpoint, not OpenAI multipart edits.
// How: Maps gateway image generation/edit requests to /images/generations and normalizes OpenAI-like output.
// Which parameters and values each Seedream route accepts lives in the catalogue
// (v2_route_capabilities.params), which routing checks before this adapter runs. This
// adapter only translates fields into ModelArk's spelling and leaves value checks to
// routing and to BytePlus's own validation. Field names follow the ModelArk Image
// generation API reference (https://docs.byteplus.com/en/docs/ModelArk/1541523) and,
// for the early-access Seedream 5.5, byteplus-sa/ComfyUI-BytePlus-ModelArk#29.

import { ImagesEditSchema, ImagesGenerationSchema } from "@core/schemas";
import type { ImagesEditRequest, ImagesGenerationRequest } from "@core/schemas";
import { buildImagePricingRequestOptions } from "@core/image-request-options";
import { computeBillAfterProviderCharge } from "@pipeline/pricing/engine";
import type { AdapterResult, ProviderExecuteArgs } from "../../types";
import { openAICompatHeaders, openAICompatUrl, resolveOpenAICompatKey } from "../../openai-compatible/config";
import { sanitizePayload } from "../../utils";
import { upstreamTestHeaders } from "@providers/shared/testing";

type BytePlusImageRequest = {
	model: string;
	prompt: string;
	image?: string | string[];
	size?: string;
	n?: number;
	response_format?: string;
	user?: string;
	output_format?: string;
	background?: string;
	watermark: boolean;
	optimize_prompt_options?: Record<string, unknown>;
	sequential_image_generation?: "auto";
	sequential_image_generation_options?: { max_images: number };
	safety_identifier?: string;
};

type SeedreamFamily = "seedream-4.0" | "seedream-4.5" | "seedream-5.0-lite" | "seedream-5.0-flash" | "seedream-5.0-pro" | "seedream-5.5";

/** Families with group generation: ModelArk has no `n`, so several outputs use sequential_image_generation. */
const GROUP_GENERATION_FAMILIES: ReadonlySet<SeedreamFamily> = new Set(["seedream-4.0", "seedream-4.5", "seedream-5.0-lite"]);

const SIZE_PRESETS = ["1K", "1.5K", "2K", "3K", "4K"];

/**
 * Maps a provider slug (dola-seedream-5-5-261028, seedream-5-0-260128) or canonical
 * id (bytedance/seedream-5.0-pro) to its Seedream family; null for anything else.
 */
export function resolveSeedreamFamily(model: string): SeedreamFamily | null {
	const normalized = model
		.trim()
		.toLowerCase()
		.split("/")
		.pop()!
		.replace(/[._]/g, "-")
		.replace(/^dola-/, "")
		.replace(/-\d{6}$/, "");
	const match = /^seedream-(\d)-(\d)(?:-(lite|flash|pro))?$/.exec(normalized);
	if (!match) return null;
	const [, major, minor, tier] = match;
	const version = `${major}.${minor}`;
	if (version === "4.0" && !tier) return "seedream-4.0";
	if (version === "4.5" && !tier) return "seedream-4.5";
	if (version === "5.5" && !tier) return "seedream-5.5";
	if (version === "5.0") return `seedream-5.0-${tier ?? "lite"}` as SeedreamFamily;
	return null;
}

function resolveOutputImageCount(body: { n?: number }, normalized: any): number {
	const fromPayload = Array.isArray(normalized?.data) ? normalized.data.length : 0;
	if (fromPayload > 0) return fromPayload;
	if (typeof body.n === "number" && Number.isFinite(body.n) && body.n > 0) {
		return body.n;
	}
	return 1;
}

function resolveInputImageCount(body: ImagesGenerationRequest | ImagesEditRequest): number {
	const image = "image" in body ? body.image : undefined;
	if (Array.isArray(image)) return image.length;
	return image ? 1 : 0;
}

function normalizeResponse(json: any): any {
	if (!json || typeof json !== "object") return undefined;
	return {
		...json,
		created: json.created ?? Math.floor(Date.now() / 1000),
		data: Array.isArray(json.data) ? json.data : [],
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** BytePlus-only options from provider_params.byteplus (or .bytedance, or flat provider_params). */
function bytePlusProviderParams(rawBody: Record<string, any>): Record<string, unknown> {
	const params = rawBody.provider_params;
	if (!isRecord(params)) return {};
	for (const key of ["byteplus", "bytedance"]) {
		if (isRecord(params[key])) return params[key] as Record<string, unknown>;
	}
	return params;
}

/** ModelArk spells size presets in upper case ("1.5K"); WIDTHxHEIGHT passes through. */
function normalizeSize(size: string | undefined): string | undefined {
	if (size == null || size === "auto") return undefined;
	const preset = SIZE_PRESETS.find((value) => value.toLowerCase() === size.trim().toLowerCase());
	return preset ?? size;
}

function mapKnownFamily(
	request: BytePlusImageRequest,
	body: ImagesGenerationRequest | ImagesEditRequest,
	native: Record<string, unknown>,
	family: SeedreamFamily,
): void {
	// ModelArk documents no `n`. seed and stream are not sent either: the catalogue marks
	// them unsupported on these routes, and this adapter calls ModelArk without SSE.
	request.n = undefined;
	const n = typeof body.n === "number" ? body.n : 1;
	if (n > 1 && GROUP_GENERATION_FAMILIES.has(family)) {
		// max_images is an upper bound; billing counts the images actually returned.
		request.sequential_image_generation = "auto";
		request.sequential_image_generation_options = { max_images: n };
	}

	request.size = normalizeSize(body.size);
	if (body.output_format != null) request.output_format = body.output_format;

	// "auto" is ModelArk's default where it exists, so it is left out.
	if (body.background != null && body.background !== "auto") {
		request.background = body.background;
		// PNG keeps the alpha channel.
		if (body.background === "transparent" && request.output_format == null) request.output_format = "png";
	}

	if (isRecord(native.optimize_prompt_options)) {
		request.optimize_prompt_options = native.optimize_prompt_options;
	} else if (body.prompt_optimizer === true) {
		request.optimize_prompt_options = { mode: "standard" };
	}

	if (typeof native.safety_identifier === "string" && native.safety_identifier.trim()) {
		request.safety_identifier = native.safety_identifier;
	}
}

function mapBody(args: ProviderExecuteArgs): { request: BytePlusImageRequest; pricingInput: ImagesGenerationRequest | ImagesEditRequest } {
	const isEdit = args.endpoint === "images.edits";
	const body: ImagesGenerationRequest | ImagesEditRequest = isEdit
		? sanitizePayload(ImagesEditSchema, args.body)
		: sanitizePayload(ImagesGenerationSchema, args.body);
	const model = args.providerModelSlug || args.model || body.model;
	const pricingInput = { ...body, model };
	const native = bytePlusProviderParams((args.body ?? {}) as Record<string, any>);

	const request: BytePlusImageRequest = {
		model,
		prompt: body.prompt,
		// BytePlus's JSON edit API accepts string references only; multipart
		// Blob inputs are handled by file-capable providers such as OpenAI.
		image: isEdit ? (body as ImagesEditRequest).image as string | string[] : undefined,
		size: body.size,
		n: body.n,
		response_format: body.response_format,
		user: body.user,
		// ModelArk watermarks by default ("watermark boolean Default true"); the gateway
		// returns clean images unless the caller asks for the mark.
		watermark: native.watermark === true,
	};

	const family = resolveSeedreamFamily(model);
	if (family) mapKnownFamily(request, body, native, family);
	return { request, pricingInput };
}

export async function exec(args: ProviderExecuteArgs): Promise<AdapterResult> {
	const { request, pricingInput } = mapBody(args);
	const keyInfo = await resolveOpenAICompatKey(args);
	// The timing tracker counts a 2xx so a later pricing failure is not retried on another provider.
	const fetcher = args.upstreamTiming?.fetch ?? fetch;
	const res = await fetcher(openAICompatUrl(args.providerId, "/images/generations"), {
		method: "POST",
		headers: openAICompatHeaders(args.providerId, keyInfo.key, upstreamTestHeaders(args.meta)),
		body: JSON.stringify(request),
	});

	const bill = {
		cost_cents: 0,
		currency: "USD" as const,
		usage: undefined as any,
		upstream_id: res.headers.get("x-request-id"),
		finish_reason: null,
	};
	const json = await res.clone().json().catch(() => null);
	const normalized = normalizeResponse(json);

	if (res.ok && args.pricingCard) {
		const outputImageCount = resolveOutputImageCount(pricingInput, normalized);
		const usageMeters: Record<string, unknown> = normalized?.usage && typeof normalized.usage === "object"
			? { ...(normalized.usage as Record<string, unknown>) }
			: { total_tokens: 0 };
		if (typeof usageMeters.requests !== "number") usageMeters.requests = 1;
		if (typeof usageMeters.output_image !== "number") usageMeters.output_image = outputImageCount;
		if (typeof usageMeters.input_image !== "number") usageMeters.input_image = resolveInputImageCount(pricingInput);

		const pricedUsage = computeBillAfterProviderCharge(
			usageMeters as Record<string, any>,
			args.pricingCard,
			buildImagePricingRequestOptions(pricingInput, usageMeters),
		);
		bill.cost_cents = pricedUsage.pricing.total_cents;
		bill.currency = pricedUsage.pricing.currency;
		bill.usage = pricedUsage;
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
