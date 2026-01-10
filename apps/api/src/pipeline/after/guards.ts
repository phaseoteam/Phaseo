// lib/gateway/after/guards.ts
import type { PipelineContext } from "../before/types";
import type { RequestResult } from "../execute";
import { makeHeaders, createResponse } from "./http";
import { handleFailureAudit } from "./audit";

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
        const errCode = extractErrorCode(body, "upstream_non_2xx");
        const description = extractErrorDescription(body) ?? `Upstream returned status ${upstreamStatus}`;
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
            description
        );

        const generationId = ctx.requestId ?? body?.generation_id ?? body?.request_id ?? body?.requestId ?? "unknown";
        const responseBody: Record<string, unknown> = {
            generation_id: generationId,
            status_code: upstreamStatus,
            error: errCode,
            description,
        };
        if (ctx.meta?.echoUpstreamRequest && result.mappedRequest) {
            responseBody.upstream_request = result.mappedRequest;
        }

        return {
            ok: false,
            response: createResponse(responseBody, upstreamStatus, headers)
        };
    }

    return { ok: true, value: undefined };
}
