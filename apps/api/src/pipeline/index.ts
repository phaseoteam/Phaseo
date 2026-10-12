// src/lib/gateway/route-factory.ts
// Purpose: Pipeline entrypoint that wires before/execute/after stages.
// Why: Provides a single request lifecycle orchestrator.
// How: Orchestrates before -> execute -> after with timing hooks.

import { beforeRequest, type BeforeRequestObservabilitySnapshot } from "./before";
import type { Endpoint } from "@core/types";
import { handleError } from "@core/error-handler";
import { auditFailure } from "./audit";
import { Timer } from "./telemetry/timer";
import { gatewayTraceFor } from "./telemetry/gateway-trace";
import type { PipelineTiming } from "./execute";
import { resolvePipeline } from "./registry";
import { ResponsesSchema } from "@core/schemas";
import { MAX_REQUEST_MODEL_FALLBACKS } from "./before/requestModelFallbacks";
import { runAutoRouterClassifierGatewayRequest } from "./auto-router-classifier-gateway";
import {
	buildPipelineExecutionErrorResponse,
	logPipelineExecutionError,
} from "./error-response";

const EARLY_OBSERVABILITY_BODY_LIMIT_BYTES = 256 * 1024;
const MODEL_FALLBACK_STATUSES = new Set([429, 500, 502, 503, 504]);
let autoRouterClassifierHandler: ReturnType<typeof makeEndpointHandler> | null = null;

function getAutoRouterClassifierHandler() {
	autoRouterClassifierHandler ??= makeEndpointHandler({ endpoint: "responses", schema: ResponsesSchema });
	return autoRouterClassifierHandler;
}

type ModelFallbackSource = "dynamic_route" | "request" | "auto_router";
type ModelFallbackAttempt = { model: string; status: number | null; stage: "before" | "execute" | "skipped" };

function cleanFallbackModels(values: unknown, primaryModel: string | null): string[] {
	if (!Array.isArray(values)) return [];
	return [...new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0))]
		.filter((value) => value !== primaryModel)
		.slice(0, MAX_REQUEST_MODEL_FALLBACKS);
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
		const models = cleanFallbackModels(values, source === "request" ? null : ctx.model);
		if (models.length) return { source, models };
	}
	return null;
}

// An attempt is identified by its resolved model and eligible providers, so a
// provider-pinned or preset fallback for the same model is still tried.
function modelFallbackAttemptKey(ctx: { model: string; providers?: Array<{ providerId: string }> | null }): string {
	const providers = (ctx.providers ?? []).map((provider) => provider.providerId).sort().join(",");
	return `${ctx.model}|${providers}`;
}

function shouldTryModelFallback(response: Response): boolean {
    return MODEL_FALLBACK_STATUSES.has(response.status);
}

function discardResponseBody(response: Response) {
	response.body?.cancel().catch(() => undefined);
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

function fallbackBeforeOptions(source: ModelFallbackSource, model: string, ctx: { routingDiagnostics?: Record<string, any> | null }) {
	if (source === "request") return { requestModelOverride: model };
	return {
		dynamicRouteModelOverride: model,
		autoRouterModelOverride: model,
		autoRouterClassificationOverride: ctx.routingDiagnostics?.autoRouter?.classification ?? null,
	};
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

        // If before failed, log and return error immediately
        if (!pre.ok) {
            // Use error handler directly
            return await handleError({
                stage: "before",
                res: (pre as { ok: false; response: Response }).response,
                endpoint,
                timingHeader: timing.timer.serverTiming(),
                auditFailure,
                req,
                requestBodyReq: observabilityReq,
                requestObservability: earlyRequestObservability,
            });
        }

        if (beforeMs !== null) {
            pre.ctx.meta.before_ms = beforeMs;
        }
        pre.ctx.gatewayTimingTrace = gatewayTrace;

        try {
			const runner = resolvePipeline(endpoint);
			let response = await runner({ pre, req, endpoint, timing });
			if (!shouldTryModelFallback(response)) return response;
			const fallbackPlan = configuredModelFallbacks(pre.ctx);
			if (!fallbackPlan) return response;

			const attempts: ModelFallbackAttempt[] = [{ model: pre.ctx.model, status: response.status, stage: "execute" }];
			const attemptedModels = new Set([modelFallbackAttemptKey(pre.ctx)]);
			for (const [fallbackIndex, fallbackModel] of fallbackPlan.models.entries()) {
				const fallbackReq = requestForModelFallback(req, pre.ctx.retryRawBody ?? pre.ctx.rawBody) as unknown as typeof req;
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
						...fallbackBeforeOptions(fallbackPlan.source, fallbackModel, pre.ctx),
						onObservabilitySnapshot: (snapshot) => {
							fallbackRequestObservability = snapshot;
						},
					},
				);
				const fallbackBeforeMsRaw = fallbackTiming.timer.end("before_start");
				if (!fallbackPre.ok) {
					// A fallback that cannot serve this request (unsupported endpoint,
					// parameter, policy) is recorded and skipped; it never replaces the
					// upstream failure the client would otherwise receive.
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
				fallbackPre.ctx.routingDiagnostics = {
					...(fallbackPre.ctx.routingDiagnostics ?? {}),
					modelFallback: {
						source: fallbackPlan.source,
						primaryModel: pre.ctx.model,
						primaryRequestId: pre.ctx.requestId,
						models: fallbackPlan.models,
						attempt: fallbackIndex + 1,
						previousAttempts: attempts.map((attempt) => ({ ...attempt })),
					},
				};
				discardResponseBody(response);
				try {
					response = await runner({ pre: fallbackPre, req: fallbackReq, endpoint, timing: fallbackTiming });
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
				attempts.push({ model: fallbackPre.ctx.model, status: response.status, stage: "execute" });
				if (!shouldTryModelFallback(response)) return response;
			}
			return response;
        } catch (err) {
            logPipelineExecutionError("entrypoint", err);
            const header = timing.timer.header();
            pre.ctx.timing = timing.timer.snapshot();
            return await handleError({
                stage: "execute",
                res: buildPipelineExecutionErrorResponse(err, pre.ctx),
                endpoint,
                ctx: pre.ctx,
                timingHeader: header || undefined,
                auditFailure,
                req,
            });
        }
    };
}
