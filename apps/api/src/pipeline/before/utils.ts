// lib/gateway/before/utils.ts
// Purpose: Before-stage helpers for auth, validation, and context building.
// Why: Small helpers for model extraction and candidate construction.
// How: Provides focused utilities used during request preflight.

import { z } from "zod";
import { adapterFor } from "@providers/index";
import type { Endpoint } from "@core/types";
import type { ProviderCandidate } from "./types";
import type { GatewayContextData } from "./types";
import type { ProviderCandidateBuildDiagnostics } from "./types";

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

export function buildProviderCandidatesWithDiagnostics(
    ctx: GatewayContextData,
): { candidates: ProviderCandidate[]; diagnostics: ProviderCandidateBuildDiagnostics } {
    const droppedUnsupportedEndpoint: string[] = [];
    const droppedMissingAdapter: Array<{ providerId: string; endpoint: Endpoint }> = [];
    const candidates: ProviderCandidate[] = [];
    const endpoint = ctx.endpoint as Endpoint;

    for (const provider of ctx.providers ?? []) {
        if (!provider.supportsEndpoint) {
            droppedUnsupportedEndpoint.push(provider.providerId);
            continue;
        }
        const adapter = adapterFor(provider.providerId, endpoint);
        if (!adapter) {
            droppedMissingAdapter.push({
                providerId: provider.providerId,
                endpoint,
            });
            continue;
        }
        candidates.push({
            providerId: provider.providerId,
            providerStatus: provider.providerStatus ?? "not_ready",
            adapter,
            baseWeight: provider.baseWeight > 0 ? provider.baseWeight : 1,
            byokMeta: provider.byokMeta,
            pricingCard: ctx.pricing[provider.providerId] ?? null,
            providerModelSlug: provider.providerModelSlug,
            inputModalities: provider.inputModalities ?? null,
            outputModalities: provider.outputModalities ?? null,
            capabilityParams: provider.capabilityParams ?? {},
            maxInputTokens: provider.maxInputTokens ?? null,
            maxOutputTokens: provider.maxOutputTokens ?? null,
        });
    }

    const diagnostics: ProviderCandidateBuildDiagnostics = {
        totalProviders: Array.isArray(ctx.providers) ? ctx.providers.length : 0,
        supportsEndpointCount: (ctx.providers ?? []).filter((provider) => provider.supportsEndpoint).length,
        droppedUnsupportedEndpoint,
        droppedMissingAdapter,
        candidateCount: candidates.length,
    };

    return { candidates, diagnostics };
}

export function buildProviderCandidates(ctx: GatewayContextData): ProviderCandidate[] {
    return buildProviderCandidatesWithDiagnostics(ctx).candidates;
}
