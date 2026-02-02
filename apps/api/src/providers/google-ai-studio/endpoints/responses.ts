// Purpose: Provider adapter module.
// Why: Encapsulates provider-specific configuration and endpoint mapping.
// How: Exposes provider-specific helpers for routing and execution.

import type { AdapterResult, ProviderExecuteArgs } from "../../types";
import type { ResponsesRequest } from "@core/schemas";
import { ResponsesSchema } from "@core/schemas";
import { buildAdapterPayload } from "../../utils";
import { getBindings } from "@/runtime/env";
import { resolveProviderKey, type ResolvedKey } from "../../keys";
import { computeBill } from "@pipeline/pricing/engine";
import { normalizeGoogleUsage } from "../usage";

const GOOGLE = "https://generativelanguage.googleapis.com";

async function resolveApiKey(args: ProviderExecuteArgs): Promise<ResolvedKey> {
    return resolveProviderKey(args, () => getBindings().GOOGLE_AI_STUDIO_API_KEY);
}

function toUserText(body: ResponsesRequest) {
    const parts: string[] = [];
    if (body.input !== undefined && body.input !== null) {
        parts.push(typeof body.input === "string" ? body.input : JSON.stringify(body.input));
    }
    if (Array.isArray(body.input_items)) {
        for (const item of body.input_items) {
            if (item === undefined || item === null) continue;
            parts.push(typeof item === "string" ? item : JSON.stringify(item));
        }
    }
    return parts.join("\n\n");
}

function mapToGoogleRequest(body: ResponsesRequest) {
    const text = toUserText(body);
    return {
        contents: [{ role: "user", parts: [{ text }] }],
        generationConfig: {
            temperature: body.temperature,
            topP: body.top_p,
            maxOutputTokens: body.max_output_tokens,
        },
    };
}

async function bufferGoogleResponsesStream(upstream: Response, model: string) {
    if (!upstream.body) throw new Error("google_stream_missing_body");
    const reader = upstream.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let firstFrameMs: number | null = null;
    const tStart = performance.now();
    let assembled = "";
    let usage: any = undefined;

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
            if (!data) continue;
            let payload: any;
            try { payload = JSON.parse(data); } catch { continue; }
            const cands = payload?.candidates ?? [];
            for (const cand of cands) {
                const parts = cand?.content?.parts ?? [];
                for (const part of parts) {
                    if (typeof part?.text === "string") assembled += part.text;
                }
            }
            const um = payload?.usageMetadata;
            if (um) {
                usage = normalizeGoogleUsage(um) ?? usage;
                if (!usage) {
                    const prompt = um.promptTokenCount ?? 0;
                    const total = um.totalTokenCount ?? 0;
                    const completion = Math.max(0, total - prompt);
                    usage = { input_text_tokens: prompt, output_text_tokens: completion, total_tokens: total };
                }
            }
        }
    }

    const normalized = {
        object: "response",
        model,
        output: [{
            id: `msg_${crypto.randomUUID?.() ?? Date.now()}`,
            type: "message",
            status: "completed",
            role: "assistant",
            content: [{
                type: "output_text",
                text: assembled,
                annotations: [],
                logprobs: [],
            }],
        }],
        ...(usage ? { usage } : {}),
    };

    return { normalized, firstFrameMs };
}

export async function exec(args: ProviderExecuteArgs): Promise<AdapterResult> {
    const keyInfo = await resolveApiKey(args);
    const { canonical, adapterPayload } = buildAdapterPayload(ResponsesSchema, args.body, ["usage", "meta"]);
    const body: ResponsesRequest = {
        ...adapterPayload,
        model: args.providerModelSlug || (adapterPayload.model as string),
        stream: true,
    };

    const req = mapToGoogleRequest(body);
    const streamUrl = `${GOOGLE}/v1beta/models/${encodeURIComponent(body.model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(keyInfo.key)}`;
    const res = await fetch(streamUrl, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Accept": "text/event-stream",
        },
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

    const { normalized, firstFrameMs } = await bufferGoogleResponsesStream(res, body.model);
    if (firstFrameMs !== null) args.meta.latency_ms = firstFrameMs;

    if (normalized?.usage) {
        const priced = computeBill(normalized.usage, args.pricingCard);
        bill.cost_cents = priced.pricing.total_cents;
        bill.currency = priced.pricing.currency;
        bill.usage = priced;
    } else if (normalized?.usage !== undefined) {
        bill.usage = normalized.usage;
    }

    return {
        kind: "completed",
        upstream: new Response(JSON.stringify(normalized), {
            status: res.status,
            headers: { "Content-Type": "application/json" },
        }),
        bill,
        normalized,
        keySource: keyInfo.source,
        byokKeyId: keyInfo.byokId,
    };
}

