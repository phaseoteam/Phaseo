// lib/gateway/before/guards.ts
import { z } from "zod";
import type { Endpoint, RequestMeta } from "@core/types";
import { err } from "./http";
import { extractModel, formatZodErrors, buildProviderCandidates } from "./utils";
import { fetchGatewayContext } from "./context";
import { generatePublicId } from "./genId";
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
}): Promise<GuardResult<{ context: any; providers: any[]; resolvedModel?: string | null }>> {
    try {
        console.log(
            `[DEBUG] guardContext called with model: ${args.model}, endpoint: ${args.endpoint}, capability: ${args.capability}`
        );
        const context = await fetchGatewayContext({
            teamId: args.teamId,
            model: args.model,
            endpoint: args.capability,
            apiKeyId: args.apiKeyId,
        });

        console.log(`[DEBUG] guardContext: context loaded, resolvedModel: ${context.resolvedModel}`);
        console.log(`[DEBUG] guardContext: context.providers:`, context.providers);

        // Key validity
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

        // Key limits
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

        // Credit check
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
        console.log(`[DEBUG] guardContext: providers built, count: ${providers.length}`);
        if (!providers.length) {
            console.log(`[DEBUG] guardContext: no providers found for model ${args.model}`);
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
        console.error("[DEBUG] guardContext error:", e);
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
    returnUsage?: boolean;
    returnMeta?: boolean;
    echoUpstreamRequest?: boolean;
}): RequestMeta {
    const { referer, appTitle } = readAttributionHeaders(input.req);
    const debugHeader = input.req.headers.get("x-gateway-debug");
    const userAgent = input.req.headers.get("user-agent");
    const cfRay = input.req.headers.get("cf-ray");
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
        (globalThis as any).__pricingDebug = debugHeader === "true";
    } catch {
        // ignore global debug flag errors
    }
    return {
        apiKeyId: input.apiKeyId,
        apiKeyRef: input.apiKeyRef,
        apiKeyKid: input.apiKeyKid,
        requestId: input.requestId,
        stream: input.stream,
        debug: debugHeader === "true",
        echoUpstreamRequest: input.echoUpstreamRequest ?? false,
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
        returnUsage: input.returnUsage ?? false,
        returnMeta: input.returnMeta ?? false,
    };
}
