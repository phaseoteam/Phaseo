// lib/gateway/before/guards.ts
// Purpose: Before-stage helpers for auth, validation, and context building.
// Why: Keeps pre-execution logic centralized and consistent.
// How: Implements guard functions that return ok/response tuples.

import { z } from "zod";
import type { Endpoint, RequestMeta } from "@core/types";
import { getEdgeMeta } from "@core/edge";
import { err } from "./http";
import { extractModel, formatZodErrors, buildProviderCandidates } from "./utils";
import { fetchGatewayContext } from "./context";
import { generatePublicId } from "./genId";
import { isDebugAllowed } from "../debug";
import type { DebugOptions } from "@core/types";
import { authenticate, type AuthFailure } from "./auth";
import { readAttributionHeaders } from "../after/attribution";

const MIN_CREDIT_AMOUNT = 1.0;
const TRUTHY_VALUES = new Set(["1", "true", "yes"]);

export function normalizeReturnFlag(value: unknown): boolean {
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
        return TRUTHY_VALUES.has(value.toLowerCase());
    }
    return false;
}

export type GuardOk<T> = { ok: true; value: T };
export type GuardErr = { ok: false; response: Response };
export type GuardResult<T> = GuardOk<T> | GuardErr;

export async function guardAuth(req: Request): Promise<GuardResult<{
    requestId: string;
    teamId: string;
    apiKeyId: string;
    apiKeyRef: string | null;
    apiKeyKid: string | null;
    internal?: boolean;
}>> {
    const requestId = generatePublicId();
    const auth = await authenticate(req);
    if (!auth.ok) {
        const reason = (auth as AuthFailure).reason;
        return { ok: false, response: err("unauthorised", { reason, request_id: requestId }) };
    }
    return {
        ok: true,
        value: {
            requestId,
            teamId: auth.teamId,
            apiKeyId: auth.apiKeyId,
            apiKeyRef: auth.apiKeyRef,
            apiKeyKid: auth.apiKeyKid,
            internal: auth.internal,
        },
    };
}

export async function guardJson(req: Request, teamId: string, requestId: string): Promise<GuardResult<any>> {
    try {
        const body = await req.json();
        return { ok: true, value: body };
    } catch {
        return { ok: false, response: err("invalid_json", { request_id: requestId, team_id: teamId }) };
    }
}

export function guardZod(schema: z.ZodTypeAny | null, rawBody: any, teamId: string, requestId: string): GuardResult<any> {
    if (!schema) return { ok: true, value: rawBody };
    const result = schema.safeParse(rawBody);
    if (!result.success) {
        return {
            ok: false,
            response: err("validation_error", {
                details: formatZodErrors(result.error),
                request_id: requestId,
                team_id: teamId,
            }),
        };
    }
    return { ok: true, value: result.data };
}

export function guardModel(body: any, teamId: string, requestId: string): GuardResult<{ body: any; model: string; stream: boolean }> {
    const model = extractModel(body);
    if (!model) {
        return { ok: false, response: err("model_required", { request_id: requestId, team_id: teamId }) };
    }
    const stream = Boolean((body as any)?.stream);
    return { ok: true, value: { body, model, stream } };
}

