// lib/gateway/providers/google-ai-studio/endpoints/video.ts
// Purpose: Provider endpoint adapter for google-ai-studio (video).
// Why: Encapsulates provider-specific request/response mapping.
// How: Defines provider-specific endpoint adapters and configuration helpers.

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
    const durationSeconds = typeof body.duration_seconds === "number"
        ? body.duration_seconds
        : typeof body.duration === "number"
            ? body.duration
            : typeof body.seconds === "string"
                ? Number(body.seconds)
                : typeof body.seconds === "number"
                    ? body.seconds
                    : undefined;
    const aspectRatio = body.aspect_ratio ?? body.ratio;
    const parameters: Record<string, any> = {
        ...(typeof durationSeconds === "number" && !Number.isNaN(durationSeconds) ? { durationSeconds } : {}),
        ...(aspectRatio ? { aspectRatio } : {}),
        ...(body.resolution ? { resolution: body.resolution } : {}),
        ...(body.negative_prompt ? { negativePrompt: body.negative_prompt } : {}),
        ...(body.sample_count ? { sampleCount: body.sample_count } : {}),
        ...(typeof body.seed === "number" ? { seed: body.seed } : {}),
        ...(body.person_generation ? { personGeneration: body.person_generation } : {}),
        ...(body.output_storage_uri ? { storageUri: body.output_storage_uri } : {}),
    };

    return {
        instances: [
            {
                prompt: body.prompt,
            },
        ],
        ...(Object.keys(parameters).length ? { parameters } : {}),
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

function encodeOperationId(operationName: string) {
    const b64 = btoa(operationName).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
    return `gaiop_${b64}`;
}

function mapGoogleToGatewayVideo(json: any, args: ProviderExecuteArgs, request: VideoGenerationRequest): any {
    const usageSeconds =
        json?.videoMetadata?.durationSeconds ??
        json?.response?.videoMetadata?.durationSeconds ??
        request.duration_seconds ??
        request.duration ??
        null;

    const usage = typeof usageSeconds === "number"
        ? { output_video_seconds: usageSeconds }
        : undefined;

    const operationName = json?.name ?? json?.operationName ?? null;
    const createdAt = Math.floor(Date.now() / 1000);

    return {
        id: operationName ? encodeOperationId(operationName) : null,
        object: "video",
        status: "queued",
        created_at: createdAt,
        model: request.model,
        ...(typeof usageSeconds === "number" ? { seconds: usageSeconds } : {}),
        nativeResponseId: operationName ?? json?.responseId ?? json?.id ?? null,
        provider: "google-ai-studio",
        meta: {
            ...buildGatewayMeta(args),
            operation_name: operationName ?? undefined,
        },
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
    const res = await fetch(`${BASE_URL}/v1beta/models/${modelForUrl}:predictLongRunning?key=${key}`, {
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









