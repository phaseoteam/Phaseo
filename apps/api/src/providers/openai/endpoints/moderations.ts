// lib/gateway/providers/openai/endpoints/moderations.ts
// Purpose: Provider endpoint adapter for openai (moderations).
// Why: Encapsulates provider-specific request/response mapping.
// How: Defines provider-specific endpoint adapters and configuration helpers.

import type { ProviderExecuteArgs, AdapterResult } from "../../types";
import { ModerationsSchema, type ModerationsRequest } from "@core/schemas";
import { buildAdapterPayload } from "../../utils";
import { computeBill } from "@pipeline/pricing/engine";
import { openAICompatHeaders, openAICompatUrl, resolveOpenAICompatKey } from "../../openai-compatible/config";



function mapGatewayToOpenAIModerations(body: ModerationsRequest) {
    return {
        input: body.input,
        model: body.model,
        // meta is only for gateway response shaping; not forwarded upstream
    };
}

type ModerationContext = {
    requestId?: string | null;
    providerId: string;
    model: string;
    generationMs: number | null;
    latencyMs: number | null;
};

function mapOpenAIToGatewayModerations(json: any, ctx: ModerationContext): any {
    return {
        ...json,
        // Always expose the gateway-generated id; keep the upstream id in nativeResponseId
        id: ctx.requestId ?? json?.id ?? null,
        model: ctx.model ?? json?.model,
        provider: ctx.providerId,
        meta: {
            generation_ms: ctx.generationMs,
            latency_ms: ctx.latencyMs,
        },
    };
}

export async function exec(args: ProviderExecuteArgs): Promise<AdapterResult> {
    const keyInfo = await resolveOpenAICompatKey(args);
    const key = keyInfo.key;
    const { adapterPayload } = buildAdapterPayload(ModerationsSchema, args.body, ["meta"]);
    const modifiedBody: ModerationsRequest = {
        ...adapterPayload,
        model: args.providerModelSlug || args.model,
    };
    const req = mapGatewayToOpenAIModerations(modifiedBody);
    const startedAt = Date.now();
    const res = await fetch(openAICompatUrl(args.providerId, "/moderations"), {
        method: "POST",
        headers: openAICompatHeaders(args.providerId, key),
        body: JSON.stringify(req),
    });
    const latencyMs = Date.now() - startedAt;
    const generationHeader = res.headers.get("openai-processing-ms");
    const generationMs = Number.isFinite(Number(generationHeader)) ? Number(generationHeader) : latencyMs;
    const bill = {
        cost_cents: 0,
        currency: "USD" as const,
        usage: undefined as any,
        upstream_id: res.headers.get("x-request-id"),
        finish_reason: null,
    };
    const json = await res.clone().json().catch(() => null);
    const normalized = json
        ? mapOpenAIToGatewayModerations(json, {
            requestId: args.meta.requestId,
            providerId: args.providerId,
            model: args.model,
            generationMs: generationMs ?? null,
            latencyMs: latencyMs ?? null,
        })
        : undefined;
    
    // Calculate pricing
    if (normalized?.usage) {
        const pricedUsage = computeBill(normalized.usage, args.pricingCard);
        bill.cost_cents = pricedUsage.pricing.total_cents;
        bill.currency = pricedUsage.pricing.currency;
        bill.usage = pricedUsage;
    }
    
    return { kind: "completed", upstream: res, bill, normalized, keySource: keyInfo.source, byokKeyId: keyInfo.byokId };
}









