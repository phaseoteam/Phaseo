// lib/gateway/before/guards.ts
// Purpose: Before-stage helpers for auth, validation, and context building.
// Why: Keeps pre-execution logic centralized and consistent.
// How: Implements guard functions that return ok/response tuples.

import { z } from "zod";
import type { Endpoint, RequestMeta } from "@core/types";
import { getEdgeMeta } from "@core/edge";
import { err } from "./http";
import { extractModel, formatZodErrors, buildProviderCandidatesWithDiagnostics } from "./utils";
import { fetchGatewayContext } from "./context";
import { generatePublicId } from "./genId";
import { isDebugAllowed } from "../debug";
import type { DebugOptions } from "@core/types";
import { authenticate, type AuthFailure } from "./auth";
import { readAttributionHeaders } from "../after/attribution";
import type { ProviderCandidateBuildDiagnostics } from "./types";

const MIN_CREDIT_AMOUNT = 1.0;
const TRUTHY_VALUES = new Set(["1", "true", "yes"]);
const FORM_JSON_FIELDS = new Set(["provider", "debug", "include", "timestamp_granularities"]);
const FORM_FORCE_ARRAY_FIELDS = new Set(["include", "timestamp_granularities"]);

function normalizeFormKey(key: string): { key: string; array: boolean } {
    if (/\[\]$/.test(key)) {
        return { key: key.slice(0, -2), array: true };
    }
    const indexed = key.match(/^(.*)\[(\d+)\]$/);
    if (indexed) {
        return { key: indexed[1], array: true };
    }
    return { key, array: false };
}

function maybeParseJsonFormValue(key: string, value: string): unknown {
    if (!FORM_JSON_FIELDS.has(key)) return value;
    const trimmed = value.trim();
    if (!trimmed || (!trimmed.startsWith("{") && !trimmed.startsWith("["))) return value;
    try {
        return JSON.parse(trimmed);
    } catch {
        return value;
    }
}

function appendFormField(output: Record<string, unknown>, key: string, value: FormDataEntryValue): void {
    const { key: normalizedKey, array } = normalizeFormKey(key);
    const forceArray = array || FORM_FORCE_ARRAY_FIELDS.has(normalizedKey);
    const parsedValue = typeof value === "string"
        ? maybeParseJsonFormValue(normalizedKey, value)
        : value;
    if (!forceArray && !(normalizedKey in output)) {
        output[normalizedKey] = parsedValue;
        return;
    }
    const current = output[normalizedKey];
    if (forceArray && current === undefined) {
        output[normalizedKey] = Array.isArray(parsedValue) ? [...parsedValue] : [parsedValue];
        return;
    }
    if (Array.isArray(current)) {
        if (Array.isArray(parsedValue)) {
            current.push(...parsedValue);
        } else {
            current.push(parsedValue);
        }
        return;
    }
    output[normalizedKey] = current === undefined ? [parsedValue] : [current, parsedValue];
}

async function parseFormBody(req: Request): Promise<Record<string, unknown>> {
    const form = await req.formData();
    const output: Record<string, unknown> = {};
    for (const [key, value] of form.entries()) {
        appendFormField(output, key, value);
    }
    return output;
}

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
    const contentType = (req.headers.get("content-type") || "").toLowerCase();
    try {
        if (contentType.includes("multipart/form-data") || contentType.includes("application/x-www-form-urlencoded")) {
            const body = await parseFormBody(req);
            return { ok: true, value: body };
        }
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
}): Promise<GuardResult<{ context: any; providers: any[]; resolvedModel?: string | null; candidateDiagnostics: ProviderCandidateBuildDiagnostics }>> {
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

        const { candidates: providers, diagnostics: candidateDiagnostics } = buildProviderCandidatesWithDiagnostics(context);
        if (!providers.length) {
            return {
                ok: false,
                response: err("unsupported_model_or_endpoint", {
                    model: args.model,
                    endpoint: args.endpoint,
                    request_id: args.requestId,
                    team_id: args.teamId,
                    provider_candidate_diagnostics: candidateDiagnostics,
                }),
            };
        }

        return {
            ok: true,
            value: {
                context,
                providers,
                resolvedModel: context.resolvedModel,
                candidateDiagnostics,
            },
        };
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
