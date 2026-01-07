// lib/gateway/before/index.ts
import { z } from "zod";
import { schemaFor } from "../../schemas";
import type { Endpoint, RequestMeta } from "../../types";
import type { PipelineContext } from "./types";
import { guardAuth, guardJson, guardZod, guardModel, guardContext, makeMeta, normalizeReturnFlag } from "./guards";
import { Timer } from "../telemetry/timer";

/**
 * BEFORE STAGE
 * - AuthN + team lookup
 * - Parse & validate body
 * - Credit / key checks via RPC
 * - Build PipelineContext (single source of truth for downstream)
 */
export async function beforeRequest(
    req: Request,
    endpoint: Endpoint,
    timer: Timer,
    zodSchema: z.ZodTypeAny | null = schemaFor(endpoint)
): Promise<{ ok: true; ctx: PipelineContext } | { ok: false; response: Response }> {

    // 1) Auth
    const a = await timer.span("guardAuth", () => guardAuth(req));
    if (!a.ok) return a as { ok: false; response: Response };
    const { requestId, teamId, apiKeyId, apiKeyRef, apiKeyKid, internal } = a.value;

    // 2) JSON
    const j = await timer.span("guardJson", () => guardJson(req, teamId, requestId));
    if (!j.ok) return j as { ok: false; response: Response };
    const rawBody = j.value;

    // 3) Zod
    const v = await timer.span("guardZod", () => guardZod(zodSchema, rawBody, teamId, requestId));
    if (!v.ok) return v as { ok: false; response: Response };
    const body = v.value;

    // 4) Model + stream
    const m = await timer.span("guardModel", () => guardModel(body, teamId, requestId));
    if (!m.ok) return m as { ok: false; response: Response };
    const { model, stream } = m.value;

    // 5) RPC + gating + providers
    const c = await timer.span("guardContext", () => guardContext({ teamId, apiKeyId, endpoint, model, requestId, internal }));
    if (!c.ok) return c as { ok: false; response: Response };
    const { context, providers, resolvedModel } = c.value;
    // console.log(`[DEBUG] beforeRequest: resolvedModel: ${resolvedModel}, original model: ${model}`);

    // 6) Meta + final ctx
    const returnUsage = normalizeReturnFlag(body?.usage);
    const returnMeta = normalizeReturnFlag(body?.meta);
    const meta: RequestMeta = makeMeta({
        apiKeyId,
        apiKeyRef,
        apiKeyKid,
        requestId,
        stream,
        req,
        returnUsage,
        returnMeta,
    });
    const requestPath = (() => {
        try {
            return new URL(req.url).pathname;
        } catch {
            return null;
        }
    })();

    const ctx: PipelineContext = {
        endpoint,
        requestId,
        meta,
        rawBody,
        body,
        model: resolvedModel || model,
        teamId,
        stream,
        requestPath: requestPath ?? undefined,
        providers,
        pricing: context.pricing,
        gating: {
            key: context.key,
            keyLimit: context.keyLimit,
            credit: context.credit,
        },
        internal,
    };

    // console.log(`[DEBUG] beforeRequest: final ctx.model: ${ctx.model}`);

    return { ok: true, ctx };
}
