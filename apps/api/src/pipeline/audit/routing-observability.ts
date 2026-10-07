export type RoutingInput = {
    provider?: string | null;
    providerApiModelId?: string | null;
    providerModelSlug?: string | null;
    requestedModel: string;
    endpoint: string;
    providerAttempts?: Array<Record<string, unknown>> | null;
    routingSnapshot?: Array<Record<string, unknown>> | null;
    routingDiagnostics?: Record<string, unknown> | null;
};

export function toProviderModelId(provider: unknown, model: unknown): string | null {
    const providerId = typeof provider === "string" ? provider.trim() : "";
    const modelSlug = typeof model === "string" ? model.trim() : "";
    return providerId && modelSlug ? `${providerId}:${modelSlug}` : null;
}

export function buildRoutingObservability(args: RoutingInput) {
    const asJsonObject = (value: unknown): Record<string, any> =>
        value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
    const routingDiagnostics = asJsonObject(args.routingDiagnostics);
    const routingAlgorithm = asJsonObject(routingDiagnostics.algorithm);
    const factorKeys = [
        "success_rate",
        "latency_score",
        "tail_latency_score",
        "throughput_score",
        "price_score",
        "reliability_sample",
        "reliability_observations",
        "token_affinity",
        "base_weight",
        "rollout_multiplier",
        "routing_multiplier",
        "cache_boost_multiplier",
        "latency_preference_multiplier",
        "throughput_preference_multiplier",
    ] as const;
    const attempts = Array.isArray(args.providerAttempts) ? args.providerAttempts : [];
    const normalizedAttempts = attempts.map((attempt, index) => {
        const status = Number(attempt.status);
        const latency = Number(attempt.latency_ms ?? attempt.duration_ms);
        return {
            // The persisted relation keys attempts by sequence. Use array order
            // so duplicate or missing caller numbers cannot abort the whole RPC.
            attempt_number: index + 1,
            provider: typeof attempt.provider === "string" ? attempt.provider : null,
            provider_model_id: toProviderModelId(attempt.provider, attempt.provider_model_slug),
            provider_api_model_id:
                typeof attempt.provider_model_slug === "string" ? attempt.provider_model_slug :
                typeof attempt.api_model_id === "string" ? attempt.api_model_id : null,
            status_code: Number.isFinite(status) && status >= 100 && status <= 599 ? status : null,
            success: attempt.outcome === "success",
            error_code: typeof attempt.type === "string" && attempt.outcome !== "success"
                ? attempt.type
                : null,
            failure_class: typeof attempt.outcome === "string" && attempt.outcome !== "success"
                ? attempt.outcome
                : null,
            latency_ms: Number.isFinite(latency) ? Math.max(0, Math.round(latency)) : null,
            credential_phase: typeof attempt.credential_phase === "string" ? attempt.credential_phase : null,
            key_source: typeof attempt.key_source === "string" ? attempt.key_source : null,
            response_kind: typeof attempt.response_kind === "string" ? attempt.response_kind : null,
            retryable: attempt.retryable === true,
            was_probe: attempt.was_probe === true,
        };
    });
    const attemptedKeys = new Set(normalizedAttempts.map((attempt) =>
        `${attempt.provider ?? ""}::${attempt.provider_api_model_id ?? ""}`
    ));
    const rankedDecisions = (Array.isArray(args.routingSnapshot) ? args.routingSnapshot : [])
        .slice(0, 128)
        .map((entry, index) => {
            const provider = typeof entry.provider_id === "string"
                ? entry.provider_id
                : typeof entry.provider === "string" ? entry.provider : null;
            const providerModelSlug = typeof entry.provider_model_slug === "string"
                ? entry.provider_model_slug
                : null;
            const providerApiModelId = typeof entry.provider_api_model_id === "string"
                ? (providerModelSlug
                    ? providerModelSlug
                    : entry.provider_api_model_id)
                : providerModelSlug;
            return {
                decision_order: index + 1,
                decision: "ranked",
                rank: Number.isFinite(Number(entry.rank)) ? Number(entry.rank) : index + 1,
                provider,
                provider_model_id: toProviderModelId(provider, entry.provider_model_slug),
                provider_api_model_id: providerApiModelId,
                score: Number.isFinite(Number(entry.score)) ? Number(entry.score) : null,
                selected: provider === args.provider && (
                    args.providerModelSlug
                        ? providerModelSlug === args.providerModelSlug
                        : !args.providerApiModelId || providerApiModelId === args.providerApiModelId
                ),
                attempted: attemptedKeys.has(`${provider ?? ""}::${providerApiModelId ?? ""}`) ||
                    normalizedAttempts.some((attempt) => attempt.provider === provider),
                breaker: typeof entry.breaker === "string" ? entry.breaker : null,
                breaker_until_ms: Number.isFinite(Number(entry.breaker_until_ms))
                    ? Number(entry.breaker_until_ms)
                    : null,
                provider_status: typeof entry.provider_status === "string" ? entry.provider_status : null,
                provider_routing_status: typeof entry.provider_routing_status === "string"
                    ? entry.provider_routing_status : null,
                model_routing_status: typeof entry.model_routing_status === "string"
                    ? entry.model_routing_status : null,
                capability_status: typeof entry.capability_status === "string"
                    ? entry.capability_status : null,
                score_factors: Array.isArray(entry.score_factor_values)
                    ? Object.fromEntries(factorKeys.flatMap((key, factorIndex) => {
                        const value = Number(entry.score_factor_values?.[factorIndex]);
                        return Number.isFinite(value)
                            ? [[key, Number(value.toFixed(6))]]
                            : [];
                    }))
                    : entry.score_factors && typeof entry.score_factors === "object"
                        ? entry.score_factors : {},
                score_trace: entry.score_trace && typeof entry.score_trace === "object"
                    ? entry.score_trace : {},
            };
        });
    const filterStages = Array.isArray((args.routingDiagnostics as any)?.filterStages)
        ? (args.routingDiagnostics as any).filterStages
        : [];
    const routingStageExclusions = filterStages.flatMap((stage: any) =>
        (Array.isArray(stage?.droppedProviders) ? stage.droppedProviders : []).map((entry: any) => ({
            decision_order: rankedDecisions.length + 1,
            decision: "excluded",
            rank: null,
            provider: typeof entry?.providerId === "string" ? entry.providerId : null,
            provider_model_id: toProviderModelId(entry?.providerId, entry?.providerModelSlug),
            provider_api_model_id:
                typeof entry?.apiModelId === "string" ? entry.apiModelId :
                typeof entry?.providerModelSlug === "string" ? entry.providerModelSlug : null,
            score: null,
            selected: false,
            attempted: false,
            exclusion_stage: typeof stage?.stage === "string" ? stage.stage : null,
            exclusion_reason: typeof entry?.reason === "string" ? entry.reason : null,
            score_factors: {},
            score_trace: {},
        }))
    );
    const workspacePolicy = (args.routingDiagnostics as any)?.workspacePolicy;
    const workspacePolicyDrops = [
        ...(Array.isArray(workspacePolicy?.droppedProviders) ? workspacePolicy.droppedProviders : []),
        ...(Array.isArray(workspacePolicy?.droppedByPrivacy) ? workspacePolicy.droppedByPrivacy : []),
    ];
    const seenExclusions = new Set(routingStageExclusions.map((entry: any) =>
        `${entry.provider ?? ""}::${entry.provider_api_model_id ?? ""}`
    ));
    const workspacePolicyExclusions = workspacePolicyDrops.flatMap((entry: any) => {
        const provider = typeof entry?.providerId === "string" ? entry.providerId : null;
        const providerApiModelId =
            typeof entry?.apiModelId === "string" ? entry.apiModelId :
            typeof entry?.providerModelSlug === "string" ? entry.providerModelSlug : null;
        const key = `${provider ?? ""}::${providerApiModelId ?? ""}`;
        if (!provider || seenExclusions.has(key)) return [];
        seenExclusions.add(key);
        return [{
            decision_order: rankedDecisions.length + 1,
            decision: "excluded",
            rank: null,
            provider,
            provider_model_id: toProviderModelId(provider, entry?.providerModelSlug),
            provider_api_model_id: providerApiModelId,
            score: null,
            selected: false,
            attempted: false,
            exclusion_stage: "workspace_policy",
            exclusion_reason: typeof entry?.reason === "string" ? entry.reason : "excluded_by_workspace_policy",
            score_factors: {},
            score_trace: {},
        }];
    });
    const excludedDecisions = [...routingStageExclusions, ...workspacePolicyExclusions]
        .slice(0, Math.max(0, 128 - rankedDecisions.length))
        .map((entry: Record<string, unknown>, index: number): Record<string, unknown> => ({
            ...entry,
            decision_order: rankedDecisions.length + index + 1,
        }));
    const routingTrace: { algorithm: Record<string, any>; [key: string]: any } = {
                algorithm: {
                    ...routingAlgorithm,
                    poolBounds: asJsonObject(routingAlgorithm.poolBounds),
                },
                model: routingDiagnostics.model ?? args.requestedModel,
                endpoint: routingDiagnostics.endpoint ?? args.endpoint,
                priority: routingDiagnostics.priority ?? null,
                routing_mode: routingDiagnostics.routingMode ?? null,
                requested_routing: asJsonObject(routingDiagnostics.requestedRouting),
                sticky_routing: asJsonObject(routingDiagnostics.stickyRouting),
                final_candidate_count: routingDiagnostics.finalCandidateCount ?? rankedDecisions.length,
            };
    return { normalizedAttempts, rankedDecisions, excludedDecisions, routingTrace };
}
