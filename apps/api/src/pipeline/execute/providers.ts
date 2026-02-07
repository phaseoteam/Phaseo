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
    const ranked = await routeProviders(candidates, {
        endpoint: ctx.endpoint,
        model: ctx.model,
        teamId: ctx.teamId,
        body: ctx.body,
        routingMode: ctx.routingMode ?? ctx.teamSettings?.routingMode ?? null,
        betaChannelEnabled: ctx.teamSettings?.betaChannelEnabled ?? false,
        requestId: ctx.requestId ?? null,
    });
    (ctx as any).routingSnapshot = ranked.map((entry) => ({
        provider: entry.adapter.name,
        breaker: entry.health.breaker,
        breaker_until_ms: entry.health.breaker_until_ms,
    }));
    return ranked;
}










