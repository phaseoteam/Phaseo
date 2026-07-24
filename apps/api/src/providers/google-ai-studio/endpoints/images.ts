// lib/gateway/providers/google-ai-studio/endpoints/images.ts
// Purpose: Provider endpoint adapter for google-ai-studio (images).
// Why: Encapsulates provider-specific request/response mapping.
// How: Defines provider-specific endpoint adapters and configuration helpers.

import type { ProviderExecuteArgs, AdapterResult } from "../../types";
import { ImagesGenerationSchema, type ImagesGenerationRequest } from "@core/schemas";
import { sanitizePayload } from "../../utils";
import { getBindings } from "@/runtime/env";
import { computeBill } from "@pipeline/pricing/engine";
import { resolveProviderKey, type ResolvedKey } from "../../keys";
import { normalizeGoogleUsage } from "../usage";

const BASE_URL = "https://generativelanguage.googleapis.com";

async function resolveApiKey(args: ProviderExecuteArgs): Promise<ResolvedKey> {
    return resolveProviderKey(args, () => getBindings().GOOGLE_AI_STUDIO_API_KEY);
}

function baseHeaders() {
    return {
        "Content-Type": "application/json",
    };
}

function isGeminiImageModel(model: string): boolean {
    const normalized = String(model ?? "").trim().toLowerCase();
    return normalized.includes("gemini") || normalized.includes("nano-banana");
}

function gcd(a: number, b: number): number {
    let x = Math.abs(a);
    let y = Math.abs(b);
    while (y !== 0) {
        const r = x % y;
        x = y;
        y = r;
    }
    return x || 1;
}

const GOOGLE_IMAGE_ALLOWED_ASPECT_RATIOS = [
    "1:1",
    "1:4",
    "1:8",
    "2:3",
    "3:2",
    "3:4",
    "4:1",
    "4:3",
    "4:5",
    "5:4",
    "8:1",
    "9:16",
    "16:9",
    "21:9",
] as const;

const GOOGLE_IMAGE_ALLOWED_ASPECT_RATIO_SET = new Set<string>(GOOGLE_IMAGE_ALLOWED_ASPECT_RATIOS);

function parseRatio(value: string): { width: number; height: number } | null {
    const match = /^(\d+):(\d+)$/i.exec(value.trim());
    if (!match) return null;
    const width = Number(match[1]);
    const height = Number(match[2]);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        return null;
    }
    return { width, height };
}

function closestSupportedAspectRatio(width: number, height: number): string | undefined {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        return undefined;
    }
    const target = width / height;
    let bestRatio: string | undefined;
    let bestDelta = Number.POSITIVE_INFINITY;
    for (const ratio of GOOGLE_IMAGE_ALLOWED_ASPECT_RATIOS) {
        const parsed = parseRatio(ratio);
        if (!parsed) continue;
        const candidate = parsed.width / parsed.height;
        const delta = Math.abs(target - candidate);
        if (delta < bestDelta) {
            bestDelta = delta;
            bestRatio = ratio;
        }
    }
    return bestRatio;
}

function toAspectRatio(size: string | undefined): string | undefined {
    if (!size) return undefined;
    const ratioLike = parseRatio(size);
    if (ratioLike) {
        const ratioLabel = `${ratioLike.width}:${ratioLike.height}`;
        if (GOOGLE_IMAGE_ALLOWED_ASPECT_RATIO_SET.has(ratioLabel)) {
            return ratioLabel;
        }
        return closestSupportedAspectRatio(ratioLike.width, ratioLike.height);
    }
    const dimensionLike = /^(\d+)x(\d+)$/i.exec(size.trim());
    if (!dimensionLike) return undefined;
    const width = Number(dimensionLike[1]);
    const height = Number(dimensionLike[2]);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        return undefined;
    }
    const divisor = gcd(width, height);
    const reducedWidth = Math.floor(width / divisor);
    const reducedHeight = Math.floor(height / divisor);
    const reducedRatio = `${reducedWidth}:${reducedHeight}`;
    if (GOOGLE_IMAGE_ALLOWED_ASPECT_RATIO_SET.has(reducedRatio)) {
        return reducedRatio;
    }
    return closestSupportedAspectRatio(width, height);
}

function toGeminiImageSize(quality: string | undefined): "512" | "1K" | "2K" | "4K" | undefined {
    if (!quality) return undefined;
    const normalized = quality.trim().toUpperCase();
    if (normalized === "512") return "512";
    if (normalized === "1K") return "1K";
    if (normalized === "2K") return "2K";
    if (normalized === "4K") return "4K";
    return undefined;
}

function mapGatewayToGoogleImages(body: ImagesGenerationRequest) {
    const aspectRatio = toAspectRatio(body.size);
    return {
        prompt: body.prompt,
        ...(typeof body.n === "number" ? { numberOfImages: body.n } : {}),
        ...(aspectRatio ? { aspectRatio } : {}),
    };
}

