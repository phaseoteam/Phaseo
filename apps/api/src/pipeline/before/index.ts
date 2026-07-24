// lib/gateway/before/index.ts
// Purpose: Before-stage helpers for auth, validation, and context building.
// Why: Keeps pre-execution logic centralized and consistent.
// How: Orchestrates auth, validation, and context loading to build PipelineContext.

import { z } from "zod";
import { getBindings } from "@/runtime/env";
import { schemaFor } from "@core/schemas";
import type { Endpoint, RequestBetaOptions, RequestMeta } from "@core/types";
import type { PipelineContext } from "./types";
import { guardAuth, guardJson, guardZod, guardModel, guardContext, makeMeta, normalizeReturnFlag } from "./guards";
import { err } from "./http";
import { Timer } from "../telemetry/timer";
import { resolveCapabilityFromEndpoint } from "@/lib/config/capabilityToEndpoints";
import { validateCapabilities } from "./capabilityValidation";
import { isDebugAllowed } from "../debug";
import { isProviderCapabilityEnabled, normalizeCapability } from "@/executors";
import { adapterFor } from "@/providers/index";
import type { ProviderEnablementDiagnostics } from "./types";
import {
	isPerfGatewayEndpointAllowed,
	isTestingModeRequested,
	resolvePerfGatewayAccess,
	resolveTestingMode,
} from "./testingMode";
import { normalizeGatewayPlugins, resolveGatewayPlugins } from "@/plugins/normalize";
import { findUnknownGatewayPluginIds } from "@/plugins/registry";
import { validateSynchronousTextServiceTierRequest } from "./serviceTierValidation";
import {
	collectUnsupportedRoutingFields,
	getEffectiveRoutingHints,
	normalizeRequestRoutingBody,
} from "../requestRouting";
import { fetchWorkspacePolicy, applyWorkspacePolicy } from "./workspacePolicy";

function resolveRequestRoutingModeOverride(
    body: any,
    fallback: string | null,
): string | null {
    const requestedMode = getEffectiveRoutingHints(body).requestedMode;
    if (typeof requestedMode !== "string") return fallback;

    const normalized = requestedMode.trim().toLowerCase();
    if (
        normalized === "price" ||
        normalized === "pricing" ||
        normalized === "cost"
    ) {
        return "price";
    }
    if (normalized === "latency" || normalized === "speed") {
        return "latency";
    }
    if (normalized === "throughput" || normalized === "tps") {
        return "throughput";
    }
    if (normalized === "balanced" || normalized === "default") {
        return "balanced";
    }
    return fallback;
}

function objectOrEmpty(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value)
        ? { ...(value as Record<string, unknown>) }
        : {};
}

function applyWorkspacePrivacyRoutingDefaults(
    body: any,
    teamSettings: PipelineContext["teamSettings"] | null | undefined,
): any {
    if (!teamSettings?.privacyZdrOnly) return body;
    return {
        ...body,
        routing: {
            ...objectOrEmpty(body?.routing),
            require_zero_data_retention: true,
            zdr: true,
        },
    };
}

function hasItems(value: unknown): boolean {
    return Array.isArray(value) && value.length > 0;
}

