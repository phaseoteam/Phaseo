// lib/gateway/execute/providers.ts
// Purpose: Execute-stage logic for routing, attempts, and provider health.
// Why: Centralizes execution/failover behavior.
// How: Ranks providers using health metrics and weights.

import { routeProviders } from "./routing";
import { resolveCacheAwareRoutingPreference } from "./sticky-routing";
import type { PipelineContext } from "../before/types";
import type { ProviderCandidate } from "../before/types";

function resolveCacheAwareRoutingFlag(ctx: PipelineContext): boolean {
    const fallback =
        typeof ctx.teamSettings?.cacheAwareRoutingEnabled === "boolean"
            ? ctx.teamSettings.cacheAwareRoutingEnabled
            : true;
    return resolveCacheAwareRoutingPreference(ctx.body, fallback);
}

export async function rankProviders(
    candidates: ProviderCandidate[],
    ctx: PipelineContext
) {
    const existingRoutingDiagnostics =
        (ctx as any).routingDiagnostics &&
        typeof (ctx as any).routingDiagnostics === "object" &&
        !Array.isArray((ctx as any).routingDiagnostics)
            ? (ctx as any).routingDiagnostics
            : null;
    const routed = await routeProviders(candidates, {
        endpoint: ctx.endpoint,
        model: ctx.model,
        workspaceId: ctx.workspaceId,
        body: ctx.body,
        routingMode: ctx.routingMode ?? ctx.teamSettings?.routingMode ?? null,
        betaChannelEnabled: ctx.teamSettings?.betaChannelEnabled ?? false,
        alphaChannelEnabled: ctx.teamSettings?.alphaChannelEnabled ?? false,
        providerCapabilitiesBeta: ctx.providerCapabilitiesBeta ?? false,
        testingMode: ctx.testingMode ?? false,
        requestId: ctx.requestId ?? null,
        cacheAwareRouting: resolveCacheAwareRoutingFlag(ctx),
		collectDetailedDiagnostics: Boolean(
			ctx.meta?.debug?.enabled || ctx.meta?.returnRoutingDiagnostics,
		),
    });
    const ranked = routed.ranked;
    (ctx as any).routingSnapshot = ranked.map((entry, index) => ({
        rank: index + 1,
        provider: entry.adapter.name,
        provider_id: entry.candidate.providerId,
        provider_api_model_id: entry.candidate.apiModelId ?? null,
        provider_model_slug: entry.candidate.providerModelSlug ?? null,
        breaker: entry.health.breaker,
        breaker_until_ms: entry.health.breaker_until_ms,
        score: Number.isFinite(entry.score) ? Number(entry.score.toFixed(6)) : entry.score,
        score_factor_values: entry.scoreFactorValues,
        provider_status: entry.candidate.providerStatus ?? null,
        provider_routing_status: entry.candidate.providerRoutingStatus ?? null,
        model_routing_status: entry.candidate.modelRoutingStatus ?? null,
        capability_status: entry.candidate.capabilityStatus ?? null,
    }));
    (ctx as any).routingDiagnostics = existingRoutingDiagnostics
        ? { ...existingRoutingDiagnostics, ...routed.diagnostics }
        : routed.diagnostics;
    return ranked;
}

