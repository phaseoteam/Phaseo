import type { GatewayBindings } from "@/runtime/env";
import type { Endpoint } from "@/lib/types";
import type { Hono } from "hono";
import { ChatCompletionsSchema, ResponsesSchema } from "@/lib/schemas";
import { AnthropicMessagesSchema } from "@/codecs/anthropic_messages_schema";
import { openAiChatToCore, coreToOpenAiChatResponse } from "@/codecs/openai_chat";
import { openAiResponsesToCore, coreToOpenAiResponsesResponse } from "@/codecs/openai_responses";
import { anthropicMessagesToCore, coreToAnthropicMessageResponse, openAiStreamToAnthropic } from "@/codecs/anthropic_messages";
import { executorForSurface } from "@/executors";
import { chooseExecutionPlan, type ContextEntry, type TextProtocol } from "@/core/router";
import { applyStrictness } from "@/core/strictness";
import type { CoreRequest } from "@/core/types";
import { parseStrictness } from "@/router/strictness";
import { guardAuth, guardJson, guardZod, makeMeta, normalizeReturnFlag } from "@/lib/gateway/before/guards";
import { fetchGatewayContext } from "@/lib/gateway/before/context";
import { buildProviderCandidates } from "@/lib/gateway/before/utils";
import type { GatewayContextData, ProviderCandidate } from "@/lib/gateway/before/types";
import type { PipelineContext } from "@/lib/gateway/before/types";
import { err } from "@/lib/gateway/before/http";
import { Timer } from "@/lib/gateway/telemetry/timer";
import { doRequest, type PipelineTiming } from "@/lib/gateway/execute";
import { finalizeRequest } from "@/lib/gateway/after";
import { handleStreamResponse } from "@/lib/gateway/after/stream";
import { loadProviderPricing } from "@/lib/gateway/after/pricing";
import { handleError } from "@/lib/error-handler";
import { auditFailure } from "@/lib/gateway/audit";

type ProtocolSchemaMap = {
    "openai.chat": typeof ChatCompletionsSchema;
    "openai.responses": typeof ResponsesSchema;
    "anthropic.messages": typeof AnthropicMessagesSchema;
};

const protocolSchemas: ProtocolSchemaMap = {
    "openai.chat": ChatCompletionsSchema,
    "openai.responses": ResponsesSchema,
    "anthropic.messages": AnthropicMessagesSchema,
};

function protocolEndpoint(protocol: TextProtocol): Endpoint {
    switch (protocol) {
        case "openai.responses":
            return "responses";
        case "openai.chat":
            return "chat.completions";
        case "anthropic.messages":
        default:
            return "chat.completions";
    }
}

function toCore(protocol: TextProtocol, body: any, strictness: CoreRequest["strictness"]) {
    if (protocol === "openai.chat") return openAiChatToCore(body, { strictness });
    if (protocol === "openai.responses") return openAiResponsesToCore(body, { strictness });
    return anthropicMessagesToCore(body, { strictness });
}

async function resolveTextContexts(args: {
    teamId: string;
    apiKeyId: string;
    model: string;
    requestId: string;
    internal?: boolean;
    endpoints: Endpoint[];
}): Promise<
    | { ok: true; contexts: Map<Endpoint, ContextEntry> }
    | { ok: false; response: Response }
> {
    let lastError: Response | null = null;
    const contexts = new Map<Endpoint, ContextEntry>();

    for (const endpoint of args.endpoints) {
        try {
            const context = await fetchGatewayContext({
                teamId: args.teamId,
                model: args.model,
                endpoint,
                apiKeyId: args.apiKeyId,
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
                        min_usd: 1.0,
                        request_id: args.requestId,
                        team_id: args.teamId,
                    }),
                };
            }

            const providers = buildProviderCandidates(context);
            if (!providers.length) {
                lastError = err("unsupported_model_or_endpoint", {
                    model: args.model,
                    endpoint,
                    request_id: args.requestId,
                    team_id: args.teamId,
                });
                continue;
            }

            contexts.set(endpoint, {
                endpoint,
                context,
                providers,
                resolvedModel: context.resolvedModel,
            });
        } catch (e) {
            console.error("[gateway] context resolution error", e);
            lastError = err("upstream_error", {
                reason: "gateway_context_failed",
                request_id: args.requestId,
                team_id: args.teamId,
            });
        }
    }

    if (!contexts.size) {
        return { ok: false, response: lastError ?? err("upstream_error", { reason: "gateway_context_failed", request_id: args.requestId, team_id: args.teamId }) };
    }

    return { ok: true, contexts };
}

