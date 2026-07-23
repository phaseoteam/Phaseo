// file: lib/gateway/execute/index.ts
// Purpose: Execute-stage logic for routing, attempts, and provider health.
// Why: Centralizes execution/failover behavior.
// How: Ranks candidates, attempts providers with failover, and records timing/usage.

import type { GatewayResponsePayload } from "@core/types";
import type { ByokKeyMeta, PipelineContext, ProviderAttemptLog } from "../before/types";
import { Timer } from "../telemetry/timer";
import { dispatchBackground, ensureRuntimeForBackground } from "@/runtime/env";

export type PipelineTiming = {
	timer: Timer;
	internal: {
		adapterMarked: boolean;
	};
};

function dispatchProviderHealthBackground(task: () => Promise<unknown>): void {
	let releaseRuntime: () => void = () => {};
	try {
		releaseRuntime = ensureRuntimeForBackground();
	} catch (error) {
		console.error("[gateway] failed to preserve runtime for provider health", {
			error: error instanceof Error ? error.message : String(error),
		});
	}
	dispatchBackground((async () => {
		try {
			await task();
		} finally {
			releaseRuntime();
		}
	})());
}

import { guardCandidates, guardPricingFound, guardAllFailed } from "./guards";
import { err } from "./http";
import { getBaseModel, calculateMaxTries } from "./utils";
import { rankProviders } from "./providers";
import { resolveProviderExecutor } from "../../executors";
import {
	admitThroughBreaker,
	classifyProviderHealthImpact,
	onCallEnd,
	onCallStart,
	maybeOpenOnRecentErrors,
	reportProbeResult,
} from "./health";
import { logDebugEvent, previewValue, parseJsonLoose } from "../debug";

export type Bill = {
	cost_cents: number;
	currency: string;
	usage?: Record<string, any>;
	upstream_id?: string | null;
	finish_reason?: string | null;
};

// NOTE: Legacy RequestResult removed. Use IRRequestResult everywhere.

// ============================================================================
// IR-AWARE EXECUTION (NEW)
// ============================================================================

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
	IRModerationsRequest,
	IRModerationsResponse,
	IRRerankRequest,
	IRRerankResponse,
	IROcrRequest,
	IROcrResponse,
	IRMusicGenerateRequest,
	IRMusicGenerateResponse,
	IRVideoGenerationRequest,
	IRVideoGenerationResponse,
} from "@core/ir";
import type { ExecutorExecuteArgs } from "@executors/types";
import { createUpstreamTimingTracker } from "@executors/_shared/timing/upstream";
import { normalizeIRForProvider } from "./normalize";
import { normalizeCapability } from "@/executors";
import { filterCandidatesByModalities, filterEmbeddingCandidatesByModalities } from "./modalities";
import { loadPriceCard } from "../pricing";
import { stripUsagePricing } from "../usage";
import { getEffectiveRoutingHints } from "../requestRouting";
import { sanitizeUrlForLogging } from "@/lib/security/sanitizeUrl";

const ATTEMPT_PREVIEW_LIMIT = 320;
const MAX_UPSTREAM_ERROR_BODY_BYTES = 32 * 1024;
const MAX_RETRYABLE_EXECUTOR_RETRIES = 0;
const SINGLE_PROVIDER_FAILURE_RETRIES = 0;

export type CredentialAttemptPhase = "priority_byok" | "gateway" | "fallback_byok";

export function buildCredentialAttemptPlan(
	rankedProviders: any[],
	options: { includeFallbackByok?: boolean } = {},
): Array<{
	routed: any;
	phase: CredentialAttemptPhase;
	credential: { kind: "gateway" } | { kind: "byok"; key: ByokKeyMeta };
}> {
	const modeForKey = (key: ByokKeyMeta): "priority" | "fallback" =>
		key.routingMode ?? (key.alwaysUse ? "priority" : "fallback");
	const keysForMode = (routed: any, mode: "priority" | "fallback") =>
		(routed.candidate.byokMeta ?? [])
			.filter((key: ByokKeyMeta) => modeForKey(key) === mode)
			.sort((a: ByokKeyMeta, b: ByokKeyMeta) =>
				(a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id.localeCompare(b.id),
			)
			.map((key: ByokKeyMeta) => ({
				routed,
				phase: mode === "priority" ? "priority_byok" as const : "fallback_byok" as const,
				credential: { kind: "byok" as const, key },
			}));

	return [
		...rankedProviders.flatMap((routed) => keysForMode(routed, "priority")),
		...rankedProviders.map((routed) => ({
			routed,
			phase: "gateway" as const,
			credential: { kind: "gateway" as const },
		})),
		...(options.includeFallbackByok === false
			? []
			: rankedProviders.flatMap((routed) => keysForMode(routed, "fallback"))),
	];
}

function shouldRetrySingleProviderStatus(status: number | null | undefined): boolean {
	const code = Number(status ?? 0);
	if (!Number.isFinite(code)) return false;
	if (code === 408 || code === 429) return true;
	return code >= 500;
}

function truncateAttemptText(value: unknown, limit = ATTEMPT_PREVIEW_LIMIT): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	if (!trimmed) return null;
	if (trimmed.length <= limit) return trimmed;
	return `${trimmed.slice(0, limit)}...[truncated ${trimmed.length - limit} chars]`;
}

