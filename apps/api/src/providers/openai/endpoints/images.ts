// lib/gateway/providers/openai/endpoints/images.ts
// Purpose: Provider endpoint adapter for openai (images).
// Why: Encapsulates provider-specific request/response mapping.
// How: Defines provider-specific endpoint adapters and configuration helpers.

import type { ProviderExecuteArgs, AdapterResult } from "../../types";
import { ImagesGenerationSchema, type ImagesGenerationRequest } from "@core/schemas";
import { sanitizePayload } from "../../utils";
import { computeBill } from "@pipeline/pricing/engine";
import { openAICompatHeaders, openAICompatUrl, resolveOpenAICompatKey } from "../../openai-compatible/config";



function mapGatewayToOpenAIImages(body: ImagesGenerationRequest) {
    return {
        prompt: body.prompt,
        model: body.model,
        n: body.n,
        quality: body.quality,
        response_format: body.response_format,
        size: body.size,
        style: body.style,
        user: body.user,
    };
}

function mapOpenAIToGatewayImages(json: any): any {
    return {
        created: json.created,
        data: json.data,
    };
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
        headers: openAICompatHeaders(args.providerId, key),
        body: JSON.stringify(req),
    });
    const bill = {
        cost_cents: 0,
        currency: "USD" as const,
        usage: undefined as any,
        upstream_id: res.headers.get("x-request-id"),
        finish_reason: null,
    };
    const json = await res.clone().json().catch(() => null);
    const normalized = json ? mapOpenAIToGatewayImages(json) : undefined;
    
    // Calculate pricing
    if (normalized?.usage) {
        const pricedUsage = computeBill(normalized.usage, args.pricingCard);
        bill.cost_cents = pricedUsage.pricing.total_cents;
        bill.currency = pricedUsage.pricing.currency;
        bill.usage = pricedUsage;
    }
    
    return { kind: "completed", upstream: res, bill, normalized, keySource: keyInfo.source, byokKeyId: keyInfo.byokId };
}









