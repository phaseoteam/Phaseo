// Purpose: Provider adapter module.
// Why: Encapsulates provider-specific configuration and endpoint mapping.
// How: Exposes provider-specific helpers for routing and execution.

import type { AdapterResult, ProviderExecuteArgs } from "../../types";
import { ImagesEditSchema, type ImagesEditRequest } from "@core/schemas";
import { buildAdapterPayload } from "../../utils";
import { openAICompatHeaders, openAICompatUrl, resolveOpenAICompatKey } from "../../openai-compatible/config";
import { computeBill } from "@pipeline/pricing/engine";
import { resolveUploadableFromString } from "./uploadable";



export async function exec(args: ProviderExecuteArgs): Promise<AdapterResult> {
    const keyInfo = await resolveOpenAICompatKey(args);
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
            const upload = await resolveUploadableFromString(input, {
                defaultMimeType: "image/png",
                fallbackFilename: `image-${i + 1}`,
                maxBytes: 25 * 1024 * 1024,
            });
            imageUploads.push(upload);
        } catch (error) {
            return {
                kind: "completed",
                upstream: new Response(
                    JSON.stringify({
                        error: "Invalid image input. Provide reachable image URLs or valid base64 payloads.",
                        message: error instanceof Error ? error.message : String(error),
                        index: i,
                    }),
                    { status: 400, headers: { "Content-Type": "application/json" } },
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
    if (typeof body.mask === "string" && body.mask.trim().length > 0) {
        try {
            maskUpload = await resolveUploadableFromString(body.mask, {
                defaultMimeType: "image/png",
                fallbackFilename: "mask",
                maxBytes: 4 * 1024 * 1024,
            });
        } catch (error) {
            return {
                kind: "completed",
                upstream: new Response(
                    JSON.stringify({
                        error: "Invalid mask input. Provide a reachable image URL or valid base64 payload.",
                        message: error instanceof Error ? error.message : String(error),
                    }),
                    { status: 400, headers: { "Content-Type": "application/json" } },
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
    form.append("model", body.model);
    form.append("prompt", body.prompt);
    for (const imageUpload of imageUploads) {
        form.append("image", imageUpload.blob, imageUpload.filename);
    }
    if (maskUpload) form.append("mask", maskUpload.blob, maskUpload.filename);
    if (body.size) form.append("size", body.size);
    if (typeof body.n === "number") form.append("n", String(body.n));
    if (body.quality) form.append("quality", body.quality);
    if (body.response_format) form.append("response_format", body.response_format);
    if (body.output_format) form.append("output_format", body.output_format);
    if (typeof body.output_compression === "number") form.append("output_compression", String(body.output_compression));
    if (body.background) form.append("background", body.background);
    if (body.moderation) form.append("moderation", body.moderation);
    if (body.input_fidelity) form.append("input_fidelity", body.input_fidelity);
    if (body.user) form.append("user", body.user);

    const headers = openAICompatHeaders(args.providerId, keyInfo.key);
    delete (headers as any)["Content-Type"];

    const res = await fetch(openAICompatUrl(args.providerId, "/images/edits"), {
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

    const normalized = await res.clone().json().catch(() => undefined);

    if (res.ok && args.pricingCard) {
        const usageMeters = normalized?.usage && typeof normalized.usage === "object"
            ? { ...(normalized.usage as Record<string, number>), requests: 1 }
            : { requests: 1, total_tokens: 0 };
        const pricedUsage = computeBill(usageMeters, args.pricingCard);
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

