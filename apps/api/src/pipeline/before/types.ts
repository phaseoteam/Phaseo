// Purpose: Pipeline module for the gateway request lifecycle.
// Why: Keeps stage-specific logic isolated and testable.
// How: Exposes helpers used by before/execute/after orchestration.

// Types for the "before" stage of the gateway pipeline
// These types represent data structures used for authentication, authorization,
// and context building before processing requests

import type { Timer } from "../telemetry/timer";
import type { Endpoint, RequestMeta } from "@core/types";
import type { PriceCard } from "../pricing";
import type { ProviderAdapter } from "@providers/types";
import type {
    GatewayPluginExecutionMetadata,
    NormalizedGatewayPluginConfig,
} from "@/plugins/types";

/**
 * Represents the result of a gate check (authentication/authorization check)
 * Used for key validation, rate limiting, and credit checks
 */
export type GateCheck = {
    ok: boolean;
    reason: string | null;
    resetAt: string | null;
    now?: string | null;
    balanceNanos?: number | null;
    limitWindow?: "daily" | "weekly" | "monthly" | null;
    limitMetric?: "requests" | "cost" | "soft_blocked" | null;
    currentValue?: number | null;
    limitValue?: number | null;
    buckets?: {
        daily?: {
            windowStart: string | null;
            requestsUsed: number;
            requestsLimit: number;
            costUsedNanos: number;
            costLimitNanos: number;
        };
        weekly?: {
            windowStart: string | null;
            requestsUsed: number;
            requestsLimit: number;
            costUsedNanos: number;
            costLimitNanos: number;
        };
        monthly?: {
            windowStart: string | null;
            requestsUsed: number;
            requestsLimit: number;
            costUsedNanos: number;
            costLimitNanos: number;
        };
    } | null;
};

/**
 * Metadata for Bring Your Own Key (BYOK) keys
 * Contains information about user-provided API keys for specific providers
 */
export type ByokKeyMeta = {
    id: string;
    providerId: string | null;
    fingerprintSha256: string;
    keyVersion: string | null;
    alwaysUse: boolean;
    /**
     * When gateway context preloads a decrypted BYOK key, we keep it here to
     * avoid re-fetching from the database inside each adapter.
     */
    key?: string | null;
    // Back-compat alias used by older executors.
    value?: string | null;
};

/**
 * Configuration for a preset (reusable gateway configuration)
 * Presets can include system prompts, model constraints, and default parameters
 */
export type PresetConfig = {
    // System prompt injection
    systemPrompt?: string | null;

    // Model constraints
    allowedModels?: string[] | null;
    defaultModel?: string | null;
    model?: string | null; // Alias for defaultModel

    // Provider routing
    allowedProviders?: string[] | null;
    deniedProviders?: string[] | null;
    provider?: {
        order?: string[] | null;
        only?: string[] | null;
        ignore?: string[] | null;
        requiredExecutionRegion?: string | null;
        requiredDataRegion?: string | null;
        requireZeroDataRetention?: boolean | null;
        maxPrice?: {
            prompt?: number | string | null;
            completion?: number | string | null;
            image?: number | string | null;
            audio?: number | string | null;
            request?: number | string | null;
        } | null;
        preferredMinThroughput?: number | Record<string, number> | null;
        preferredMaxLatency?: number | Record<string, number> | null;
    } | null;

    // Default parameters (merged with request)
    defaultParams?: Record<string, any> | null;

    // Advanced routing
    providerPreferences?: Record<string, number> | null;
    routingMode?: "balanced" | "price" | "latency" | "throughput" | null;
    plugins?: NormalizedGatewayPluginConfig[] | null;
    responseCaching?: {
        enabled?: boolean | null;
        ttlSeconds?: number | null;
    } | null;
};

/**
 * Preset data returned from database
 */
export type PresetData = {
    id: string;
    name: string;
    slug: string | null;
    description: string | null;
    config: PresetConfig;
    visibility: "private" | "team" | "public";
};

