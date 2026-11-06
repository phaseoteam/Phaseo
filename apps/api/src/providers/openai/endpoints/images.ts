// lib/gateway/providers/openai/endpoints/images.ts
// Purpose: Provider endpoint adapter for openai (images).
// Why: Encapsulates provider-specific request/response mapping.
// How: Defines provider-specific endpoint adapters and configuration helpers.

import type { ProviderExecuteArgs, AdapterResult } from "../../types";
import { ImagesGenerationSchema, type ImagesGenerationRequest } from "@core/schemas";
import { sanitizePayload } from "../../utils";
import { computeBillAfterProviderCharge } from "@pipeline/pricing/engine";
import { resolveOpenAITransport } from "../../shared/openai-transport";
import { buildImagePricingRequestOptions, normalizeOpenAIImageTokenUsage } from "@core/image-request-options";
import { upstreamTestHeaders } from "@providers/shared/testing";
import { priceSvgAuthorUsage, resolveSvgAuthor, type SvgAuthor } from "./images-svg";

function shouldLogRawImageResponse(args: ProviderExecuteArgs): boolean {
    return (
        args.meta?.debug?.enabled === true ||
        args.meta?.debug?.return_upstream_response === true ||
        args.meta?.returnUpstreamResponse === true
    );
}

function logRawImageResponse(
    args: ProviderExecuteArgs,
    details: {
        json: any;
        normalized: any;
        rawText?: string | null;
        contentType?: string | null;
        status?: number | null;
    },
) {
    const { json, normalized, rawText, contentType, status } = details;
    if (!shouldLogRawImageResponse(args)) return;
    if (!json || typeof json !== "object") {
        console.log("[gateway][openai][images] raw upstream response missing or non-object", {
            requestId: args.meta?.requestId ?? null,
            provider: args.providerId,
            model: args.model,
            status: status ?? null,
            contentType: contentType ?? null,
            rawTextLength: typeof rawText === "string" ? rawText.length : null,
        });
        return;
    }

    console.log("[gateway][openai][images] raw upstream response summary", {
        requestId: args.meta?.requestId ?? null,
        provider: args.providerId,
        model: args.model,
        status: status ?? null,
        contentType: contentType ?? null,
        topLevel: {
            size: json.size ?? null,
            quality: json.quality ?? null,
            output_format: json.output_format ?? null,
            created: json.created ?? null,
        },
        usage: {
            input_tokens: json.usage?.input_tokens ?? null,
            output_tokens: json.usage?.output_tokens ?? null,
            total_tokens: json.usage?.total_tokens ?? null,
            input_image_tokens:
                json.usage?.input_image_tokens ??
                json.usage?.input_tokens_details?.image_tokens ??
                null,
            input_text_tokens:
                json.usage?.input_text_tokens ??
                json.usage?.input_tokens_details?.text_tokens ??
                null,
            output_image_tokens:
                json.usage?.output_image_tokens ??
                json.usage?.output_tokens_details?.image_tokens ??
                null,
            output_text_tokens:
                json.usage?.output_text_tokens ??
                json.usage?.output_tokens_details?.text_tokens ??
                null,
        },
        data_count: Array.isArray(json.data) ? json.data.length : 0,
        normalized: {
            size: normalized?.size ?? null,
            quality: normalized?.quality ?? null,
            output_format: normalized?.output_format ?? null,
        },
    });
}
/** A `WIDTHxHEIGHT` size as numbers, or null. */
function parseSizeDimensions(size: string | undefined): { width: number; height: number } | null {
    const match = /^(\d+)x(\d+)$/i.exec(size?.trim() ?? "");
    return match ? { width: Number(match[1]), height: Number(match[2]) } : null;
}

/**
 * Together has no `size` field (only width and height) and calls base64 output
 * `base64`, not `b64_json`; its response still uses `b64_json`.
 * https://docs.together.ai/reference/post-images-generations
 */
function togetherSizeError(body: ImagesGenerationRequest): string | null {
    if (!body.size || body.size.trim().toLowerCase() === "auto" || parseSizeDimensions(body.size)) return null;
    return "Together image size must be WIDTHxHEIGHT, for example 1024x768. You can also send width and height.";
}

function invalidRequestResult(message: string, param: string): AdapterResult {
    const normalized = { error: { type: "invalid_request_error", message, param } };
    return {
        kind: "completed",
        upstream: new Response(JSON.stringify(normalized), { status: 400, headers: { "Content-Type": "application/json" } }),
        normalized,
        bill: { cost_cents: 0, currency: "USD", usage: undefined, upstream_id: null, finish_reason: null },
        keySource: null,
        byokKeyId: null,
    };
}

