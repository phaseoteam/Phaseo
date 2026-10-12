// Purpose: Response cache lookup shared by the cacheable surfaces.
// Why: Text generation and embeddings resolve the cache policy, look up the
//      entry and serve hits the same way.
// How: Sets `ctx.responseCache` for every request (bypass, miss or hit) and
//      returns the replayed response on a hit. Misses are stored after the
//      response is produced (see after/index.ts and after/response-cache-stream.ts).
import {
	applyResponseCacheHeaders,
	buildCachedResponseBody,
	buildCachedSseBody,
	buildResponseCacheFingerprint,
	buildResponseCacheKey,
	parseResponseCacheFlag,
	parseResponseCacheTtl,
	resolveResponseCachePolicy,
	RESPONSE_CACHE_REQUEST_HEADERS,
	type CachedResponseRecord,
} from "@/core/response-cache";
import { releaseCustomerRequest } from "@/routes/v1/data/customer-quota";
import {
	dispatchBackground,
	ensureRuntimeForBackground,
	getResponseCache,
} from "@/runtime/env";
import { handleSuccessAudit } from "../after/audit";
import { makeHeaders, createResponse } from "../after/http";
import type { PipelineRunnerArgs } from "./types";

/**
 * Serves a cache hit. Hits are free: the request is logged with zero usage and
 * zero cost (the original usage is kept in the cache diagnostics as
 * `savedUsage`), and it gives back its slot in the customer's per-minute limit.
 */
async function serveCachedResponse(args: {
	pre: PipelineRunnerArgs["pre"];
	req: Request;
	endpoint: PipelineRunnerArgs["endpoint"];
	timingHeader?: string;
	record: CachedResponseRecord;
	stream: boolean;
}): Promise<Response> {
	const { pre, req, endpoint, timingHeader, record, stream } = args;
	const ctx = pre.ctx;
	ctx.meta.generation_ms = 0;
	ctx.meta.latency_ms = ctx.meta.before_ms ?? 0;
	releaseCustomerRequest(req);

	const responseBody = stream
		? null
		: buildCachedResponseBody({
			responseBody: record.responseBody,
			sourceRequestId: record.sourceRequestId,
			requestId: ctx.requestId,
		});
	const sseBody = stream
		? buildCachedSseBody({
			frames: record.streamFrames ?? [],
			sourceRequestId: record.sourceRequestId,
			requestId: ctx.requestId,
		})
		: null;

	const result = {
		kind: "completed" as const,
		upstream: new Response(null, {
			status: record.statusCode,
			headers: { "Content-Type": "application/json" },
		}),
		provider: record.providerId ?? "response-cache",
		generationTimeMs: 0,
		bill: {
			cost_cents: 0,
			currency: record.currency ?? "USD",
			usage: undefined,
			upstream_id: record.nativeResponseId ?? null,
			finish_reason: record.finishReason ?? null,
		},
		mappedRequest: null,
		rawResponse: null,
	} as const;

	let releaseRuntime: () => void = () => {};
	try {
		releaseRuntime = ensureRuntimeForBackground();
	} catch (error) {
		console.error("[gateway] failed to initialize runtime for cached response audit", {
			requestId: ctx.requestId,
			endpoint,
			error: error instanceof Error ? error.message : String(error),
		});
	}

	dispatchBackground(
		(async () => {
			try {
				await handleSuccessAudit(
					ctx,
					result as any,
					stream,
					{},
					0,
					0,
					record.currency ?? "USD",
					record.finishReason ?? null,
					record.statusCode,
					record.nativeResponseId ?? null,
					responseBody,
				);
			} finally {
				releaseRuntime();
			}
		})(),
	);

	if (
		(ctx.meta?.debug?.enabled || ctx.meta.returnMeta) &&
		responseBody &&
		typeof responseBody === "object"
	) {
		const responseBodyRecord = responseBody as Record<string, any>;
		const existingMeta =
			responseBodyRecord.meta && typeof responseBodyRecord.meta === "object"
				? responseBodyRecord.meta
				: {};
		responseBodyRecord.meta = {
			...existingMeta,
			...(ctx.responseCache ? { response_cache: ctx.responseCache } : {}),
			...(ctx.guardrailEnforcement
				? { guardrail_enforcement: ctx.guardrailEnforcement }
				: {}),
		};
	}

	const headers = makeHeaders(timingHeader);
	applyResponseCacheHeaders(headers, {
		status: "hit",
		ttlSeconds: record.ttlSeconds,
		ageMs: ctx.responseCache?.ageMs ?? null,
		sourceRequestId: record.sourceRequestId,
	});
	if (sseBody !== null) {
		headers.set("Content-Type", "text/event-stream");
		return new Response(sseBody, { status: record.statusCode, headers });
	}
	return createResponse(responseBody, record.statusCode, headers);
}

/**
 * Resolves the cache policy for an eligible request and serves a hit.
 * Returns null when the request should run: bypassed, missed, or cleared.
 */
