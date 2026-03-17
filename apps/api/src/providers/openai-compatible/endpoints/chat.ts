// Purpose: Provider adapter module.
// Why: Encapsulates provider-specific configuration and endpoint mapping.
// How: Exposes provider-specific helpers for routing and execution.

import type { ProviderExecuteArgs, AdapterResult } from "../../types";
import type { GatewayCompletionsResponse, GatewayReasoningDetail, GatewayUsage } from "@core/types";
import { ChatCompletionsSchema, type ChatCompletionsRequest } from "@core/schemas";
import { buildAdapterPayload } from "../../utils";
import { computeBill } from "@pipeline/pricing/engine";
import { openAICompatHeaders, openAICompatUrl, resolveOpenAICompatKey } from "../config";

function collectText(value: unknown, out: string[]) {
    if (typeof value === "string") {
        out.push(value);
        return;
    }
    if (Array.isArray(value)) {
        for (const item of value) {
            collectText(item, out);
        }
        return;
    }
    if (!value || typeof value !== "object") return;

    const entry = value as Record<string, unknown>;
    if (typeof entry.text === "string") {
        out.push(entry.text);
    }
    for (const nested of Object.values(entry)) {
        if (nested && typeof nested === "object") {
            collectText(nested, out);
        }
    }
}

function parseAssistantContent(
    content: unknown,
    reasoningIdPrefix: string
): { text: string; reasoningContent?: string; reasoningDetails?: GatewayReasoningDetail[] } {
    if (typeof content === "string") {
        return { text: content };
    }

    if (!Array.isArray(content)) {
        if (content && typeof content === "object") {
            const contentObj = content as Record<string, unknown>;
            if (typeof contentObj.text === "string") {
                return { text: contentObj.text };
            }
            if (contentObj.type === "thinking") {
                const reasoningParts: string[] = [];
                if ("thinking" in contentObj) {
                    collectText(contentObj.thinking, reasoningParts);
                }
                const reasoningContent = reasoningParts.join("\n");
                if (reasoningContent) {
                    return {
                        text: "",
                        reasoningContent,
                        reasoningDetails: [{
                            id: `${reasoningIdPrefix}-reasoning-1`,
                            index: 0,
                            type: "text",
                            text: reasoningContent,
                        }],
                    };
                }
            }
        }
        return { text: "" };
    }

    const textParts: string[] = [];
    const reasoningParts: string[] = [];

    for (const rawPart of content) {
        if (typeof rawPart === "string") {
            textParts.push(rawPart);
            continue;
        }
        if (!rawPart || typeof rawPart !== "object") continue;

        const part = rawPart as Record<string, unknown>;
        const type = typeof part.type === "string" ? part.type : "";

        if (type === "thinking") {
            if ("thinking" in part) {
                collectText(part.thinking, reasoningParts);
            }
            if (typeof part.text === "string") {
                reasoningParts.push(part.text);
            }
            continue;
        }

        if (type === "text" || type === "output_text") {
            if (typeof part.text === "string") {
                textParts.push(part.text);
            }
            continue;
        }

        if (type === "reasoning") {
            if ("content" in part) {
                collectText(part.content, reasoningParts);
            }
            if (typeof part.text === "string") {
                reasoningParts.push(part.text);
            }
            continue;
        }

        if (typeof part.text === "string") {
            textParts.push(part.text);
        }
    }

    const text = textParts.join("");
    const reasoningContent = reasoningParts.join("\n");
    if (!reasoningContent) {
        return { text };
    }

    return {
        text,
        reasoningContent,
        reasoningDetails: [{
            id: `${reasoningIdPrefix}-reasoning-1`,
            index: 0,
            type: "text",
            text: reasoningContent,
        }],
    };
}

function resolveMistralReasoningEffort(body: ChatCompletionsRequest): "none" | "high" {
    const bodyAny = body as ChatCompletionsRequest & { reasoning_effort?: unknown };
    const reasoning = body.reasoning;
    const candidate =
        typeof bodyAny.reasoning_effort === "string"
            ? bodyAny.reasoning_effort
            : (typeof reasoning?.effort === "string" ? reasoning.effort : undefined);

    // If caller explicitly passes reasoning effort, map "none" to disabled and
    // coerce every other effort level to Mistral's supported "high" mode.
    if (typeof candidate === "string") {
        return candidate === "none" ? "none" : "high";
    }

    // Fallback control via reasoning.enabled.
    if (reasoning?.enabled === true) return "high";
    if (reasoning?.enabled === false) return "none";

    // Default is reasoning off when no signal is provided.
    return "none";
}

function isMistralSmall4Model(modelId: string | undefined): boolean {
    if (!modelId) return false;
    const normalized = modelId.toLowerCase();
    return normalized.includes("mistral-small-4") || normalized.includes("mistral-small-2603");
}

