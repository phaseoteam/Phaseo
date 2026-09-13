// lib/gateway/before/index.ts
// Purpose: Before-stage helpers for auth, validation, and context building.
// Why: Keeps pre-execution logic centralized and consistent.
// How: Orchestrates auth, validation, and context loading to build PipelineContext.

import { z } from "zod";
import { getBindings } from "@/runtime/env";
import { getAutoRoutingFeatureGateName, isAutoRoutingAccessEnabled } from "@core/feature-flags";
import { schemaFor } from "@core/schemas";
import type { Endpoint, RequestBetaOptions, RequestMeta } from "@core/types";
import type { PipelineContext } from "./types";
import { guardAuth, guardJson, guardZod, guardModel, guardContext, makeMeta, normalizeReturnFlag } from "./guards";
import { err } from "./http";
import { Timer } from "../telemetry/timer";
import { resolveCapabilityFromEndpoint } from "@/lib/config/capabilityToEndpoints";
import { validateCapabilities } from "./capabilityValidation";
import { isDebugAllowed } from "../debug";
import { EXECUTORS_BY_PROVIDER, isProviderCapabilityEnabled, normalizeCapability } from "@/executors";
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
	applyProviderQualifiedModelConstraint,
	canonicalizeProviderQualifiedModelRequest,
	filterProviderQualifiedModelCandidates,
	filterQuantizationCandidates,
	collectUnsupportedRoutingFields,
	getEffectiveRoutingHints,
	normalizeRequestRoutingBody,
	validateProviderQualifiedModelProvider,
} from "../requestRouting";
import { fetchWorkspacePolicy, applyWorkspacePolicy } from "./workspacePolicy";
import { getWebhookEndpointSigningConfig } from "@core/webhook-endpoints";
import { parseRequestLabels } from "./request-labels";
import { generatePublicId } from "./genId";
import { applyDeploymentRegionPolicy, validateRegionalTextRequest } from "./deployment-region";
import {
    applyDynamicRouteToBody,
    evaluateDynamicRoute,
    selectDynamicRouteContextModels,
    suppressDynamicRouteModelOverrides,
    type DynamicRouteEvaluation,
} from "./dynamic-routes";
import {
	buildAutoRouterCandidateEvidence,
	applyAutoRouterHardRequirements,
	deterministicAutoRouterClassification,
	isAutoRouterModel,
	loadAutoRouterBenchmarks,
	loadManagedAutoRouterCandidates,
	loadWorkspaceAutoRouterConfig,
	selectAutoRouterModel,
	type AutoRouterClassification,
	type AutoRouterEvaluation,
} from "./auto-router";

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
	droppedByPrivacy?: unknown[];
	accountPolicyApplied?: boolean;
    beforeCount: number;
}): {
	code: "validation_error" | "guardrail_blocked";
    errorType: "user" | "system";
    errorOrigin: "user" | "gateway";
    operationalKind: string;
    reason: string;
	description: string;
	keyword: string;
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
			code: "validation_error",
            errorType: "user",
            errorOrigin: "user",
            operationalKind: "request_provider_filter_no_match",
            reason: "request_provider_filter_no_match",
			description: "The request provider filters did not match any available routes",
			keyword: "request_provider_filter_no_match",
        };
    }

	if (hasItems(diagnostics.droppedByPrivacy)) {
		return {
			code: "guardrail_blocked",
			errorType: "user",
			errorOrigin: "user",
			operationalKind: "data_handling_policy_no_routes",
			reason: "data_handling_policy_no_routes",
			description: "No provider routes satisfy the account or workspace data-handling policy",
			keyword: "no_routes_after_data_handling_policy",
		};
	}

    if (hasWorkspaceProviderFilter) {
        return {
			code: "guardrail_blocked",
            errorType: "user",
            errorOrigin: "user",
			operationalKind: "provider_restricted_by_policy",
			reason: "provider_restricted_by_policy",
			description: "All provider routes for this model are blocked by an account or workspace guardrail",
			keyword: "no_providers_after_route_access_policy",
        };
    }

    return {
		code: "validation_error",
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
		description: "No gateway provider routes are currently available for this request",
		keyword: "no_gateway_provider_routes",
    };
}

