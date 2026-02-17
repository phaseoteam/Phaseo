// lib/gateway/execute/providers.ts
// Purpose: Execute-stage logic for routing, attempts, and provider health.
// Why: Centralizes execution/failover behavior.
// How: Ranks providers using health metrics and weights.

import { routeProviders } from "./routing";
import type { PipelineContext } from "../before/types";
import type { ProviderCandidate } from "../before/types";

export async function rankProviders(
    candidates: ProviderCandidate[],
    ctx: PipelineContext
) {
    const routed = await routeProviders(candidates, {
        endpoint: ctx.endpoint,
        model: ctx.model,
        teamId: ctx.teamId,
        body: ctx.body,
        routingMode: ctx.routingMode ?? ctx.teamSettings?.routingMode ?? null,
        betaChannelEnabled: ctx.teamSettings?.betaChannelEnabled ?? false,
        providerCapabilitiesBeta: ctx.providerCapabilitiesBeta ?? false,
        requestId: ctx.requestId ?? null,
    });
    const ranked = routed.ranked;
    (ctx as any).routingSnapshot = ranked.map((entry) => ({
        provider: entry.adapter.name,
        breaker: entry.health.breaker,
        breaker_until_ms: entry.health.breaker_until_ms,
        score: Number.isFinite(entry.score) ? Number(entry.score.toFixed(6)) : entry.score,
    }));
    (ctx as any).routingDiagnostics = routed.diagnostics;
    return ranked;
}