function normalizeUpstreamErrorCode(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	if (!trimmed) return null;
	const withoutNamespace = trimmed.includes("#") ? trimmed.slice(trimmed.lastIndexOf("#") + 1) : trimmed;
	const withoutSuffix = withoutNamespace.includes(":")
		? withoutNamespace.slice(0, withoutNamespace.indexOf(":"))
		: withoutNamespace;
	return truncateAttemptText(withoutSuffix, 120);
}

function extractUpstreamErrorSummary(
	payload: unknown,
	upstreamHeaders?: Headers | null,
): {
	upstream_error_code: string | null;
	upstream_error_type: string | null;
	upstream_error_message: string | null;
	upstream_error_description: string | null;
	upstream_error_param: string | null;
} {
	if (!payload || typeof payload !== "object") {
		return {
			upstream_error_code: null,
			upstream_error_type: null,
			upstream_error_message: null,
			upstream_error_description: null,
			upstream_error_param: null,
		};
	}

	const obj = payload as Record<string, unknown>;
	const innerError =
		obj.error && typeof obj.error === "object" ? (obj.error as Record<string, unknown>) : null;
	const awsHeaderErrorType = normalizeUpstreamErrorCode(
		upstreamHeaders?.get("x-amzn-errortype"),
	);
	const namedExceptionEntry = Object.entries(obj).find(([key, value]) =>
		/exception$/i.test(key) && Boolean(value) && typeof value === "object",
	);
	const namedExceptionBody =
		namedExceptionEntry && typeof namedExceptionEntry[1] === "object"
			? (namedExceptionEntry[1] as Record<string, unknown>)
			: null;
	const fallbackCode =
		awsHeaderErrorType ??
		normalizeUpstreamErrorCode(obj.__type) ??
		(namedExceptionEntry ? normalizeUpstreamErrorCode(namedExceptionEntry[0]) : null) ??
		normalizeUpstreamErrorCode(obj.status) ??
		(typeof obj.error === "string"
			? obj.error
			: typeof obj.code === "string"
				? obj.code
				: typeof obj.error_code === "string"
					? obj.error_code
					: null);
	const fallbackType =
		awsHeaderErrorType ??
		normalizeUpstreamErrorCode(obj.__type) ??
		typeof obj.error_type === "string"
			? obj.error_type
			: typeof obj.type === "string"
				? obj.type
				: null;
	const fallbackMessage = truncateAttemptText(
		typeof namedExceptionBody?.message === "string"
			? namedExceptionBody.message
			: (typeof obj.message === "string" ? obj.message : null),
	);
	const fallbackDescription = truncateAttemptText(
		typeof namedExceptionBody?.description === "string"
			? namedExceptionBody.description
			: (typeof obj.description === "string" ? obj.description : null),
	);
	const rawParam = truncateAttemptText(
		typeof innerError?.param === "string"
			? innerError.param
			: (typeof obj.param === "string" ? obj.param : null),
	);
	const message =
		truncateAttemptText(
			typeof innerError?.message === "string" ? innerError.message : null,
		) ?? fallbackMessage;
	const normalizedMessage =
		rawParam && message && /^param\s+incorrect$/i.test(message)
			? `${message}: ${rawParam}`
			: message;

	return {
		upstream_error_code:
			normalizeUpstreamErrorCode(innerError?.code) ??
			normalizeUpstreamErrorCode(innerError?.status) ??
			normalizeUpstreamErrorCode(innerError?.type) ??
			normalizeUpstreamErrorCode(fallbackCode),
		upstream_error_type:
			normalizeUpstreamErrorCode(innerError?.status) ??
			normalizeUpstreamErrorCode(innerError?.type) ??
			normalizeUpstreamErrorCode(fallbackType),
		upstream_error_message: normalizedMessage,
		upstream_error_description:
			truncateAttemptText(
				typeof innerError?.description === "string" ? innerError.description : null,
			) ?? rawParam ?? fallbackDescription,
		upstream_error_param: rawParam,
	};
}

async function readUpstreamFailurePayload(result: {
	upstream: Response;
	rawResponse?: unknown;
}): Promise<{ payload: unknown; payload_preview: string | null }> {
	if (result.rawResponse !== undefined) {
		const rawPreview = truncateAttemptText(
			typeof result.rawResponse === "string"
				? result.rawResponse
				: JSON.stringify(result.rawResponse),
		);
		return { payload: result.rawResponse, payload_preview: rawPreview };
	}

	try {
		const clone = result.upstream.clone();
		if (!clone.body) {
			return { payload: null, payload_preview: null };
		}
		const reader = clone.body.getReader();
		const chunks: Uint8Array[] = [];
		let totalBytes = 0;
		let truncated = false;
		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				if (!value) continue;
				const remaining = MAX_UPSTREAM_ERROR_BODY_BYTES - totalBytes;
				if (remaining <= 0) {
					truncated = true;
					await reader.cancel("upstream_error_body_limit");
					break;
				}
				chunks.push(value.byteLength <= remaining ? value : value.slice(0, remaining));
				totalBytes += Math.min(value.byteLength, remaining);
				if (value.byteLength > remaining) {
					truncated = true;
					await reader.cancel("upstream_error_body_limit");
					break;
				}
			}
		} finally {
			reader.releaseLock();
		}
		const bytes = new Uint8Array(totalBytes);
		let offset = 0;
		for (const chunk of chunks) {
			bytes.set(chunk, offset);
			offset += chunk.byteLength;
		}
		const text = new TextDecoder().decode(bytes);
		if (!text) {
			return { payload: null, payload_preview: null };
		}
		const previewSuffix = truncated ? "...[upstream error body truncated]" : "";
		try {
			const parsed = JSON.parse(text);
			return {
				payload: parsed,
				payload_preview: `${truncateAttemptText(JSON.stringify(parsed)) ?? ""}${previewSuffix}` || null,
			};
		} catch {
			return {
				payload: text,
				payload_preview: `${truncateAttemptText(text) ?? ""}${previewSuffix}` || null,
			};
		}
	} catch {
		return { payload: null, payload_preview: null };
	}
}