function mapGatewayToOpenAIImages(
    body: ImagesGenerationRequest,
    rawBody: Record<string, unknown>,
    providerId: string,
    svgAuthor?: SvgAuthor | null,
) {
    const providerParams = rawBody.provider_params && typeof rawBody.provider_params === "object"
        ? rawBody.provider_params as Record<string, unknown>
        : {};
    const isTogether = providerId === "together";
    const explicitWidth = rawBody.width ?? providerParams.width;
    const explicitHeight = rawBody.height ?? providerParams.height;
    // Each explicit width or height wins; a WIDTHxHEIGHT size fills whichever is missing.
    const sizeDimensions = parseSizeDimensions(body.size);
    const togetherParams = isTogether ? {
        width: explicitWidth ?? sizeDimensions?.width,
        height: explicitHeight ?? sizeDimensions?.height,
        steps: rawBody.steps ?? providerParams.steps,
        seed: rawBody.seed ?? providerParams.seed,
        negative_prompt: rawBody.negative_prompt ?? providerParams.negative_prompt,
        guidance_scale: rawBody.guidance_scale ?? providerParams.guidance_scale,
        image_url: rawBody.image_url ?? providerParams.image_url,
        reference_images: rawBody.reference_images ?? providerParams.reference_images,
        disable_safety_checker: rawBody.disable_safety_checker ?? providerParams.disable_safety_checker,
    } : {};
    const xAiParams = ["spacex-ai", "x-ai", "xai"].includes(providerId) ? {
        aspect_ratio: rawBody.aspect_ratio,
        resolution: rawBody.resolution,
    } : {};
    return {
        prompt: body.prompt,
        model: body.model,
        n: body.n,
        quality: body.quality,
        stream: body.stream,
        partial_images: body.partial_images,
        response_format: isTogether && body.response_format === "b64_json" ? "base64" : body.response_format,
        output_format: body.output_format,
        output_compression: body.output_compression,
        background: body.background,
        moderation: body.moderation,
        complexity: body.complexity,
        frame_count: body.frame_count,
        frame_duration_ms: body.frame_duration_ms,
        svg: body.svg && svgAuthor
            ? { ...body.svg, model: svgAuthor.upstreamModel }
            : undefined,
        size: isTogether ? undefined : body.size,
        style: body.style,
        user: body.user,
        ...Object.fromEntries(Object.entries(xAiParams).filter(([, value]) => value !== undefined)),
        ...Object.fromEntries(Object.entries(togetherParams).filter(([, value]) => value !== undefined)),
    };
}

function resolveOutputImagePixels(request: Record<string, any>, count: number, providerId: string): number | undefined {
    const width = Number(request.width);
    const height = Number(request.height);
    if (Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0) {
        return width * height * count;
    }
    const size = typeof request.size === "string" ? request.size.match(/^(\d+)x(\d+)$/i) : null;
    if (!size) return providerId === "together" ? 1024 * 1024 * count : undefined;
    const parsedWidth = Number(size[1]);
    const parsedHeight = Number(size[2]);
    return parsedWidth > 0 && parsedHeight > 0 ? parsedWidth * parsedHeight * count : undefined;
}

function mapOpenAIToGatewayImages(json: any): any {
    return {
        created: json.created,
        data: json.data,
        background: json.background,
        output_format: json.output_format,
        quality: json.quality,
        size: json.size,
        usage: json.usage,
        ...(json.svg_usage && typeof json.svg_usage === "object" ? { svg_usage: json.svg_usage } : {}),
    };
}

function invalidSvgModelResponse(model: string): Response {
    return new Response(JSON.stringify({
        error: {
            message: `svg.model "${model}" is not an OpenAI text model with Phaseo pricing. Use an OpenAI model id such as openai/gpt-5-nano.`,
            type: "invalid_request_error",
            param: "svg.model",
            code: "invalid_svg_model",
        },
    }), { status: 400, headers: { "Content-Type": "application/json" } });
}

function resolveOutputImageCount(body: ImagesGenerationRequest, normalized: any): number {
    const fromPayload = Array.isArray(normalized?.data) ? normalized.data.length : 0;
    if (fromPayload > 0) return fromPayload;

    const requestedCount = body.n;
    if (typeof requestedCount === "number" && Number.isFinite(requestedCount) && requestedCount > 0) {
        return requestedCount;
    }

    return 1;
}

/**
 * Read an image stream's usage and count its finished images: the
 * `image_generation.completed` / `image_edit.completed` events of the OpenAI Images API.
 */