function mapGatewayToOpenAIChat(
    body: ChatCompletionsRequest,
    providerId: string,
    gatewayModelId?: string
) {
    const shouldMapMistralReasoning =
        providerId === "mistral" &&
        (isMistralSmall4Model(body.model) || isMistralSmall4Model(gatewayModelId));

    const mistralReasoningEffort =
        shouldMapMistralReasoning ? resolveMistralReasoningEffort(body) : undefined;

    return {
        model: body.model,
        messages: body.messages,
        max_tokens: body.max_output_tokens,
        temperature: body.temperature,
        top_p: body.top_p,
        top_k: body.top_k,
        frequency_penalty: body.frequency_penalty,
        presence_penalty: body.presence_penalty,
        seed: body.seed,
        stream: Boolean(body.stream),
        tools: body.tools,
        tool_choice: body.tool_choice,
        parallel_tool_calls: body.parallel_tool_calls,
        logit_bias: body.logit_bias,
        response_format: body.response_format,
        logprobs: body.logprobs,
        top_logprobs: body.top_logprobs,
        user: body.user_id,
        ...(mistralReasoningEffort ? { reasoning_effort: mistralReasoningEffort } : {}),
    };
}

function normalizeUsage(usage: any): GatewayUsage | undefined {
    if (!usage) return undefined;
    const input = usage.prompt_tokens ?? 0;
    const output = usage.completion_tokens ?? 0;
    const total = usage.total_tokens ?? (input + output);
    return {
        input_tokens: input,
        output_tokens: output,
        total_tokens: total,
        input_text_tokens: input,
        output_text_tokens: output,
    };
}

function mapOpenAIToGatewayChat(
    provider: string,
    model: string,
    json: any,
    requestId?: string
): GatewayCompletionsResponse {
    const choices = Array.isArray(json?.choices)
        ? json.choices.map((choice: any, idx: number) => {
            const index = typeof choice.index === "number" ? choice.index : idx;
            const parsedContent = parseAssistantContent(
                choice.message?.content,
                `${requestId ?? json?.id ?? "resp"}-${index}`
            );
            const reasoningContent =
                typeof choice.message?.reasoning_content === "string"
                    ? choice.message.reasoning_content
                    : parsedContent.reasoningContent;

            return {
                index,
                message: {
                    role: "assistant",
                    content: parsedContent.text,
                    ...(Array.isArray(choice.message?.tool_calls) ? { tool_calls: choice.message.tool_calls } : {}),
                    ...(reasoningContent ? { reasoning_content: reasoningContent } : {}),
                    ...(choice.message?.reasoning_details
                        ? { reasoning_details: choice.message.reasoning_details }
                        : parsedContent.reasoningDetails
                            ? { reasoning_details: parsedContent.reasoningDetails }
                            : {}),
                },
                finish_reason: choice.finish_reason ?? "stop",
                ...(reasoningContent ? { reasoning: true } : {}),
                ...(choice.logprobs ? { logprobs: choice.logprobs } : {}),
            };
        })
        : [];

    return {
        id: requestId ?? json?.id ?? null,
        nativeResponseId: json?.id ?? null,
        created: json?.created ?? Math.floor(Date.now() / 1000),
        model,
        provider,
        choices,
        usage: normalizeUsage(json?.usage),
    };
}

type ToolCallAccumulator = {
    id: string;
    name?: string;
    arguments: string;
    index: number;
};

