// lib/gateway/providers/types.ts
// Purpose: Provider adapter module for types.ts.
// Why: Isolates provider-specific configuration and utilities.
// How: Defines provider-specific endpoint adapters and configuration helpers.

import type { Endpoint, GatewayResponsePayload, RequestMeta } from "@core/types";
import type { Bill } from "@pipeline/execute";
import type { PriceCard } from "@pipeline/pricing";
import type { ByokKeyMeta } from "@pipeline/before/types";

export type NormalizedUsage = {
    // Core, provider-agnostic
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
    _ext?: Record<string, number>;
};

export type ProviderExecuteArgs = {
    endpoint: Endpoint;
    model: string;
    body: any;
    meta: RequestMeta & {
        keySource?: "gateway" | "byok";
        byokKeyId?: string | null;
    };
    teamId: string;
    providerId: string;
    byokMeta: ByokKeyMeta[];

    // Preloaded pricing (fail-fast before execute)
    pricingCard: PriceCard;

    // Provider-specific model slug for the request
    providerModelSlug?: string | null;

    // Whether the current invocation expects a streaming response
    stream: boolean;
};

export type AdapterCompletedResult = {
    kind: "completed";
    upstream: Response;
    bill: Bill;
    normalized?: GatewayResponsePayload;
    keySource?: "gateway" | "byok";
    byokKeyId?: string | null;
};

export type AdapterStreamingResult = {
    kind: "stream";
    upstream: Response;
    stream?: ReadableStream<Uint8Array>;
    usageFinalizer?: (() => Promise<Bill | null>) | null;
    bill: Bill;
    normalized?: GatewayResponsePayload;
    keySource?: "gateway" | "byok";
    byokKeyId?: string | null;
};

export type AdapterResult = AdapterCompletedResult | AdapterStreamingResult;

export type ProviderAdapter = {
    name: string;

    execute(args: ProviderExecuteArgs): Promise<AdapterResult>;
};

// Helper: merge provider-specific raw usage into normalized form
export function mergeUsage(base: NormalizedUsage, add?: NormalizedUsage): NormalizedUsage {
    if (!add) return base;
    const out: NormalizedUsage = { ...base };

    const addNum = (k: keyof NormalizedUsage) => {
        const v = add[k];
        if (typeof v === "number") (out as any)[k] = (out as any)[k] ? (out as any)[k] + v : v;
    };
    addNum("input_tokens");
    addNum("output_tokens");
    addNum("total_tokens");

    if (add._ext) {
        out._ext ??= {};
        for (const [k, v] of Object.entries(add._ext)) {
            if (typeof v === "number") out._ext[k] = (out._ext[k] ?? 0) + v;
        }
    }
    return out;
}









