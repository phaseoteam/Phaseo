// lib/gateway/providers/openai/endpoints/embeddings.ts
// Purpose: Provider endpoint adapter for openai (embeddings).
// Why: Encapsulates provider-specific request/response mapping.
// How: Defines provider-specific endpoint adapters and configuration helpers.

import type { ProviderExecuteArgs, AdapterResult } from "../../types";
import { EmbeddingsSchema, type EmbeddingsRequest } from "@core/schemas";
import { sanitizePayload } from "../../utils";
import { computeBill } from "@pipeline/pricing/engine";
import { openAICompatHeaders, openAICompatUrl, resolveOpenAICompatKey } from "../../openai-compatible/config";



function mapGatewayToOpenAIEmbeddings(body: EmbeddingsRequest, providerId: string) {
    const req: Record<string, any> = {
        input: body.input,
        model: body.model,
        encoding_format: body.encoding_format,
        dimensions: body.dimensions,
        user: body.user,
    };
    if (providerId === "mistral") {
        const mistralOptions = body.embedding_options?.mistral;
        const outputDimension = mistralOptions?.output_dimension ?? body.dimensions;
        if (typeof outputDimension === "number") {
            req.output_dimension = outputDimension;
        }
        if (mistralOptions?.output_dtype) {
            req.output_dtype = mistralOptions.output_dtype;
        }
    }
    return req;
}

function mapOpenAIToGatewayEmbeddings(json: any): any {
    return {
        object: json.object,
        data: json.data,
        model: json.model,
        usage: json.usage,
    };
}

export async function exec(args: ProviderExecuteArgs): Promise<AdapterResult> {
    const keyInfo = await resolveOpenAICompatKey(args);
    const key = keyInfo.key;
    const sanitizedBody = sanitizePayload(EmbeddingsSchema, args.body);
    const modifiedBody: EmbeddingsRequest = {
        ...sanitizedBody,
        model: args.providerModelSlug || args.model,
    };
    const req = mapGatewayToOpenAIEmbeddings(modifiedBody, args.providerId);
    const res = await fetch(openAICompatUrl(args.providerId, "/embeddings"), {
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
    const normalized = json ? mapOpenAIToGatewayEmbeddings(json) : undefined;
    
    // Calculate pricing
    if (normalized?.usage) {
        const pricedUsage = computeBill(normalized.usage, args.pricingCard);
        bill.cost_cents = pricedUsage.pricing.total_cents;
        bill.currency = pricedUsage.pricing.currency;
        bill.usage = pricedUsage;
    }
    
    return { kind: "completed", upstream: res, bill, normalized, keySource: keyInfo.source, byokKeyId: keyInfo.byokId };
}









