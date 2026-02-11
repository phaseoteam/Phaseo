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

    // Default parameters (merged with request)
    defaultParams?: Record<string, any> | null;

    // Advanced routing
    providerPreferences?: Record<string, number> | null;
};

/**
 * Preset data returned from database
 */
export type PresetData = {
    id: string;
    name: string;
    description: string | null;
    config: PresetConfig;
    visibility: "private" | "team" | "public";
};

/**
 * Snapshot of a provider's configuration and capabilities
 * Returned from the RPC call for gateway context
 */
export type GatewayProviderSnapshot = {
    providerId: string;
    providerStatus?: "active" | "beta" | "alpha" | "not_ready" | null;
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

/**
 * Complete context data returned from the gateway RPC
 * Includes team info, gate checks, providers, and pricing
 */
export type GatewayContextData = {
    teamId: string;
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
};

/**
 * A candidate provider for handling a request
 * Includes the adapter, weight, BYOK metadata, and pricing info
 */
export type ProviderCandidate = {
    providerId: string;
    providerStatus?: "active" | "beta" | "alpha" | "not_ready" | null;
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
        stage: "param_support" | "provider_docs" | "response_format" | "structured_outputs" | "token_limits";
        beforeCount: number;
        afterCount: number;
        droppedProviders: string[];
    }>;
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
    model: string;
    teamId: string;
    stream: boolean;
    strictness?: "off" | "warn" | "error";
    requestPath?: string;
    requestedParams?: string[];
    paramRoutingDiagnostics?: ParamRoutingDiagnostics;
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
        config: PresetConfig;
    } | null;
    internal?: boolean;
    timing?: Record<string, number>;
    timer?: Timer;
    // Enrichment data for observability (wide events)
    teamEnrichment?: TeamEnrichment | null;
    keyEnrichment?: KeyEnrichment | null;
    teamSettings?: TeamSettings | null;
    routingMode?: string | null;
    keyId?: string | null;
};