function classifyWorkspaceProviderFilterFailure(diagnostics: {
    providerAllowlist: string[];
    providerAllowlistConfigured?: boolean;
    providerBlocklist: string[];
    requestProviderOnly: string[];
    requestProviderIgnore: string[];
    activeGuardrailIds: string[];
    allowedApiModels: string[];
    beforeCount: number;
}): {
    errorType: "user" | "system";
    errorOrigin: "user" | "gateway";
    operationalKind: string;
    reason: string;
} {
    const hasRequestProviderFilter =
        hasItems(diagnostics.requestProviderOnly) ||
        hasItems(diagnostics.requestProviderIgnore);
    const hasWorkspaceProviderFilter =
        hasItems(diagnostics.providerAllowlist) ||
        diagnostics.providerAllowlistConfigured === true ||
        hasItems(diagnostics.providerBlocklist) ||
        hasItems(diagnostics.activeGuardrailIds) ||
        hasItems(diagnostics.allowedApiModels);

    if (hasRequestProviderFilter && !hasWorkspaceProviderFilter) {
        return {
            errorType: "user",
            errorOrigin: "user",
            operationalKind: "request_provider_filter_no_match",
            reason: "request_provider_filter_no_match",
        };
    }

    if (hasWorkspaceProviderFilter) {
        return {
            errorType: "user",
            errorOrigin: "user",
            operationalKind: "workspace_policy_no_providers",
            reason: "workspace_policy_no_providers",
        };
    }

    return {
        errorType: "system",
        errorOrigin: "gateway",
        operationalKind:
            diagnostics.beforeCount > 0
                ? "gateway_provider_availability_gap"
                : "gateway_provider_candidate_gap",
        reason:
            diagnostics.beforeCount > 0
                ? "gateway_provider_availability_gap"
                : "gateway_provider_candidate_gap",
    };
}

/**
 * BEFORE STAGE
 * - AuthN + team lookup
 * - Parse & validate body
 * - Credit / key checks via RPC
 * - Build PipelineContext (single source of truth for downstream)
 */
