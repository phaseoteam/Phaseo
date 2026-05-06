// lib/gateway/after/guards.ts
// Purpose: After-stage logic for payload shaping, pricing, auditing, and streaming.
// Why: Keeps post-execution side-effects consistent.
// How: Validates upstream status and shapes errors post-execution.

import type { PipelineContext } from "../before/types";
import type { RequestResult } from "../execute";
import { makeHeaders, createResponse } from "./http";
import { handleFailureAudit } from "./audit";
import { parseJsonLoose } from "../debug";
import {
	extractRequestedParams,
	getUnsupportedParamsForProvider,
} from "../before/paramCapabilities";

export type AfterGuardOk<T> = { ok: true; value: T };
export type AfterGuardErr = { ok: false; response: Response };
export type AfterGuardResult<T> = AfterGuardOk<T> | AfterGuardErr;

export async function guardUpstreamStatus(
    ctx: PipelineContext,
    result: RequestResult,
    timingHeader?: string
): Promise<AfterGuardResult<void>> {
    const upstreamStatus = result?.upstream?.status ?? 500;
    const statusOk = upstreamStatus >= 200 && upstreamStatus < 300;

    if (!statusOk) {
        // Import error helpers dynamically to avoid circular deps
        const {
            safeJson,
            extractErrorCode,
            extractErrorDescription,
            classifyAttribution,
            classifyErrorType,
            extractUpstreamUnsupportedParamSignal,
        } = await import("@core/error-handler");
        const { classifyProviderFailureDiagnostics } = await import("../execute/guards");

        const body = await safeJson(result.upstream);
        const upstreamErrorCode = extractErrorCode(body, "upstream_non_2xx");
        const upstreamMessage =
            (typeof body?.error?.message === "string" && body.error.message.trim()) ||
            (typeof body?.message === "string" && body.message.trim()) ||
            null;
        let errCode = upstreamErrorCode;
        let description = extractErrorDescription(body) ?? `Upstream returned status ${upstreamStatus}`;
        let details: Array<Record<string, unknown>> | undefined;
        const unsupportedParamSignal = extractUpstreamUnsupportedParamSignal({
            stage: "execute",
            body,
        });

        if (ctx.providerCapabilitiesBeta && upstreamStatus === 400) {
            const requested = ctx.requestedParams ?? extractRequestedParams(ctx.endpoint, ctx.rawBody);
            const providerCandidate = ctx.providers.find((p) => p.providerId === result.provider);
            const unsupported = providerCandidate
                ? getUnsupportedParamsForProvider({
                    endpoint: ctx.endpoint,
                    requestedParams: requested,
                    candidate: providerCandidate,
                    assumeSupportedOnMissingConfig: true,
                })
                : [];

            if (unsupported.length) {
                errCode = "validation_error";
                description = `Unsupported parameter(s) for provider ${result.provider}: ${unsupported.join(", ")}`;
                details = unsupported.map((param) => ({
                    message: `Unsupported parameter for provider ${result.provider}: ${param}`,
                    path: param.split("."),
                    keyword: "unsupported_param",
                    params: { param, provider: result.provider },
                }));
            }
        }
        const attribution = classifyAttribution({
            stage: "execute",
            status: upstreamStatus,
            errorCode: errCode,
            body
        });
        let errorType = classifyErrorType({
            stage: "execute",
            status: upstreamStatus,
            errorCode: errCode,
            body,
        });
        const errorOrigin: "upstream" = "upstream";
        if (unsupportedParamSignal) {
            errorType = "system";
        }
        const failureSample = [{
            provider: result.provider ?? null,
            type: "upstream_non_2xx",
            status: upstreamStatus,
            upstream_error_code: upstreamErrorCode,
            upstream_error_message: upstreamMessage,
            upstream_error_description: description,
            upstream_error_param: unsupportedParamSignal?.param ?? null,
            upstream_payload_preview: result.rawResponse
                ? (() => {
                    try {
                        return JSON.stringify(result.rawResponse).slice(0, 320);
                    } catch {
                        return String(result.rawResponse).slice(0, 320);
                    }
                })()
                : null,
            retryable: upstreamStatus === 408 || upstreamStatus === 429 || upstreamStatus >= 500,
        }];
        const providerFailureDiagnostics = classifyProviderFailureDiagnostics(failureSample);

        const headers = makeHeaders(timingHeader);
        headers.set("X-Gateway-Error-Attribution", attribution);
        headers.set("X-Gateway-Error-Origin", errorOrigin);

        const generationId = ctx.requestId ?? body?.generation_id ?? body?.request_id ?? body?.requestId ?? "unknown";
        const responseBody: Record<string, unknown> = {
            generation_id: generationId,
            status_code: upstreamStatus,
            error: errCode,
            error_type: errorType,
            error_origin: errorOrigin,
            description,
        };
        if (details?.length) {
            responseBody.details = details;
        }
        if (upstreamErrorCode || upstreamMessage || description || unsupportedParamSignal?.param) {
            responseBody.upstream_error = {
                code: upstreamErrorCode,
                message: upstreamMessage,
                description,
                param: unsupportedParamSignal?.param ?? null,
            };
            responseBody.failure_sample = failureSample;
        }
        if (providerFailureDiagnostics) {
            responseBody.provider_failure_diagnostics = providerFailureDiagnostics;
        }
        if (ctx.meta?.debug?.return_upstream_request && result.mappedRequest) {
            responseBody.upstream_request = parseJsonLoose(result.mappedRequest);
        }
        if (ctx.meta?.debug?.return_upstream_response && result.rawResponse) {
            responseBody.upstream_response = result.rawResponse;
        }

        await handleFailureAudit(
            ctx,
            result,
            upstreamStatus,
            attribution,
            errCode,
            description,
            body,
            responseBody,
        );

        return {
            ok: false,
            response: createResponse(responseBody, upstreamStatus, headers)
        };
    }

    return { ok: true, value: undefined };
}