export async function tryServeFromResponseCache(args: {
	pre: PipelineRunnerArgs["pre"];
	req: Request;
	endpoint: PipelineRunnerArgs["endpoint"];
	timing: PipelineRunnerArgs["timing"];
	protocol: string | null;
	stream: boolean;
	eligibility: { eligible: boolean; reason: string };
}): Promise<Response | null> {
	const { pre, req, endpoint, timing, protocol, stream, eligibility } = args;
	pre.ctx.responseCache = {
		enabled: false,
		status: "bypass",
		reason: eligibility.reason,
		key: null,
		fingerprint: null,
		ttlSeconds: null,
		ttlSource: null,
	};

	const responseCacheStore = getResponseCache();
	if (eligibility.eligible && responseCacheStore && pre.ctx.keyId) {
		const presetResponseCaching = pre.ctx.preset?.config?.responseCaching ?? null;
		const responseCachePolicy = resolveResponseCachePolicy({
			requestEnabled: parseResponseCacheFlag(req.headers.get(RESPONSE_CACHE_REQUEST_HEADERS.enabled)),
			requestTtlSeconds: parseResponseCacheTtl(req.headers.get(RESPONSE_CACHE_REQUEST_HEADERS.ttl)),
			presetEnabled: presetResponseCaching?.enabled ?? null,
			presetTtlSeconds: presetResponseCaching?.ttlSeconds ?? null,
		});
		if (responseCachePolicy.enabled === false) {
			pre.ctx.responseCache = {
				enabled: false,
				status: "bypass",
				reason: responseCachePolicy.reason,
				key: null,
				fingerprint: null,
				ttlSeconds: null,
				ttlSource: responseCachePolicy.source,
			};
		} else {
			const fingerprint = await buildResponseCacheFingerprint({
				workspaceId: pre.ctx.workspaceId,
				apiKeyId: pre.ctx.keyId,
				endpoint,
				model: pre.ctx.model,
				stream,
				body: pre.ctx.body,
				protocol,
				presetId: pre.ctx.preset?.id ?? null,
				presetSlug: pre.ctx.preset?.slug ?? null,
				routingMode: pre.ctx.routingMode ?? null,
			});
			const cacheKey = buildResponseCacheKey(
				pre.ctx.keyId,
				fingerprint.digest,
			);
			const clearRequested = parseResponseCacheFlag(
				req.headers.get(RESPONSE_CACHE_REQUEST_HEADERS.clear),
			) === true;
			pre.ctx.responseCache = {
				enabled: true,
				status: "miss",
				reason: null,
				key: cacheKey,
				fingerprint: fingerprint.digest,
				ttlSeconds: responseCachePolicy.ttlSeconds,
				ttlSource: responseCachePolicy.source,
				...(clearRequested ? { cleared: true } : {}),
			};
			const cacheLookupStartedAt = performance.now();
			let cachedRecord: CachedResponseRecord | null = null;
			try {
				if (clearRequested) {
					// Drop the entry and fall through: this request refetches and re-stores it.
					await responseCacheStore.delete(cacheKey);
				} else {
					cachedRecord = await responseCacheStore.get<CachedResponseRecord>(cacheKey);
				}
			} catch (error) {
				// The cache is best-effort: an unavailable store is treated as a miss.
				console.warn("[gateway] response cache lookup failed", {
					requestId: pre.ctx.requestId,
					error: error instanceof Error ? error.message : String(error),
				});
			}
			timing.timer.record(
				"response_cache_lookup",
				performance.now() - cacheLookupStartedAt,
			);
			const replayable = stream
				? Array.isArray(cachedRecord?.streamFrames) && cachedRecord.streamFrames.length > 0
				: Boolean(cachedRecord?.responseBody);
			if (cachedRecord && replayable && cachedRecord.statusCode === 200) {
				const ageMs = Math.max(
					0,
					Date.now() - new Date(cachedRecord.createdAt).getTime(),
				);
				pre.ctx.responseCache = {
					enabled: true,
					status: "hit",
					reason: null,
					key: cacheKey,
					fingerprint: fingerprint.digest,
					ttlSeconds: cachedRecord.ttlSeconds,
					ttlSource: responseCachePolicy.source,
					createdAt: cachedRecord.createdAt,
					ageMs,
					providerId: cachedRecord.providerId ?? null,
					sourceRequestId: cachedRecord.sourceRequestId ?? null,
					savedUsage: cachedRecord.usage ?? null,
				};
				timing.timer.record("execute_total", 0);
				const header = timing.timer.header();
				pre.ctx.timing = timing.timer.snapshot();
				pre.ctx.timer = timing.timer;
				return await serveCachedResponse({
					pre,
					req,
					endpoint,
					timingHeader: header || undefined,
					record: cachedRecord,
					stream,
				});
			}
		}
	} else if (eligibility.eligible && !responseCacheStore) {
		pre.ctx.responseCache = {
			enabled: false,
			status: "bypass",
			reason: "store_not_configured",
			key: null,
			fingerprint: null,
			ttlSeconds: null,
			ttlSource: null,
		};
	}
	return null;
}