function getProviderAttempts(ctx: PipelineContext): ProviderAttemptLog[] {
	return (ctx.providerAttempts ??= []);
}

function recordProviderAttempt(
	ctx: PipelineContext,
	entry: ProviderAttemptLog,
): void {
	getProviderAttempts(ctx).push(entry);
}

/**
 * IR-aware request result
 * Similar to RequestResult but works with IR
 */
export type IRRequestResult = {
	kind: "completed" | "stream";
	ir?:
		| IRChatResponse
		| IREmbeddingsResponse
		| IRModerationsResponse
		| IRRerankResponse
		| IRImageGenerationResponse
		| IRAudioSpeechResponse
		| IRAudioTranscriptionResponse
		| IRAudioTranslationResponse
		| IRVideoGenerationResponse
		| IROcrResponse
		| IRMusicGenerateResponse; // IR response (for completed requests)
	normalized?: GatewayResponsePayload;
	upstream: Response;
	stream?: ReadableStream<Uint8Array> | null;
	usageFinalizer?: (() => Promise<Bill | null>) | null;
	provider: string;
	apiModelId?: string | null;
	pricingKey?: string | null;
	providerModelSlug?: string | null;
	generationTimeMs: number;
	bill: Bill;
	keySource?: "gateway" | "byok";
	byokKeyId?: string | null;
	mappedRequest?: string;
	rawResponse?: any;
};

export type RequestResult = IRRequestResult;

/**
 * Execute request using IR pipeline
 * @param ctx - Pipeline context
 * @param ir - IR chat request
 * @param timing - Timing tracker
 * @returns IR request result or error response
 */
export async function doRequestWithIR(
	ctx: PipelineContext,
	ir:
		| IRChatRequest
		| IREmbeddingsRequest
		| IRModerationsRequest
		| IRRerankRequest
		| IRImageGenerationRequest
		| IRAudioSpeechRequest
		| IRAudioTranscriptionRequest
		| IRAudioTranslationRequest
		| IRVideoGenerationRequest
		| IROcrRequest
		| IRMusicGenerateRequest,
	timing: PipelineTiming,
): Promise<Response | { ok: true; result: IRRequestResult }> {
	const baseModel = getBaseModel(ctx.model);

	// 1) Guard: Check candidates exist
	const candidatesGuard = await timing.timer.span("execute_guard_candidates", () =>
		guardCandidates(ctx, timing),
	);
	if (!candidatesGuard.ok) return (candidatesGuard as { ok: false; response: Response }).response;
	let candidates = candidatesGuard.value;

	// 1.5) Filter providers by requested input/output modalities
	const normalizedCapability = normalizeCapability(ctx.capability);
	if (normalizedCapability === "text.generate") {
		const filtered = await timing.timer.span("execute_filter_modalities", () =>
			filterCandidatesByModalities(candidates, ir as IRChatRequest),
		);
		if (!filtered.length) {
			return err("unsupported_modalities", {
				model: ctx.model,
				endpoint: ctx.endpoint,
				request_id: ctx.requestId,
				reason: "unsupported_modalities",
			});
		}
		candidates = filtered;
	}
	if (normalizedCapability === "embeddings") {
		const filtered = await timing.timer.span("execute_filter_modalities", () =>
			filterEmbeddingCandidatesByModalities(candidates, ir as IREmbeddingsRequest),
		);
		if (!filtered.length) {
			return err("unsupported_modalities", {
				model: ctx.model,
				endpoint: ctx.endpoint,
				request_id: ctx.requestId,
				reason: "unsupported_modalities",
			});
		}
		candidates = filtered;
	}

	// 1.6) Guard: Ensure at least one provider has pricing configured
	const anyPricingAvailable = candidates.some((entry) => Boolean(entry.pricingCard));
	if (!anyPricingAvailable && !ctx.testingMode) {
		const pricingGuard = await timing.timer.span("execute_guard_pricing", () =>
			guardPricingFound(false, ctx, timing),
		);
		if (!pricingGuard.ok) return (pricingGuard as { ok: false; response: Response }).response;
	}

	// 2) Rank providers (health-aware)
	const ranked = await timing.timer.span("execute_rank_providers", () =>
		rankProviders(candidates, ctx),
	);

	// 3) Try providers in order (failover up to 5)
	const allowFallbacks = getEffectiveRoutingHints(ctx.body).allowFallbacks;
	const maxTries = calculateMaxTries(ranked.length, allowFallbacks);
	const rankedProviders = ranked.slice(0, maxTries);
	const credentialPlan = buildCredentialAttemptPlan(rankedProviders, {
		includeFallbackByok: ctx.teamSettings?.byokFallbackEnabled === true,
	});
	ctx.credentialPlan = credentialPlan.map((entry, index) => ({
		attempt_number: index + 1,
		provider: entry.routed.candidate.providerId,
		credential_phase: entry.phase,
		key_source: entry.credential.kind === "byok" ? "byok" : "gateway",
		byok_key_id: entry.credential.kind === "byok" ? entry.credential.key.id : null,
	}));
	let anyPricingFound = anyPricingAvailable;

	for (let attempt = 0; attempt < credentialPlan.length; attempt++) {
		const choice = credentialPlan[attempt];

		// Use IR-aware attempt function
		const result = await attemptProviderWithIR(
			choice.routed,
			ctx,
			ir,
			timing,
			baseModel,
			rankedProviders.length === 1,
			attempt + 1,
			choice.credential,
			choice.phase,
		);

		if (result.ok) {
			return result;
		}

		if ("skip" in result && result.skip === "no_pricing") {
			continue;
		}

		if ("skip" in result && result.skip === "blocked") {
			continue;
		}

		anyPricingFound = true;
	}

	// 4) Guard: Check if any pricing was found
	const pricingGuard = await timing.timer.span("execute_guard_pricing", () =>
		guardPricingFound(anyPricingFound, ctx, timing),
	);
	if (!pricingGuard.ok) return (pricingGuard as { ok: false; response: Response }).response;

	// 5) All providers failed
	const failureGuard = await timing.timer.span("execute_guard_all_failed", () =>
		guardAllFailed(ctx, timing),
	);
	return (failureGuard as { ok: false; response: Response }).response;
}

