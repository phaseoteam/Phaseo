// Purpose: Provider endpoint adapter for BytePlus ModelArk image generation.
// Why: Seedream image editing uses the Image generation API JSON endpoint, not OpenAI multipart edits.
// How: Maps gateway image generation/edit requests to /images/generations and normalizes OpenAI-like output.
// Field support per Seedream family follows the ModelArk Image generation API reference
// (https://docs.byteplus.com/en/docs/ModelArk/1541523) and, for the early-access Seedream 5.5,
// BytePlus's ComfyUI pack (byteplus-sa/ComfyUI-BytePlus-ModelArk#29).

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
	output_format?: "png" | "jpeg";
	background?: "auto" | "transparent" | "opaque";
	watermark: boolean;
	optimize_prompt_options?: { mode: "standard" | "fast" };
	sequential_image_generation?: "auto";
	sequential_image_generation_options?: { max_images: number };
	safety_identifier?: string;
};

type SeedreamFamily = "seedream-4.0" | "seedream-4.5" | "seedream-5.0-lite" | "seedream-5.0-flash" | "seedream-5.0-pro" | "seedream-5.5";

type SeedreamCapabilities = {
	label: string;
	/** Output images per request; above 1 the family supports sequential (group) generation. */
	maxOutputs: number;
	maxReferenceImages: number;
	outputFormats: ReadonlyArray<"png" | "jpeg">;
	backgrounds: ReadonlyArray<"auto" | "transparent" | "opaque">;
	/** Transparent output needs exactly one reference image with an alpha channel. */
	transparentNeedsOneReference: boolean;
	promptOptimizationModes: ReadonlyArray<"standard" | "fast">;
	sizePresets: ReadonlyArray<string>;
	minPixels: number;
	maxPixels: number;
	safetyIdentifier: boolean;
};

// Reference images plus generated images per sequential request (ModelArk limit).
const SEQUENTIAL_TOTAL_IMAGE_LIMIT = 15;
const MAX_ASPECT_RATIO = 16;

const SEEDREAM_CAPABILITIES: Record<SeedreamFamily, SeedreamCapabilities> = {
	"seedream-4.0": {
		label: "Seedream 4.0",
		maxOutputs: 15,
		maxReferenceImages: 14,
		outputFormats: [],
		backgrounds: [],
		transparentNeedsOneReference: false,
		promptOptimizationModes: ["standard", "fast"],
		sizePresets: ["1K", "2K", "4K"],
		minPixels: 921_600,
		maxPixels: 16_777_216,
		safetyIdentifier: false,
	},
	"seedream-4.5": {
		label: "Seedream 4.5",
		maxOutputs: 15,
		maxReferenceImages: 14,
		outputFormats: [],
		backgrounds: [],
		transparentNeedsOneReference: false,
		promptOptimizationModes: ["standard"],
		sizePresets: ["2K", "4K"],
		minPixels: 3_686_400,
		maxPixels: 16_777_216,
		safetyIdentifier: false,
	},
	"seedream-5.0-lite": {
		label: "Seedream 5.0 Lite",
		maxOutputs: 15,
		maxReferenceImages: 14,
		outputFormats: ["png", "jpeg"],
		backgrounds: [],
		transparentNeedsOneReference: false,
		promptOptimizationModes: ["standard"],
		sizePresets: ["2K", "3K", "4K"],
		minPixels: 3_686_400,
		maxPixels: 16_777_216,
		safetyIdentifier: false,
	},
	"seedream-5.0-flash": {
		label: "Seedream 5.0 Flash",
		maxOutputs: 1,
		maxReferenceImages: 10,
		outputFormats: ["png", "jpeg"],
		backgrounds: ["opaque", "transparent"],
		transparentNeedsOneReference: true,
		promptOptimizationModes: ["standard"],
		sizePresets: ["1K", "1.5K", "2K"],
		minPixels: 921_600,
		maxPixels: 4_624_220,
		safetyIdentifier: false,
	},
	"seedream-5.0-pro": {
		label: "Seedream 5.0 Pro",
		maxOutputs: 1,
		maxReferenceImages: 10,
		outputFormats: ["png", "jpeg"],
		backgrounds: ["opaque", "transparent"],
		transparentNeedsOneReference: true,
		promptOptimizationModes: ["standard", "fast"],
		sizePresets: ["1K", "1.5K", "2K"],
		minPixels: 921_600,
		maxPixels: 4_624_220,
		safetyIdentifier: false,
	},
	"seedream-5.5": {
		label: "Seedream 5.5",
		maxOutputs: 1,
		maxReferenceImages: 10,
		outputFormats: ["png", "jpeg"],
		backgrounds: ["auto", "transparent", "opaque"],
		transparentNeedsOneReference: false,
		promptOptimizationModes: ["standard"],
		sizePresets: ["1K", "1.5K", "2K"],
		minPixels: 921_600,
		maxPixels: 4_624_220,
		safetyIdentifier: true,
	},
};

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