/**
 * BEFORE STAGE
 * - AuthN + team lookup
 * - Parse & validate body
 * - Credit / key checks via RPC
 * - Build PipelineContext (single source of truth for downstream)
 */
export type BeforeRequestObservabilitySnapshot = {
    requestPayload: unknown;
    requestedModel: string | null;
    model?: string | null;
};

export async function beforeRequest(
    req: Request,
    endpoint: Endpoint,
    timer: Timer,
    zodSchema: z.ZodTypeAny | null = schemaFor(endpoint),
    options?: {
        dynamicRouteModelOverride?: string | null;
		autoRouterModelOverride?: string | null;
		autoRouterClassificationOverride?: AutoRouterClassification | null;
		classifyAutoRouterRequest?: (args: {
			endpoint: Endpoint;
			body: unknown;
		}) => Promise<AutoRouterClassification | null>;
        onObservabilitySnapshot?: (snapshot: BeforeRequestObservabilitySnapshot) => void;
    },
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
    const requestLabels = parseRequestLabels(req);
    if (requestLabels.ok === false) {
        return {
            ok: false,
            response: err("validation_error", {
                reason: "invalid_request_metadata",
                description: requestLabels.message,
                request_id: requestId,
                workspace_id: workspaceId,
            }),
        };
    }
    const requestedModel = typeof rawBody?.model === "string" && rawBody.model.trim()
        ? rawBody.model.trim()
        : null;
    options?.onObservabilitySnapshot?.({
        requestPayload: rawBody,
        requestedModel,
    });
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
    let body = v.value;
    const providerQualifiedModelRequest =
        canonicalizeProviderQualifiedModelRequest(body);
    if (providerQualifiedModelRequest.syntaxError) {
        const syntaxError = providerQualifiedModelRequest.syntaxError;
        return {
            ok: false,
            response: err("validation_error", {
                reason: syntaxError.reason,
                description: syntaxError.message,
                error_type: "user",
                error_origin: "user",
                error_operational_kind: syntaxError.reason,
                details: [{
                    message: syntaxError.message,
                    path: ["model"],
                    keyword: syntaxError.reason,
                    params: {
                        input: syntaxError.input,
                        provider: syntaxError.providerSlug || null,
                    },
                }],
                request_id: requestId,
                workspace_id: workspaceId,
            }),
        };
    }
    const providerSlugValidation = validateProviderQualifiedModelProvider(
        providerQualifiedModelRequest.selection,
        Object.keys(EXECUTORS_BY_PROVIDER),
    );
    if (providerSlugValidation.ok === false) {
        return {
            ok: false,
            response: err("validation_error", {
                model: providerSlugValidation.model,
                provider: providerSlugValidation.providerId,
                reason: providerSlugValidation.reason,
                description: providerSlugValidation.message,
                error_type: "user",
                error_origin: "user",
                error_operational_kind: providerSlugValidation.reason,
                details: [{
                    message: providerSlugValidation.message,
                    path: ["model"],
                    keyword: providerSlugValidation.reason,
                    params: {
                        provider: providerSlugValidation.providerId,
                        model: providerSlugValidation.model,
                    },
                }],
                request_id: requestId,
                workspace_id: workspaceId,
            }),
        };
    }
    body = providerQualifiedModelRequest.body;

	if (endpoint === "video.generation" && body?.webhook?.endpointId) {
		const webhookEndpoint = await timer.span("validateVideoWebhookEndpoint", () =>
			getWebhookEndpointSigningConfig({
				workspaceId,
				endpointId: body.webhook.endpointId,
			}),
		);
		if (!webhookEndpoint) {
			return {
				ok: false,
				response: err("validation_error", {
					reason: "video_webhook_endpoint_not_found_or_inactive",
					message: "webhook.endpoint_id must reference an active webhook endpoint in this workspace.",
					request_id: requestId,
					workspace_id: workspaceId,
				}),
			};
		}
	}

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
	if (isAutoRouterModel(model) && !(await timer.span("checkAutoRoutingFeatureGate", () => isAutoRoutingAccessEnabled(a.value)))) {
		return {
			ok: false,
			response: err("not_supported", {
				reason: "auto_routing_feature_flag_disabled",
				message: "Auto Routing is currently available to selected Alpha workspaces.",
				feature_gate: getAutoRoutingFeatureGateName(),
				request_id: requestId,
				workspace_id: workspaceId,
			}),
		};
	}
    options?.onObservabilitySnapshot?.({
        requestPayload: rawBody,
        requestedModel,
        model,
    });

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
    let autoRouterEvaluation: AutoRouterEvaluation | null = null;
    let workspacePolicyLoad: Awaited<typeof workspacePolicyPromise> | null = null;
    const loadWorkspacePolicy = async () => {
		workspacePolicyLoad ??= await workspacePolicyPromise;
		return workspacePolicyLoad;
	};
	const contextForModel = (candidateModel: string) => guardContext({
		workspaceId,
		apiKeyId,
		endpoint,
		capability,
		model: candidateModel,
		requestId,
		internal,
		testingMode: testingModeEnabled,
		disableCache: debugEnabled,
	});

	let c: Awaited<ReturnType<typeof guardContext>>;
	if (isAutoRouterModel(model)) {
		const regionalAutoRouterBody = applyDeploymentRegionPolicy(
			body,
			bindings.GATEWAY_ROUTING_REGION,
		);
		const autoRouterBody = regionalAutoRouterBody.ok
			? regionalAutoRouterBody.body
			: body;
		if (body?.routing?.auto != null || body?.provider?.auto != null) {
			return {
				ok: false,
				response: err("validation_error", {
					reason: "auto_router_request_config_not_supported",
					description: "phaseo/auto uses the workspace Auto Routing configuration and does not accept request-level routing constraints",
					details: [{
						message: "Remove the request-level auto-router configuration",
						path: [body?.routing?.auto != null ? "routing" : "provider", "auto"],
						keyword: "auto_router_request_config_not_supported",
					}],
					request_id: requestId,
					workspace_id: workspaceId,
				}),
			};
		}
		const deterministicClassification = deterministicAutoRouterClassification(autoRouterBody);
		const classifierPromise = options?.autoRouterClassificationOverride
			? Promise.resolve(options.autoRouterClassificationOverride)
			: options?.classifyAutoRouterRequest && !options?.autoRouterModelOverride
				? timer.span("classifyAutoRouterRequest", () => options.classifyAutoRouterRequest!({ endpoint, body: autoRouterBody }))
					.catch((error) => {
						console.warn("[beforeRequest] auto_router_classifier_failed", {
							workspaceId,
							requestId,
							error: error instanceof Error ? error.message : String(error),
						});
						return null;
					})
				: Promise.resolve(null);
		let config: Awaited<ReturnType<typeof loadWorkspaceAutoRouterConfig>>;
		try {
			config = await timer.span("loadWorkspaceAutoRouterConfig", () => loadWorkspaceAutoRouterConfig(workspaceId));
		} catch (error) {
			console.error("[beforeRequest] auto_router_config_fetch_failed", {
				workspaceId,
				requestId,
				error: error instanceof Error ? error.message : String(error),
			});
			return { ok: false, response: err("gateway_error", { reason: "auto_router_config_fetch_failed", request_id: requestId, workspace_id: workspaceId }) };
		}
		const classification = applyAutoRouterHardRequirements(autoRouterBody, await classifierPromise ?? deterministicClassification);
		let candidateUniverse: Awaited<ReturnType<typeof loadManagedAutoRouterCandidates>>;
		try {
			candidateUniverse = await timer.span("loadManagedAutoRouterCandidates", () => loadManagedAutoRouterCandidates(config, autoRouterBody, classification));
		} catch (error) {
			console.error("[beforeRequest] auto_router_candidates_fetch_failed", {
				workspaceId,
				requestId,
				error: error instanceof Error ? error.message : String(error),
			});
			return { ok: false, response: err("gateway_error", { reason: "auto_router_candidates_fetch_failed", request_id: requestId, workspace_id: workspaceId }) };
		}
		const selectionConfig = {
			...config,
			allowedModels: candidateUniverse.models,
			candidateUniverseSize: candidateUniverse.totalEligible,
		};
		const policyLoad = await loadWorkspacePolicy();
		if ("error" in policyLoad) {
			console.error("[beforeRequest] workspace_policy_fetch_failed", {
				workspaceId,
				requestId,
				error: policyLoad.error instanceof Error ? policyLoad.error.message : String(policyLoad.error),
			});
			return { ok: false, response: err("gateway_error", { reason: "workspace_policy_fetch_failed", request_id: requestId, workspace_id: workspaceId }) };
		}
		const selection = await timer.span("selectAutoRouterModel", () => selectAutoRouterModel({
			endpoint,
			body: autoRouterBody,
			config: selectionConfig,
			classification,
			modelOverride: options?.autoRouterModelOverride,
			loadBenchmarks: loadAutoRouterBenchmarks,
			loadCandidate: async (candidateModel) => {
				const candidateContext = await contextForModel(candidateModel);
				if (!candidateContext.ok) return { ok: false as const, reason: "model_or_endpoint_unavailable" };
				const candidateResolvedModel = candidateContext.value.resolvedModel || candidateModel;
				const policyResult = applyWorkspacePolicy({
					providers: candidateContext.value.providers,
					resolvedModel: candidateResolvedModel,
					body: autoRouterBody,
					workspacePolicy: policyLoad.value,
					teamSettings: candidateContext.value.context.teamSettings ?? null,
				});
				if (policyResult.ok === false) {
					return { ok: false as const, reason: policyResult.reason === "model_not_allowed" ? "model_restricted_by_policy" : "no_policy_compliant_providers" };
				}
				const executableProviders = policyResult.providers.filter((provider) =>
					isProviderCapabilityEnabled(provider.providerId, capability) &&
					Boolean(adapterFor(provider.providerId, endpoint)) &&
					Boolean(provider.pricingCard?.rules?.length));
				if (!executableProviders.length) {
					return { ok: false as const, reason: "no_executable_providers" };
				}
				const capabilityResult = await validateCapabilities({
					endpoint,
					rawBody,
					body: autoRouterBody,
					requestId,
					workspaceId,
					providers: executableProviders,
					model: candidateResolvedModel,
				});
				if (!capabilityResult.ok || !capabilityResult.providers.length) {
					return { ok: false as const, reason: "request_capabilities_unsupported" };
				}
				const quantizationResult = filterQuantizationCandidates(
					capabilityResult.providers,
					getEffectiveRoutingHints(autoRouterBody).quantizations,
				);
				if (!quantizationResult.ok || !quantizationResult.providers.length) {
					return { ok: false as const, reason: "request_quantization_unsupported" };
				}
				const contextResult = {
					...candidateContext,
					value: { ...candidateContext.value, providers: quantizationResult.providers },
				};
				return buildAutoRouterCandidateEvidence({
					endpoint,
					requestedModel: candidateModel,
					resolvedModel: candidateResolvedModel,
					providers: quantizationResult.providers,
					contextResult,
					config,
				});
			},
		}));
		if (selection.ok === false) {
			return {
				ok: false,
				response: err("unsupported_model_or_endpoint", {
					model,
					reason: selection.reason === "invalid_override" ? "auto_router_invalid_fallback" : "auto_router_no_eligible_models",
					description: selection.reason === "invalid_override"
						? "The requested auto-router fallback is outside the current managed candidate shortlist"
						: "No managed auto-router model is currently eligible for this request",
					routing_diagnostics: { autoRouter: { candidates: selection.candidates } },
					request_id: requestId,
					workspace_id: workspaceId,
				}),
			};
		}
		autoRouterEvaluation = selection.evaluation;
		c = selection.selected.contextResult as Awaited<ReturnType<typeof guardContext>>;
		options?.onObservabilitySnapshot?.({ requestPayload: rawBody, requestedModel, model: selection.selected.resolvedModel });
	} else {
		c = await timer.span("guardContext", () => contextForModel(model));
	}
    if (!c.ok) return c as { ok: false; response: Response };
    let { context, providers, resolvedModel, candidateDiagnostics } = c.value;
    const contextTelemetry = context.contextTelemetry ?? null;
    const contextTimingSpans = {
        context_total: contextTelemetry?.totalMs,
        context_preset_access: contextTelemetry?.presetAccessMs,
        context_private_model: contextTelemetry?.privateModelMs,
        context_byok_hydration: contextTelemetry?.byokHydrationMs,
        context_key_version: contextTelemetry?.keyVersionMs,
        context_cache_read: contextTelemetry?.cacheReadMs,
        context_credit_refresh: contextTelemetry?.creditRefreshMs,
        context_rpc: contextTelemetry?.rpcMs,
        context_enrich: contextTelemetry?.enrichMs,
        context_cache_write: contextTelemetry?.cacheWriteMs,
    };
    for (const [name, durationMs] of Object.entries(contextTimingSpans)) {
        if (typeof durationMs === "number") timer.record(name, durationMs);
    }

    workspacePolicyLoad = await loadWorkspacePolicy();
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
    let dynamicRouteEvaluation: DynamicRouteEvaluation | null = null;
    if (workspacePolicy.dynamicRoute) {
        dynamicRouteEvaluation = evaluateDynamicRoute({
            policy: workspacePolicy.dynamicRoute,
            endpoint,
            model: resolvedModel || model,
            body,
            headers: req.headers,
            requestId,
            usage: context.keyLimit,
        });
        // A provider-qualified model is an exact provider/model request. Keep
        // non-model route controls, but do not let a route replace that model
        // or introduce model fallbacks.
        if (providerQualifiedModelRequest.selection) {
            dynamicRouteEvaluation = suppressDynamicRouteModelOverrides(
                dynamicRouteEvaluation,
            );
        }
        const routeModels = selectDynamicRouteContextModels(
            dynamicRouteEvaluation.action,
            options?.dynamicRouteModelOverride,
        );
        let routedContextFailure: { ok: false; response: Response } | null = null;
        for (const routedModel of routeModels) {
            if (routedModel === (resolvedModel || model)) {
                dynamicRouteEvaluation = {
                    ...dynamicRouteEvaluation,
                    action: { ...dynamicRouteEvaluation.action, model: routedModel },
                };
                routedContextFailure = null;
                break;
            }
            const routedContext = await timer.span("guardDynamicRouteContext", () =>
                guardContext({
                    workspaceId,
                    apiKeyId,
                    endpoint,
                    capability,
                    model: routedModel,
                    requestId,
                    internal,
                    testingMode: testingModeEnabled,
                    disableCache: debugEnabled,
                })
            );
            if (!routedContext.ok) {
                routedContextFailure = routedContext as { ok: false; response: Response };
                continue;
            }
            ({ context, providers, resolvedModel, candidateDiagnostics } = routedContext.value);
            dynamicRouteEvaluation = {
                ...dynamicRouteEvaluation,
                action: { ...dynamicRouteEvaluation.action, model: resolvedModel || routedModel },
            };
            routedContextFailure = null;
            break;
        }
        if (routedContextFailure) return routedContextFailure;
		if (autoRouterEvaluation && dynamicRouteEvaluation.action.model) {
			autoRouterEvaluation = {
				...autoRouterEvaluation,
				fallbackModels: [],
				overriddenByDynamicRoute: dynamicRouteEvaluation.action.model,
			};
		}
    }

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

    if (dynamicRouteEvaluation) {
        mergedBody = applyDynamicRouteToBody(mergedBody, dynamicRouteEvaluation);
        if (dynamicRouteEvaluation.action.routingMode) {
            resolvedRoutingMode = dynamicRouteEvaluation.action.routingMode;
        }
    }

	const regionalRequestViolation = validateRegionalTextRequest(
		endpoint,
		mergedBody,
		bindings.GATEWAY_ROUTING_REGION,
	);
	if (regionalRequestViolation) {
		return {
			ok: false,
			response: err("not_supported", {
				reason: `regional_${regionalRequestViolation.reason}`,
				description:
					"Regional gateways currently support text-only Chat Completions, Responses, and Messages requests.",
				details: [{
					message: "This request uses a feature that is not available on a regional gateway.",
					path: regionalRequestViolation.path,
					keyword: `regional_${regionalRequestViolation.reason}`,
					params: { value: regionalRequestViolation.value ?? null },
				}],
				request_id: requestId,
				workspace_id: workspaceId,
			}),
		};
	}

	const deploymentRegionResult = applyDeploymentRegionPolicy(
		mergedBody,
		bindings.GATEWAY_ROUTING_REGION,
	);
	if (deploymentRegionResult.ok === false) {
		return {
			ok: false,
			response: err("validation_error", {
				reason: "deployment_region_conflict",
				description:
					`This gateway only routes requests whose execution and data regions are ${deploymentRegionResult.region.toUpperCase()}.`,
				error_type: "user",
				error_origin: "user",
				error_operational_kind: "deployment_region_conflict",
				details: [{
					message:
						`Requested region "${deploymentRegionResult.requestedRegion}" conflicts with the ${deploymentRegionResult.region.toUpperCase()} gateway.`,
					path: ["provider", deploymentRegionResult.field],
					keyword: "deployment_region_conflict",
					params: {
						gateway_region: deploymentRegionResult.region,
						requested_region: deploymentRegionResult.requestedRegion,
					},
				}],
				request_id: requestId,
				workspace_id: workspaceId,
			}),
		};
	}
	mergedBody = deploymentRegionResult.body;

    // Keep this as the final request-level provider constraint before workspace
    // policy enforcement. A provider-qualified model is an exact pair, not a
    // provider preference that presets or other routing hints may widen.
    const providerQualifiedConstraint =
        applyProviderQualifiedModelConstraint(
            mergedBody,
            providerQualifiedModelRequest.selection,
        );
    if (providerQualifiedConstraint.ok === false) {
        return {
            ok: false,
            response: err("validation_error", {
                details: [{
                    message:
                        `Provider-qualified model "${providerQualifiedConstraint.providerId}:${providerQualifiedConstraint.model}" conflicts with ${providerQualifiedConstraint.field}`,
                    path: providerQualifiedConstraint.field.split("."),
                    keyword: "provider_qualified_model_conflict",
                    params: {
                        provider: providerQualifiedConstraint.providerId,
                        model: providerQualifiedConstraint.model,
                        field: providerQualifiedConstraint.field,
                        values: providerQualifiedConstraint.values,
                    },
                }],
                request_id: requestId,
                workspace_id: workspaceId,
            }),
        };
    }
    mergedBody = providerQualifiedConstraint.body;

    const providerQualifiedCandidates =
        filterProviderQualifiedModelCandidates(
            presetFilteredProviders,
            providerQualifiedModelRequest.selection,
        );
    if (providerQualifiedCandidates.ok === false) {
        const qualifiedModel =
            `${providerQualifiedCandidates.providerId}:${providerQualifiedCandidates.model}`;
        const freeRouteUnavailable =
            providerQualifiedCandidates.reason ===
            "qualified_free_provider_unavailable";
        const description = freeRouteUnavailable
            ? `Provider-qualified free model "${qualifiedModel}" does not have an eligible all-zero free pricing route`
            : `Provider-qualified model "${qualifiedModel}" is not available for this endpoint`;
        return {
            ok: false,
            response: err("validation_error", {
                model: providerQualifiedCandidates.model,
                provider: providerQualifiedCandidates.providerId,
                reason: providerQualifiedCandidates.reason,
                description,
                error_type: "user",
                error_origin: "user",
                error_operational_kind: providerQualifiedCandidates.reason,
                details: [{
                    message: description,
                    path: ["model"],
                    keyword: providerQualifiedCandidates.reason,
                    params: {
                        provider: providerQualifiedCandidates.providerId,
                        model: providerQualifiedCandidates.model,
                    },
                }],
                request_id: requestId,
                workspace_id: workspaceId,
            }),
        };
    }
    presetFilteredProviders = providerQualifiedCandidates.providers;

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
                response: err("guardrail_blocked", {
                    model: resolvedModel || model,
					reason: "model_restricted_by_policy",
					description: `Model "${resolvedModel || model}" is blocked by an account or workspace guardrail`,
					error_operational_kind: "model_restricted_by_policy",
					guardrail: {
						type: "route_access",
						scope: workspacePolicyFailure.diagnostics.accountPolicyApplied ? "account_or_workspace" : "workspace",
						active_guardrail_ids: workspacePolicyFailure.diagnostics.activeGuardrailIds,
					},
                    details: [{
						message: `Model "${resolvedModel || model}" is blocked by an account or workspace guardrail`,
                        path: ["model"],
						keyword: "model_restricted_by_policy",
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
			response: err(providerFilterClassification.code, {
                model: resolvedModel || model,
                reason: providerFilterClassification.reason,
				description: providerFilterClassification.description,
                error_type: providerFilterClassification.errorType,
                error_origin: providerFilterClassification.errorOrigin,
                error_operational_kind: providerFilterClassification.operationalKind,
                details: [{
					message: providerFilterClassification.description,
                    path: ["provider"],
					keyword: providerFilterClassification.keyword,
                    params: workspacePolicyFailure.diagnostics,
                }],
				guardrail: providerFilterClassification.code === "guardrail_blocked" ? {
					type: providerFilterClassification.reason === "data_handling_policy_no_routes" ? "data_handling" : "route_access",
					scope: workspacePolicyFailure.diagnostics.accountPolicyApplied ? "account_or_workspace" : "workspace",
					active_guardrail_ids: workspacePolicyFailure.diagnostics.activeGuardrailIds,
				} : undefined,
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
			authorizeRemappedCandidate: (candidate) => applyWorkspacePolicy({
				providers: [candidate],
				resolvedModel: candidate.apiModelId ?? resolvedModel ?? model,
				body: mergedBody,
				workspacePolicy,
				teamSettings: context.teamSettings ?? null,
			}).ok,
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
	const quantizationCandidates = filterQuantizationCandidates(
		enabledProviders,
		getEffectiveRoutingHints(mergedBody).quantizations,
	);
	if (quantizationCandidates.ok === false) {
		const requested = quantizationCandidates.requested.join(", ");
		const available = quantizationCandidates.diagnostics.available;
		const description = available.length > 0
			? `No eligible provider-model offer matches the requested quantization(s): ${requested}. Available quantizations: ${available.join(", ")}`
			: `No eligible provider-model offer matches the requested quantization(s): ${requested}. The eligible offers have no usable quantization metadata.`;
		return {
			ok: false,
			response: err("unsupported_model_or_endpoint", {
				model: resolvedModel || model,
				reason: quantizationCandidates.reason,
				description,
				error_type: "user",
				error_origin: "user",
				error_operational_kind: quantizationCandidates.reason,
				details: [{
					message: description,
					path: ["provider", "quantizations"],
					keyword: quantizationCandidates.reason,
					params: {
						requested: quantizationCandidates.requested,
						available,
					},
				}],
				routing_diagnostics: {
					quantization: quantizationCandidates.diagnostics,
				},
				request_id: requestId,
				workspace_id: workspaceId,
			}),
		};
	}
	enabledProviders = quantizationCandidates.providers;
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
        beforeContextCreditRefreshMs: contextTelemetry?.creditRefreshMs ?? null,
        beforeContextRpcMs: contextTelemetry?.rpcMs ?? null,
        beforeContextEnrichMs: contextTelemetry?.enrichMs ?? null,
        beforeContextCacheWriteMs: contextTelemetry?.cacheWriteMs ?? null,
        beforeContextFallbackRemap: contextTelemetry?.fallbackRemap ?? null,
        startedAtMs: requestStartedAtMs,
        labels: requestLabels.labels,
    });
    const requestPath = meta.requestPath ?? null;

    const ctx: PipelineContext = {
        endpoint,
        capability,
        requestId,
        billingRequestId: generatePublicId(),
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
            dynamicRoute: dynamicRouteEvaluation,
			autoRouter: autoRouterEvaluation,
        },
        guardrailEnforcement: sensitiveInfoResult.enforcement,
    };

    // console.log(`[DEBUG] beforeRequest: final ctx.model: ${ctx.model}`);

    return { ok: true, ctx };
}
