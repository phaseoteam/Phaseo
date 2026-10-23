// src/lib/gateway/route-factory.ts
// Purpose: Pipeline entrypoint that wires before/execute/after stages.
// Why: Provides a single request lifecycle orchestrator.
// How: Orchestrates before -> execute -> after with timing hooks.

import { beforeRequest, type BeforeRequestObservabilitySnapshot, type UnservedModelFallback } from "./before";
import { modelSubstitutionHeader, noteModelSubstitutionServed, type ModelSubstitution } from "./before/modelSuccessor";
import { DROPPED_PARAMS_HEADER, droppedParamsForClient, droppedParamsHeader } from "./execute/unsupportedParams";
import type { Endpoint } from "@core/types";
import { handleError } from "@core/error-handler";
import { errorCodeOf, withErrorObject, withErrorObjectResponse } from "@core/error-object";
import { auditFailure } from "./audit";
import { Timer } from "./telemetry/timer";
import { gatewayTraceFor } from "./telemetry/gateway-trace";
import type { PipelineTiming } from "./execute";
import { resolvePipeline } from "./registry";
import { DecisionsSchema, ResponsesSchema } from "@core/schemas";
import { MAX_REQUEST_MODEL_FALLBACKS } from "./before/requestModelFallbacks";
import { everyAttemptRejectedRequest } from "./execute/attempt-outcomes";
import { runAutoRouterClassifierGatewayRequest } from "./auto-router-classifier-gateway";
import { attachRequestClassifierCall } from "./classification/request-classifiers";
import {
	buildPipelineExecutionErrorResponse,
	logPipelineExecutionError,
} from "./error-response";
import { rejectedByRateLimitPolicy, withRateLimitPolicyHeaders } from "@core/rate-limit-policies";
import {
	createConcurrencyLeases, releaseConcurrencyAfter, releaseConcurrencyLeases, type ConcurrencyLeases,
} from "@core/customer-rate-limits";

const EARLY_OBSERVABILITY_BODY_LIMIT_BYTES = 256 * 1024;
const MODEL_FALLBACK_STATUSES = new Set([429, 500, 502, 503, 504]);
// Dynamic routes store at most eight fallbacks; the auto-router is capped to match.
const CONFIGURED_MODEL_FALLBACK_LIMIT = 8;
let autoRouterClassifierHandler: ReturnType<typeof makeEndpointHandler> | null = null;

let decisionsClassifierHandler: ReturnType<typeof makeEndpointHandler> | null = null;

function getAutoRouterClassifierHandler() {
	autoRouterClassifierHandler ??= makeEndpointHandler({ endpoint: "responses", schema: ResponsesSchema });
	return autoRouterClassifierHandler;
}

/** Request classifiers call Responses, or Decisions for decision models. */
function getRequestClassifierHandler(path: "responses" | "decisions") {
	if (path === "responses") return getAutoRouterClassifierHandler();
	decisionsClassifierHandler ??= makeEndpointHandler({ endpoint: "decisions", schema: DecisionsSchema });
	return decisionsClassifierHandler;
}

type ModelFallbackSource = "dynamic_route" | "request" | "auto_router";
type ModelFallbackAttempt = { model: string; status: number | null; stage: "before" | "execute" | "skipped" };

function cleanFallbackModels(values: unknown, primaryModel: string | null, limit: number): string[] {
	if (!Array.isArray(values)) return [];
	return [...new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0))]
		.filter((value) => value !== primaryModel)
		.slice(0, limit);
}

// Workspace dynamic-route fallbacks are operator policy and take precedence
// over the request `models` list; phaseo/auto cannot be combined with `models`.
function configuredModelFallbacks(ctx: { model: string; routingDiagnostics?: Record<string, any> | null }): {
	source: ModelFallbackSource;
	models: string[];
} | null {
	const candidates: Array<[ModelFallbackSource, unknown]> = [
		["dynamic_route", ctx.routingDiagnostics?.dynamicRoute?.action?.modelFallbacks],
		["request", ctx.routingDiagnostics?.requestModelFallbacks?.models],
		["auto_router", ctx.routingDiagnostics?.autoRouter?.fallbackModels],
	];
	for (const [source, values] of candidates) {
		// Request entries were already deduped against the requested model; a
		// provider-qualified or preset entry may resolve to the same model ID
		// with different routing, so it is not dropped here.
		const models = source === "request"
			? cleanFallbackModels(values, null, MAX_REQUEST_MODEL_FALLBACKS)
			: cleanFallbackModels(values, ctx.model, CONFIGURED_MODEL_FALLBACK_LIMIT);
		if (models.length) return { source, models };
	}
	return null;
}

