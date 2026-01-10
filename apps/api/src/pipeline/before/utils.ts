// lib/gateway/before/utils.ts
import { z } from "zod";
import { adapterById } from "@providers/index";
import type { ProviderCandidate } from "./types";
import type { GatewayContextData } from "./types";

export function formatZodErrors(error: z.ZodError) {
    return error.issues.map((issue) => ({
        message: issue.message,
        path: issue.path,
        keyword: issue.code,
        params: {},
    }));
}

export function extractModel(body: any): string | null {
    if (!body || typeof body !== "object") return null;
    const raw = (body as any).model;
    if (typeof raw !== "string") return null;
    const trimmed = raw.trim();
    if (!trimmed.length) return null;
    return trimmed;
}

export function buildProviderCandidates(ctx: GatewayContextData): ProviderCandidate[] {
    console.log(`[DEBUG] buildProviderCandidates: input providers:`, ctx.providers);
    const afterSupportsFilter = ctx.providers.filter((p) => p.supportsEndpoint);
    console.log(`[DEBUG] buildProviderCandidates: after supportsEndpoint filter:`, afterSupportsFilter);
    const mapped = afterSupportsFilter
        .map((p) => {
            const adapter = adapterById(p.providerId);
            if (!adapter) {
                console.log(`[DEBUG] buildProviderCandidates: no adapter for providerId: ${p.providerId}`);
                return null;
            }
            return {
                providerId: p.providerId,
                adapter,
                baseWeight: p.baseWeight > 0 ? p.baseWeight : 1,
                byokMeta: p.byokMeta,
                pricingCard: ctx.pricing[p.providerId] ?? null,
                providerModelSlug: p.providerModelSlug,
            } as ProviderCandidate;
        })
        .filter(Boolean) as ProviderCandidate[];
    console.log(`[DEBUG] buildProviderCandidates: final candidates:`, mapped);
    return mapped;
}
