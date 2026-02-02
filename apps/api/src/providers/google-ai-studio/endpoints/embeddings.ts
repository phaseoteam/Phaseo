// lib/gateway/providers/google-ai-studio/endpoints/embeddings.ts
// Purpose: Provider endpoint adapter for google-ai-studio (embeddings).
// Why: Encapsulates provider-specific request/response mapping.
// How: Defines provider-specific endpoint adapters and configuration helpers.

import type { ProviderExecuteArgs, AdapterResult } from "../../types";
import { EmbeddingsSchema, type EmbeddingsRequest } from "@core/schemas";
import { sanitizePayload } from "../../utils";
import { getBindings } from "@/runtime/env";
import { computeBill } from "@pipeline/pricing/engine";
import { normalizeGoogleUsage } from "../usage";
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

function normalizeEmbeddingInput(input: string) {
    return {
        role: "user" as const,
        parts: [{ text: input }],
    };
}

function coerceInput(value: string): string {
    return typeof value === "string" ? value : String(value);
}

function extractEmbeddingUsage(json: any): Record<string, number> | undefined {
    const merged: Record<string, number> = {};
    const mergeUsage = (usage?: Record<string, number>) => {
        if (!usage) return;
        for (const [key, value] of Object.entries(usage)) {
            if (typeof value !== "number") continue;
            merged[key] = (merged[key] ?? 0) + value;
        }
    };

    mergeUsage(normalizeGoogleUsage(json?.usageMetadata));
    const usageEntries: any[] = [];
    if (json?.usageMetadata) usageEntries.push(json.usageMetadata);
    if (Array.isArray(json?.embeddings)) {
        for (const entry of json.embeddings) {
            if (entry?.usageMetadata) usageEntries.push(entry.usageMetadata);
            if (entry?.usage) usageEntries.push(entry.usage);
        }
    }
    if (Array.isArray(json?.requests)) {
        for (const entry of json.requests) {
            if (entry?.usageMetadata) usageEntries.push(entry.usageMetadata);
            if (entry?.usage) usageEntries.push(entry.usage);
        }
    }
    for (const entry of usageEntries) {
        mergeUsage(normalizeGoogleUsage(entry?.usageMetadata ?? entry));
    }
    const readCount = (entry: any) =>
        entry?.totalTokenCount ??
        entry?.totalTokens ??
        entry?.promptTokenCount ??
        entry?.promptTokens ??
        entry?.inputTokenCount ??
        entry?.inputTokens ??
        entry?.tokenCount ??
        entry?.tokens ??
        entry?.usage?.totalTokenCount ??
        entry?.usage?.totalTokens ??
        entry?.usage?.promptTokenCount ??
        entry?.usage?.inputTokenCount ??
        0;
    let total = 0;
    for (const entry of usageEntries) {
        total += readCount(entry);
    }
    if (!total && Object.keys(merged).length) {
        return merged;
    }
    if (!total) return undefined;
    const usage = {
        embedding_tokens: total,
        total_tokens: total,
        input_text_tokens: total,
    };
    return Object.keys(merged).length
        ? { ...merged, ...usage }
        : usage;
}

function mapGoogleToGatewayEmbeddings(json: any, model: string, usageOverride?: Record<string, number>): any {
    const entries = Array.isArray(json?.embeddings)
        ? json.embeddings
        : json?.embedding
            ? [json.embedding]
            : [];

    const data = entries.map((item: any, index: number) => ({
        object: "embedding",
        embedding: item?.values ?? item?.embedding?.values ?? [],
        index,
    }));

    if (!data.length && Array.isArray(json?.data)) {
        // Fallback to pass-through if provider already returns OpenAI shape
        return json;
    }

    const usage = usageOverride ?? extractEmbeddingUsage(json);

    return {
        object: "list",
        data,
        model,
        ...(usage ? { usage } : {}),
    };
}

async function fetchTokenCount(key: string, modelForUrl: string, inputs: string[]) {
    const contents = inputs.map((input) => normalizeEmbeddingInput(coerceInput(input)));
    const res = await fetch(`${BASE_URL}/v1beta/models/${modelForUrl}:countTokens?key=${key}`, {
        method: "POST",
        headers: baseHeaders(key),
        body: JSON.stringify({ contents }),
    });
    const json = await res.clone().json().catch(() => null);
    const total =
        json?.totalTokens ??
        json?.totalTokenCount ??
        json?.tokenCount ??
        json?.tokens ??
        json?.usageMetadata?.totalTokenCount ??
        0;
    if (!total || typeof total !== "number") return undefined;
    return total;
}

export async function exec(args: ProviderExecuteArgs): Promise<AdapterResult> {
    const keyInfo = await resolveApiKey(args);
    const key = keyInfo.key;
    const sanitizedBody = sanitizePayload(EmbeddingsSchema, args.body);
    const modifiedBody: EmbeddingsRequest = {
        ...sanitizedBody,
        model: args.providerModelSlug || args.model,
    };
    const modelForUrl = args.providerModelSlug || args.model;
    const inputs = Array.isArray(modifiedBody.input) ? modifiedBody.input : [modifiedBody.input];
    const isBatch = Array.isArray(modifiedBody.input);
    const googleOptions = modifiedBody.embedding_options?.google;
    const outputDimensionality = googleOptions?.output_dimensionality ?? modifiedBody.dimensions;
    const taskType = googleOptions?.task_type;
    const title = googleOptions?.title;
    const requestModel = `models/${modelForUrl}`;
    const payload = isBatch
        ? {
            requests: inputs.map((input) => ({
                model: requestModel,
                content: normalizeEmbeddingInput(coerceInput(input)),
                ...(taskType ? { taskType } : {}),
                ...(title ? { title } : {}),
                ...(typeof outputDimensionality === "number" ? { outputDimensionality } : {}),
            })),
        }
        : {
            content: normalizeEmbeddingInput(coerceInput(inputs[0])),
            ...(taskType ? { taskType } : {}),
            ...(title ? { title } : {}),
            ...(typeof outputDimensionality === "number" ? { outputDimensionality } : {}),
        };
    const endpoint = isBatch ? ":batchEmbedContents" : ":embedContent";
    const res = await fetch(`${BASE_URL}/v1beta/models/${modelForUrl}${endpoint}?key=${key}`, {
        method: "POST",
        headers: baseHeaders(key),
        body: JSON.stringify(payload),
    });
    const bill = {
        cost_cents: 0,
        currency: "USD" as const,
        usage: undefined as any,
        upstream_id: res.headers.get("x-request-id"),
        finish_reason: null,
    };
    const json = await res.clone().json().catch(() => null);
    let usage = json ? extractEmbeddingUsage(json) : undefined;
    if (!usage) {
        const totalTokens = await fetchTokenCount(key, modelForUrl, inputs);
        if (typeof totalTokens === "number" && totalTokens > 0) {
            usage = {
                embedding_tokens: totalTokens,
                total_tokens: totalTokens,
                input_text_tokens: totalTokens,
            };
        }
    }
    const normalized = json ? mapGoogleToGatewayEmbeddings(json, args.model, usage) : undefined;
    
    // Calculate pricing
    if (normalized?.usage) {
        const pricedUsage = computeBill(normalized.usage, args.pricingCard);
        bill.cost_cents = pricedUsage.pricing.total_cents;
        bill.currency = pricedUsage.pricing.currency;
        bill.usage = pricedUsage;
    }
    
    return { kind: "completed", upstream: res, bill, normalized, keySource: keyInfo.source, byokKeyId: keyInfo.byokId };
}









