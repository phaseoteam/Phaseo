// lib/gateway/before/utils.ts
// Purpose: Before-stage helpers for auth, validation, and context building.
// Why: Small helpers for model extraction and candidate construction.
// How: Provides focused utilities used during request preflight.

import { z } from "zod";
import { adapterFor } from "@providers/index";
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
    return ctx.providers
        .filter((p) => p.supportsEndpoint)
        .map((p) => {
            const adapter = adapterFor(p.providerId, ctx.endpoint);
            if (!adapter) return null;
            return {
                providerId: p.providerId,
                providerStatus: p.providerStatus ?? "not_ready",
                adapter,
                baseWeight: p.baseWeight > 0 ? p.baseWeight : 1,
                byokMeta: p.byokMeta,
                pricingCard: ctx.pricing[p.providerId] ?? null,
                providerModelSlug: p.providerModelSlug,
                inputModalities: p.inputModalities ?? null,
                outputModalities: p.outputModalities ?? null,
                capabilityParams: p.capabilityParams ?? {},
                maxInputTokens: p.maxInputTokens ?? null,
                maxOutputTokens: p.maxOutputTokens ?? null,
            } as ProviderCandidate;
        })
        .filter(Boolean) as ProviderCandidate[];
}