export async function collectImageStreamSummary(stream: ReadableStream<Uint8Array>): Promise<{ usage: Record<string, unknown>; completedImages: number }> {
	const reader = stream.getReader();
	const decoder = new TextDecoder();
	let buffer = "";
	let usage: Record<string, unknown> = {};
	let completedImages = 0;
	const consume = (frame: string) => {
		const lines = frame.split(/\r?\n/);
		const data = lines.filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("\n");
		if (!data || data === "[DONE]") return;
		try {
			const payload = JSON.parse(data);
			if (payload?.usage && typeof payload.usage === "object") usage = payload.usage;
			if (typeof payload?.type === "string" && payload.type.endsWith(".completed")) completedImages += 1;
		} catch {
			// Forward malformed upstream frames unchanged; they cannot be priced.
		}
	};
	while (true) {
		const { done, value } = await reader.read();
		buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
		let boundary: number;
		while ((boundary = buffer.search(/\r?\n\r?\n/)) >= 0) {
			const frame = buffer.slice(0, boundary);
			buffer = buffer.slice(boundary).replace(/^\r?\n\r?\n/, "");
			consume(frame);
		}
		if (done) break;
	}
	if (buffer.trim()) consume(buffer);
	return { usage, completedImages };
}

/**
 * Meters for a finished image stream. Models priced per image (not by GPT Image tokens) get
 * `output_image` from the completed events, else the requested count.
 */
export function imageStreamUsageMeters(
	summary: { usage: Record<string, unknown>; completedImages: number },
	gptImageTokenPricing: boolean,
	requestedCount: number | undefined,
): Record<string, unknown> {
	const usageMeters = gptImageTokenPricing ? normalizeOpenAIImageTokenUsage(summary.usage) : { ...summary.usage };
	usageMeters.requests = 1;
	if (!gptImageTokenPricing && typeof usageMeters.output_image !== "number") {
		usageMeters.output_image = summary.completedImages > 0
			? summary.completedImages
			: typeof requestedCount === "number" && Number.isFinite(requestedCount) && requestedCount > 0 ? requestedCount : 1;
	}
	return usageMeters;
}

export function usesGptImageTokenPricing(...modelIds: Array<string | null | undefined>): boolean {
	return modelIds.some((modelId) => /(?:gpt-image-|chatgpt-image-latest)/i.test(modelId?.trim() ?? ""));
}

