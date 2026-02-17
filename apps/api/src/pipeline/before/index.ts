// lib/gateway/before/index.ts
// Purpose: Before-stage helpers for auth, validation, and context building.
// Why: Keeps pre-execution logic centralized and consistent.
// How: Orchestrates auth, validation, and context loading to build PipelineContext.

import { z } from "zod";
import { schemaFor } from "@core/schemas";
import type { Endpoint, RequestMeta } from "@core/types";
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

    // 1) Auth
    const a = await timer.span("guardAuth", () => guardAuth(req));
    if (!a.ok) return a as { ok: false; response: Response };
    const { requestId, teamId, apiKeyId, apiKeyRef, apiKeyKid, internal } = a.value;

    // 2) JSON (raw body for tracing + schema guard)
    const j = await timer.span("guardJson", () => guardJson(req, teamId, requestId));
    if (!j.ok) return j as { ok: false; response: Response };
    const rawBody = j.value;
    const betaCapabilities = normalizeReturnFlag(
        req.headers.get("x-aistats-beta-capabilities") ??
        rawBody?.beta_capabilities ??
        rawBody?.provider_capabilities_beta
    );
    const debugHeaderEnabled = normalizeReturnFlag(
        req.headers.get("x-gateway-debug") ??
        req.headers.get("x-ai-stats-debug")
    ) && isDebugAllowed();
    const debugBodyRaw = rawBody?.debug ?? null;
    const debugEnabled = debugHeaderEnabled || normalizeReturnFlag(debugBodyRaw?.enabled);

    // 3) Zod (route schema: shape depends on request path)
    const v = await timer.span("guardZod", () => guardZod(zodSchema, rawBody, teamId, requestId));
    if (!v.ok) return v as { ok: false; response: Response };
    const body = v.value;

    // 4) Model + stream (required for provider selection)
    const m = await timer.span("guardModel", () => guardModel(body, teamId, requestId));
    if (!m.ok) return m as { ok: false; response: Response };
    const { model, stream } = m.value;

    // 5) RPC + gating + providers (choose viable providers for this model/endpoint)
    const capability = resolveCapabilityFromEndpoint(endpoint);
    const c = await timer.span("guardContext", () =>
        guardContext({
            teamId,
            apiKeyId,
            endpoint,
            capability,
            model,
            requestId,
            internal,
            disableCache: debugEnabled,
        })
    );
    if (!c.ok) return c as { ok: false; response: Response };
    const { context, providers, resolvedModel, candidateDiagnostics } = c.value;

    // 5.3) Apply preset configuration if present
    let mergedBody = body;
    let presetFilteredProviders = providers;
    let presetInfo: { id: string; name: string; config: any } | null = null;

    if (context.preset) {
        const { mergePresetWithBody, filterProvidersByPreset, applyProviderPreferences } = await import("./presetMerge");

        // Merge preset config with request body
        mergedBody = mergePresetWithBody(body, context.preset);

        // Filter providers by preset constraints
        presetFilteredProviders = filterProvidersByPreset(providers, context.preset.config);

        // Apply provider preferences/weights
        presetFilteredProviders = applyProviderPreferences(presetFilteredProviders, context.preset.config);

        // Save preset info for context
        presetInfo = {
            id: context.preset.id,
            name: context.preset.name,
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
                    team_id: teamId,
                }),
            };
        }
    }

    // 5.5) Capability validation - parameter support and token limits
    const capabilityValidation = await timer.span("validateCapabilities", () =>
        validateCapabilities({
            endpoint,
            rawBody,
            body: mergedBody,
            requestId,
            teamId,
            providers: presetFilteredProviders,
            model: resolvedModel || model,
        })
    );
    if (!capabilityValidation.ok) return capabilityValidation as { ok: false; response: Response };
    mergedBody = capabilityValidation.body;
    const filteredProviders = capabilityValidation.providers;
    const normalizedCapability = normalizeCapability(capability);
    const executorManagedCapabilities = new Set<string>([
        "text.generate",
        "embeddings",
        "moderations",
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
    const enabledProviders = filteredProviders.filter((provider) => {
        if (executorManagedCapabilities.has(normalizedCapability)) {
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
    const providerEnablementDiagnostics: ProviderEnablementDiagnostics = {
        capability: normalizedCapability,
        providersBefore: filteredProviders.map((provider) => provider.providerId),
        providersAfter: enabledProviders.map((provider) => provider.providerId),
        dropped: providerEnablementDropped,
    };
    if (providerEnablementDropped.length > 0 || enabledProviders.length === 0) {
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
                team_id: teamId,
                provider_enablement: providerEnablementDiagnostics,
                provider_candidate_diagnostics: candidateDiagnostics,
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
    const debugTrace = normalizeReturnFlag(debugBody?.trace);
    const traceLevel = (debugBody?.trace_level ?? debugBody?.traceLevel) as "summary" | "full" | undefined;
    const debug = (debugEnabled || returnUpstreamRequest || returnUpstreamResponse || debugTrace)
        ? {
            enabled: debugEnabled,
            return_upstream_request: returnUpstreamRequest,
            return_upstream_response: returnUpstreamResponse,
            trace: debugTrace,
            trace_level: traceLevel ?? (debugTrace ? "full" : undefined),
        }
        : undefined;
    const meta: RequestMeta = makeMeta({
        apiKeyId,
        apiKeyRef,
        apiKeyKid,
        requestId,
        stream,
        req,
        returnMeta,
        debug,
        providerCapabilitiesBeta: betaCapabilities,
    });
    const requestPath = (() => {
        try {
            return new URL(req.url).pathname;
        } catch {
            return null;
        }
    })();

    const ctx: PipelineContext = {
        endpoint,
        capability,
        requestId,
        meta,
        rawBody,
        body: mergedBody,
        model: resolvedModel || model,
        teamId,
        stream,
        requestPath: requestPath ?? undefined,
        requestedParams: capabilityValidation.requestedParams,
        paramRoutingDiagnostics: capabilityValidation.paramRoutingDiagnostics,
        providerCandidateBuildDiagnostics: candidateDiagnostics,
        providerEnablementDiagnostics,
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
        routingMode: context.teamSettings?.routingMode ?? null,
        keyId: apiKeyId ?? null,
    };

    // console.log(`[DEBUG] beforeRequest: final ctx.model: ${ctx.model}`);

    return { ok: true, ctx };
}