function applyWarningsHeader(res: Response, warnings: string[]) {
    if (!warnings.length) return res;
    const headers = new Headers(res.headers);
    headers.set("x-aistats-warnings", warnings.join(","));
    return new Response(res.body, {
        status: res.status,
        statusText: res.statusText,
        headers,
    });
}

export function makeTextEndpointHandler(opts: { protocol: TextProtocol }) {
    const schema = protocolSchemas[opts.protocol];

    return async function handler(req: Request) {
        const endpoints: Endpoint[] = ["responses", "chat.completions"];
        const defaultEndpoint = protocolEndpoint(opts.protocol);
        const timer = new Timer();
        const timing: PipelineTiming = {
            timer,
            internal: { adapterMarked: false },
        };

        timing.timer.mark("before_start");
        const a = await guardAuth(req);
        if (!a.ok) {
            return handleError({
                stage: "before",
                res: (a as { ok: false; response: Response }).response,
                endpoint: defaultEndpoint,
                timingHeader: timing.timer.serverTiming(),
                auditFailure,
                req,
            });
        }

        const { requestId, teamId, apiKeyId, apiKeyRef, apiKeyKid, internal } = a.value;
        const j = await guardJson(req, teamId, requestId);
        if (!j.ok) {
            return handleError({
                stage: "before",
                res: (j as { ok: false; response: Response }).response,
                endpoint: defaultEndpoint,
                timingHeader: timing.timer.serverTiming(),
                auditFailure,
                req,
            });
        }

        const rawBody = j.value;
        const v = guardZod(schema, rawBody, teamId, requestId);
        if (!v.ok) {
            return handleError({
                stage: "before",
                res: (v as { ok: false; response: Response }).response,
                endpoint: defaultEndpoint,
                timingHeader: timing.timer.serverTiming(),
                auditFailure,
                req,
            });
        }

        const body = v.value;
        const strictness = parseStrictness(req.headers);
        const core = toCore(opts.protocol, body, strictness);
        if (!core.model) {
            return handleError({
                stage: "before",
                res: err("model_required", { request_id: requestId, team_id: teamId }),
                endpoint: defaultEndpoint,
                timingHeader: timing.timer.serverTiming(),
                auditFailure,
                req,
            });
        }

        const ctxResult = await resolveTextContexts({
            teamId,
            apiKeyId,
            model: core.model,
            requestId,
            internal,
            endpoints,
        });
        if (!ctxResult.ok) {
            return handleError({
                stage: "before",
                res: ctxResult.response,
                endpoint: defaultEndpoint,
                timingHeader: timing.timer.serverTiming(),
                auditFailure,
                req,
            });
        }

        const plan = chooseExecutionPlan(opts.protocol, ctxResult.contexts);
        if (!plan) {
            return handleError({
                stage: "before",
                res: err("unsupported_model_or_endpoint", {
                    model: core.model,
                    endpoint: defaultEndpoint,
                    request_id: requestId,
                    team_id: teamId,
                }),
                endpoint: defaultEndpoint,
                timingHeader: timing.timer.serverTiming(),
                auditFailure,
                req,
            });
        }

        const strictnessResult = applyStrictness(core, plan.surface, strictness);
        if (strictnessResult.blocked) {
            return handleError({
                stage: "before",
                res: err("validation_error", {
                    reason: strictnessResult.reason ?? "strictness_violation",
                    request_id: requestId,
                    team_id: teamId,
                }),
                endpoint: plan.endpoint,
                timingHeader: timing.timer.serverTiming(),
                auditFailure,
                req,
            });
        }

        const warnings = [...strictnessResult.warnings];
        const coreRequest: CoreRequest = { ...strictnessResult.request };

        const expectedEndpoint = protocolEndpoint(opts.protocol);
        if (coreRequest.stream && expectedEndpoint !== plan.endpoint) {
            if (strictness === "error") {
                return handleError({
                    stage: "before",
                    res: err("validation_error", {
                        reason: "streaming_not_supported_for_protocol_translation",
                        request_id: requestId,
                        team_id: teamId,
                    }),
                    endpoint: plan.endpoint,
                    timingHeader: timing.timer.serverTiming(),
                    auditFailure,
                    req,
                });
            }
            coreRequest.stream = false;
            warnings.push("streaming_disabled_for_protocol_translation");
        }

        const executor = executorForSurface(plan.surface);
        const canonicalBody = executor.toUpstream(coreRequest);

        const returnUsage = normalizeReturnFlag((body as any)?.usage);
        const returnMeta = normalizeReturnFlag((body as any)?.meta);
        const meta = makeMeta({
            apiKeyId,
            apiKeyRef,
            apiKeyKid,
            requestId,
            stream: Boolean(coreRequest.stream),
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
            endpoint: plan.endpoint,
            requestId,
            meta,
            rawBody,
            body: canonicalBody,
            model: plan.resolvedModel ?? coreRequest.model,
            teamId,
            stream: Boolean(coreRequest.stream),
            requestPath: requestPath ?? undefined,
            providers: plan.providers,
            pricing: plan.context.pricing,
            gating: {
                key: plan.context.key,
                keyLimit: plan.context.keyLimit,
                credit: plan.context.credit,
            },
            internal,
            protocol: opts.protocol,
            strictness,
        };

        timing.timer.end("before_start");
        timing.timer.mark("execute_start");
        const exec = await doRequest(ctx, timing);

        if (exec instanceof Response) {
            const header = timing.timer.header();
            ctx.timing = timing.timer.snapshot();
            return handleError({
                stage: "execute",
                res: exec,
                endpoint: plan.endpoint,
                ctx,
                timingHeader: header || undefined,
                auditFailure,
                req,
            });
        }

        const header = timing.timer.header();
        ctx.timing = timing.timer.snapshot();
        ctx.timer = timing.timer;

        if (opts.protocol === "anthropic.messages") {
            if (ctx.stream) {
                const card = await loadProviderPricing(ctx, exec.result);
                const openAiStream = await handleStreamResponse(
                    ctx,
                    exec.result,
                    card,
                    header || undefined
                );
                const anthropic = openAiStreamToAnthropic({
                    upstream: openAiStream,
                    requestId,
                    model: ctx.model,
                });
                return applyWarningsHeader(anthropic, warnings);
            }

            const openAiResponse = await finalizeRequest({
                pre: { ok: true, ctx },
                exec,
                endpoint: plan.endpoint,
                timingHeader: header || undefined,
            });
            if (!openAiResponse.ok) return openAiResponse;

            const payload = await openAiResponse.clone().json();
            const coreResponse = executor.fromUpstream(payload);
            const anthropic = coreToAnthropicMessageResponse(coreResponse, {
                requestId,
                model: ctx.model,
            });

            const headers = new Headers(openAiResponse.headers);
            headers.set("Content-Type", "application/json");
            const response = new Response(JSON.stringify(anthropic), {
                status: openAiResponse.status,
                headers,
            });
            return applyWarningsHeader(response, warnings);
        }

        const openAiResponse = await finalizeRequest({
            pre: { ok: true, ctx },
            exec,
            endpoint: plan.endpoint,
            timingHeader: header || undefined,
        });

        const expected = protocolEndpoint(opts.protocol);
        if (plan.endpoint === expected) {
            return applyWarningsHeader(openAiResponse, warnings);
        }

        if (ctx.stream) {
            return applyWarningsHeader(openAiResponse, warnings);
        }

        if (!openAiResponse.ok) return openAiResponse;
        const payload = await openAiResponse.clone().json();
        const coreResponse = executor.fromUpstream(payload);

        const translated = opts.protocol === "openai.responses"
            ? coreToOpenAiResponsesResponse(coreResponse, { requestId, model: ctx.model })
            : coreToOpenAiChatResponse(coreResponse, { requestId, model: ctx.model });

        const headers = new Headers(openAiResponse.headers);
        headers.set("Content-Type", "application/json");
        const response = new Response(JSON.stringify(translated), {
            status: openAiResponse.status,
            headers,
        });
        return applyWarningsHeader(response, warnings);
    };
}

export function registerTextEndpoints(app: Hono<{ Bindings: GatewayBindings }>) {
    app.post("/v1/chat/completions", makeTextEndpointHandler({ protocol: "openai.chat" }));
    app.post("/v1/responses", makeTextEndpointHandler({ protocol: "openai.responses" }));
    app.post("/v1/messages", makeTextEndpointHandler({ protocol: "anthropic.messages" }));
}
