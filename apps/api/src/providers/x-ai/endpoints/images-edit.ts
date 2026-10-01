import { ImagesEditSchema, type ImagesEditRequest } from "@core/schemas";
import { buildImagePricingRequestOptions } from "@core/image-request-options";
import { computeBill } from "@pipeline/pricing/engine";
import type { AdapterResult, ProviderExecuteArgs } from "../../types";
import { buildAdapterPayload } from "../../utils";
import { openAICompatHeaders, openAICompatUrl, resolveOpenAICompatKey } from "../../openai-compatible/config";
import { upstreamTestHeaders } from "@providers/shared/testing";

function invalidParameterResponse(param: string, message: string): Response {
	return new Response(JSON.stringify({ error: { type: "invalid_request_error", message, param } }), { status: 400, headers: { "Content-Type": "application/json" } });
}

async function imageUrl(value: string | Blob): Promise<string> {
	if (typeof value === "string") return value;
	const bytes = new Uint8Array(await value.arrayBuffer());
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return `data:${value.type || "image/png"};base64,${btoa(binary)}`;
}

export async function exec(args: ProviderExecuteArgs): Promise<AdapterResult> {
	const keyInfo = await resolveOpenAICompatKey(args);
	const body = buildAdapterPayload(ImagesEditSchema, args.body, ["meta", "usage"]).adapterPayload as ImagesEditRequest;
	const images = Array.isArray(body.image) ? body.image : [body.image];
	const model = args.providerModelSlug || body.model;
	const supportsMultiImage = model === "grok-imagine-image-2.0";
	const size = body.size?.toLowerCase();
	const resolution = body.resolution?.toLowerCase();
	if (supportsMultiImage && size && resolution && size !== resolution) {
		const upstream = invalidParameterResponse("size", "Grok Imagine Image 2.0 size and resolution must match when both are provided.");
		return { kind: "completed", upstream, bill: { cost_cents: 0, currency: "USD", usage: undefined, upstream_id: null, finish_reason: null }, keySource: keyInfo.source, byokKeyId: keyInfo.byokId };
	}
	const canonicalResolution = resolution ?? size;
	if (supportsMultiImage && canonicalResolution && canonicalResolution !== "1k" && canonicalResolution !== "2k") {
		const upstream = invalidParameterResponse(body.resolution ? "resolution" : "size", "Grok Imagine Image 2.0 resolution must be 1k or 2k.");
		return { kind: "completed", upstream, bill: { cost_cents: 0, currency: "USD", usage: undefined, upstream_id: null, finish_reason: null }, keySource: keyInfo.source, byokKeyId: keyInfo.byokId };
	}
	if (images.length > 1 && !supportsMultiImage) {
		const upstream = invalidParameterResponse("image", "xAI image editing accepts multiple source images only for Grok Imagine Image 2.0.");
		return { kind: "completed", upstream, bill: { cost_cents: 0, currency: "USD", usage: undefined, upstream_id: null, finish_reason: null }, keySource: keyInfo.source, byokKeyId: keyInfo.byokId };
	}
	if (images.length > 5) {
		const upstream = invalidParameterResponse("image", "xAI image editing accepts at most five source images for Grok Imagine Image 2.0.");
		return { kind: "completed", upstream, bill: { cost_cents: 0, currency: "USD", usage: undefined, upstream_id: null, finish_reason: null }, keySource: keyInfo.source, byokKeyId: keyInfo.byokId };
	}
	const unsupported = body.mask !== undefined ? "mask" : body.stream ? "stream" : body.partial_images !== undefined ? "partial_images" : body.background !== undefined ? "background" : body.input_fidelity !== undefined ? "input_fidelity" : null;
	if (unsupported) {
		const upstream = invalidParameterResponse(unsupported, `xAI image editing does not support ${unsupported}.`);
		return { kind: "completed", upstream, bill: { cost_cents: 0, currency: "USD", usage: undefined, upstream_id: null, finish_reason: null }, keySource: keyInfo.source, byokKeyId: keyInfo.byokId };
	}
	const imagePayloads = await Promise.all(images.map(async (image) => ({
		type: "image_url",
		url: await imageUrl(image),
	})));
	const request = {
		model,
		prompt: body.prompt,
		...(imagePayloads.length === 1 ? { image: { url: imagePayloads[0].url } } : { images: imagePayloads }),
		...(typeof body.n === "number" ? { n: body.n } : {}),
		...(body.quality ? { quality: body.quality } : {}),
		...(body.response_format ? { response_format: body.response_format } : {}),
		...(body.aspect_ratio ? { aspect_ratio: body.aspect_ratio } : {}),
		...(canonicalResolution ? { resolution: canonicalResolution } : {}),
	};
	const res = await (args.upstreamTiming?.fetch ?? fetch)(openAICompatUrl(args.providerId, "/images/edits"), {
		method: "POST", headers: openAICompatHeaders(args.providerId, keyInfo.key, upstreamTestHeaders(args.meta)), body: JSON.stringify(request),
	});
	const normalized = await res.clone().json().catch(() => undefined);
	const usageMeters: Record<string, unknown> = normalized?.usage && typeof normalized.usage === "object" ? { ...normalized.usage } : {};
	usageMeters.requests = 1;
	usageMeters.input_image = images.length;
	usageMeters.output_image = Array.isArray(normalized?.data) && normalized.data.length > 0 ? normalized.data.length : body.n ?? 1;
	let cost_cents = 0;
	let currency: "USD" | "EUR" = "USD";
	let usage: any = usageMeters;
	if (res.ok && args.pricingCard) {
		const priced = computeBill(usageMeters, args.pricingCard, buildImagePricingRequestOptions({ ...body, model, size: canonicalResolution, resolution: canonicalResolution, capability_id: "image.edit" }, usageMeters));
		cost_cents = priced.pricing.total_cents;
		currency = priced.pricing.currency;
		usage = priced;
	}
	return { kind: "completed", upstream: res, normalized, bill: { cost_cents, currency, usage, upstream_id: res.headers.get("x-request-id"), finish_reason: null }, keySource: keyInfo.source, byokKeyId: keyInfo.byokId };
}
