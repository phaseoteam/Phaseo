// Purpose: Provider adapter module.
// Why: Encapsulates provider-specific configuration and endpoint mapping.
// How: Exposes provider-specific helpers for routing and execution.

import type { AdapterResult, ProviderExecuteArgs } from "../../types";
import { ImagesEditSchema, type ImagesEditRequest } from "@core/schemas";
import { buildAdapterPayload } from "../../utils";
import { resolveOpenAITransport } from "../../shared/openai-transport";
import { computeBill } from "@pipeline/pricing/engine";
import { resolveUploadableFromString } from "./uploadable";
import { buildImagePricingRequestOptions, normalizeOpenAIImageTokenUsage } from "@core/image-request-options";
import { collectStreamUsage, usesGptImageTokenPricing } from "./images";

async function resolveImageUpload(
    source: string | Blob,
    options: Parameters<typeof resolveUploadableFromString>[1],
) {
    if (typeof source === "string") {
        return resolveUploadableFromString(source, options);
    }
    if (typeof Blob !== "undefined" && source instanceof Blob && source.size > 0) {
        const filename = typeof File !== "undefined" && source instanceof File && source.name
            ? source.name
            : `${options.fallbackFilename}.png`;
        return { blob: source, filename };
    }
    throw new Error("uploadable_source_invalid");
}

function invalidUploadResponse(message: string, param: "image" | "mask", index?: number): Response {
    return new Response(JSON.stringify({
        error: {
            message,
            type: "invalid_request_error",
            param,
            code: "invalid_image",
            ...(typeof index === "number" ? { index } : {}),
        },
    }), { status: 400, headers: { "Content-Type": "application/json" } });
}

function resolveOutputImageCount(body: ImagesEditRequest, normalized: any): number {
    const fromPayload = Array.isArray(normalized?.data) ? normalized.data.length : 0;
    if (fromPayload > 0) return fromPayload;

    const requestedCount = body.n;
    if (typeof requestedCount === "number" && Number.isFinite(requestedCount) && requestedCount > 0) {
        return requestedCount;
    }

    return 1;
}