// An attempt is identified by its resolved model, eligible providers and
// preset, so a provider-pinned fallback for the same model is still tried, and
// so is a preset that may change the prompt, parameters or routing.
function modelFallbackAttemptKey(ctx: {
	model: string;
	providers?: Array<{ providerId: string }> | null;
	preset?: { id: string } | null;
}): string {
	const providers = (ctx.providers ?? []).map((provider) => provider.providerId).sort().join(",");
	return `${ctx.model}|${providers}|${ctx.preset?.id ?? ""}`;
}

// A provider rejection of the request itself (400, 413, 422) reaches the client
// as a 502 upstream_error, but it is the request's fault: another model would
// be called, and billed, with the same bad request.
function shouldTryModelFallback(
	response: Response,
	ctx: { attemptErrors?: Array<Record<string, unknown>> | null },
): boolean {
	if (!MODEL_FALLBACK_STATUSES.has(response.status)) return false;
	return !(response.status === 502 && everyAttemptRejectedRequest(ctx.attemptErrors));
}

function discardResponseBody(response: Response) {
	response.body?.cancel().catch(() => undefined);
}

/**
 * A 429 upstream_error says every provider called was rate limited. Across model fallbacks
 * that holds only if every model that ran also ended in 429; otherwise (for example the
 * primary's provider failed with 503) the request failed for mixed reasons and is a 502.
 */
export async function settleMixedRateLimitAcrossModels(response: Response, attempts: readonly ModelFallbackAttempt[]): Promise<Response> {
	if (response.status !== 429) return response;
	const executed = attempts.filter((attempt) => attempt.stage === "execute");
	if (executed.every((attempt) => attempt.status === 429)) return response;
	const body = await response.clone().json().catch(() => null) as Record<string, unknown> | null;
	if (!body || errorCodeOf(body) !== "upstream_error") return response;
	discardResponseBody(response);
	return new Response(JSON.stringify(withErrorObject({ ...body, status_code: 502 }, 502)), { status: 502, headers: response.headers });
}

function hasBlobValue(value: unknown): boolean {
	if (value instanceof Blob) return true;
	return Array.isArray(value) && value.some((item) => item instanceof Blob);
}

function appendFallbackFormValue(form: FormData, key: string, value: unknown) {
	if (value === undefined || value === null) return;
	if (value instanceof Blob) {
		form.append(key, value, value instanceof File ? value.name : "blob");
		return;
	}
	form.append(key, typeof value === "object" ? JSON.stringify(value) : String(value));
}

function formDataForModelFallback(rawBody: Record<string, unknown>): FormData {
	const form = new FormData();
	for (const [key, value] of Object.entries(rawBody)) {
		if (Array.isArray(value)) {
			// Empty arrays only come from JSON-encoded form fields; keep them present.
			if (value.length === 0) form.append(key, "[]");
			for (const item of value) appendFallbackFormValue(form, `${key}[]`, item);
			continue;
		}
		appendFallbackFormValue(form, key, value);
	}
	return form;
}

function requestForModelFallback(req: Request, rawBody: unknown): Request {
	const headers = new Headers(req.headers);
	headers.delete("content-length");
	const contentType = (req.headers.get("content-type") ?? "").toLowerCase();
	const isFormBody = contentType.includes("multipart/form-data") ||
		contentType.includes("application/x-www-form-urlencoded");
	if (
		isFormBody &&
		rawBody &&
		typeof rawBody === "object" &&
		!Array.isArray(rawBody)
	) {
		const record = rawBody as Record<string, unknown>;
		if (contentType.includes("multipart/form-data") || Object.values(record).some(hasBlobValue)) {
			// FormData supplies a fresh multipart boundary.
			headers.delete("content-type");
			return new Request(req.url, {
				method: req.method,
				headers,
				body: formDataForModelFallback(record),
			});
		}
	}
	headers.set("content-type", "application/json");
	return new Request(req.url, {
		method: req.method,
		headers,
		body: JSON.stringify(rawBody),
	});
}