export type ProviderRolloutStatus =
    | "active"
    | "beta"
    | "alpha"
    | "not_ready"
    | "gated"
    | "access_limited"
    | "region_limited"
    | "project_limited"
    | "paused"
    | "soft_blocked";

export type RoutingStatus =
    | "active"
    | "deranked_lvl1"
    | "deranked_lvl2"
    | "deranked_lvl3"
    | "disabled";

export type CapabilityRoutingStatus = RoutingStatus | "internal_testing" | "coming_soon";

/**
 * Snapshot of a provider's configuration and capabilities
 * Returned from the RPC call for gateway context
 */
export type GatewayProviderSnapshot = {
    providerId: string;
    providerFamilyId?: string | null;
    offerScope?: "global" | "regional" | "specialized" | null;
    offerLabel?: string | null;
    apiModelId?: string | null;
    pricingKey?: string | null;
    providerStatus?: ProviderRolloutStatus | null;
    providerRoutingStatus?: RoutingStatus | null;
    modelRoutingStatus?: RoutingStatus | null;
    capabilityStatus?: CapabilityRoutingStatus | null;
    residencyMode?:
        | "unknown"
        | "provider_managed"
        | "customer_selectable"
        | "account_selected"
        | null;
    executionRegions?: string[] | null;
    dataRegions?: string[] | null;
    zeroDataRetention?:
        | "unknown"
        | "unsupported"
        | "optional"
        | "default"
        | null;
    promptTrainingPolicy?:
        | "unknown"
        | "no_train"
        | "may_train"
        | "opt_out_available"
        | "enterprise_no_train"
        | null;
    dataPolicyTier?: "unknown" | "private" | "logs" | "trains" | null;
    dataPolicyConfidence?: "unknown" | "confirmed" | "maybe" | null;
    dataPolicyContractMode?:
        | "none"
        | "customer_agreement"
        | "enterprise_agreement"
        | null;
    supportsEndpoint: boolean;
    baseWeight: number;
    byokMeta: ByokKeyMeta[];
    providerModelSlug: string | null;
    inputModalities?: string[] | null;
    outputModalities?: string[] | null;
    capabilityParams?: Record<string, any>;
    maxInputTokens?: number | null;
    maxOutputTokens?: number | null;
};

/**
 * Team enrichment data for observability (wide event pattern)
 * Following loggingsucks.com: One event should tell you everything about the user
 */
export type TeamEnrichment = {
    tier: string;
    created_at: string;
    account_age_days: number;
    balance_nanos: number;
    balance_usd: number;
    balance_is_low: boolean;
    total_requests: number;
    total_spend_nanos: number;
    total_spend_usd: number;
    spend_24h_nanos: number;
    spend_24h_usd: number;
    spend_7d_nanos: number;
    spend_7d_usd: number;
    spend_30d_nanos: number;
    spend_30d_usd: number;
    requests_1h: number;
    requests_24h: number;
};

export type TeamSettings = {
    routingMode: string | null;
    byokFallbackEnabled: boolean | null;
    betaChannelEnabled: boolean | null;
    alphaChannelEnabled?: boolean | null;
    cacheAwareRoutingEnabled?: boolean | null;
    privacyZdrOnly?: boolean | null;
    privacyEnablePaidMayTrain?: boolean | null;
    privacyEnableFreeMayTrain?: boolean | null;
    privacyEnableInputOutputLogging?: boolean | null;
    defaultPlugins?: NormalizedGatewayPluginConfig[] | null;
    billingMode: "wallet" | "invoice";
};

/**
 * API Key enrichment data for observability
 */
export type KeyEnrichment = {
    name: string | null;
    created_at: string;
    key_age_days: number;
    total_requests: number;
    total_spend_nanos: number;
    total_spend_usd: number;
    requests_today: number;
    spend_today_nanos: number;
    spend_today_usd: number;
    daily_limit_pct: number | null;
};

export type ContextFetchTelemetry = {
    cacheStatus: "hit" | "miss" | "bypass";
    totalMs: number;
    keyVersionMs?: number | null;
    cacheReadMs?: number | null;
    rpcMs?: number | null;
    enrichMs?: number | null;
    cacheWriteMs?: number | null;
    fallbackRemap?: boolean;
};