/**
 * Attempt to execute IR request with a specific provider
 * Execute a single provider attempt for IR requests
 */
async function attemptProviderWithIR(
	routed: any, // RoutedCandidate type
	ctx: PipelineContext,
	ir:
		| IRChatRequest
		| IREmbeddingsRequest
		| IRModerationsRequest
		| IRRerankRequest
		| IRImageGenerationRequest
		| IRAudioSpeechRequest
		| IRAudioTranscriptionRequest
		| IRAudioTranslationRequest
		| IRVideoGenerationRequest
		| IROcrRequest
		| IRMusicGenerateRequest,
	timing: PipelineTiming,
	baseModel: string,
	allowSingleProviderRetry: boolean,
	attemptNumber: number,
	credential: { kind: "gateway" } | { kind: "byok"; key: ByokKeyMeta },
	credentialPhase: CredentialAttemptPhase,
): Promise<{ ok: true; result: IRRequestResult } | { ok: false; skip?: string }> {
	const attemptErrors: Array<Record<string, unknown>> = (ctx.attemptErrors ??= []);
	const attemptPrefix = `attempt_${attemptNumber}`;
	const attemptStartedAt = performance.now();

	// Extract candidate from RoutedCandidate
	const candidate = routed.candidate;
	const credentialLog = {
		credential_phase: credentialPhase,
		key_source: credential.kind === "byok" ? "byok" as const : "gateway" as const,
		byok_key_id: credential.kind === "byok" ? credential.key.id : null,
	};
	const candidateApiModelId =
		typeof candidate.apiModelId === "string" && candidate.apiModelId.trim().length > 0
			? candidate.apiModelId.trim()
			: null;

	const admission = await timing.timer.span(`${attemptPrefix}_breaker`, () =>
		admitThroughBreaker(
			ctx.endpoint,
			candidate.providerId,
			baseModel,
			ctx.workspaceId,
			ctx.requestId,
			routed.health,
		),
	);
	if (admission === "blocked") {
		attemptErrors.push({
			...credentialLog,
			provider: candidate.providerId,
			endpoint: ctx.endpoint,
			attempt_number: attemptNumber,
			type: "blocked",
		});
		recordProviderAttempt(ctx, {
			...credentialLog,
			attempt_number: attemptNumber,
			provider: candidate.providerId,
			endpoint: ctx.endpoint,
			model: baseModel,
			api_model_id: candidateApiModelId,
			provider_model_slug: null,
			outcome: "blocked",
			type: "blocked",
			duration_ms: Math.round(performance.now() - attemptStartedAt),
			was_probe: false,
		});
		return { ok: false, skip: "blocked" };
	}
	const isProbe = admission === "probe";
	const providerModelSlug = typeof candidate.providerModelSlug === "string"
		? candidate.providerModelSlug.trim()
		: candidate.providerModelSlug;

	// Get pricing card (testing mode candidates may not have context-preloaded pricing).
	let pricingCard = candidate.pricingCard ?? null;
	if (!pricingCard) {
		pricingCard = await timing.timer.span(`${attemptPrefix}_load_pricecard`, () =>
			loadPriceCard(
				candidate.providerId,
				candidateApiModelId ?? baseModel,
				ctx.capability,
			),
		);
		if (pricingCard) {
			candidate.pricingCard = pricingCard;
		}
	}
	if (!pricingCard) {
		attemptErrors.push({
			...credentialLog,
			provider: candidate.providerId,
			endpoint: ctx.endpoint,
			attempt_number: attemptNumber,
			type: "no_pricing",
			duration_ms: Math.round(performance.now() - attemptStartedAt),
			was_probe: isProbe,
		});
		recordProviderAttempt(ctx, {
			...credentialLog,
			attempt_number: attemptNumber,
			provider: candidate.providerId,
			endpoint: ctx.endpoint,
			model: baseModel,
			api_model_id: candidateApiModelId,
			provider_model_slug: providerModelSlug ?? null,
			outcome: "no_pricing",
			type: "no_pricing",
			duration_ms: Math.round(performance.now() - attemptStartedAt),
			was_probe: isProbe,
		});
		return { ok: false, skip: "no_pricing" };
	}

	// Execute using provider-capability executor
	let t0 = performance.now();
	try {
		timing.timer.mark("adapter_start");
		if (!timing.internal.adapterMarked) {
			timing.timer.between("internal_latency_ms", "request_start", "adapter_start");
			timing.internal.adapterMarked = true;
		}
		// Health accounting is advisory and must not delay the upstream request.
		dispatchProviderHealthBackground(() =>
			onCallStart(ctx.endpoint, candidate.providerId, baseModel),
		);
		t0 = performance.now();

		delete (ctx.meta as Record<string, unknown>).latency_ms;
		delete (ctx.meta as Record<string, unknown>).generation_ms;
		const executorResolveStart = performance.now();
		const executor = resolveProviderExecutor(candidate.providerId, ctx.capability);
		timing.timer.record(
			`${attemptPrefix}_resolve_executor`,
			performance.now() - executorResolveStart,
		);
		if (!executor) {
			attemptErrors.push({
				...credentialLog,
				provider: candidate.providerId,
				endpoint: ctx.endpoint,
				attempt_number: attemptNumber,
				type: "unsupported_executor",
			});
			recordProviderAttempt(ctx, {
				...credentialLog,
				attempt_number: attemptNumber,
				provider: candidate.providerId,
				endpoint: ctx.endpoint,
				model: baseModel,
				api_model_id: candidateApiModelId,
				provider_model_slug: providerModelSlug ?? null,
				outcome: "unsupported_executor",
				type: "unsupported_executor",
				duration_ms: Math.round(performance.now() - attemptStartedAt),
				was_probe: isProbe,
			});
			return { ok: false, skip: "unsupported_executor" };
		}

		const normalizedCapability = normalizeCapability(ctx.capability);
		const upstreamTracker = createUpstreamTimingTracker();
		const isTextGenerate = normalizedCapability === "text.generate";
		const modelForReasoning = providerModelSlug?.trim() || baseModel;
		const captureProviderPayloads =
			ctx.teamSettings?.ioLoggingEnabled === true &&
			ctx.teamSettings?.ioLoggingIncludeProviderPayloads === true;

		const normalizedIr = await timing.timer.span(`${attemptPrefix}_normalize_ir`, () =>
			isTextGenerate
				? normalizeIRForProvider(
					ir as IRChatRequest,
					candidate.providerId,
					ctx.protocol as any,
					{
						capabilityParams: candidate.capabilityParams,
						providerMaxOutputTokens: candidate.maxOutputTokens,
						modelForReasoning,
					},
				)
				: ir,
		);
		const buildExecutorArgs = () =>
			({
				ir: normalizedIr,
				requestId: ctx.requestId,
				workspaceId: ctx.workspaceId,
				providerId: candidate.providerId,
				endpoint: ctx.endpoint,
				protocol: ctx.protocol as any,
				capability: ctx.capability,
				providerModelSlug,
				capabilityParams: candidate.capabilityParams,
				maxInputTokens: candidate.maxInputTokens,
				maxOutputTokens: candidate.maxOutputTokens,
				byokMeta: credential.kind === "byok" ? [credential.key] : [],
				pricingCard,
				upstreamTiming: upstreamTracker.timing,
				meta: {
					debug: ctx.meta.debug,
					returnMeta: ctx.meta.returnMeta,
					echoUpstreamRequest: Boolean(ctx.meta.debug?.return_upstream_request),
					// Provider payload capture is an explicit workspace opt-in.
					returnUpstreamRequest: captureProviderPayloads,
					returnUpstreamResponse: captureProviderPayloads,
					upstreamStartMs: ctx.meta.upstreamStartMs, // Pass timing to executor
					requestedModel:
						typeof (ctx.rawBody as any)?.model === "string"
							? ((ctx.rawBody as any).model as string)
							: undefined,
					appId: ctx.meta.appId ?? null,
					sessionId: ctx.meta.sessionId ?? null,
					requestUserId: ctx.meta.requestUserId ?? null,
					trace: ctx.meta.trace ?? null,
					testId: ctx.meta.testId ?? null,
					authMethod: ctx.meta.authMethod ?? "api_key",
					oauthClientId: ctx.meta.oauthClientId ?? null,
					oauthUserId: ctx.meta.oauthUserId ?? null,
					forceGatewayKey: credential.kind === "gateway",
				},
			}) as ExecutorExecuteArgs;

		const executeWithRetry = async () => {
			let lastErr: unknown = null;
			const maxRetries = allowSingleProviderRetry
				? SINGLE_PROVIDER_FAILURE_RETRIES
				: MAX_RETRYABLE_EXECUTOR_RETRIES;
			for (let retryAttempt = 0; retryAttempt <= maxRetries; retryAttempt += 1) {
				try {
					const nextResult = await executor(buildExecutorArgs());
					const shouldRetryStatus =
						allowSingleProviderRetry &&
						!nextResult.upstream.ok &&
						shouldRetrySingleProviderStatus(nextResult.upstream.status);
					const hasRetryLeft = retryAttempt < maxRetries;
					if (shouldRetryStatus && hasRetryLeft) {
						await new Promise((resolve) => setTimeout(resolve, 120));
						continue;
					}
					return nextResult;
				} catch (err) {
					lastErr = err;
					const retryable = (err as any)?.retryable === true;
					const hasRetryLeft = retryAttempt < maxRetries;
					if (!retryable || !hasRetryLeft) {
						throw err;
					}
					// Short jitter-free backoff for transient transport faults.
					await new Promise((resolve) => setTimeout(resolve, 120));
				}
			}
			throw (lastErr instanceof Error ? lastErr : new Error("executor_retry_exhausted"));
		};

		const executorResult = await timing.timer.span(`${attemptPrefix}_executor_total`, () =>
			executeWithRetry(),
		);
		const upstreamTiming = upstreamTracker.snapshot();
		const selectedUpstreamTiming = upstreamTracker.timing.timingFor(executorResult.upstream);
		executorResult.timing = {
			...(executorResult.timing ?? {}),
			...(upstreamTiming.requestBuildMs === undefined
				? {}
				: { requestBuildMs: upstreamTiming.requestBuildMs }),
			...(upstreamTiming.upstreamFetchStartMs === undefined
				? {}
				: { upstreamFetchStartMs: upstreamTiming.upstreamFetchStartMs }),
			...(selectedUpstreamTiming?.dispatchAtMs === undefined
				? {}
				: { selectedUpstreamFetchStartMs: selectedUpstreamTiming.dispatchAtMs }),
			...(selectedUpstreamTiming?.headersMs === undefined
				? {}
				: { upstreamHeadersMs: selectedUpstreamTiming.headersMs }),
			upstreamRequestCount: upstreamTiming.upstreamRequestCount,
			upstreamPollCount: upstreamTiming.upstreamPollCount,
			upstreamAuthCount: upstreamTiming.upstreamAuthCount,
			upstreamPreflightCount: upstreamTiming.upstreamPreflightCount,
			upstreamMediaCount: upstreamTiming.upstreamMediaCount,
		};

		if (executorResult.timing) {
			if (typeof executorResult.timing.latencyMs === "number") {
				ctx.meta.latency_ms = executorResult.timing.latencyMs;
			}
			if (typeof executorResult.timing.generationMs === "number") {
				ctx.meta.generation_ms = executorResult.timing.generationMs;
			}
			if (typeof executorResult.timing.requestBuildMs === "number") {
				timing.timer.record(`${attemptPrefix}_request_build`, executorResult.timing.requestBuildMs);
				ctx.meta.adapterRequestBuildMs = executorResult.timing.requestBuildMs;
			}
			if (typeof executorResult.timing.upstreamFetchStartMs === "number") {
				ctx.meta.upstreamFetchStartMs ??= executorResult.timing.upstreamFetchStartMs;
				if (typeof ctx.meta.startedAtMs === "number") {
					const timeToThisUpstreamRequestMs = Math.max(
						0,
						executorResult.timing.upstreamFetchStartMs - ctx.meta.startedAtMs,
					);
					ctx.meta.timeToUpstreamRequestMs ??= timeToThisUpstreamRequestMs;
					ctx.meta.timeToLatestUpstreamRequestMs = timeToThisUpstreamRequestMs;
				}
			}
			if (typeof executorResult.timing.selectedUpstreamFetchStartMs === "number") {
				ctx.meta.selectedUpstreamFetchStartMs =
					executorResult.timing.selectedUpstreamFetchStartMs;
				// Backwards-compatible field: this is now the selected upstream attempt,
				// never gateway receipt or the first failed/fallback attempt.
				ctx.meta.upstreamStartMs = executorResult.timing.selectedUpstreamFetchStartMs;
			}
			if (typeof executorResult.timing.upstreamHeadersMs === "number") {
				timing.timer.record(`${attemptPrefix}_upstream_headers`, executorResult.timing.upstreamHeadersMs);
				ctx.meta.upstreamHeadersMs = executorResult.timing.upstreamHeadersMs;
			}
			ctx.meta.upstreamRequestCount = executorResult.timing.upstreamRequestCount;
			ctx.meta.upstreamPollCount = executorResult.timing.upstreamPollCount;
			ctx.meta.upstreamAuthCount = executorResult.timing.upstreamAuthCount;
			ctx.meta.upstreamPreflightCount = executorResult.timing.upstreamPreflightCount;
			ctx.meta.upstreamMediaCount = executorResult.timing.upstreamMediaCount;
			if (typeof executorResult.timing.transientRetryDelayMs === "number") {
				timing.timer.record(`${attemptPrefix}_retry_delay`, executorResult.timing.transientRetryDelayMs);
			}
		}
		timing.timer.end("adapter_start");
		const generationTimeMs = Math.round(performance.now() - t0);
		const selectedProviderDurationMs = selectedUpstreamTiming
			? Math.max(0, Date.now() - selectedUpstreamTiming.dispatchAtMs)
			: generationTimeMs;
		ctx.meta.provider_duration_ms = selectedProviderDurationMs;
		const attemptDurationMs = Math.round(performance.now() - attemptStartedAt);

		const usageForMetrics = executorResult.kind === "completed"
			? (executorResult.ir as any)?.usage
			: null;
		const tokensIn = usageForMetrics
			? Number(
				usageForMetrics.inputTokens ??
					usageForMetrics.input_tokens ??
					usageForMetrics.promptTokens ??
					usageForMetrics.prompt_tokens ??
					usageForMetrics.embeddingTokens ??
					0
			)
			: 0;
		const tokensOut = usageForMetrics
			? Number(
				usageForMetrics.outputTokens ??
					usageForMetrics.output_tokens ??
					usageForMetrics.completionTokens ??
					usageForMetrics.completion_tokens ??
					0
			)
			: 0;

		if (executorResult.kind === "completed") {
			const recordsSynchronousGeneration =
				normalizedCapability === "image.generate" ||
				normalizedCapability === "audio.speech";
			if (!isTextGenerate) {
				delete (ctx.meta as Record<string, unknown>).latency_ms;
				if (recordsSynchronousGeneration && executorResult.upstream.ok) {
					ctx.meta.generation_ms ??= selectedProviderDurationMs;
				} else {
					delete (ctx.meta as Record<string, unknown>).generation_ms;
				}
			}
			const completedLatencyMs = ctx.meta.latency_ms ?? selectedProviderDurationMs;
			const completedGenerationMs = ctx.meta.generation_ms ?? 0;
			const healthImpact = classifyProviderHealthImpact({
				upstreamStatus: executorResult.upstream.status,
			});
			dispatchProviderHealthBackground(async () => {
				await onCallEnd(ctx.endpoint, {
					provider: candidate.providerId,
					model: baseModel,
					ok: executorResult.upstream.ok,
					healthImpact,
					latency_ms: completedLatencyMs,
					generation_ms: completedGenerationMs,
					tokens_in: tokensIn,
					tokens_out: tokensOut,
				});
				if (isProbe && healthImpact !== "neutral") {
					await reportProbeResult(ctx.endpoint, candidate.providerId, baseModel, executorResult.upstream.ok);
				} else if (healthImpact === "failure") {
					await maybeOpenOnRecentErrors(ctx.endpoint, candidate.providerId, baseModel);
				}
			});
		}
		if (!executorResult.upstream.ok) {
			const upstreamFailure = await readUpstreamFailurePayload(executorResult);
			const upstreamSummary = extractUpstreamErrorSummary(
				upstreamFailure.payload,
				executorResult.upstream.headers,
			);
			const durationMs = Math.round(performance.now() - attemptStartedAt);
			attemptErrors.push({
				...credentialLog,
				provider: candidate.providerId,
				endpoint: ctx.endpoint,
				model: baseModel,
				provider_model_slug: providerModelSlug ?? null,
				attempt_number: attemptNumber,
				type: "upstream_non_2xx",
				status: executorResult.upstream.status,
				status_text: executorResult.upstream.statusText || null,
				upstream_url: sanitizeUrlForLogging(executorResult.upstream.url || null),
				key_source: executorResult.keySource ?? credentialLog.key_source,
				byok_key_id: executorResult.byokKeyId ?? credentialLog.byok_key_id,
				upstream_payload_preview: upstreamFailure.payload_preview,
				...upstreamSummary,
			});
			recordProviderAttempt(ctx, {
				...credentialLog,
				attempt_number: attemptNumber,
				provider: candidate.providerId,
				endpoint: ctx.endpoint,
				model: baseModel,
				api_model_id: candidateApiModelId,
				provider_model_slug: providerModelSlug ?? null,
				outcome: "upstream_non_2xx",
				type: "upstream_non_2xx",
				duration_ms: durationMs,
				status: executorResult.upstream.status,
				status_text: executorResult.upstream.statusText || null,
				key_source: executorResult.keySource ?? credentialLog.key_source,
				byok_key_id: executorResult.byokKeyId ?? credentialLog.byok_key_id,
				upstream_url: sanitizeUrlForLogging(executorResult.upstream.url || null),
				upstream_error_code: upstreamSummary.upstream_error_code,
				upstream_error_type: upstreamSummary.upstream_error_type,
				upstream_error_message: upstreamSummary.upstream_error_message,
				upstream_error_description: upstreamSummary.upstream_error_description,
				upstream_error_param: upstreamSummary.upstream_error_param,
				upstream_payload_preview: upstreamFailure.payload_preview,
				response_kind: executorResult.kind,
				was_probe: isProbe,
				fallback_attempted: (executorResult as any).fallbackAttempted === true,
				request_build_ms: executorResult.timing?.requestBuildMs ?? null,
				upstream_headers_ms: executorResult.timing?.upstreamHeadersMs ?? null,
				time_to_upstream_request_ms:
					typeof executorResult.timing?.upstreamFetchStartMs === "number" && typeof ctx.meta.startedAtMs === "number"
						? Math.max(0, executorResult.timing.upstreamFetchStartMs - ctx.meta.startedAtMs)
						: null,
				upstream_request_count: executorResult.timing?.upstreamRequestCount ?? null,
				upstream_poll_count: executorResult.timing?.upstreamPollCount ?? null,
				upstream_auth_count: executorResult.timing?.upstreamAuthCount ?? null,
				upstream_preflight_count: executorResult.timing?.upstreamPreflightCount ?? null,
				upstream_media_count: executorResult.timing?.upstreamMediaCount ?? null,
				retry_delay_ms: executorResult.timing?.transientRetryDelayMs ?? null,
			});
			return { ok: false };
		}

		// Build result
		const result: IRRequestResult = {
			kind: executorResult.kind,
			ir: executorResult.kind === "completed" ? executorResult.ir : undefined,
			upstream: executorResult.upstream,
			stream: executorResult.kind === "stream" ? executorResult.stream : undefined,
			usageFinalizer: executorResult.kind === "stream" ? executorResult.usageFinalizer : undefined,
			provider: candidate.providerId,
			apiModelId: candidateApiModelId,
			pricingKey:
				candidate.pricingKey ??
				(candidateApiModelId
					? `${candidate.providerId}:${candidateApiModelId}`
					: candidate.providerId),
			providerModelSlug: providerModelSlug ?? null,
			generationTimeMs,
			bill: {
				...executorResult.bill,
				usage: stripUsagePricing(executorResult.bill?.usage),
			},
			keySource: executorResult.keySource ?? credentialLog.key_source,
			byokKeyId: executorResult.byokKeyId ?? credentialLog.byok_key_id,
			mappedRequest: executorResult.mappedRequest,
			rawResponse: executorResult.rawResponse,
		};
		(result as any).healthContext = {
			provider: candidate.providerId,
			model: baseModel,
			isProbe,
		};

		if (ctx.meta.debug?.enabled) {
			const mappedRequestValue = parseJsonLoose(executorResult.mappedRequest);
			void logDebugEvent("executor.result", {
				requestId: ctx.requestId,
				endpoint: ctx.endpoint,
				provider: candidate.providerId,
				upstreamStatus: executorResult.upstream.status,
				upstreamUrl: sanitizeUrlForLogging(executorResult.upstream.url),
				mappedRequest: typeof mappedRequestValue === "string"
					? previewValue(mappedRequestValue)
					: mappedRequestValue,
				rawResponse: previewValue(executorResult.rawResponse),
				ir: previewValue(executorResult.kind === "completed" ? executorResult.ir : null),
			});
		}

		recordProviderAttempt(ctx, {
			...credentialLog,
			attempt_number: attemptNumber,
			provider: candidate.providerId,
			endpoint: ctx.endpoint,
			model: baseModel,
			api_model_id: candidateApiModelId,
			provider_model_slug: providerModelSlug ?? null,
			outcome: "success",
			type: "success",
			duration_ms: attemptDurationMs,
			status: executorResult.upstream.status,
			status_text: executorResult.upstream.statusText || null,
			key_source: executorResult.keySource ?? credentialLog.key_source,
			byok_key_id: executorResult.byokKeyId ?? credentialLog.byok_key_id,
			upstream_url: sanitizeUrlForLogging(executorResult.upstream.url || null),
			response_kind: executorResult.kind,
			was_probe: isProbe,
			fallback_attempted: (executorResult as any).fallbackAttempted === true,
			request_build_ms: executorResult.timing?.requestBuildMs ?? null,
			upstream_headers_ms: executorResult.timing?.upstreamHeadersMs ?? null,
			time_to_upstream_request_ms:
				typeof executorResult.timing?.upstreamFetchStartMs === "number" && typeof ctx.meta.startedAtMs === "number"
					? Math.max(0, executorResult.timing.upstreamFetchStartMs - ctx.meta.startedAtMs)
					: null,
			upstream_request_count: executorResult.timing?.upstreamRequestCount ?? null,
			upstream_poll_count: executorResult.timing?.upstreamPollCount ?? null,
			upstream_auth_count: executorResult.timing?.upstreamAuthCount ?? null,
			upstream_preflight_count: executorResult.timing?.upstreamPreflightCount ?? null,
			upstream_media_count: executorResult.timing?.upstreamMediaCount ?? null,
			retry_delay_ms: executorResult.timing?.transientRetryDelayMs ?? null,
		});

		return { ok: true, result };
	} catch (err) {
		console.error(`Executor execution failed for ${candidate.providerId}:`, err);
		const message = err instanceof Error ? err.message : String(err);
		const stackPreview = truncateAttemptText(
			err instanceof Error ? err.stack : null,
			ATTEMPT_PREVIEW_LIMIT * 3,
		);
		attemptErrors.push({
			...credentialLog,
			provider: candidate.providerId,
			endpoint: ctx.endpoint,
			model: baseModel,
			provider_model_slug: providerModelSlug ?? null,
			attempt_number: attemptNumber,
			type: (err as any)?.retryable === true ? "retryable_error" : "error",
			retryable: (err as any)?.retryable === true,
			upstream_error_code: typeof (err as any)?.code === "string" ? (err as any).code : null,
			upstream_error_message: message,
			upstream_error_description: stackPreview,
			message,
		});
		recordProviderAttempt(ctx, {
			...credentialLog,
			attempt_number: attemptNumber,
			provider: candidate.providerId,
			endpoint: ctx.endpoint,
			model: baseModel,
			api_model_id: candidateApiModelId,
			provider_model_slug: providerModelSlug ?? null,
			outcome: (err as any)?.retryable === true ? "retryable_error" : "error",
			type: (err as any)?.retryable === true ? "retryable_error" : "error",
			duration_ms: Math.round(performance.now() - attemptStartedAt),
			retryable: (err as any)?.retryable === true,
			upstream_error_code: typeof (err as any)?.code === "string" ? (err as any).code : null,
			upstream_error_message: message,
			upstream_error_description: stackPreview,
			was_probe: isProbe,
		});
		const errorHealthImpact = classifyProviderHealthImpact({
			errorCode: typeof (err as any)?.code === "string" ? (err as any).code : null,
			errorMessage: message,
		});
		dispatchProviderHealthBackground(async () => {
			await onCallEnd(ctx.endpoint, {
				provider: candidate.providerId,
				model: baseModel,
				ok: false,
				healthImpact: errorHealthImpact,
				latency_ms: Math.round(performance.now() - attemptStartedAt),
				generation_ms: ctx.meta.generation_ms ?? Math.round(performance.now() - t0),
			});
			if (isProbe && errorHealthImpact !== "neutral") {
				await reportProbeResult(ctx.endpoint, candidate.providerId, baseModel, false);
			} else if (errorHealthImpact === "failure") {
				await maybeOpenOnRecentErrors(ctx.endpoint, candidate.providerId, baseModel);
			}
		});
		return { ok: false };
	}
}