function fallbackBeforeOptions(
	source: ModelFallbackSource,
	model: string,
	ctx: { routingDiagnostics?: Record<string, any> | null },
	isLast: boolean,
) {
	// An approved successor only stands in for the last model in a list.
	if (source === "request") return { requestModelOverride: model, allowModelSuccessor: isLast };
	return {
		allowModelSuccessor: isLast,
		dynamicRouteModelOverride: model,
		autoRouterModelOverride: model,
		autoRouterClassificationOverride: ctx.routingDiagnostics?.autoRouter?.classification ?? null,
	};
}

/**
 * Tells the client which model it asked for when an approved successor served
 * the request, and queues the workspace's one-off notice the first time one does.
 */
function withModelSubstitutionHeaders(
	response: Response,
	ctx: { routingDiagnostics?: Record<string, any> | null; workspaceId?: string | null; testingMode?: boolean; stream?: boolean },
): Response {
	const substitution = ctx.routingDiagnostics?.modelSubstitution as ModelSubstitution | undefined;
	if (!substitution) return response;
	// A stream can still fail after its headers; the stream finalizer notes it on success.
	if (response.ok && !ctx.stream) noteModelSubstitutionServed(ctx);
	const headers = new Headers(response.headers);
	headers.set("X-Phaseo-Requested-Model", substitution.from);
	headers.set("X-Phaseo-Model-Substitution", modelSubstitutionHeader(substitution));
	return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

/**
 * Tells the client which of its parameters the serving provider does not
 * support and the gateway removed (`X-Phaseo-Dropped-Params: top_k, min_p`).
 */
function withDroppedParamsHeader(
	response: Response,
	ctx: { routingDiagnostics?: Record<string, any> | null },
): Response {
	if (!response.ok) return response;
	const dropped = droppedParamsForClient(ctx);
	if (dropped.length === 0) return response;
	const headers = new Headers(response.headers);
	headers.set(DROPPED_PARAMS_HEADER, droppedParamsHeader(dropped));
	return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function cloneRequestForEarlyObservability(req: Request): Request | undefined {
    const contentType = (req.headers.get("content-type") ?? "").toLowerCase();
    const capturesTextBody =
        contentType.includes("application/json") ||
        contentType.includes("application/x-www-form-urlencoded");
    if (!capturesTextBody) return undefined;

    const contentLengthHeader = req.headers.get("content-length");
    if (contentLengthHeader) {
        const contentLength = Number(contentLengthHeader);
        if (Number.isFinite(contentLength) && contentLength > EARLY_OBSERVABILITY_BODY_LIMIT_BYTES) {
            return undefined;
        }
    }

    return req.clone() as unknown as Request;
}

export function makeEndpointHandler(opts: { endpoint: Endpoint; schema: any; }) {
    const { endpoint, schema } = opts;

    return async function handler(req: Request) {
        // Concurrency slots taken by rate limit policies are held until the response has been delivered.
        const concurrency = createConcurrencyLeases();
        try {
            return releaseConcurrencyAfter(await handleRequest(req, concurrency), concurrency);
        } catch (error) {
            releaseConcurrencyLeases(concurrency);
            throw error;
        }
    };

    async function handleRequest(req: Request, concurrency: ConcurrencyLeases): Promise<Response> {
        const timer = new Timer();
        const gatewayTrace = gatewayTraceFor(req);
        gatewayTrace?.mark("pipeline_entry");
        const timing: PipelineTiming = {
            timer,
            internal: { adapterMarked: false },
        };
        timing.timer.mark("preflight_start");

        const observabilityReq = cloneRequestForEarlyObservability(req);
        let earlyRequestObservability: BeforeRequestObservabilitySnapshot | undefined;

        timing.timer.mark("before_start");
        const pre = await beforeRequest(req, endpoint, timing.timer, schema, {
			classifyAutoRouterRequest: ({ endpoint: sourceEndpoint, body }) =>
				runAutoRouterClassifierGatewayRequest({
					sourceRequest: req,
					endpoint: sourceEndpoint,
					body,
					handler: getAutoRouterClassifierHandler(),
				}),
            onObservabilitySnapshot: (snapshot) => {
                earlyRequestObservability = snapshot;
            },
        });
        const beforeMsRaw = timing.timer.end("before_start");
        const beforeMs = typeof beforeMsRaw === "number"
            ? Math.round(beforeMsRaw * 1000) / 1000
            : null;

        const runner = resolvePipeline(endpoint);
        // Surfaces that build their own error bodies get the same `error` object.
        const runWithHeaders = async (attempt: Parameters<typeof runner>[0]) => {
            attachRequestClassifierCall(attempt.pre.ctx, req, getRequestClassifierHandler);
            return withDroppedParamsHeader(withModelSubstitutionHeaders(await withErrorObjectResponse(await runner(attempt)), attempt.pre.ctx), attempt.pre.ctx);
        };

        // Tries the configured fallback models in order after the first model
        // failed. Returns the first response that should not fall back further,
        // or the original failure when every fallback is rejected or fails.
        const tryModelFallbacks = async (
            fallbackPlan: { source: ModelFallbackSource; models: string[] },
            primary: {
                model: string;
                requestId: string;
                retryRawBody: unknown;
                routingDiagnostics?: Record<string, any> | null;
                attemptKey: string;
                // Absent when the primary failed before it was admitted.
                rateLimitAdmissionId?: string;
                stage: "before" | "execute";
            },
            initialResponse: Response,
        ): Promise<Response> => {
            let response = initialResponse;
			const attempts: ModelFallbackAttempt[] = [{ model: primary.model, status: response.status, stage: primary.stage }];
			const attemptedModels = new Set([primary.attemptKey]);
			let rateLimitAdmissionId = primary.rateLimitAdmissionId;
			for (const [fallbackIndex, fallbackModel] of fallbackPlan.models.entries()) {
				const fallbackReq = requestForModelFallback(req, primary.retryRawBody) as unknown as typeof req;
				const fallbackObservabilityReq = cloneRequestForEarlyObservability(fallbackReq);
				let fallbackRequestObservability: BeforeRequestObservabilitySnapshot | undefined;
				const fallbackTimer = new Timer();
				const fallbackTiming: PipelineTiming = {
					timer: fallbackTimer,
					internal: { adapterMarked: false },
				};
				fallbackTiming.timer.mark("preflight_start");
				fallbackTiming.timer.mark("before_start");
				const fallbackPre = await beforeRequest(
					fallbackReq,
					endpoint,
					fallbackTiming.timer,
					schema,
					{
						...fallbackBeforeOptions(
							fallbackPlan.source,
							fallbackModel,
							primary,
							fallbackIndex === fallbackPlan.models.length - 1,
						),
						onObservabilitySnapshot: (snapshot) => {
							fallbackRequestObservability = snapshot;
						},
					},
				);
				const fallbackBeforeMsRaw = fallbackTiming.timer.end("before_start");
				if (!fallbackPre.ok) {
					// A fallback that cannot serve this request (unsupported endpoint,
					// parameter, policy) is recorded and skipped; it never replaces the
					// failure the client would otherwise receive.
					const rejected = await handleError({
						stage: "before",
						res: (fallbackPre as { ok: false; response: Response }).response,
						endpoint,
						timingHeader: fallbackTiming.timer.serverTiming(),
						auditFailure,
						req: fallbackReq,
						requestBodyReq: fallbackObservabilityReq,
						requestObservability: fallbackRequestObservability,
					});
					attempts.push({ model: fallbackModel, status: rejected.status, stage: "before" });
					discardResponseBody(rejected);
					continue;
				}
				if (attemptedModels.has(modelFallbackAttemptKey(fallbackPre.ctx))) {
					attempts.push({ model: fallbackPre.ctx.model, status: null, stage: "skipped" });
					continue;
				}
				attemptedModels.add(modelFallbackAttemptKey(fallbackPre.ctx));
				if (typeof fallbackBeforeMsRaw === "number") {
					fallbackPre.ctx.meta.before_ms = Math.round(fallbackBeforeMsRaw * 1000) / 1000;
				}
				// One HTTP request is one admission against rate limit policies.
				rateLimitAdmissionId ??= fallbackPre.ctx.billingRequestId;
				fallbackPre.ctx.rateLimitAdmissionId = rateLimitAdmissionId;
				fallbackPre.ctx.rateLimitConcurrency = concurrency;
				fallbackPre.ctx.routingDiagnostics = {
					...(fallbackPre.ctx.routingDiagnostics ?? {}),
					modelFallback: {
						source: fallbackPlan.source,
						primaryModel: primary.model,
						primaryRequestId: primary.requestId,
						models: fallbackPlan.models,
						attempt: fallbackIndex + 1,
						previousAttempts: attempts.map((attempt) => ({ ...attempt })),
					},
				};
				discardResponseBody(response);
				try {
					response = await runWithHeaders({ pre: fallbackPre, req: fallbackReq, endpoint, timing: fallbackTiming });
				} catch (error) {
					logPipelineExecutionError("model_fallback", error);
					fallbackPre.ctx.timing = fallbackTiming.timer.snapshot();
					response = await handleError({
						stage: "execute",
						res: buildPipelineExecutionErrorResponse(error, fallbackPre.ctx),
						endpoint,
						ctx: fallbackPre.ctx,
						timingHeader: fallbackTiming.timer.header() || undefined,
						auditFailure,
						req: fallbackReq,
					});
				}
				response = withRateLimitPolicyHeaders(response, fallbackPre.ctx);
				attempts.push({ model: fallbackPre.ctx.model, status: response.status, stage: "execute" });
				if (!shouldTryModelFallback(response, fallbackPre.ctx) || rejectedByRateLimitPolicy(fallbackPre.ctx)) return response;
			}
			return await settleMixedRateLimitAcrossModels(response, attempts);
        };

        // If before failed, log and return error immediately
        if (!pre.ok) {
            const failure = pre as { ok: false; response: Response; unservedModelFallback?: UnservedModelFallback };
            const response = await handleError({
                stage: "before",
                res: failure.response,
                endpoint,
                timingHeader: timing.timer.serverTiming(),
                auditFailure,
                req,
                requestBodyReq: observabilityReq,
                requestObservability: earlyRequestObservability,
            });
            // No provider serves the requested model: the request's own
            // fallback list is tried before any approved successor.
            const unserved = failure.unservedModelFallback;
            if (!unserved) return response;
            return await tryModelFallbacks(
                { source: "request", models: unserved.models },
                {
                    model: unserved.model,
                    requestId: unserved.requestId,
                    retryRawBody: unserved.retryRawBody,
                    attemptKey: `${unserved.model}||`,
                    stage: "before",
                },
                response,
            );
        }

        if (beforeMs !== null) {
            pre.ctx.meta.before_ms = beforeMs;
        }
        pre.ctx.gatewayTimingTrace = gatewayTrace;
        pre.ctx.rateLimitConcurrency = concurrency;

        try {
			const response = withRateLimitPolicyHeaders(await runWithHeaders({ pre, req, endpoint, timing }), pre.ctx);
			if (!shouldTryModelFallback(response, pre.ctx)) return response;
			// Other models share the exhausted policy allowance.
			if (rejectedByRateLimitPolicy(pre.ctx)) return response;
			const fallbackPlan = configuredModelFallbacks(pre.ctx);
			if (!fallbackPlan) return response;
			return await tryModelFallbacks(
				fallbackPlan,
				{
					model: pre.ctx.model,
					requestId: pre.ctx.requestId,
					retryRawBody: pre.ctx.retryRawBody ?? pre.ctx.rawBody,
					routingDiagnostics: pre.ctx.routingDiagnostics,
					attemptKey: modelFallbackAttemptKey(pre.ctx),
					rateLimitAdmissionId: pre.ctx.rateLimitAdmissionId ?? pre.ctx.billingRequestId,
					stage: "execute",
				},
				response,
			);
        } catch (err) {
            logPipelineExecutionError("entrypoint", err);
            const header = timing.timer.header();
            pre.ctx.timing = timing.timer.snapshot();
            return withRateLimitPolicyHeaders(await handleError({
                stage: "execute",
                res: buildPipelineExecutionErrorResponse(err, pre.ctx),
                endpoint,
                ctx: pre.ctx,
                timingHeader: header || undefined,
                auditFailure,
                req,
            }), pre.ctx);
        }
    }
}
