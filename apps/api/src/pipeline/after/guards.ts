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
        const { safeJson, extractErrorCode, extractErrorDescription, classifyAttribution } = await import("@core/error-handler");

        const body = await safeJson(result.upstream);
        let errCode = extractErrorCode(body, "upstream_non_2xx");
        let description = extractErrorDescription(body) ?? `Upstream returned status ${upstreamStatus}`;
        let details: Array<Record<string, unknown>> | undefined;

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

        const headers = makeHeaders(timingHeader);
        headers.set("X-Gateway-Error-Attribution", attribution);

        await handleFailureAudit(
            ctx,
            result,
            upstreamStatus,
            attribution,
            errCode,
            description,
            body
        );

        const generationId = ctx.requestId ?? body?.generation_id ?? body?.request_id ?? body?.requestId ?? "unknown";
        const responseBody: Record<string, unknown> = {
            generation_id: generationId,
            status_code: upstreamStatus,
            error: errCode,
            description,
        };
        if (details?.length) {
            responseBody.details = details;
        }
        if (ctx.meta?.debug?.return_upstream_request && result.mappedRequest) {
            responseBody.upstream_request = parseJsonLoose(result.mappedRequest);
        }
        if (ctx.meta?.debug?.return_upstream_response && result.rawResponse) {
            responseBody.upstream_response = result.rawResponse;
        }

        return {
            ok: false,
            response: createResponse(responseBody, upstreamStatus, headers)
        };
    }

    return { ok: true, value: undefined };
}