function mapGatewayToGeminiGenerateContent(body: ImagesGenerationRequest) {
    const imageConfig: Record<string, unknown> = {};
    const aspectRatio = toAspectRatio(body.size);
    const imageSize = toGeminiImageSize(body.quality);
    if (aspectRatio) imageConfig.aspectRatio = aspectRatio;
    if (imageSize) imageConfig.imageSize = imageSize;

    const generationConfig: Record<string, unknown> = {
        responseModalities: ["IMAGE"],
    };
    if (typeof body.n === "number" && Number.isFinite(body.n)) {
        generationConfig.candidateCount = Math.max(1, Math.min(4, Math.floor(body.n)));
    }
    if (Object.keys(imageConfig).length > 0) {
        generationConfig.imageConfig = imageConfig;
    }

    return {
        contents: [
            {
                role: "user",
                parts: [{ text: body.prompt }],
            },
        ],
        generationConfig,
    };
}

function mapGoogleGenerateImageToGatewayImages(json: any): any {
    const data: Array<Record<string, unknown>> = [];

    for (const item of json?.generatedImages ?? []) {
        const bytes = item?.image?.imageBytes ?? item?.imageBytes;
        if (typeof bytes === "string" && bytes.trim()) {
            data.push({ b64_json: bytes.trim() });
            continue;
        }
        const uri = item?.image?.uri ?? item?.uri;
        if (typeof uri === "string" && uri.trim()) {
            data.push({ url: uri.trim() });
        }
    }

    for (const candidate of json?.candidates ?? []) {
        const output = candidate?.output;
        if (typeof output === "string" && output.trim()) {
            data.push({ url: output.trim() });
        }
    }

    const usage = normalizeGoogleUsage(json?.usageMetadata);
    return {
        created: Math.floor(Date.now() / 1000),
        data,
        ...(usage ? { usage } : {}),
    };
}

function mapGeminiGenerateContentToGatewayImages(json: any): any {
    const data: Array<Record<string, unknown>> = [];

    for (const candidate of json?.candidates ?? []) {
        const parts = candidate?.content?.parts ?? [];
        for (const part of parts) {
            const inline = part?.inline_data ?? part?.inlineData;
            const imageBytes = inline?.data;
            if (typeof imageBytes === "string" && imageBytes.trim()) {
                data.push({ b64_json: imageBytes.trim() });
                continue;
            }
            const text = part?.text;
            if (typeof text === "string" && /^https?:\/\//i.test(text.trim())) {
                data.push({ url: text.trim() });
            }
        }
    }

    const usage = normalizeGoogleUsage(json?.usageMetadata);
    return {
        created: Math.floor(Date.now() / 1000),
        data,
        ...(usage ? { usage } : {}),
    };
}

export async function exec(args: ProviderExecuteArgs): Promise<AdapterResult> {
    const keyInfo = await resolveApiKey(args);
    const key = keyInfo.key;
    const sanitizedBody = sanitizePayload(ImagesGenerationSchema, args.body);
    const modifiedBody: ImagesGenerationRequest = {
        ...sanitizedBody,
        model: args.providerModelSlug || args.model,
    };
    const modelForUrl = args.providerModelSlug || args.model;
    const useGeminiContentEndpoint = isGeminiImageModel(modelForUrl);
    const req = useGeminiContentEndpoint
        ? mapGatewayToGeminiGenerateContent(modifiedBody)
        : mapGatewayToGoogleImages(modifiedBody);
    const path = useGeminiContentEndpoint ? "generateContent" : "generateImage";
    const res = await (args.upstreamTiming?.fetch ?? fetch)(`${BASE_URL}/v1beta/models/${encodeURIComponent(modelForUrl)}:${path}?key=${encodeURIComponent(key)}`, {
        method: "POST",
        headers: baseHeaders(),
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
    const normalized = json
        ? (useGeminiContentEndpoint
            ? mapGeminiGenerateContentToGatewayImages(json)
            : mapGoogleGenerateImageToGatewayImages(json))
        : undefined;
    
    // Calculate pricing
    if (res.ok && args.pricingCard) {
        const usageMeters = normalized?.usage && typeof normalized.usage === "object"
            ? { ...(normalized.usage as Record<string, number>), requests: 1 }
            : { requests: 1, total_tokens: 0 };
        const pricedUsage = computeBill(usageMeters, args.pricingCard);
        bill.cost_cents = pricedUsage.pricing.total_cents;
        bill.currency = pricedUsage.pricing.currency;
        bill.usage = pricedUsage;
    }
    
    return { kind: "completed", upstream: res, bill, normalized, keySource: keyInfo.source, byokKeyId: keyInfo.byokId };
}