export async function beforeRequest(
    req: Request,
    endpoint: Endpoint,
    timer: Timer,
    zodSchema: z.ZodTypeAny | null = schemaFor(endpoint)
): Promise<{ ok: true; ctx: PipelineContext } | { ok: false; response: Response }> {
    const requestStartedAtMs = timer.startedAtMs();

    // 1) Auth
    const a = await timer.span("guardAuth", () => guardAuth(req));
    if (!a.ok) return a as { ok: false; response: Response };
    const { requestId, workspaceId, apiKeyId, apiKeyRef, apiKeyKid, userId, internal } = a.value;
	const bindings = getBindings();
	const perfGatewayAccess = resolvePerfGatewayAccess({
		environment: bindings.ENV,
		allowedWorkspaceId: bindings.GATEWAY_PERF_WORKSPACE_ID,
		workspaceId,
	});
	if (!perfGatewayAccess.allowed) {
		return {
			ok: false,
			response: err("unauthorised", {
				reason: perfGatewayAccess.reason,
				request_id: requestId,
				workspace_id: workspaceId,
			}),
		};
	}
	if (!isPerfGatewayEndpointAllowed({
		perfEnvironment: perfGatewayAccess.perfEnvironment,
		allowedEndpoints: bindings.GATEWAY_PERF_ALLOWED_ENDPOINTS,
		endpoint,
	})) {
		return {
			ok: false,
			response: err("not_supported", {
				reason: "perf_endpoint_not_allowed",
				endpoint,
				request_id: requestId,
				workspace_id: workspaceId,
			}),
		};
	}

    // 2) JSON (raw body for tracing + schema guard)
    const j = await timer.span("guardJson", () =>
        guardJson(req, workspaceId, requestId, { endpoint }),
    );
    if (!j.ok) return j as { ok: false; response: Response };
    let rawBody = j.value;
    const betaCapabilities = normalizeReturnFlag(
        req.headers.get("x-phaseo-beta-capabilities") ??
        req.headers.get("x-aistats-beta-capabilities") ??
        rawBody?.beta_capabilities ??
        rawBody?.provider_capabilities_beta
    );
    const debugHeaderEnabled = normalizeReturnFlag(
        req.headers.get("x-gateway-debug") ??
        req.headers.get("x-phaseo-debug")
    ) && isDebugAllowed();
    const debugBodyRaw = rawBody?.debug ?? null;
    const debugEnabled = debugHeaderEnabled || normalizeReturnFlag(debugBodyRaw?.enabled);
    const testingModeRequested = perfGatewayAccess.perfEnvironment || isTestingModeRequested(req, rawBody);

    // 3) Zod (route schema: shape depends on request path)
    const v = await timer.span("guardZod", () => guardZod(zodSchema, rawBody, workspaceId, requestId));
    if (!v.ok) return v as { ok: false; response: Response };
    const body = v.value;

    const serviceTierValidation = validateSynchronousTextServiceTierRequest({
        endpoint,
        body,
        requestId,
        workspaceId,
    });
    if (serviceTierValidation.ok === false) {
        return serviceTierValidation;
    }

    // 4) Model + stream (required for provider selection)
    const m = await timer.span("guardModel", () => guardModel(body, workspaceId, requestId));
    if (!m.ok) return m as { ok: false; response: Response };
    const { model, stream } = m.value;

    const testingMode = await timer.span("resolveTestingMode", () =>
        resolveTestingMode({
            requested: testingModeRequested,
            workspaceId,
            userId,
            internal,
        })
    );
    if (testingModeRequested && !testingMode.enabled) {
        return {
            ok: false,
            response: err("unauthorised", {
                reason: testingMode.reason,
                request_id: requestId,
                workspace_id: workspaceId,
            }),
        };
    }
    const testingModeEnabled = testingMode.enabled;

    // Policy and request context depend on the authenticated workspace/key but
    // not on one another. Overlap their cache/source reads while retaining the
    // same fail-closed enforcement after both have completed.
    const workspacePolicyPromise = timer.span("fetchWorkspacePolicy", () =>
        fetchWorkspacePolicy({ workspaceId, apiKeyId })
    ).then(
        (value) => ({ ok: true as const, value }),
        (error: unknown) => ({ ok: false as const, error }),
    );

    // 5) RPC + gating + providers (choose viable providers for this model/endpoint)
    const capability = normalizeCapability(resolveCapabilityFromEndpoint(endpoint));
    const c = await timer.span("guardContext", () =>
        guardContext({
            workspaceId,
            apiKeyId,
            endpoint,
            capability,
            model,
            requestId,
            internal,
            testingMode: testingModeEnabled,
            disableCache: debugEnabled,
        })
    );
    if (!c.ok) return c as { ok: false; response: Response };
    const { context, providers, resolvedModel, candidateDiagnostics } = c.value;

    // 5.3) Apply preset configuration if present
    let mergedBody = body;
    let presetFilteredProviders = providers;
    let resolvedRoutingMode = context.teamSettings?.routingMode ?? null;
    let presetInfo: { id: string; name: string; slug?: string | null; config: any } | null = null;

    if (context.preset) {
        const {
            mergePresetWithBody,
            filterProvidersByPreset,
            applyProviderPreferences,
            resolvePresetRoutingMode,
            validatePresetModel,
        } = await import("./presetMerge");

        // Merge preset config with request body
        mergedBody = mergePresetWithBody(body, context.preset);
        const presetModelValidationError = validatePresetModel(
            resolvedModel || model,
            context.preset.config,
        );
        if (presetModelValidationError) {
            return {
                ok: false,
                response: err("validation_error", {
                    details: [{
                        message: presetModelValidationError,
                        path: ["preset", "config", "models"],
                        keyword: "preset_model_not_allowed",
                        params: {
                            preset: context.preset.name,
                            model: resolvedModel || model,
                        },
                    }],
                    request_id: requestId,
                    workspace_id: workspaceId,
                }),
            };
        }

        // Filter providers by preset constraints
        presetFilteredProviders = filterProvidersByPreset(providers, context.preset.config);

        // Apply provider preferences/weights
        presetFilteredProviders = applyProviderPreferences(presetFilteredProviders, context.preset.config);
        resolvedRoutingMode = resolvePresetRoutingMode(
            context.preset.config,
            resolvedRoutingMode,
        );

        // Save preset info for context
        presetInfo = {
            id: context.preset.id,
            name: context.preset.name,
            slug: context.preset.slug ?? null,
            config: context.preset.config,
        };

        if (!presetFilteredProviders.length) {
            return {
                ok: false,
                response: err("validation_error", {
                    details: [{
                        message: `Preset "${context.preset.name}" filters resulted in no available providers`,
                        path: ["preset"],
                        keyword: "no_providers_after_preset_filter",
                        params: { preset: context.preset.name },
                    }],
                    request_id: requestId,
                    workspace_id: workspaceId,
                }),
            };
        }
    }

    const resolvedPlugins = resolveGatewayPlugins({
        workspaceDefaults: context.teamSettings?.defaultPlugins,
        presetDefaults: context.preset?.config?.plugins,
        requestPlugins: mergedBody?.plugins,
    });
    if (resolvedPlugins.length > 0 || mergedBody?.plugins !== undefined) {
        mergedBody = {
            ...mergedBody,
            plugins: resolvedPlugins,
        };
    }
    const unknownPluginIds = findUnknownGatewayPluginIds(resolvedPlugins);
    if (unknownPluginIds.length > 0) {
        return {
            ok: false,
            response: err("validation_error", {
                details: [{
                    message: `Unknown gateway plugin id${unknownPluginIds.length > 1 ? "s" : ""}: ${unknownPluginIds.join(", ")}`,
                    path: ["plugins"],
                    keyword: "unknown_gateway_plugin",
                    params: {
                        pluginIds: unknownPluginIds,
                    },
                }],
                request_id: requestId,
                workspace_id: workspaceId,
            }),
        };
    }
    mergedBody = applyWorkspacePrivacyRoutingDefaults(
        mergedBody,
        context.teamSettings,
    );
    const unsupportedRoutingFields = collectUnsupportedRoutingFields(mergedBody);
    if (unsupportedRoutingFields.length > 0) {
        return {
            ok: false,
            response: err("validation_error", {
                details: unsupportedRoutingFields.map((field) => ({
                    message: field.message,
                    path: field.path,
                    keyword: "unsupported_routing_filter",
                    params: {
                        field: field.field,
                    },
                })),
                request_id: requestId,
                workspace_id: workspaceId,
            }),
        };
    }
    mergedBody = normalizeRequestRoutingBody(mergedBody);

    const workspacePolicyLoad = await workspacePolicyPromise;
    if ("error" in workspacePolicyLoad) {
        const error = workspacePolicyLoad.error;
        console.error("[beforeRequest] workspace_policy_fetch_failed", {
            workspaceId,
            requestId,
            error: error instanceof Error ? error.message : String(error),
        });
        return {
            ok: false,
            response: err("gateway_error", {
                reason: "workspace_policy_fetch_failed",
                request_id: requestId,
                workspace_id: workspaceId,
            }),
        };
    }
    const workspacePolicy = workspacePolicyLoad.value;

    const workspacePolicyResult = applyWorkspacePolicy({
        providers: presetFilteredProviders,
        resolvedModel: resolvedModel || model,
        body: mergedBody,
        workspacePolicy,
        teamSettings: context.teamSettings ?? null,
    });
    if (!workspacePolicyResult.ok) {
        const workspacePolicyFailure = workspacePolicyResult as Extract<
            typeof workspacePolicyResult,
            { ok: false }
        >;
        if (workspacePolicyFailure.reason === "model_not_allowed") {
            return {
                ok: false,
                response: err("validation_error", {
                    model: resolvedModel || model,
                    reason: "workspace_model_not_allowed",
                    description: `Model "${resolvedModel || model}" is not allowed by workspace policy`,
                    error_operational_kind: "workspace_model_not_allowed",
                    details: [{
                        message: `Model "${resolvedModel || model}" is not allowed by workspace policy`,
                        path: ["model"],
                        keyword: "model_not_allowed_by_workspace_policy",
                        params: workspacePolicyFailure.diagnostics,
                    }],
                    routing_diagnostics: {
                        workspacePolicy: workspacePolicyFailure.diagnostics,
                    },
                    request_id: requestId,
                    workspace_id: workspaceId,
                }),
            };
        }

        const providerFilterClassification =
            classifyWorkspaceProviderFilterFailure(workspacePolicyFailure.diagnostics);
        return {
            ok: false,
            response: err("validation_error", {
                model: resolvedModel || model,
                reason: providerFilterClassification.reason,
                description: "Workspace and request provider filters resulted in no available providers",
                error_type: providerFilterClassification.errorType,
                error_origin: providerFilterClassification.errorOrigin,
                error_operational_kind: providerFilterClassification.operationalKind,
                details: [{
                    message: "Workspace and request provider filters resulted in no available providers",
                    path: ["provider"],
                    keyword: "no_providers_after_workspace_policy_filter",
                    params: workspacePolicyFailure.diagnostics,
                }],
                routing_diagnostics: {
                    workspacePolicy: workspacePolicyFailure.diagnostics,
                },
                request_id: requestId,
                workspace_id: workspaceId,
            }),
        };
    }
    presetFilteredProviders = workspacePolicyResult.providers;

    const { applyPromptInjectionGuardrails } = await import("./promptInjection");
    const promptInjectionResult = applyPromptInjectionGuardrails({
        body: mergedBody,
        rawBody,
        endpoint,
        workspacePolicy,
        requestId,
        workspaceId,
    });
    if (!promptInjectionResult.ok) {
        return promptInjectionResult as { ok: false; response: Response };
    }
    mergedBody = promptInjectionResult.body;
    rawBody = promptInjectionResult.rawBody;

    const { applySensitiveInfoGuardrails } = await import("./sensitiveInfo");
    const sensitiveInfoResult = applySensitiveInfoGuardrails({
        body: mergedBody,
        rawBody,
        endpoint,
        workspacePolicy,
        requestId,
        workspaceId,
        existingEnforcement: promptInjectionResult.enforcement,
    });
    if (!sensitiveInfoResult.ok) {
        return sensitiveInfoResult as { ok: false; response: Response };
    }
    mergedBody = sensitiveInfoResult.body;
    rawBody = sensitiveInfoResult.rawBody;
    resolvedRoutingMode = resolveRequestRoutingModeOverride(
        mergedBody,
        resolvedRoutingMode,
    );

    // 5.5) Capability validation - parameter support and token limits
    const capabilityValidation = await timer.span("validateCapabilities", () =>
        validateCapabilities({
            endpoint,
            rawBody,
            body: mergedBody,
            requestId,
            workspaceId,
            providers: presetFilteredProviders,
            model: resolvedModel || model,
        })
    );
    if (!capabilityValidation.ok) return capabilityValidation as { ok: false; response: Response };
    mergedBody = capabilityValidation.body;
    const filteredProviders = capabilityValidation.providers;
    const normalizedCapability = capability;
    const executorManagedCapabilities = new Set<string>([
        "text.generate",
        "embeddings",
        "moderations",
        "rerank",
        "image.generate",
        "image.edit",
        "audio.speech",
        "audio.transcription",
        "audio.translations",
        "video.generate",
        "ocr",
        "music.generate",
    ]);
    const providerEnablementDropped: ProviderEnablementDiagnostics["dropped"] = [];
    let enabledProviders = filteredProviders.filter((provider) => {
        if (executorManagedCapabilities.has(normalizedCapability)) {
            if (testingModeEnabled) {
                const hasAdapter = Boolean(adapterFor(provider.providerId, endpoint));
                if (!hasAdapter) {
                    providerEnablementDropped.push({
                        providerId: provider.providerId,
                        reason: "adapter_missing",
                    });
                }
                return hasAdapter;
            }
            const enabled = isProviderCapabilityEnabled(provider.providerId, normalizedCapability);
            if (!enabled) {
                providerEnablementDropped.push({
                    providerId: provider.providerId,
                    reason: "capability_disabled",
                });
            }
            return enabled;
        }
        const hasAdapter = Boolean(adapterFor(provider.providerId, endpoint));
        if (!hasAdapter) {
            providerEnablementDropped.push({
                providerId: provider.providerId,
                reason: "adapter_missing",
            });
        }
        return hasAdapter;
    });
    const { applyServiceTierRouting } = await import("./serviceTierRouting");
    const serviceTierRoutingResult = await timer.span("applyServiceTierRouting", () =>
        applyServiceTierRouting({
            candidates: enabledProviders,
            body: mergedBody,
            capability: normalizedCapability,
        })
    );
    if (serviceTierRoutingResult.diagnostics.droppedProviders.length) {
        for (const droppedProvider of serviceTierRoutingResult.diagnostics.droppedProviders) {
            providerEnablementDropped.push({
                providerId: droppedProvider.providerId,
                reason: "service_tier_unsupported",
            });
        }
    }
    enabledProviders = serviceTierRoutingResult.candidates;
    const missingPricingProviders = enabledProviders
        .filter((provider) =>
            !provider.pricingCard ||
            !Array.isArray(provider.pricingCard.rules) ||
            provider.pricingCard.rules.length === 0
        )
        .map((provider) => provider.providerId);
    if (missingPricingProviders.length) {
        for (const providerId of missingPricingProviders) {
            providerEnablementDropped.push({
                providerId,
                reason: "pricing_missing",
            });
        }
        enabledProviders = enabledProviders.filter((provider) =>
            Boolean(
                provider.pricingCard &&
                Array.isArray(provider.pricingCard.rules) &&
                provider.pricingCard.rules.length > 0
            )
        );
    }
    const providerEnablementDiagnostics: ProviderEnablementDiagnostics = {
        capability: normalizedCapability,
        providersBefore: filteredProviders.map((provider) => provider.providerId),
        providersAfter: enabledProviders.map((provider) => provider.providerId),
        dropped: providerEnablementDropped,
    };
    if ((providerEnablementDropped.length > 0 || enabledProviders.length === 0) && (debugEnabled || enabledProviders.length === 0)) {
        console.log("[gateway] provider enablement", {
            requestId,
            model: resolvedModel || model,
            endpoint,
            capability: normalizedCapability,
            beforeCount: providerEnablementDiagnostics.providersBefore.length,
            afterCount: providerEnablementDiagnostics.providersAfter.length,
            dropped: providerEnablementDiagnostics.dropped,
        });
    }
    if (!enabledProviders.length) {
        return {
            ok: false,
            response: err("unsupported_model_or_endpoint", {
                model: resolvedModel || model,
                endpoint,
                request_id: requestId,
                workspace_id: workspaceId,
                provider_enablement: providerEnablementDiagnostics,
                provider_candidate_diagnostics: candidateDiagnostics,
                service_tier_routing: serviceTierRoutingResult.diagnostics,
                reason: missingPricingProviders.length > 0
                    ? "pricing_not_configured"
                    : serviceTierRoutingResult.diagnostics.requestedPlan
                        ? "service_tier_not_supported"
                    : "no_enabled_providers",
                missing_pricing_providers:
                    missingPricingProviders.length > 0
                        ? missingPricingProviders
                        : undefined,
            }),
        };
    }

    // console.log(`[DEBUG] beforeRequest: resolvedModel: ${resolvedModel}, original model: ${model}`);

    // 6) Meta + final ctx
    const returnMeta = normalizeReturnFlag(body?.meta ?? rawBody?.meta);
    const debugBody = (body?.debug ?? rawBody?.debug) ?? null;
    const returnUpstreamRequest = normalizeReturnFlag(
        debugBody?.return_upstream_request ??
        debugBody?.returnUpstreamRequest ??
        body?.echo_upstream_request ??
        rawBody?.echo_upstream_request
    );
    const returnUpstreamResponse = normalizeReturnFlag(
        debugBody?.return_upstream_response ??
        debugBody?.returnUpstreamResponse
    );
    const returnRoutingDiagnostics = getEffectiveRoutingHints(mergedBody).returnDiagnostics;
    const debugTrace = normalizeReturnFlag(debugBody?.trace);
    const traceLevel = (debugBody?.trace_level ?? debugBody?.traceLevel) as "summary" | "full" | undefined;
    const betaBody = ((body as any)?.beta ?? rawBody?.beta) as Record<string, any> | undefined;
    const openAIWebSocketModeRaw =
        betaBody?.openai_websocket_mode ??
        betaBody?.openaiWebsocketMode ??
        betaBody?.openai?.websocket_mode ??
        betaBody?.openai?.websocketMode;
    const beta: RequestBetaOptions | undefined = openAIWebSocketModeRaw === undefined
        ? undefined
        : {
            openai_websocket_mode: normalizeReturnFlag(openAIWebSocketModeRaw),
        };
    const debug = (debugEnabled || returnUpstreamRequest || returnUpstreamResponse || debugTrace)
        ? {
            enabled: debugEnabled,
            return_upstream_request: returnUpstreamRequest,
            return_upstream_response: returnUpstreamResponse,
            trace: debugTrace,
            trace_level: traceLevel ?? (debugTrace ? "full" : undefined),
        }
        : undefined;
    const contextTelemetry = context.contextTelemetry ?? null;
    const meta: RequestMeta = makeMeta({
        endpoint,
        apiKeyId,
        apiKeyRef,
        apiKeyKid,
        requestId,
        stream,
        req,
        rawBody: rawBody && typeof rawBody === "object" ? (rawBody as Record<string, unknown>) : null,
        authMethod: apiKeyRef?.startsWith("oauth_") ? "oauth" : "api_key",
        oauthClientId: apiKeyRef?.startsWith("oauth_") ? (apiKeyKid ?? null) : null,
        oauthUserId: apiKeyRef?.startsWith("oauth_") ? (userId ?? null) : null,
        returnMeta,
        returnRoutingDiagnostics,
        debug,
        providerCapabilitiesBeta: betaCapabilities,
        beta,
        beforeContextMs: contextTelemetry?.totalMs ?? null,
        beforeContextCacheStatus: contextTelemetry?.cacheStatus ?? null,
        beforeContextKeyVersionMs: contextTelemetry?.keyVersionMs ?? null,
        beforeContextCacheReadMs: contextTelemetry?.cacheReadMs ?? null,
        beforeContextRpcMs: contextTelemetry?.rpcMs ?? null,
        beforeContextEnrichMs: contextTelemetry?.enrichMs ?? null,
        beforeContextCacheWriteMs: contextTelemetry?.cacheWriteMs ?? null,
        beforeContextFallbackRemap: contextTelemetry?.fallbackRemap ?? null,
        startedAtMs: requestStartedAtMs,
    });
    const requestPath = meta.requestPath ?? null;

    const ctx: PipelineContext = {
        endpoint,
        capability,
        requestId,
        meta,
        rawBody,
        body: mergedBody,
        requestedModel: model,
        model: resolvedModel || model,
        workspaceId,
        stream,
        requestPath: requestPath ?? undefined,
        requestedParams: capabilityValidation.requestedParams,
        paramRoutingDiagnostics: capabilityValidation.paramRoutingDiagnostics,
        providerCandidateBuildDiagnostics: candidateDiagnostics,
        providerEnablementDiagnostics,
        plugins: normalizeGatewayPlugins(mergedBody?.plugins),
        providers: enabledProviders,
        providerCapabilitiesBeta: betaCapabilities,
        pricing: context.pricing,
        gating: {
            key: context.key,
            keyLimit: context.keyLimit,
            credit: context.credit,
        },
        preset: presetInfo,
        internal,
        // Enrichment data for observability (wide events)
        teamEnrichment: context.teamEnrichment ?? null,
        keyEnrichment: context.keyEnrichment ?? null,
        teamSettings: context.teamSettings ?? null,
        routingMode: resolvedRoutingMode,
        keyId: apiKeyId ?? null,
        testingMode: testingModeEnabled,
        routingDiagnostics: {
            workspacePolicy: workspacePolicyResult.diagnostics,
        },
        guardrailEnforcement: sensitiveInfoResult.enforcement,
    };

    // console.log(`[DEBUG] beforeRequest: final ctx.model: ${ctx.model}`);

    return { ok: true, ctx };
}
