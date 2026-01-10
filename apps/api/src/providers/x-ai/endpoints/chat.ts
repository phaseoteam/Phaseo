// lib/gateway/providers/x-ai/endpoints/chat.ts
import type { ProviderExecuteArgs, AdapterResult } from "../../types";
import { ChatCompletionsSchema, type ChatCompletionsRequest } from "@core/schemas";
import { buildAdapterPayload } from "../../utils";
import { getBindings } from "@/runtime/env";
import { computeBill } from "@pipeline/pricing/engine";
import { resolveProviderKey, type ResolvedKey } from "../../keys";

const BASE_URL = "https://api.x.ai";

async function resolveApiKey(args: ProviderExecuteArgs): Promise<ResolvedKey> {
    return resolveProviderKey(args, () => getBindings().XAI_API_KEY);
}

function baseHeaders(key: string) {
    return {
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json",
    };
}

function mapGatewayToXAIChat(body: ChatCompletionsRequest) {
    const maxTokens = body.max_output_tokens;
    return {
        model: body.model,
        messages: body.messages,
        max_tokens: maxTokens,
        temperature: body.temperature,
        top_p: body.top_p,
        stream: Boolean(body.stream),
        tools: body.tools,
    };
}

function mapXAIToGatewayChat(json: any, requestId?: string): any {
    const choices = json.choices?.map((choice: any) => ({
        index: choice.index,
        message: {
            role: "assistant",
            content: choice.message?.content || "",
        },
        finish_reason: choice.finish_reason || "stop",
        reasoning: false, // xAI doesn't separate reasoning in response
    })) || [];

    return {
        id: requestId ?? json.id ?? null,
        nativeResponseId: json.id ?? null,
        created: json.created,
        model: json.model,
        provider: "x-ai",
        choices,
        usage: json.usage ? {
            input_text_tokens: json.usage.prompt_tokens || 0,
            output_text_tokens: json.usage.completion_tokens || 0,
            total_tokens: json.usage.total_tokens || 0,
        } : undefined,
    };
}

async function bufferXAIStream(res: Response, model: string, requestId: string) {
    if (!res.body) throw new Error("xai_stream_missing_body");
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
            let data = "";
            for (const line of raw.split("\n")) {
                const l = line.replace(/\r$/, "");
                if (l.startsWith("data:")) data += l.slice(5).trimStart();
            }
            if (!data || data === "[DONE]") continue;
            let payload: any;
            try { payload = JSON.parse(data); } catch { continue; }
            final = payload;
        }
    }

    if (!final) throw new Error("xai_stream_missing_completion");
    return { normalized: mapXAIToGatewayChat(final, requestId), firstFrameMs };
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
    const req = mapGatewayToXAIChat(modifiedBody);
    const res = await fetch(`${BASE_URL}/v1/chat/completions`, {
        method: "POST",
        headers: baseHeaders(key),
        body: JSON.stringify(req),
    });
    const bill = {
        cost_cents: 0,
        currency: "USD" as const,
        usage: undefined as any,
        upstream_id: res.headers.get("x-request-id"),
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

    const { normalized, firstFrameMs } = await bufferXAIStream(res, args.model, args.meta.requestId);
    if (firstFrameMs !== null) args.meta.latency_ms = firstFrameMs;

    if (normalized?.usage) {
        const pricedUsage = computeBill(normalized.usage, args.pricingCard);
        bill.cost_cents = pricedUsage.pricing.total_cents;
        bill.currency = pricedUsage.pricing.currency;
        bill.usage = pricedUsage;
    }

    return { kind: "completed", upstream: res, bill, normalized, keySource: keyInfo.source, byokKeyId: keyInfo.byokId };
}
