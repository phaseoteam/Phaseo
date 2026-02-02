// lib/gateway/providers/anthropic/endpoints/chat.ts
// Purpose: Provider endpoint adapter for anthropic (chat).
// Why: Encapsulates provider-specific request/response mapping.
// How: Defines provider-specific endpoint adapters and configuration helpers.

import type { ProviderExecuteArgs, AdapterResult } from "../../types";
import { ChatCompletionsSchema, type ChatCompletionsRequest } from "@core/schemas";
import { buildAdapterPayload } from "../../utils";
import { getBindings } from "@/runtime/env";
import { computeBill } from "@pipeline/pricing/engine";
import { resolveProviderKey, type ResolvedKey } from "../../keys";

const BASE_URL = "https://api.anthropic.com";

async function resolveApiKey(args: ProviderExecuteArgs): Promise<ResolvedKey> {
    return resolveProviderKey(args, () => getBindings().ANTHROPIC_API_KEY);
}

function baseHeaders(key: string) {
    return {
        "x-api-key": key,
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
    };
}

function mapGatewayToAnthropicChat(body: ChatCompletionsRequest) {
    const messages = [];
    let system = body.system || "";
    const maxTokens = body.max_output_tokens;

    for (const m of body.messages || []) {
        if (m.role === "system") {
            system += (system ? "\n\n" : "") + (typeof m.content === "string" ? m.content : "");
        } else {
            messages.push({
                role: m.role === "assistant" ? "assistant" : "user",
                content: typeof m.content === "string" ? m.content : String(m.content || ""),
            });
        }
    }

    return {
        model: body.model,
        max_tokens: maxTokens,
        messages,
        system: system || undefined,
        temperature: body.temperature,
        top_p: body.top_p,
        top_k: body.top_k,
        stream: Boolean(body.stream),
        tools: body.tools,
    };
}

export function mapAnthropicToGatewayChat(json: any, requestId?: string): any {
    const content = json.content || [];
    let text = "";
    for (const block of content) {
        if (block.type === "text" && typeof block.text === "string") {
            text += block.text;
        }
    }

    const finishReasonMap: { [key: string]: string } = {
        "end_turn": "stop",
        "max_tokens": "length",
        "stop_sequence": "stop",
        "tool_use": "tool_calls",
    };

    const finish_reason = finishReasonMap[json.stop_reason] || "stop";

    return {
        id: requestId ?? json.id ?? null,
        nativeResponseId: json.id ?? null,
        created: Math.floor(Date.now() / 1000), // Anthropic doesn't provide created timestamp
        model: json.model,
        provider: "anthropic",
        choices: [{
            index: 0,
            message: {
                role: "assistant",
                content: text,
            },
            finish_reason,
            reasoning: false, // Anthropic doesn't separate reasoning
        }],
        usage: {
            input_text_tokens: json.usage?.input_tokens || 0,
            output_text_tokens: json.usage?.output_tokens || 0,
            total_tokens: (json.usage?.input_tokens || 0) + (json.usage?.output_tokens || 0),
        },
    };
}

async function bufferAnthropicStream(res: Response, model: string, requestId: string) {
    if (!res.body) throw new Error("anthropic_stream_missing_body");
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let final: any = null;
    let firstFrameMs: number | null = null;
    const tStart = performance.now();

    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (firstFrameMs === null) firstFrameMs = Math.round(performance.now() - tStart);
        buf += dec.decode(value, { stream: true });
        const frames = buf.split(/\n\n/);
        buf = frames.pop() ?? "";
        for (const raw of frames) {
            const lines = raw.split("\n");
            let data = "";
            for (const line of lines) {
                const l = line.replace(/\r$/, "");
                if (l.startsWith("data:")) data += l.slice(5).trimStart();
            }
            if (!data || data === "[DONE]") continue;
            let payload: any;
            try { payload = JSON.parse(data); } catch { continue; }
            if (payload?.type === "message_delta" && payload?.delta?.stop_reason) {
                // keep for finish reason, but not used directly
            }
            if (payload?.type === "message_stop" || payload?.type === "message") {
                final = payload?.message ?? payload;
            }
        }
    }

    if (!final) throw new Error("anthropic_stream_missing_completion");
    return { normalized: mapAnthropicToGatewayChat(final, requestId), firstFrameMs };
}

export async function exec(args: ProviderExecuteArgs): Promise<AdapterResult> {
    const keyInfo = await resolveApiKey(args);
    const key = keyInfo.key;
    const { canonical, adapterPayload } = buildAdapterPayload(ChatCompletionsSchema, args.body, ["usage", "meta"]);
    const modifiedBody: ChatCompletionsRequest = {
        ...adapterPayload,
        model: args.providerModelSlug || args.model,
        stream: true,
    };
    const req = mapGatewayToAnthropicChat(modifiedBody);
    const res = await fetch(`${BASE_URL}/v1/messages`, {
        method: "POST",
        headers: baseHeaders(key),
        body: JSON.stringify(req),
    });
    const bill = {
        cost_cents: 0,
        currency: "USD" as const,
        usage: undefined as any,
        upstream_id: res.headers.get("request-id"),
        finish_reason: null,
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
    const { normalized, firstFrameMs } = await bufferAnthropicStream(res, args.model, args.meta.requestId);
    if (firstFrameMs !== null) args.meta.latency_ms = firstFrameMs;
    
    // Calculate pricing
    if (normalized?.usage) {
        const pricedUsage = computeBill(normalized.usage, args.pricingCard);
        bill.cost_cents = pricedUsage.pricing.total_cents;
        bill.currency = pricedUsage.pricing.currency;
        bill.usage = pricedUsage;
    }
    
    return { kind: "completed", upstream: res, bill, normalized, keySource: keyInfo.source, byokKeyId: keyInfo.byokId };
}