/**
 * Complete context data returned from the gateway RPC
 * Includes team info, gate checks, providers, and pricing
 */
export type GatewayContextData = {
    workspaceId: string;
    endpoint?: Endpoint;
    resolvedModel?: string | null;
    preset?: PresetData | null;
    key: GateCheck;
    keyLimit: GateCheck;
    credit: GateCheck;
    providers: GatewayProviderSnapshot[];
    pricing: Record<string, PriceCard>;
    teamEnrichment?: TeamEnrichment | null;
    keyEnrichment?: KeyEnrichment | null;
    teamSettings?: TeamSettings | null;
    testingMode?: boolean;
    contextTelemetry?: ContextFetchTelemetry;
};

/**
 * A candidate provider for handling a request
 * Includes the adapter, weight, BYOK metadata, and pricing info
 */
export type ProviderCandidate = {
    providerId: string;
    providerFamilyId?: string | null;
    offerScope?: "global" | "regional" | "specialized" | null;
    offerLabel?: string | null;
    apiModelId?: string | null;
    pricingKey?: string | null;
    providerStatus?: ProviderRolloutStatus | null;
    providerRoutingStatus?: RoutingStatus | null;
    modelRoutingStatus?: RoutingStatus | null;
    capabilityStatus?: CapabilityRoutingStatus | null;
    residencyMode?:
        | "unknown"
        | "provider_managed"
        | "customer_selectable"
        | "account_selected"
        | null;
    executionRegions?: string[] | null;
    dataRegions?: string[] | null;
    zeroDataRetention?:
        | "unknown"
        | "unsupported"
        | "optional"
        | "default"
        | null;
    promptTrainingPolicy?:
        | "unknown"
        | "no_train"
        | "may_train"
        | "opt_out_available"
        | "enterprise_no_train"
        | null;
    dataPolicyTier?: "unknown" | "private" | "logs" | "trains" | null;
    dataPolicyConfidence?: "unknown" | "confirmed" | "maybe" | null;
    dataPolicyContractMode?:
        | "none"
        | "customer_agreement"
        | "enterprise_agreement"
        | null;
    adapter: ProviderAdapter;
    baseWeight: number;
    byokMeta: ByokKeyMeta[];
    pricingCard: PriceCard | null;
    providerModelSlug: string | null;
    inputModalities?: string[] | null;
    outputModalities?: string[] | null;
    capabilityParams?: Record<string, any>;
    maxInputTokens?: number | null;
    maxOutputTokens?: number | null;
};

export type ParamRoutingDiagnostics = {
    requestedParams: string[];
    unknownParams: string[];
    providerCountBefore: number;
    providerCountAfter: number;
    perParamSupport: Array<{
        param: string;
        supportedProviders: string[];
        unsupportedProviders: string[];
    }>;
    droppedProviders: Array<{
        providerId: string;
        unsupportedParams: string[];
    }>;
    filteringStages: Array<{
        stage:
            | "param_support"
            | "param_preference"
            | "provider_docs"
            | "response_format"
            | "structured_outputs"
            | "token_limits";
        beforeCount: number;
        afterCount: number;
        droppedProviders: string[];
    }>;
};

export type ProviderCandidateBuildDiagnostics = {
    totalProviders: number;
    supportsEndpointCount: number;
    droppedUnsupportedEndpoint: string[];
    droppedMissingAdapter: Array<{
        providerId: string;
        endpoint: Endpoint;
    }>;
    candidateCount: number;
};

export type ProviderEnablementDiagnostics = {
    capability: string;
    providersBefore: string[];
    providersAfter: string[];
    dropped: Array<{
        providerId: string;
        reason:
            | "capability_disabled"
            | "adapter_missing"
            | "pricing_missing"
            | "service_tier_unsupported";
    }>;
};

