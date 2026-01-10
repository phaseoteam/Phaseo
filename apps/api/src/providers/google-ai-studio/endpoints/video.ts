// lib/gateway/providers/google-ai-studio/endpoints/video.ts
import type { ProviderExecuteArgs, AdapterResult } from "../../types";
import { VideoGenerationSchema, type VideoGenerationRequest } from "@core/schemas";
import { sanitizePayload } from "../../utils";
import { getBindings } from "@/runtime/env";
import { computeBill } from "@pipeline/pricing/engine";
import { resolveProviderKey, type ResolvedKey } from "../../keys";

const BASE_URL = "https://generativelanguage.googleapis.com";

async function resolveApiKey(args: ProviderExecuteArgs): Promise<ResolvedKey> {
    return resolveProviderKey(args, () => getBindings().GOOGLE_AI_STUDIO_API_KEY);
}

function baseHeaders(key: string) {
    return {
        "Content-Type": "application/json",
    };
}

function mapGatewayToGoogleVideo(body: VideoGenerationRequest) {
    return {
        contents: [
            {
                role: "user",
                parts: [{ text: body.prompt }],
            },
        ],
        generationConfig: {
            responseModalities: ["VIDEO"],
            ...(body.duration || body.ratio
                ? {
                    videoConfig: {
                        ...(typeof body.duration === "number" ? { durationSeconds: body.duration } : {}),
                        ...(body.ratio ? { aspectRatio: body.ratio } : {}),
                    },
                }
                : {}),
        },
    };
}

function buildGatewayMeta(args: ProviderExecuteArgs) {
    return {
        requestId: args.meta.requestId,
        provider: "google-ai-studio",
        endpoint: args.endpoint,
        model: args.model,
        appTitle: args.meta.appTitle ?? undefined,
        referer: args.meta.referer ?? undefined,
    };
}

function mapGoogleToGatewayVideo(json: any, args: ProviderExecuteArgs, request: VideoGenerationRequest): any {
    const usageSeconds =
        json?.videoMetadata?.durationSeconds ??
        json?.response?.videoMetadata?.durationSeconds ??
        request.duration ??
        null;

    const usage = typeof usageSeconds === "number"
        ? { output_video_seconds: usageSeconds }
        : undefined;

    return {
        nativeResponseId: json?.responseId ?? json?.id ?? null,
        provider: "google-ai-studio",
        meta: buildGatewayMeta(args),
        result: json,
        ...(usage ? { usage } : {}),
    };
}

export async function exec(args: ProviderExecuteArgs): Promise<AdapterResult> {
    const keyInfo = await resolveApiKey(args);
    const key = keyInfo.key;
    const sanitizedBody = sanitizePayload(VideoGenerationSchema, args.body);
    const modifiedBody: VideoGenerationRequest = {
        ...sanitizedBody,
        model: args.providerModelSlug || args.model,
    };
    const modelForUrl = args.providerModelSlug || args.model;
    const req = mapGatewayToGoogleVideo(modifiedBody);
    const res = await fetch(`${BASE_URL}/v1beta/models/${modelForUrl}:generateContent?key=${key}`, {
        method: "POST",
        headers: baseHeaders(key),
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
    const normalized = json ? mapGoogleToGatewayVideo(json, args, modifiedBody) : undefined;
    
    // Calculate pricing
    if (normalized?.usage) {
        const pricedUsage = computeBill(normalized.usage, args.pricingCard);
        bill.cost_cents = pricedUsage.pricing.total_cents;
        bill.currency = pricedUsage.pricing.currency;
        bill.usage = pricedUsage;
    }
    
    return { kind: "completed", upstream: res, bill, normalized, keySource: keyInfo.source, byokKeyId: keyInfo.byokId };
}
