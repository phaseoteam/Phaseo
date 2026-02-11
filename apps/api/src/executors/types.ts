// Executor type contracts
// Purpose: Shared type definitions for executor inputs/outputs and billing metadata.
// Why: Keeps executor interfaces consistent across providers and capabilities.
// How: Exposes typed shapes consumed by the execute pipeline and provider adapters.

import type {
	IRChatRequest,
	IRChatResponse,
	IREmbeddingsRequest,
	IREmbeddingsResponse,
	IRImageGenerationRequest,
	IRImageGenerationResponse,
	IRAudioSpeechRequest,
	IRAudioSpeechResponse,
	IRAudioTranscriptionRequest,
	IRAudioTranscriptionResponse,
	IRAudioTranslationRequest,
	IRAudioTranslationResponse,
	IRVideoGenerationRequest,
	IRVideoGenerationResponse,
	IROcrRequest,
	IROcrResponse,
	IRMusicGenerateRequest,
	IRMusicGenerateResponse,
	IRModerationsRequest,
	IRModerationsResponse,
} from "@core/ir";
import type { ByokKeyMeta } from "@pipeline/before/types";
import type { Endpoint } from "@core/types";
import type { DebugOptions } from "@core/types";
import type { Protocol } from "@protocols/detect";

export type ExecutorExecuteArgs = {
	// Keep executor boundary permissive; each executor narrows to its capability-specific IR.
	ir: any;

	requestId: string;
	teamId: string;
	providerId: string;
	endpoint: Endpoint;
	protocol?: Protocol;
	capability?: string;

	providerModelSlug?: string | null;
	capabilityParams?: Record<string, any> | null;
	maxInputTokens?: number | null;
	maxOutputTokens?: number | null;

	byokMeta: ByokKeyMeta[];
	pricingCard: any;

	meta: {
		debug?: DebugOptions;
		returnMeta?: boolean;
		echoUpstreamRequest?: boolean;
		returnUpstreamRequest?: boolean;
		returnUpstreamResponse?: boolean;
		upstreamStartMs?: number; // Timestamp when upstream request started
		forceGatewayKey?: boolean;
	};
};

export type Bill = {
	cost_cents: number;
	currency: string;
	usage?: Record<string, any>;
	upstream_id?: string | null;
	finish_reason?: string | null;
};

export type ExecutorCompletedResult = {
	kind: "completed";
	ir?:
		| IRChatResponse
		| IREmbeddingsResponse
		| IRModerationsResponse
		| IRImageGenerationResponse
		| IRAudioSpeechResponse
		| IRAudioTranscriptionResponse
		| IRAudioTranslationResponse
		| IRVideoGenerationResponse
		| IROcrResponse
		| IRMusicGenerateResponse;
	bill: Bill;
	upstream: Response;
	keySource?: "gateway" | "byok";
	byokKeyId?: string | null;
	mappedRequest?: string;
	rawResponse?: any;
	timing?: {
		latencyMs?: number;
		generationMs?: number;
	};
};

export type ExecutorStreamingResult = {
	kind: "stream";
	stream: ReadableStream<Uint8Array>;
	usageFinalizer: () => Promise<Bill | null>;
	bill: Bill;
	upstream: Response;
	keySource?: "gateway" | "byok";
	byokKeyId?: string | null;
	mappedRequest?: string;
	rawResponse?: any;
	timing?: {
		latencyMs?: number;
		generationMs?: number;
	};
};

export type ExecutorResult = ExecutorCompletedResult | ExecutorStreamingResult;

export type ProviderExecutor = (args: ExecutorExecuteArgs) => Promise<ExecutorResult>;
