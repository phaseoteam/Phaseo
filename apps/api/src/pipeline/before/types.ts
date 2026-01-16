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
};

/**
 * Snapshot of a provider's configuration and capabilities
 * Returned from the RPC call for gateway context
 */
export type GatewayProviderSnapshot = {
    providerId: string;
    supportsEndpoint: boolean;
    baseWeight: number;
    byokMeta: ByokKeyMeta[];
    providerModelSlug: string | null;
};

/**
 * Complete context data returned from the gateway RPC
 * Includes team info, gate checks, providers, and pricing
 */
export type GatewayContextData = {
    teamId: string;
    resolvedModel?: string | null;
    key: GateCheck;
    keyLimit: GateCheck;
    credit: GateCheck;
    providers: GatewayProviderSnapshot[];
    pricing: Record<string, PriceCard>;
};

/**
 * A candidate provider for handling a request
 * Includes the adapter, weight, BYOK metadata, and pricing info
 */
export type ProviderCandidate = {
    providerId: string;
    adapter: ProviderAdapter;
    baseWeight: number;
    byokMeta: ByokKeyMeta[];
    pricingCard: PriceCard | null;
    providerModelSlug: string | null;
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
    meta: RequestMeta;
    rawBody: any;
    body: any;
    model: string;
    teamId: string;
    stream: boolean;
    strictness?: "off" | "warn" | "error";
    requestPath?: string;
    providers: ProviderCandidate[];
    pricing: Record<string, PriceCard>;
    gating: {
        key: GateCheck;
        keyLimit: GateCheck;
        credit: GateCheck;
    };
    internal?: boolean;
    timing?: Record<string, number>;
    timer?: Timer;
};
