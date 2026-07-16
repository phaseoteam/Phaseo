// lib/gateway/providers/openai/endpoints/images.ts
// Purpose: Provider endpoint adapter for openai (images).
// Why: Encapsulates provider-specific request/response mapping.
// How: Defines provider-specific endpoint adapters and configuration helpers.

import type { ProviderExecuteArgs, AdapterResult } from "../../types";
import { ImagesGenerationSchema, type ImagesGenerationRequest } from "@core/schemas";
import { sanitizePayload } from "../../utils";
import { computeBill } from "@pipeline/pricing/engine";
import { openAICompatHeaders, openAICompatUrl, resolveOpenAICompatKey } from "../../openai-compatible/config";
import { buildImagePricingRequestOptions, normalizeOpenAIImageTokenUsage } from "@core/image-request-options";
import { upstreamTestHeaders } from "@providers/shared/testing";

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



function mapGatewayToOpenAIImages(body: ImagesGenerationRequest) {
    return {
        prompt: body.prompt,
        model: body.model,
        n: body.n,
        quality: body.quality,
        stream: body.stream,
        partial_images: body.partial_images,
        response_format: body.response_format,
        output_format: body.output_format,
        output_compression: body.output_compression,
        background: body.background,
        moderation: body.moderation,
        size: body.size,
        style: body.style,
        user: body.user,
    };
}

function mapOpenAIToGatewayImages(json: any): any {
    return {
        created: json.created,
        data: json.data,
        output_format: json.output_format,
        quality: json.quality,
        size: json.size,
        usage: json.usage,
    };
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

async function collectStreamUsage(stream: ReadableStream<Uint8Array>): Promise<Record<string, unknown>> {
	const reader = stream.getReader();
	const decoder = new TextDecoder();
	let buffer = "";
	let usage: Record<string, unknown> = {};
	const consume = (frame: string) => {
		const lines = frame.split(/\r?\n/);
		const data = lines.filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("\n");
		if (!data || data === "[DONE]") return;
		try {
			const payload = JSON.parse(data);
			if (payload?.usage && typeof payload.usage === "object") usage = payload.usage;
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
	return usage;
}

function usesGptImageTokenPricing(...modelIds: Array<string | null | undefined>): boolean {
	return modelIds.some((modelId) => /(?:gpt-image-|chatgpt-image-latest)/i.test(modelId?.trim() ?? ""));
}

export async function exec(args: ProviderExecuteArgs): Promise<AdapterResult> {
    const keyInfo = await resolveOpenAICompatKey(args);
    const key = keyInfo.key;
    const sanitizedBody = sanitizePayload(ImagesGenerationSchema, args.body);
    const modifiedBody: ImagesGenerationRequest = {
        ...sanitizedBody,
        model: args.providerModelSlug || args.model,
    };
    const req = mapGatewayToOpenAIImages(modifiedBody);
    const res = await fetch(openAICompatUrl(args.providerId, "/images/generations"), {
        method: "POST",
        headers: openAICompatHeaders(args.providerId, key, upstreamTestHeaders(args.meta)),
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
            const completedUsage = await collectStreamUsage(accountingStream);
            const usageMeters = usesGptImageTokenPricing(args.model, modifiedBody.model)
                ? normalizeOpenAIImageTokenUsage(completedUsage)
                : completedUsage;
            usageMeters.requests = 1;
            const pricedUsage = computeBill(usageMeters as Record<string, any>, args.pricingCard, buildImagePricingRequestOptions(modifiedBody, usageMeters));
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
        if (typeof normalized?.size === "string") usageMeters.size = normalized.size;
        if (typeof normalized?.quality === "string") usageMeters.quality = normalized.quality;
        if (typeof normalized?.output_format === "string") usageMeters.output_format = normalized.output_format;

        const pricedUsage = computeBill(
            usageMeters as Record<string, any>,
            args.pricingCard,
            buildImagePricingRequestOptions(modifiedBody, usageMeters),
        );
        bill.cost_cents = pricedUsage.pricing.total_cents;
        bill.currency = pricedUsage.pricing.currency;
        bill.usage = pricedUsage;
    }
    
    return { kind: "completed", upstream: res, bill, normalized, keySource: keyInfo.source, byokKeyId: keyInfo.byokId };
}









