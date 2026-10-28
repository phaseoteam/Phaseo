// Purpose: Provider endpoint adapter for BytePlus ModelArk image generation.
// Why: Seedream image editing uses the Image generation API JSON endpoint, not OpenAI multipart edits.
// How: Maps gateway image generation/edit requests to /images/generations and normalizes OpenAI-like output.

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
};

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

function supportsMultipleOutputs(model: string): boolean {
	const normalized = model.toLowerCase().replace(/[._]/g, "-");
	return !normalized.includes("seedream-5-0-pro");
}

function normalizeResponse(json: any): any {
	if (!json || typeof json !== "object") return undefined;
	return {
		...json,
		created: json.created ?? Math.floor(Date.now() / 1000),
		data: Array.isArray(json.data) ? json.data : [],
	};
}

function mapGenerationBody(args: ProviderExecuteArgs): { request: BytePlusImageRequest; pricingInput: ImagesGenerationRequest } {
	const body = sanitizePayload(ImagesGenerationSchema, args.body);
	const model = args.providerModelSlug || args.model || body.model;
	const pricingInput: ImagesGenerationRequest = { ...body, model };
	return {
		pricingInput,
		request: {
			model,
			prompt: body.prompt,
			size: body.size,
			n: supportsMultipleOutputs(model) ? body.n : undefined,
			response_format: body.response_format,
			user: body.user,
		},
	};
}

function mapEditBody(args: ProviderExecuteArgs): { request: BytePlusImageRequest; pricingInput: ImagesEditRequest } {
	const body = sanitizePayload(ImagesEditSchema, args.body);
	const model = args.providerModelSlug || args.model || body.model;
	const pricingInput: ImagesEditRequest = { ...body, model };
	return {
		pricingInput,
		request: {
			model,
			prompt: body.prompt,
			// BytePlus's JSON edit API accepts string references only; multipart
			// Blob inputs are handled by file-capable providers such as OpenAI.
			image: body.image as string | string[],
			size: body.size,
			n: supportsMultipleOutputs(model) ? body.n : undefined,
			response_format: body.response_format,
			user: body.user,
		},
	};
}

function mapBody(args: ProviderExecuteArgs) {
	return args.endpoint === "images.edits" ? mapEditBody(args) : mapGenerationBody(args);
}

export async function exec(args: ProviderExecuteArgs): Promise<AdapterResult> {
	const { request, pricingInput } = mapBody(args);
	if (!supportsMultipleOutputs(request.model) && typeof pricingInput.n === "number" && pricingInput.n > 1) {
		const upstream = new Response(JSON.stringify({ error: { type: "invalid_request_error", message: "Seedream 5.0 Pro supports one output image per request", param: "n" } }), {
			status: 400,
			headers: { "content-type": "application/json" },
		});
		return {
			kind: "completed",
			upstream,
			bill: { cost_cents: 0, currency: "USD", usage: undefined, upstream_id: null, finish_reason: null },
			normalized: await upstream.clone().json(),
			keySource: null,
			byokKeyId: null,
		};
	}
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
