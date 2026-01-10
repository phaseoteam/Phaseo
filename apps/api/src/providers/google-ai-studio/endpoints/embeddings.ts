// lib/gateway/providers/google-ai-studio/endpoints/embeddings.ts
import type { ProviderExecuteArgs, AdapterResult } from "../../types";
import { EmbeddingsSchema, type EmbeddingsRequest } from "@core/schemas";
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
    const usageEntries: any[] = [];
    if (json?.usageMetadata) usageEntries.push(json.usageMetadata);
    if (Array.isArray(json?.embeddings)) {
        for (const entry of json.embeddings) {
            if (entry?.usageMetadata) usageEntries.push(entry.usageMetadata);
        }
    }
    let total = 0;
    for (const entry of usageEntries) {
        total += entry?.totalTokenCount ?? entry?.inputTokenCount ?? entry?.promptTokenCount ?? 0;
    }
    if (!total) return undefined;
    return {
        embedding_tokens: total,
        total_tokens: total,
        input_text_tokens: total,
    };
}

function mapGoogleToGatewayEmbeddings(json: any, model: string): any {
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

    const usage = extractEmbeddingUsage(json);

    return {
        object: "list",
        data,
        model,
        ...(usage ? { usage } : {}),
    };
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
    const payload = isBatch
        ? {
            requests: inputs.map((input) => ({
                content: normalizeEmbeddingInput(coerceInput(input)),
            })),
        }
        : {
            content: normalizeEmbeddingInput(coerceInput(inputs[0])),
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
    const normalized = json ? mapGoogleToGatewayEmbeddings(json, args.model) : undefined;
    
    // Calculate pricing
    if (normalized?.usage) {
        const pricedUsage = computeBill(normalized.usage, args.pricingCard);
        bill.cost_cents = pricedUsage.pricing.total_cents;
        bill.currency = pricedUsage.pricing.currency;
        bill.usage = pricedUsage;
    }
    
    return { kind: "completed", upstream: res, bill, normalized, keySource: keyInfo.source, byokKeyId: keyInfo.byokId };
}