export async function exec(args: ProviderExecuteArgs): Promise<AdapterResult> {
    const { keyInfo, url, headers, deployment } = resolveOpenAITransport(args, "/images/edits");
    const { adapterPayload } = buildAdapterPayload(ImagesEditSchema, args.body, ["meta", "usage"]);
    const body: ImagesEditRequest = {
        ...adapterPayload,
        model: args.providerModelSlug || adapterPayload.model,
    };

    const imageInputs = Array.isArray(body.image) ? body.image : [body.image];
    const imageUploads: Array<Awaited<ReturnType<typeof resolveUploadableFromString>>> = [];
    for (let i = 0; i < imageInputs.length; i++) {
        const input = imageInputs[i];
        try {
            const upload = await resolveImageUpload(input, {
                defaultMimeType: "image/png",
                fallbackFilename: `image-${i + 1}`,
				maxBytes: 50 * 1024 * 1024,
				upstreamTiming: args.upstreamTiming,
            });
            imageUploads.push(upload);
        } catch {
            return {
                kind: "completed",
                upstream: invalidUploadResponse(
                    "Invalid image input. Provide an image upload, reachable URL, or valid base64 payload.",
                    "image",
                    i,
                ),
                bill: {
                    cost_cents: 0,
                    currency: "USD" as const,
                    usage: undefined as any,
                    upstream_id: null,
                    finish_reason: null,
                },
                keySource: keyInfo.source,
                byokKeyId: keyInfo.byokId,
            };
        }
    }

    let maskUpload: Awaited<ReturnType<typeof resolveUploadableFromString>> | null = null;
    if (body.mask != null) {
        try {
            maskUpload = await resolveImageUpload(body.mask, {
                defaultMimeType: "image/png",
                fallbackFilename: "mask",
				maxBytes: 50 * 1024 * 1024,
				upstreamTiming: args.upstreamTiming,
            });
        } catch {
            return {
                kind: "completed",
                upstream: invalidUploadResponse(
                    "Invalid mask input. Provide an image upload, reachable URL, or valid base64 payload.",
                    "mask",
                ),
                bill: {
                    cost_cents: 0,
                    currency: "USD" as const,
                    usage: undefined as any,
                    upstream_id: null,
                    finish_reason: null,
                },
                keySource: keyInfo.source,
                byokKeyId: keyInfo.byokId,
            };
        }
    }

    const form = new FormData();
    form.append("model", deployment || body.model);
    form.append("prompt", body.prompt);
    for (const imageUpload of imageUploads) {
        form.append("image[]", imageUpload.blob, imageUpload.filename);
    }
    if (maskUpload) form.append("mask", maskUpload.blob, maskUpload.filename);
    if (body.size) form.append("size", body.size);
    if (typeof body.n === "number") form.append("n", String(body.n));
    if (body.quality) form.append("quality", body.quality);
    if (typeof body.stream === "boolean") form.append("stream", String(body.stream));
    if (typeof body.partial_images === "number") form.append("partial_images", String(body.partial_images));
    if (body.response_format) form.append("response_format", body.response_format);
    if (body.output_format) form.append("output_format", body.output_format);
    if (typeof body.output_compression === "number") form.append("output_compression", String(body.output_compression));
    if (body.background) form.append("background", body.background);
    if (body.moderation) form.append("moderation", body.moderation);
    if (body.input_fidelity) form.append("input_fidelity", body.input_fidelity);
    if (body.user) form.append("user", body.user);

    delete (headers as any)["Content-Type"];

    const res = await (args.upstreamTiming?.fetch ?? fetch)(url, {
        method: "POST",
        headers,
        body: form,
    });

    const bill = {
        cost_cents: 0,
        currency: "USD" as const,
        usage: undefined as any,
        upstream_id: res.headers.get("x-request-id"),
        finish_reason: null,
    };

    if (res.ok && body.stream === true && res.body) {
        const [clientStream, accountingStream] = res.body.tee();
        const usageFinalizer = async () => {
            const completedUsage = await collectStreamUsage(accountingStream);
            const usageMeters = usesGptImageTokenPricing(args.model, body.model)
                ? normalizeOpenAIImageTokenUsage(completedUsage)
                : completedUsage;
            usageMeters.requests = 1;
            const pricedUsage = computeBill(
                usageMeters as Record<string, any>,
                args.pricingCard,
                buildImagePricingRequestOptions(body, usageMeters),
            );
            return {
                ...bill,
                cost_cents: pricedUsage.pricing.total_cents,
                currency: pricedUsage.pricing.currency,
                usage: pricedUsage,
            };
        };
        return {
            kind: "stream",
            upstream: res,
            stream: clientStream,
            usageFinalizer,
            bill,
            keySource: keyInfo.source,
            byokKeyId: keyInfo.byokId,
        };
    }

    const normalized = await res.clone().json().catch(() => undefined);

    if (res.ok && args.pricingCard) {
        const outputImageCount = resolveOutputImageCount(body, normalized);
        const usageMeters: Record<string, unknown> = usesGptImageTokenPricing(args.model, body.model)
            ? normalizeOpenAIImageTokenUsage(normalized?.usage)
            : normalized?.usage && typeof normalized.usage === "object"
                ? { ...(normalized.usage as Record<string, unknown>) }
                : { total_tokens: 0 };
        if (typeof usageMeters.requests !== "number") usageMeters.requests = 1;
        if (!usesGptImageTokenPricing(args.model, body.model) && typeof usageMeters.output_image !== "number") {
            usageMeters.output_image = outputImageCount;
        }

        const pricedUsage = computeBill(
            usageMeters,
            args.pricingCard,
            buildImagePricingRequestOptions(body, usageMeters),
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
