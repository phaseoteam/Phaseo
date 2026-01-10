// Surface executor types
// Surfaces represent upstream provider APIs (OpenAI-compatible, Anthropic, etc.)

import type { IRChatRequest, IRChatResponse } from "@core/ir";
import type { ByokKeyMeta } from "@pipeline/before/types";

/**
 * Surface identifiers
 * Each surface represents an upstream API format:
 * - openai_compat: OpenAI-compatible APIs (OpenAI, Groq, DeepSeek, Together, etc.)
 * - anthropic: Anthropic Messages API
 */
export type SurfaceId = "openai_compat" | "anthropic";

/**
 * Arguments for surface execution
 */
export type SurfaceExecuteArgs = {
	// IR request to execute
	ir: IRChatRequest;

	// Request context
	requestId: string;
	teamId: string;
	providerId: string;

	// Model information
	providerModelSlug?: string | null; // Provider's native model name

	// BYOK (Bring Your Own Key) metadata
	byokMeta: ByokKeyMeta[]; // BYOK keys to try (surface will resolve with fallback)

	// Pricing (for usage calculation)
	pricingCard: any; // PriceCard from pricing engine

	// Request metadata
        meta: {
                debug?: boolean;
                returnUsage?: boolean;
                returnMeta?: boolean;
                echoUpstreamRequest?: boolean;
        };
};

/**
 * Billing information for a request
 */
export type Bill = {
	cost_cents: number;
	currency: string;
	usage?: Record<string, any>; // Full usage breakdown for pricing
	upstream_id?: string | null; // Provider's request ID
	finish_reason?: string | null; // How the generation ended
};

/**
 * Result from surface execution
 * Either completed (non-streaming) or streaming
 */
export type SurfaceResult =
	| SurfaceCompletedResult
	| SurfaceStreamingResult;

/**
 * Completed (non-streaming) result
 */
export type SurfaceCompletedResult = {
        kind: "completed";
        ir?: IRChatResponse; // Complete IR response
        bill: Bill; // Billing information
        upstream: Response; // Original upstream response (for debugging)       
        keySource: "gateway" | "byok"; // Key source used
        byokKeyId: string | null; // BYOK key ID if applicable
        mappedRequest?: string; // Upstream request body (stringified JSON)
        rawResponse?: any; // Raw upstream JSON payload when available
        timing?: {
                latencyMs?: number;
                generationMs?: number;
        };
};

/**
 * Streaming result
 */
export type SurfaceStreamingResult = {
        kind: "stream";
        stream: ReadableStream<Uint8Array>; // SSE stream
        usageFinalizer: () => Promise<Bill | null>; // Callback to get final usage
        bill: Bill; // Preliminary billing (updated by finalizer)
        upstream: Response; // Original upstream response (for headers)
        keySource: "gateway" | "byok"; // Key source used
        byokKeyId: string | null; // BYOK key ID if applicable
        mappedRequest?: string; // Upstream request body (stringified JSON)
        timing?: {
                latencyMs?: number;
                generationMs?: number;
        };
};

/**
 * Surface interface
 * Each surface must implement this to execute IR requests
 */
export interface Surface {
	/**
	 * Surface name (for logging/observability)
	 */
	name: string;

    /**
     * Execute an IR request against the upstream API.
     *
     * Responsibilities:
     * 1) Transform IR -> provider's native schema for the chosen endpoint
     * 2) Call upstream API
     * 3) Transform response -> IR (semantic)
     * 4) Attach raw response context for rendering protocol envelopes
     * 5) Handle streaming if requested
     */
    execute(args: SurfaceExecuteArgs): Promise<SurfaceResult>;
}


