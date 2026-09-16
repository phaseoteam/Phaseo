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

function configuredModelFallbacks(ctx: { model: string; routingDiagnostics?: Record<string, any> | null }): string[] {
	const dynamicRouteFallbacks = ctx.routingDiagnostics?.dynamicRoute?.action?.modelFallbacks;
	const autoRouterFallbacks = ctx.routingDiagnostics?.autoRouter?.fallbackModels;
	const values = Array.isArray(dynamicRouteFallbacks) && dynamicRouteFallbacks.length
		? dynamicRouteFallbacks
		: autoRouterFallbacks;
    if (!Array.isArray(values)) return [];
    return [...new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0))]
        .filter((value) => value !== ctx.model)
        .slice(0, 8);
}

function shouldTryModelFallback(response: Response): boolean {
    return MODEL_FALLBACK_STATUSES.has(response.status);
}

function requestForModelFallback(req: Request, rawBody: unknown): Request {
	const headers = new Headers(req.headers);
	headers.delete("content-length");
	headers.set("content-type", "application/json");
	return new Request(req.url, {
		method: req.method,
		headers,
		body: JSON.stringify(rawBody),
	});
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

			for (const fallbackModel of configuredModelFallbacks(pre.ctx)) {
				const fallbackReq = requestForModelFallback(req, pre.ctx.rawBody) as unknown as typeof req;
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
						dynamicRouteModelOverride: fallbackModel,
						autoRouterModelOverride: fallbackModel,
						autoRouterClassificationOverride: pre.ctx.routingDiagnostics?.autoRouter?.classification ?? null,
						onObservabilitySnapshot: (snapshot) => {
							fallbackRequestObservability = snapshot;
						},
					},
				);
				const fallbackBeforeMsRaw = fallbackTiming.timer.end("before_start");
				if (!fallbackPre.ok) {
					response = await handleError({
						stage: "before",
						res: (fallbackPre as { ok: false; response: Response }).response,
						endpoint,
						timingHeader: fallbackTiming.timer.serverTiming(),
						auditFailure,
						req: fallbackReq,
						requestBodyReq: fallbackObservabilityReq,
						requestObservability: fallbackRequestObservability,
					});
					continue;
				}
				if (typeof fallbackBeforeMsRaw === "number") {
					fallbackPre.ctx.meta.before_ms = Math.round(fallbackBeforeMsRaw * 1000) / 1000;
				}
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
