// lib/gateway/before/guards.ts
// Purpose: Before-stage helpers for auth, validation, and context building.
// Why: Keeps pre-execution logic centralized and consistent.
// How: Implements guard functions that return ok/response tuples.

import { z } from "zod";
import type { Endpoint, RequestBetaOptions, RequestMeta } from "@core/types";
import { getEdgeMeta } from "@core/edge";
import { getBindings } from "@/runtime/env";
import {
    isBodyOnlyTextSessionEndpoint,
    normalizeTextBodySessionId,
} from "@core/session-id";
import { err } from "./http";
import { extractModel, formatZodErrors, buildProviderCandidatesWithDiagnostics } from "./utils";
import { fetchGatewayContext } from "./context";
import { generatePublicId } from "./genId";
import { isDebugAllowed } from "../debug";
import type { DebugOptions } from "@core/types";
import { authenticate, authenticateManagement, type AuthFailure } from "./auth";
import { readAttributionHeaders } from "../after/attribution";
import type { ProviderCandidateBuildDiagnostics } from "./types";
import type { PriceCard } from "../pricing";

const MIN_CREDIT_AMOUNT = 1.0;
const TRUTHY_VALUES = new Set(["1", "true", "yes"]);
const FORM_JSON_FIELDS = new Set(["provider", "debug", "include", "timestamp_granularities"]);
const FORM_FORCE_ARRAY_FIELDS = new Set(["include", "timestamp_granularities"]);

function isFreePriceCard(card: PriceCard | null | undefined): boolean {
    if (!card || !Array.isArray(card.rules) || card.rules.length === 0) return false;
    return card.rules.every((rule) => {
        const pricingPlan = String(rule.pricing_plan ?? "")
            .trim()
            .toLowerCase();
        const pricePerUnit = Number(rule.price_per_unit);

        return pricingPlan === "free" && Number.isFinite(pricePerUnit) && pricePerUnit <= 0;
    });
}

function allowsNoCreditForFreeRequest(args: { model: string; context: any; providers: any[] }): boolean {
    const routableProviders = Array.isArray(args.providers)
        ? args.providers
            .filter((provider: any) => typeof provider?.providerId === "string")
        : [];
    if (!routableProviders.length) return false;

    const pricedCards = routableProviders
        .map((provider: any) => provider?.pricingCard as PriceCard | undefined)
        .filter((card): card is PriceCard => Boolean(card));
    if (pricedCards.length !== routableProviders.length) return false;
    if (!pricedCards.length) return false;

    return pricedCards.every((card) => isFreePriceCard(card));
}

function describeKeyLimitExceeded(args: {
	reason: string | null;
	limitWindow?: "daily" | "weekly" | "monthly" | null;
	limitMetric?: "requests" | "cost" | "soft_blocked" | null;
	currentValue?: number | null;
	limitValue?: number | null;
}): string {
	if (args.limitMetric === "soft_blocked") {
		return "This API key is currently soft-blocked and cannot send requests.";
	}

	const windowLabel =
		args.limitWindow === "daily"
			? "daily"
			: args.limitWindow === "weekly"
				? "weekly"
				: args.limitWindow === "monthly"
					? "monthly"
					: "configured";
	const metricLabel =
		args.limitMetric === "cost"
			? "spend limit"
			: args.limitMetric === "requests"
				? "request limit"
				: "limit";

	if (
		typeof args.currentValue === "number" &&
		Number.isFinite(args.currentValue) &&
		typeof args.limitValue === "number" &&
		Number.isFinite(args.limitValue) &&
		args.limitValue > 0
	) {
		return `This API key has reached its ${windowLabel} ${metricLabel} (${args.currentValue}/${args.limitValue}).`;
	}

	return `This API key has reached its ${windowLabel} ${metricLabel}.`;
}

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