export type ProviderAttemptLog = {
    attempt_number: number;
    round_number?: number | null;
    provider: string;
    endpoint: Endpoint;
    model: string;
    api_model_id?: string | null;
    provider_model_slug?: string | null;
    outcome:
        | "success"
        | "upstream_non_2xx"
        | "error"
        | "retryable_error"
        | "blocked"
        | "no_pricing"
        | "unsupported_executor";
    type?: string | null;
    duration_ms: number;
    status?: number | null;
    status_text?: string | null;
    retryable?: boolean | null;
    key_source?: "gateway" | "byok" | null;
    byok_key_id?: string | null;
    upstream_url?: string | null;
    upstream_error_code?: string | null;
    upstream_error_type?: string | null;
    upstream_error_message?: string | null;
    upstream_error_description?: string | null;
    upstream_error_param?: string | null;
    upstream_payload_preview?: string | null;
    response_kind?: "completed" | "stream" | null;
    was_probe?: boolean;
    fallback_attempted?: boolean;
    request_build_ms?: number | null;
    upstream_headers_ms?: number | null;
    retry_delay_ms?: number | null;
    native_response_id?: string | null;
    provider_finish_reason?: string | null;
    finish_reason?: string | null;
    upstream_request?: unknown;
    upstream_response?: unknown;
    upstream_attempts?: Array<{
        sequence: number;
        route?: string | null;
        request?: unknown;
        response?: unknown;
        status?: number | null;
        status_text?: string | null;
        url?: string | null;
        duration_ms: number;
        outcome: "success" | "upstream_non_2xx" | "network_error";
        error_message?: string | null;
    }>;
};

export type ProviderRoundLog = {
    round_number: number;
    request_payload?: unknown;
    provider: string;
    api_model_id: string | null;
    pricing_key: string | null;
    provider_finish_reason: string | null;
    finish_reason: string | null;
    usage: Record<string, unknown> | null;
    native_response_id: string | null;
    generation_ms: number | null;
    latency_ms: number | null;
    total_ms: number | null;
    mapped_request: unknown;
    raw_response: unknown;
    status_code: number;
    key_source: "gateway" | "byok" | null;
    byok_key_id: string | null;
    provider_attempts: ProviderAttemptLog[];
};

export type WorkspacePolicy = {
    providerAllowlist: string[] | null;
    providerBlocklist: string[] | null;
    allowedApiModels: string[] | null;
    blockedApiModels?: string[] | null;
    promptInjectionAction: PromptInjectionAction | null;
    promptInjectionGuardrailIds: string[];
    sensitiveInfoRules: SensitiveInfoRule[];
    sensitiveInfoGuardrailIds: string[];
    enforceAllowed: boolean;
    activeGuardrailIds: string[];
};

export type GuardrailAction = "flag" | "redact" | "block";

export type PromptInjectionAction = GuardrailAction;
export type SensitiveInfoAction = GuardrailAction;

export type SensitiveInfoBuiltinRuleId =
    | "email_address"
    | "phone_number"
    | "ssn"
    | "credit_card_number"
    | "ip_address"
    | "person_name"
    | "physical_address";

export type SensitiveInfoBuiltinRule = {
    id: SensitiveInfoBuiltinRuleId;
    kind: "builtin";
    action: SensitiveInfoAction;
};

export type SensitiveInfoCustomRule = {
    id: string;
    kind: "custom";
    action: SensitiveInfoAction;
    name: string;
    pattern: string;
    flags?: string | null;
};

export type SensitiveInfoRule = SensitiveInfoBuiltinRule | SensitiveInfoCustomRule;

export type GuardrailEnforcementDetection = {
    detectorId: string;
    category: string;
    variant: "regex" | "typoglycemia" | "base64" | "hex" | "spaced" | "entity_heuristic";
};

export type GuardrailEnforcement = {
    source: "prompt_injection" | "sensitive_info" | "multiple";
    action: GuardrailAction;
    detectionCount: number;
    redactionCount: number;
    guardrailIds: string[];
    detections: GuardrailEnforcementDetection[];
};