class InvalidSeedreamRequest extends Error {
	constructor(message: string, readonly param: string) {
		super(message);
	}
}

function invalidRequestResult(message: string, param: string): AdapterResult {
	const normalized = { error: { type: "invalid_request_error", message, param } };
	return {
		kind: "completed",
		upstream: new Response(JSON.stringify(normalized), {
			status: 400,
			headers: { "content-type": "application/json" },
		}),
		bill: { cost_cents: 0, currency: "USD", usage: undefined, upstream_id: null, finish_reason: null },
		normalized,
		keySource: null,
		byokKeyId: null,
	};
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

/** BytePlus-only options from provider_params.byteplus (or .bytedance, or flat provider_params). */
function bytePlusProviderParams(rawBody: Record<string, any>): Record<string, unknown> {
	const params = rawBody.provider_params;
	if (!params || typeof params !== "object" || Array.isArray(params)) return {};
	for (const key of ["byteplus", "bytedance"]) {
		const nested = params[key];
		if (nested && typeof nested === "object" && !Array.isArray(nested)) return nested;
	}
	return params;
}

function resolveSize(size: string | undefined, caps: SeedreamCapabilities): string | undefined {
	if (size == null || size === "auto") return undefined;
	const preset = caps.sizePresets.find((value) => value.toLowerCase() === size.trim().toLowerCase());
	if (preset) return preset;
	const dimensions = /^(\d+)x(\d+)$/i.exec(size.trim());
	const width = dimensions ? Number(dimensions[1]) : 0;
	const height = dimensions ? Number(dimensions[2]) : 0;
	const pixels = width * height;
	if (
		!dimensions || width === 0 || height === 0 ||
		pixels < caps.minPixels || pixels > caps.maxPixels ||
		Math.max(width, height) / Math.min(width, height) > MAX_ASPECT_RATIO
	) {
		throw new InvalidSeedreamRequest(
			`${caps.label} size must be ${caps.sizePresets.join(", ")}, or WIDTHxHEIGHT with ${caps.minPixels}–${caps.maxPixels} total pixels and an aspect ratio between 1:16 and 16:1`,
			"size",
		);
	}
	return `${width}x${height}`;
}

function mapKnownFamily(
	request: BytePlusImageRequest,
	body: ImagesGenerationRequest | ImagesEditRequest,
	native: Record<string, unknown>,
	caps: SeedreamCapabilities,
	referenceCount: number,
): void {
	const unsupported = (param: string, detail = `${param} is not supported by ${caps.label}`) => new InvalidSeedreamRequest(detail, param);

	// The adapter calls ModelArk without SSE, and seed is not documented for Seedream 4.0 and later.
	if (body.stream === true) throw unsupported("stream", `${caps.label} streaming is not supported through this endpoint`);
	if (body.seed != null) throw unsupported("seed");

	if (referenceCount > caps.maxReferenceImages) {
		throw new InvalidSeedreamRequest(`${caps.label} accepts at most ${caps.maxReferenceImages} reference images`, "image");
	}

	const n = typeof body.n === "number" ? body.n : 1;
	if (n > caps.maxOutputs) {
		throw new InvalidSeedreamRequest(
			caps.maxOutputs === 1 ? `${caps.label} supports one output image per request` : `${caps.label} supports at most ${caps.maxOutputs} output images per request`,
			"n",
		);
	}
	if (n > 1) {
		// ModelArk has no `n`: group generation is sequential_image_generation=auto with
		// max_images as the upper bound, and references plus outputs may not exceed 15.
		if (referenceCount + n > SEQUENTIAL_TOTAL_IMAGE_LIMIT) {
			throw new InvalidSeedreamRequest(
				`${caps.label} allows at most ${SEQUENTIAL_TOTAL_IMAGE_LIMIT} reference and output images combined`,
				"n",
			);
		}
		request.sequential_image_generation = "auto";
		request.sequential_image_generation_options = { max_images: n };
	}

	request.size = resolveSize(body.size, caps);

	const outputFormat = body.output_format;
	if (outputFormat != null) {
		if (!(caps.outputFormats as readonly string[]).includes(outputFormat)) {
			throw unsupported(
				"output_format",
				caps.outputFormats.length
					? `${caps.label} output_format must be ${caps.outputFormats.join(" or ")}`
					: `output_format is not supported by ${caps.label}`,
			);
		}
		request.output_format = outputFormat as "png" | "jpeg";
	}

	// "auto" leaves the choice to the model, which is what families without it do anyway.
	const background = body.background === "auto" && !caps.backgrounds.includes("auto") ? undefined : body.background;
	if (background != null) {
		if (!(caps.backgrounds as readonly string[]).includes(background)) {
			throw unsupported(
				"background",
				caps.backgrounds.length
					? `${caps.label} background must be ${caps.backgrounds.join(", ")}`
					: `background is not supported by ${caps.label}`,
			);
		}
		if (background === "transparent") {
			if (outputFormat === "jpeg") {
				throw new InvalidSeedreamRequest(`${caps.label} transparent backgrounds require output_format png`, "output_format");
			}
			if (caps.transparentNeedsOneReference && referenceCount !== 1) {
				throw new InvalidSeedreamRequest(
					`${caps.label} transparent backgrounds require exactly one reference image with an alpha channel`,
					"background",
				);
			}
			// PNG keeps the alpha channel.
			request.output_format = "png";
		}
		request.background = background;
	}

	const nativeOptimization = native.optimize_prompt_options;
	let mode: unknown;
	if (nativeOptimization != null) {
		if (typeof nativeOptimization !== "object" || Array.isArray(nativeOptimization)) {
			throw new InvalidSeedreamRequest("provider_params.byteplus.optimize_prompt_options must be an object", "provider_params");
		}
		mode = (nativeOptimization as Record<string, unknown>).mode ?? "standard";
	} else if (body.prompt_optimizer === true) {
		mode = "standard";
	} else if (body.prompt_optimizer === false) {
		throw unsupported("prompt_optimizer", `${caps.label} prompt optimization cannot be disabled`);
	}
	if (mode !== undefined) {
		if (!(caps.promptOptimizationModes as readonly unknown[]).includes(mode)) {
			throw new InvalidSeedreamRequest(
				`${caps.label} prompt optimization mode must be ${caps.promptOptimizationModes.join(" or ")}`,
				"prompt_optimizer",
			);
		}
		request.optimize_prompt_options = { mode: mode as "standard" | "fast" };
	}

	if (native.safety_identifier != null) {
		if (!caps.safetyIdentifier) throw unsupported("safety_identifier");
		if (typeof native.safety_identifier !== "string" || !native.safety_identifier.trim()) {
			throw new InvalidSeedreamRequest("safety_identifier must be a non-empty string", "safety_identifier");
		}
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
	if (native.watermark != null && typeof native.watermark !== "boolean") {
		throw new InvalidSeedreamRequest("watermark must be a boolean", "watermark");
	}

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
		// ModelArk watermarks by default; the gateway returns clean images unless asked.
		watermark: native.watermark === true,
	};

	const family = resolveSeedreamFamily(model);
	if (family) {
		// ModelArk documents no `n`; group generation maps onto sequential_image_generation.
		request.n = undefined;
		mapKnownFamily(request, body, native, SEEDREAM_CAPABILITIES[family], resolveInputImageCount(body));
	}
	return { request, pricingInput };
}

export async function exec(args: ProviderExecuteArgs): Promise<AdapterResult> {
	let mapped: ReturnType<typeof mapBody>;
	try {
		mapped = mapBody(args);
	} catch (error) {
		if (error instanceof InvalidSeedreamRequest) return invalidRequestResult(error.message, error.param);
		throw error;
	}
	const { request, pricingInput } = mapped;
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
