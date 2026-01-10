// lib/gateway/execute/providers.ts
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
    });
    (ctx as any).routingSnapshot = ranked.map((entry) => ({
        provider: entry.adapter.name,
        breaker: entry.health.breaker,
        breaker_until_ms: entry.health.breaker_until_ms,
    }));
    return ranked;
}