export async function exec(args: ProviderExecuteArgs): Promise<AdapterResult> {
    const sanitizedBody = sanitizePayload(ImagesGenerationSchema, args.body);
    if (args.providerId === "together") {
        const sizeError = togetherSizeError(sanitizedBody);
        if (sizeError) return invalidRequestResult(sizeError, "size");
    }
    const { keyInfo, url, headers, deployment } = resolveOpenAITransport(args, "/images/generations", upstreamTestHeaders(args.meta));
    const modifiedBody: ImagesGenerationRequest = {
        ...sanitizedBody,
        model: deployment || args.providerModelSlug || args.model,
    };
    // SVG output also bills the caller-chosen author model; without a Phaseo price for it the
    // request is refused here, before OpenAI charges for tokens we could not bill.
    let svgAuthor: SvgAuthor | null = null;
    if (modifiedBody.output_format === "svg" && modifiedBody.svg?.model) {
        svgAuthor = await resolveSvgAuthor(modifiedBody.svg.model);
        if (!svgAuthor) {
            return {
                kind: "completed",
                upstream: invalidSvgModelResponse(modifiedBody.svg.model),
                bill: { cost_cents: 0, currency: "USD" as const, usage: undefined as any, upstream_id: null, finish_reason: null },
                keySource: keyInfo.source,
                byokKeyId: keyInfo.byokId,
            };
        }
    }
    const req = mapGatewayToOpenAIImages(modifiedBody, args.body as Record<string, unknown>, args.providerId, svgAuthor);
    // Together takes no size or quality field; its output follows width and height,
    // which default to 1024 (https://docs.together.ai/openapi.yaml). Price the
    // dimensions sent, keeping `size` only when it is what Together was given.
    const togetherSize = req as { width?: unknown; height?: unknown };
    const sentSize = parseSizeDimensions(modifiedBody.size);
    const pricingInput = args.providerId === "together"
        ? {
            ...modifiedBody,
            size: sentSize && sentSize.width === togetherSize.width && sentSize.height === togetherSize.height ? modifiedBody.size : undefined,
            width: togetherSize.width ?? 1024,
            height: togetherSize.height ?? 1024,
        }
        : modifiedBody;
    const res = await (args.upstreamTiming?.fetch ?? fetch)(url, {
        method: "POST",
        headers,
        body: JSON.stringify(req),
    });
    const bill = {
        cost_cents: 0,
        currency: "USD" as const,
        usage: undefined as any,
        upstream_id: res.headers.get("x-request-id"),
        finish_reason: null,
    };
    if (res.ok && args.stream && res.body) {
        const [clientStream, accountingStream] = res.body.tee();
        const usageFinalizer = async () => {
            const usageMeters = imageStreamUsageMeters(
                await collectImageStreamSummary(accountingStream),
                usesGptImageTokenPricing(args.model, modifiedBody.model),
                modifiedBody.n,
            );
            const imagePixels = resolveOutputImagePixels(req, modifiedBody.n ?? 1, args.providerId);
            if (imagePixels !== undefined) usageMeters.image_pixels = imagePixels;
            if (!args.pricingCard) return { ...bill, usage: usageMeters };
            const pricedUsage = computeBillAfterProviderCharge(usageMeters as Record<string, any>, args.pricingCard, buildImagePricingRequestOptions(pricingInput, usageMeters));
            return {
                ...bill,
                cost_cents: pricedUsage.pricing.total_cents,
                currency: pricedUsage.pricing.currency,
                usage: pricedUsage,
            };
        };
        return { kind: "stream", upstream: res, stream: clientStream, usageFinalizer, bill, keySource: keyInfo.source, byokKeyId: keyInfo.byokId };
    }
    const contentType = res.headers.get("content-type");
    const rawText = shouldLogRawImageResponse(args)
        ? await res.clone().text().catch(() => null)
        : null;
    const json = rawText != null
        ? (() => {
            try {
                return rawText ? JSON.parse(rawText) : null;
            } catch {
                return null;
            }
        })()
        : await res.clone().json().catch(() => null);
    const normalized = json ? mapOpenAIToGatewayImages(json) : undefined;
    logRawImageResponse(args, {
        json,
        normalized,
        rawText,
        contentType,
        status: res.status,
    });

    if (res.ok && args.pricingCard) {
        const outputImageCount = resolveOutputImageCount(modifiedBody, normalized);
        // Image providers are commonly priced by request count.
        const usageMeters: Record<string, unknown> = usesGptImageTokenPricing(args.model, modifiedBody.model)
            ? normalizeOpenAIImageTokenUsage(normalized?.usage)
            : normalized?.usage && typeof normalized.usage === "object"
                ? { ...(normalized.usage as Record<string, unknown>) }
                : { total_tokens: 0 };
        if (typeof usageMeters.requests !== "number") usageMeters.requests = 1;
        if (!usesGptImageTokenPricing(args.model, modifiedBody.model) && typeof usageMeters.output_image !== "number") {
            usageMeters.output_image = outputImageCount;
        }
        const imagePixels = resolveOutputImagePixels({ ...req, size: normalized?.size ?? req.size }, outputImageCount, args.providerId);
        if (imagePixels !== undefined) usageMeters.image_pixels = imagePixels;
        if (typeof normalized?.size === "string") usageMeters.size = normalized.size;
        if (typeof normalized?.quality === "string") usageMeters.quality = normalized.quality;
        if (typeof normalized?.output_format === "string") usageMeters.output_format = normalized.output_format;

        const pricedUsage = computeBillAfterProviderCharge(
            usageMeters as Record<string, any>,
            args.pricingCard,
            buildImagePricingRequestOptions(pricingInput, usageMeters),
        );
        bill.cost_cents = pricedUsage.pricing.total_cents;
        bill.currency = pricedUsage.pricing.currency;
        bill.usage = pricedUsage;
        if (svgAuthor) {
            // OpenAI has already charged; a pricing failure is logged, never thrown.
            try {
                const svgAuthorPricing = priceSvgAuthorUsage(json?.svg_usage, svgAuthor);
                if (svgAuthorPricing) {
                    bill.usage = { ...pricedUsage, svg_author_pricing: svgAuthorPricing };
                    bill.cost_cents = Math.trunc((Number(pricedUsage.pricing.total_nanos ?? 0) + svgAuthorPricing.total_nanos) / 10_000_000);
                } else {
                    console.error("[gateway][openai][images] svg_usage missing from SVG response", {
                        requestId: args.meta?.requestId ?? null,
                        svgAuthor: svgAuthor.model,
                    });
                }
            } catch (error) {
                console.error("[gateway][openai][images] svg author pricing failed", {
                    requestId: args.meta?.requestId ?? null,
                    svgAuthor: svgAuthor.model,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        }
    }
    
    return { kind: "completed", upstream: res, bill, normalized, keySource: keyInfo.source, byokKeyId: keyInfo.byokId };
}