function toTrimmedString(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function normalizeBoundedString(value: unknown, maxLength: number): string | null {
    const trimmed = toTrimmedString(value);
    if (!trimmed) return null;
    return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
}

function normalizeTraceObject(value: unknown, maxBytes = 16_384): Record<string, unknown> | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const obj = value as Record<string, unknown>;
    const entries = Object.entries(obj).filter(([key]) => key.trim().length > 0);
    if (entries.length === 0) return null;

    const out: Record<string, unknown> = {};
    for (const [rawKey, rawValue] of entries) {
        const key = rawKey.trim().slice(0, 128);
        if (!key) continue;
        out[key] = rawValue;
    }
    if (Object.keys(out).length === 0) return null;

    try {
        const encoded = JSON.stringify(out);
        if (!encoded) return null;
        if (encoded.length <= maxBytes) return out;
        return {
            _truncated: true,
            _original_size_bytes: encoded.length,
        };
    } catch {
        return {
            _invalid_trace_payload: true,
        };
    }
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

type GuardAuthOptions = {
    useKvCache?: boolean;
};

export async function guardAuth(req: Request, options: GuardAuthOptions = {}): Promise<GuardResult<{
    requestId: string;
    workspaceId: string;
    apiKeyId: string;
    apiKeyRef: string | null;
    apiKeyKid: string | null;
    userId?: string | null;
    internal?: boolean;
}>> {
    const requestId = generatePublicId();
    const auth = await authenticate(req, { useKvCache: options.useKvCache });
    if (!auth.ok) {
        const reason = (auth as AuthFailure).reason;
        return { ok: false, response: err("unauthorised", { reason, request_id: requestId }) };
    }
    return {
        ok: true,
        value: {
            requestId,
            workspaceId: auth.workspaceId,
            apiKeyId: auth.apiKeyId,
            apiKeyRef: auth.apiKeyRef,
            apiKeyKid: auth.apiKeyKid,
            userId: auth.userId ?? null,
            internal: auth.internal,
        },
    };
}

export async function guardManagementAuth(req: Request, options: GuardAuthOptions = {}): Promise<GuardResult<{
    requestId: string;
    workspaceId: string;
    apiKeyId: string;
    apiKeyRef: string | null;
    apiKeyKid: string | null;
    userId?: string | null;
    internal?: boolean;
}>> {
    const requestId = generatePublicId();
    const auth = await authenticateManagement(req, { useKvCache: options.useKvCache });
    if (!auth.ok) {
        const reason = (auth as AuthFailure).reason;
        return { ok: false, response: err("unauthorised", { reason, request_id: requestId }) };
    }
    return {
        ok: true,
        value: {
            requestId,
            workspaceId: auth.workspaceId,
            apiKeyId: auth.apiKeyId,
            apiKeyRef: auth.apiKeyRef,
            apiKeyKid: auth.apiKeyKid,
            userId: auth.userId ?? null,
            internal: auth.internal,
        },
    };
}

export async function guardJson(req: Request, workspaceId: string, requestId: string): Promise<GuardResult<any>> {
    const contentType = (req.headers.get("content-type") || "").toLowerCase();
    try {
        if (contentType.includes("multipart/form-data") || contentType.includes("application/x-www-form-urlencoded")) {
            const body = await parseFormBody(req);
            return { ok: true, value: body };
        }
        const body = await req.json();
        return { ok: true, value: body };
    } catch {
        return { ok: false, response: err("invalid_json", { request_id: requestId, workspace_id: workspaceId }) };
    }
}

export function guardZod(schema: z.ZodTypeAny | null, rawBody: any, workspaceId: string, requestId: string): GuardResult<any> {
    if (!schema) return { ok: true, value: rawBody };
    const result = schema.safeParse(rawBody);
    if (!result.success) {
        return {
            ok: false,
            response: err("validation_error", {
                details: formatZodErrors(result.error),
                request_id: requestId,
                workspace_id: workspaceId,
            }),
        };
    }
    return { ok: true, value: result.data };
}

export function guardModel(body: any, workspaceId: string, requestId: string): GuardResult<{ body: any; model: string; stream: boolean }> {
    const model = extractModel(body);
    if (!model) {
        return { ok: false, response: err("model_required", { request_id: requestId, workspace_id: workspaceId }) };
    }
    const stream = Boolean((body as any)?.stream);
    return { ok: true, value: { body, model, stream } };
}

export async function guardContext(args: {
    workspaceId: string;
    apiKeyId: string;
    endpoint: Endpoint;
    capability: string;
    model: string;
    requestId: string;
    internal?: boolean;
    testingMode?: boolean;
    disableCache?: boolean;
}): Promise<GuardResult<{ context: any; providers: any[]; resolvedModel?: string | null; candidateDiagnostics: ProviderCandidateBuildDiagnostics }>> {
    try {
        const context = await fetchGatewayContext({
            workspaceId: args.workspaceId,
            model: args.model,
            endpoint: args.capability,
            apiKeyId: args.apiKeyId,
            includeTestingMode: args.testingMode,
            disableCache: args.disableCache,
        });

        if (!context.key.ok) {
            return {
                ok: false,
                response: err("unauthorised", {
                    reason: context.key.reason ?? "key_invalid",
                    request_id: args.requestId,
                    workspace_id: args.workspaceId,
                }),
            };
        }

        if (!args.internal && !context.keyLimit.ok) {
            return {
                ok: false,
                response: err("key_limit_exceeded", {
                    reason: context.keyLimit.reason ?? "key_limit_exceeded",
                    reset_at: context.keyLimit.resetAt,
                    now: context.keyLimit.now ?? null,
                    limit_window: context.keyLimit.limitWindow ?? null,
                    limit_metric: context.keyLimit.limitMetric ?? null,
                    current_value: context.keyLimit.currentValue ?? null,
                    limit_value: context.keyLimit.limitValue ?? null,
                    buckets: context.keyLimit.buckets ?? null,
                    description: describeKeyLimitExceeded({
                        reason: context.keyLimit.reason ?? null,
                        limitWindow: context.keyLimit.limitWindow ?? null,
                        limitMetric: context.keyLimit.limitMetric ?? null,
                        currentValue: context.keyLimit.currentValue ?? null,
                        limitValue: context.keyLimit.limitValue ?? null,
                    }),
                    request_id: args.requestId,
                    workspace_id: args.workspaceId,
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
                    workspace_id: args.workspaceId,
                    provider_candidate_diagnostics: candidateDiagnostics,
                }),
            };
        }

        const billingMode = String(context.teamSettings?.billingMode ?? "wallet")
            .trim()
            .toLowerCase();
        const bypassWalletCreditCheck = billingMode === "invoice";
        const allowFreeWithoutCredits = allowsNoCreditForFreeRequest({
            model: args.model,
            context,
            providers,
        });

        if (
            !args.internal &&
            !context.credit.ok &&
            !bypassWalletCreditCheck &&
            !allowFreeWithoutCredits
        ) {
            return {
                ok: false,
                response: err("insufficient_funds", {
                    reason: context.credit.reason ?? "credit_check_failed",
                    min_usd: MIN_CREDIT_AMOUNT,
                    request_id: args.requestId,
                    workspace_id: args.workspaceId,
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
            response: err("gateway_error", {
                reason: "gateway_context_failed",
                request_id: args.requestId,
                workspace_id: args.workspaceId,
            }),
        };
    }
}

export function makeMeta(input: {
    endpoint: Endpoint;
    apiKeyId: string;
    apiKeyRef: string | null;
    apiKeyKid: string | null;
    requestId: string;
    stream: boolean;
    req: Request;
    rawBody?: Record<string, unknown> | null;
    authMethod?: "api_key" | "oauth";
    oauthClientId?: string | null;
    oauthUserId?: string | null;
    returnMeta?: boolean;
    debug?: DebugOptions;
    providerCapabilitiesBeta?: boolean;
    beta?: RequestBetaOptions;
    beforeContextMs?: number | null;
    beforeContextCacheStatus?: "hit" | "miss" | "bypass" | null;
    beforeContextKeyVersionMs?: number | null;
    beforeContextCacheReadMs?: number | null;
    beforeContextRpcMs?: number | null;
    beforeContextEnrichMs?: number | null;
    beforeContextCacheWriteMs?: number | null;
    beforeContextFallbackRemap?: boolean | null;
}): RequestMeta {
    const { referer, appTitle, appId, appName, sessionId: sessionIdHeader, userId: userIdHeader } = readAttributionHeaders(input.req);
    const rawBody = (input.rawBody && typeof input.rawBody === "object")
        ? input.rawBody
        : {};
    const requestUserId = normalizeBoundedString(
        rawBody?.user ??
        rawBody?.user_id ??
        userIdHeader,
        128,
    );
    const sessionId = isBodyOnlyTextSessionEndpoint(input.endpoint)
        ? normalizeTextBodySessionId(rawBody?.session_id)
        : normalizeBoundedString(
            rawBody?.session_id ??
            rawBody?.sessionId ??
            sessionIdHeader,
            128,
        );
    const trace = normalizeTraceObject(rawBody?.trace);
    const nodeEnv = String(getBindings().NODE_ENV ?? "").trim().toLowerCase();
    const testId = nodeEnv === "test"
        ? normalizeBoundedString(input.req.headers.get("x-test-id"), 128)
        : null;
    const debugHeader = input.req.headers.get("x-gateway-debug") ?? input.req.headers.get("x-ai-stats-debug");
    const debugEnabled = (normalizeReturnFlag(debugHeader) || Boolean(input.debug?.enabled)) && isDebugAllowed();
    const userAgent = input.req.headers.get("user-agent");
    const accept = input.req.headers.get("accept");
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
        authMethod: input.authMethod ?? "api_key",
        oauthClientId: input.oauthClientId ?? null,
        oauthUserId: input.oauthUserId ?? null,
        requestId: input.requestId,
        stream: input.stream,
        debug,
        echoUpstreamRequest: Boolean(debug?.return_upstream_request),
        returnUpstreamRequest: Boolean(debug?.return_upstream_request),
        returnUpstreamResponse: Boolean(debug?.return_upstream_response),
        startedAtMs: Date.now(),
        keySource: "gateway",
        byokKeyId: null,
        beforeContextMs: input.beforeContextMs ?? undefined,
        beforeContextCacheStatus: input.beforeContextCacheStatus ?? undefined,
        beforeContextKeyVersionMs: input.beforeContextKeyVersionMs ?? undefined,
        beforeContextCacheReadMs: input.beforeContextCacheReadMs ?? undefined,
        beforeContextRpcMs: input.beforeContextRpcMs ?? undefined,
        beforeContextEnrichMs: input.beforeContextEnrichMs ?? undefined,
        beforeContextCacheWriteMs: input.beforeContextCacheWriteMs ?? undefined,
        beforeContextFallbackRemap: input.beforeContextFallbackRemap ?? undefined,
        referer,
        appTitle,
        appId,
        appName,
        requestUserId,
        sessionId,
        trace,
        testId,
        requestMethod: input.req.method ?? null,
        accept,
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
        beta: input.beta,
    };
}