export async function guardContext(args: {
    teamId: string;
    apiKeyId: string;
    endpoint: Endpoint;
    capability: string;
    model: string;
    requestId: string;
    internal?: boolean;
    disableCache?: boolean;
}): Promise<GuardResult<{ context: any; providers: any[]; resolvedModel?: string | null }>> {
    try {
        const context = await fetchGatewayContext({
            teamId: args.teamId,
            model: args.model,
            endpoint: args.capability,
            apiKeyId: args.apiKeyId,
            disableCache: args.disableCache,
        });

        if (!context.key.ok) {
            return {
                ok: false,
                response: err("unauthorised", {
                    reason: context.key.reason ?? "key_invalid",
                    request_id: args.requestId,
                    team_id: args.teamId,
                }),
            };
        }

        if (!args.internal && !context.keyLimit.ok) {
            return {
                ok: false,
                response: err("key_limit_exceeded", {
                    reason: context.keyLimit.reason ?? "key_limit_exceeded",
                    reset_at: context.keyLimit.resetAt,
                    request_id: args.requestId,
                    team_id: args.teamId,
                }),
            };
        }

        if (!args.internal && !context.credit.ok) {
            return {
                ok: false,
                response: err("insufficient_funds", {
                    reason: context.credit.reason ?? "credit_check_failed",
                    min_usd: MIN_CREDIT_AMOUNT,
                    request_id: args.requestId,
                    team_id: args.teamId,
                }),
            };
        }

        const providers = buildProviderCandidates(context);
        if (!providers.length) {
            return {
                ok: false,
                response: err("unsupported_model_or_endpoint", {
                    model: args.model,
                    endpoint: args.endpoint,
                    request_id: args.requestId,
                    team_id: args.teamId,
                }),
            };
        }

        return { ok: true, value: { context, providers, resolvedModel: context.resolvedModel } };
    } catch (e) {
        console.error("[guardContext] gateway_context_failed", e);
        return {
            ok: false,
            response: err("upstream_error", {
                reason: "gateway_context_failed",
                request_id: args.requestId,
                team_id: args.teamId,
            }),
        };
    }
}

export function makeMeta(input: {
    apiKeyId: string;
    apiKeyRef: string | null;
    apiKeyKid: string | null;
    requestId: string;
    stream: boolean;
    req: Request;
    returnMeta?: boolean;
    debug?: DebugOptions;
    providerCapabilitiesBeta?: boolean;
}): RequestMeta {
    const { referer, appTitle } = readAttributionHeaders(input.req);
    const debugHeader = input.req.headers.get("x-gateway-debug") ?? input.req.headers.get("x-ai-stats-debug");
    const debugEnabled = (normalizeReturnFlag(debugHeader) || Boolean(input.debug?.enabled)) && isDebugAllowed();
    const userAgent = input.req.headers.get("user-agent");
    const cfRay = input.req.headers.get("cf-ray");
    const edge = getEdgeMeta(input.req);
    const forwardedFor = input.req.headers.get("x-forwarded-for");
    const clientIp =
        input.req.headers.get("cf-connecting-ip") ??
        (forwardedFor ? forwardedFor.split(",")[0]?.trim() : null);
    const requestUrl = input.req.url ?? null;
    const requestPath = (() => {
        try {
            return new URL(input.req.url).pathname;
        } catch {
            return null;
        }
    })();
    try {
        (globalThis as any).__pricingDebug = debugEnabled;
    } catch {
        // ignore global debug flag errors
    }
    const debug: DebugOptions | undefined = input.debug || debugEnabled
        ? { ...input.debug, enabled: debugEnabled }
        : undefined;
    return {
        apiKeyId: input.apiKeyId,
        apiKeyRef: input.apiKeyRef,
        apiKeyKid: input.apiKeyKid,
        requestId: input.requestId,
        stream: input.stream,
        debug,
        echoUpstreamRequest: Boolean(debug?.return_upstream_request),
        returnUpstreamRequest: Boolean(debug?.return_upstream_request),
        returnUpstreamResponse: Boolean(debug?.return_upstream_response),
        startedAtMs: Date.now(),
        keySource: "gateway",
        byokKeyId: null,
        referer,
        appTitle,
        requestMethod: input.req.method ?? null,
        requestUrl,
        requestPath,
        userAgent,
        clientIp,
        cfRay,
        edgeColo: edge.colo ?? null,
        edgeCity: edge.city ?? null,
        edgeCountry: edge.country ?? null,
        edgeContinent: edge.continent ?? null,
        edgeAsn: edge.asn ?? null,
        returnMeta: input.returnMeta ?? false,
        providerCapabilitiesBeta: input.providerCapabilitiesBeta ?? false,
    };
}