export type GuardrailEnforcementPayload = GuardrailEnforcement & {
    actions: GuardrailAction[];
    blocked: boolean;
    flagged: boolean;
    redacted: boolean;
    detection_count: number;
    redaction_count: number;
    guardrail_ids: string[];
    detectors: Array<{
        detector_id: string;
        category: string;
        variant: GuardrailEnforcementDetection["variant"];
    }>;
};

export type ResponseCacheDiagnostics = {
    enabled: boolean;
    status: "bypass" | "miss" | "hit";
    reason: string | null;
    key: string | null;
    fingerprint: string | null;
    ttlSeconds: number | null;
    ttlSource: string | null;
    createdAt?: string | null;
    ageMs?: number | null;
    providerId?: string | null;
};

export type SearchObservabilityResultItem = {
    type: string | null;
    title: string | null;
    url: string | null;
    snippet: string | null;
};

export type SearchObservabilityCitation = {
    type: string | null;
    title: string | null;
    url: string | null;
    text: string | null;
};

export type ManagedSearchObservabilityEntry = {
    provider: string | null;
    query: string | null;
    requestId: string | null;
    searchType: string | null;
    resultCount: number;
};

export type NativeSearchObservabilityEntry = {
    type: string | null;
    query: string | null;
    status: string | null;
};

export type SearchObservability = {
    usedNativeWebSearch: boolean;
    usedManagedWebSearch: boolean;
    resultCount: number;
    citationCount: number;
    results: SearchObservabilityResultItem[];
    citations: SearchObservabilityCitation[];
    nativeSearches: NativeSearchObservabilityEntry[];
    managedSearches: ManagedSearchObservabilityEntry[];
};

export type ManagedWebFetchObservabilityEntry = {
    provider: string | null;
    url: string | null;
    finalUrl: string | null;
    title: string | null;
    status: number | null;
    contentType: string | null;
    returnedChars: number;
    truncated: boolean;
};

export type WebFetchObservability = {
    requestCount: number;
    fetches: ManagedWebFetchObservabilityEntry[];
};

/**
 * The main context object passed through the entire pipeline
 * Contains all information needed for request processing
 */
export type PipelineContext = {
    endpoint: Endpoint;
    capability: string;
    requestId: string;
    protocol?: string;
    providerCapabilitiesBeta?: boolean;
    meta: RequestMeta;
    rawBody: any;
    body: any;
    requestedModel: string;
    model: string;
    workspaceId: string;
    stream: boolean;
    strictness?: "off" | "warn" | "error";
    requestPath?: string;
    requestedParams?: string[];
    paramRoutingDiagnostics?: ParamRoutingDiagnostics;
    providerCandidateBuildDiagnostics?: ProviderCandidateBuildDiagnostics;
    providerEnablementDiagnostics?: ProviderEnablementDiagnostics;
    plugins?: NormalizedGatewayPluginConfig[];
    pluginExecutions?: GatewayPluginExecutionMetadata[];
    providers: ProviderCandidate[];
    pricing: Record<string, PriceCard>;
    gating: {
        key: GateCheck;
        keyLimit: GateCheck;
        credit: GateCheck;
    };
    preset?: {
        id: string;
        name: string;
        slug?: string | null;
        config: PresetConfig;
    } | null;
    internal?: boolean;
    timing?: Record<string, number>;
    timer?: Timer;
    routingDiagnostics?: Record<string, any> | null;
    guardrailEnforcement?: GuardrailEnforcementPayload | null;
    searchObservability?: SearchObservability | null;
    webFetchObservability?: WebFetchObservability | null;
    responseCache?: ResponseCacheDiagnostics | null;
    attemptErrors?: Array<Record<string, unknown>>;
    providerAttempts?: ProviderAttemptLog[];
    providerRounds?: ProviderRoundLog[];
    // Enrichment data for observability (wide events)
    teamEnrichment?: TeamEnrichment | null;
    keyEnrichment?: KeyEnrichment | null;
    teamSettings?: TeamSettings | null;
    routingMode?: string | null;
    keyId?: string | null;
    testingMode?: boolean;
};