async function bufferOpenAICompatStream(
    res: Response,
    args: ProviderExecuteArgs
): Promise<{ normalized: GatewayCompletionsResponse; firstFrameMs: number | null }> {
    if (!res.body) {
        throw new Error("openai_compat_stream_missing_body");
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let firstFrameMs: number | null = null;
    const tStart = performance.now();

    let responseId: string | null = null;
    let created = Math.floor(Date.now() / 1000);
    let usage: any = undefined;

    type ChoiceAcc = {
        index: number;
        content: string;
        reasoningContent: string;
        finish_reason?: string | null;
        toolCalls: Map<string, ToolCallAccumulator>;
    };
    const choices = new Map<number, ChoiceAcc>();

    const getChoice = (index: number) => {
        const existing = choices.get(index);
        if (existing) return existing;
        const createdChoice: ChoiceAcc = {
            index,
            content: "",
            reasoningContent: "",
            finish_reason: null,
            toolCalls: new Map(),
        };
        choices.set(index, createdChoice);
        return createdChoice;
    };

    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (firstFrameMs === null) {
            firstFrameMs = Math.round(performance.now() - tStart);
        }
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split(/\n\n/);
        buffer = frames.pop() ?? "";

        for (const raw of frames) {
            let data = "";
            for (const line of raw.split("\n")) {
                const l = line.replace(/\r$/, "");
                if (l.startsWith("data:")) data += l.slice(5).trimStart();
            }
            if (!data || data === "[DONE]") continue;

            let payload: any;
            try {
                payload = JSON.parse(data);
            } catch {
                continue;
            }

            if (payload?.id) responseId = payload.id;
            if (typeof payload?.created === "number") created = payload.created;
            if (payload?.usage) usage = payload.usage;

            const chunkChoices = Array.isArray(payload?.choices) ? payload.choices : [];
            for (const choice of chunkChoices) {
                const index = typeof choice?.index === "number" ? choice.index : 0;
                const acc = getChoice(index);
                if (choice?.finish_reason !== undefined && choice?.finish_reason !== null) {
                    acc.finish_reason = choice.finish_reason;
                }
                const delta = choice?.delta ?? {};
                if (typeof delta?.content === "string") {
                    acc.content += delta.content;
                } else if (Array.isArray(delta?.content)) {
                    const parsed = parseAssistantContent(delta.content, `${responseId ?? "stream"}-${index}`);
                    if (parsed.text) acc.content += parsed.text;
                    if (parsed.reasoningContent) {
                        acc.reasoningContent += (acc.reasoningContent ? "\n" : "") + parsed.reasoningContent;
                    }
                }
                if (typeof delta?.reasoning_content === "string") {
                    acc.reasoningContent += (acc.reasoningContent ? "\n" : "") + delta.reasoning_content;
                }
                const toolDeltas = Array.isArray(delta?.tool_calls) ? delta.tool_calls : [];
                for (const [toolIndex, toolDelta] of toolDeltas.entries()) {
                    const key = toolDelta?.id ?? `${index}:${toolDelta?.index ?? toolIndex}`;
                    let toolAcc = acc.toolCalls.get(key);
                    if (!toolAcc) {
                        toolAcc = {
                            id: toolDelta?.id ?? key,
                            name: toolDelta?.function?.name,
                            arguments: "",
                            index: typeof toolDelta?.index === "number" ? toolDelta.index : toolIndex,
                        };
                        acc.toolCalls.set(key, toolAcc);
                    }
                    if (toolDelta?.function?.name) toolAcc.name = toolDelta.function.name;
                    if (typeof toolDelta?.function?.arguments === "string") {
                        toolAcc.arguments += toolDelta.function.arguments;
                    }
                }
            }
        }
    }

    const finalChoices = Array.from(choices.values())
        .sort((a, b) => a.index - b.index)
        .map((choice) => ({
            index: choice.index,
            message: {
                role: "assistant",
                content: choice.content,
                ...(choice.reasoningContent
                    ? {
                        reasoning_content: choice.reasoningContent,
                        reasoning_details: [{
                            id: `${responseId ?? "stream"}-${choice.index}-reasoning-1`,
                            index: 0,
                            type: "text" as const,
                            text: choice.reasoningContent,
                        }],
                    }
                    : {}),
                ...(choice.toolCalls.size
                    ? {
                        tool_calls: Array.from(choice.toolCalls.values())
                            .sort((a, b) => a.index - b.index)
                            .map((call) => ({
                                id: call.id,
                                type: "function",
                                function: {
                                    name: call.name ?? "",
                                    arguments: call.arguments ?? "",
                                },
                            })),
                    }
                    : {}),
            },
            finish_reason: choice.finish_reason ?? "stop",
        }));

    const openaiJson = {
        id: responseId,
        created,
        model: args.providerModelSlug || args.model,
        choices: finalChoices,
        ...(usage ? { usage } : {}),
    };

    const normalized = mapOpenAIToGatewayChat(
        args.providerId,
        args.model,
        openaiJson,
        args.meta.requestId
    );

    return { normalized, firstFrameMs };
}

export async function exec(args: ProviderExecuteArgs): Promise<AdapterResult> {
    const keyInfo = await resolveOpenAICompatKey(args);
    const { adapterPayload } = buildAdapterPayload(ChatCompletionsSchema, args.body, ["usage", "meta"]);
    const modifiedBody: ChatCompletionsRequest = {
        ...adapterPayload,
        model: args.providerModelSlug || args.model,
        stream: true,
    };
    const req = mapGatewayToOpenAIChat(modifiedBody, args.providerId, args.model);
    const res = await fetch(openAICompatUrl(args.providerId, "/chat/completions"), {
        method: "POST",
        headers: openAICompatHeaders(args.providerId, keyInfo.key),
        body: JSON.stringify(req),
    });

    const bill = {
        cost_cents: 0,
        currency: "USD" as const,
        usage: undefined as any,
        upstream_id: res.headers.get("x-request-id"),
        finish_reason: null as any,
    };

    if (args.stream) {
        return {
            kind: "stream",
            upstream: res,
            bill,
            keySource: keyInfo.source,
            byokKeyId: keyInfo.byokId,
        };
    }

    const { normalized, firstFrameMs } = await bufferOpenAICompatStream(res, args);
    if (firstFrameMs !== null) {
        args.meta.latency_ms = firstFrameMs;
    }

    if (normalized?.usage) {
        const pricedUsage = computeBill(normalized.usage, args.pricingCard);
        bill.cost_cents = pricedUsage.pricing.total_cents;
        bill.currency = pricedUsage.pricing.currency;
        bill.usage = pricedUsage;
    }
    if (normalized?.choices?.length) {
        bill.finish_reason = normalized.choices[normalized.choices.length - 1]?.finish_reason ?? null;
    }

    return {
        kind: "completed",
        upstream: new Response(JSON.stringify(normalized ?? {}), {
            status: res.status,
            headers: { "Content-Type": "application/json" },
        }),
        bill,
        normalized,
        keySource: keyInfo.source,
        byokKeyId: keyInfo.byokId,
    };
}

