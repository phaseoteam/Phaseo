// Purpose: Provider adapter module.
// Why: Encapsulates provider-specific configuration and endpoint mapping.
// How: Exposes provider-specific helpers for routing and execution.

import type { ProviderExecuteArgs, AdapterResult } from "../../types";
import type {
    Endpoint,
    GatewayCompletionsResponse,
    GatewayUsage,
    GatewayCompletionsChoice,
} from "@core/types";
import { ChatCompletionsSchema, type ChatCompletionsRequest } from "@core/schemas";
import { buildAdapterPayload } from "../../utils";
import { getBindings } from "@/runtime/env";
import { computeBill } from "@pipeline/pricing/engine";
import { resolveProviderKey, type ResolvedKey } from "../../keys";
import { normalizeGoogleUsage } from "../usage";

/* ================== Config ================== */

const GOOGLE = "https://generativelanguage.googleapis.com";
const MAX_REMOTE_ASSET_BYTES = 5 * 1024 * 1024; // 5 MB guardrail for inlining assets

type GatewayToolCall = NonNullable<GatewayCompletionsChoice["message"]["tool_calls"]>[number];

type GeminiContentPart = {
    text?: string;
    inline_data?: { mime_type: string; data: string };
    file_data?: { mime_type?: string; file_uri: string };
    functionCall?: Record<string, unknown>;
    functionResponse?: Record<string, unknown>;
};

const AUDIO_MIME_MAP: Record<string, string> = {
    wav: "audio/wav",
    mp3: "audio/mpeg",
    flac: "audio/flac",
    m4a: "audio/m4a",
    ogg: "audio/ogg",
    pcm16: "audio/pcm",
    pcm24: "audio/pcm",
};

async function resolveApiKey(args: ProviderExecuteArgs): Promise<ResolvedKey> {
    return resolveProviderKey(args, () => getBindings().GOOGLE_AI_STUDIO_API_KEY);
}

function safeStringify(value: unknown): string {
    if (typeof value === "string") return value;
    if (value === undefined || value === null) return "";
    try {
        if (typeof value === "object") return JSON.stringify(value);
        return String(value);
    } catch {
        return String(value);
    }
}

function encodeBase64(buffer: ArrayBuffer): string {
    const globalBuffer = (globalThis as any)?.Buffer;
    if (globalBuffer) {
        return globalBuffer.from(buffer).toString("base64");
    }
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    let binary = "";
    for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    const btoaFn = (globalThis as any)?.btoa;
    if (typeof btoaFn === "function") {
        return btoaFn(binary);
    }
    throw new Error("No base64 encoder available");
}

function parseDataUrl(url: string): { mimeType: string; data: string } | null {
    const match = /^data:(.+?);base64,(.+)$/i.exec(url);
    if (!match) return null;
    const mimeType = match[1] || "application/octet-stream";
    const data = match[2] || "";
    return { mimeType, data };
}

async function inlineDataFromUrl(url?: string | null): Promise<{ mime_type: string; data: string } | null> {
    if (!url) return null;
    if (url.startsWith("data:")) {
        const parsed = parseDataUrl(url);
        return parsed ? { mime_type: parsed.mimeType, data: parsed.data } : null;
    }
    try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const contentLength = Number(res.headers.get("content-length") ?? "0");
        if (contentLength && contentLength > MAX_REMOTE_ASSET_BYTES) return null;
        const buffer = await res.arrayBuffer();
        if (buffer.byteLength > MAX_REMOTE_ASSET_BYTES) return null;
        return {
            mime_type: res.headers.get("content-type") || "application/octet-stream",
            data: encodeBase64(buffer),
        };
    } catch {
        return null;
    }
}

function audioPartFromInput(input: { data?: string; format?: string } | undefined | null): GeminiContentPart | null {
    if (!input?.data) return null;
    const mime = AUDIO_MIME_MAP[input.format ?? ""] || "audio/mpeg";
    return {
        inline_data: {
            mime_type: mime,
            data: input.data,
        },
    };
}

function messageContentToPlaintext(content: ChatCompletionsRequest["messages"][number]["content"]): string {
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
        return content
            .map((part) => {
                if (!part) return "";
                if (part.type === "text") return part.text ?? "";
                return safeStringify(part);
            })
            .filter(Boolean)
            .join("\n");
    }
    return safeStringify(content);
}

async function normalizeMessageContent(
    content: ChatCompletionsRequest["messages"][number]["content"]
): Promise<GeminiContentPart[]> {
    if (typeof content === "string" || content === undefined || content === null) {
        return [{ text: typeof content === "string" ? content : "" }];
    }
    if (!Array.isArray(content)) return [{ text: safeStringify(content) }];

    const parts: GeminiContentPart[] = [];
    for (const item of content) {
        if (!item) continue;
        switch (item.type) {
            case "text":
                parts.push({ text: item.text });
                break;
            case "image_url": {
                const inline = await inlineDataFromUrl(item.image_url?.url ?? null);
                if (inline) parts.push({ inline_data: inline });
                else if (item.image_url?.url) parts.push({ text: item.image_url.url });
                break;
            }
            case "input_audio": {
                const audioPart = audioPartFromInput(item.input_audio);
                if (audioPart) parts.push(audioPart);
                break;
            }
            case "input_video":
                if (item.video_url) parts.push({ text: `[video:${item.video_url}]` });
                break;
            case "tool_call":
                parts.push({ text: safeStringify(item) });
                break;
            default:
                parts.push({ text: safeStringify(item) });
                break;
        }
    }
    return parts.length ? parts : [{ text: "" }];
}

function parseFunctionArgs(raw: unknown): Record<string, unknown> {
    if (!raw) return {};
    if (typeof raw === "string") {
        try {
            return JSON.parse(raw);
        } catch {
            return { raw };
        }
    }
    if (typeof raw === "object") return raw as Record<string, unknown>;
    return { value: raw };
}

async function normalizeAssistantMessage(
    message: ChatCompletionsRequest["messages"][number],
    index: number
): Promise<GeminiContentPart[]> {
    const parts = await normalizeMessageContent(message.content);
    const toolCalls = Array.isArray((message as any).tool_calls) ? (message as any).tool_calls : [];
    toolCalls.forEach((call: any, toolIdx: number) => {
        const fn = call?.function ?? {};
        parts.push({
            functionCall: {
                name: fn.name ?? call?.id ?? `function_${index}_${toolIdx}`,
                args: parseFunctionArgs(fn.arguments),
            },
        });
    });
    return parts;
}

async function normalizeToolMessage(message: ChatCompletionsRequest["messages"][number]): Promise<GeminiContentPart[]> {
    const textPayload = messageContentToPlaintext(message.content);
    const name = (message as any).name ?? (message as any).tool_call_id ?? "tool";
    return [{
        functionResponse: {
            name,
            response: {
                name,
                content: [
                    {
                        role: "tool",
                        parts: [{ text: textPayload }],
                    },
                ],
            },
        },
    }];
}

const THINKING_BUDGET_MAP: Record<string, number> = {
    minimal: 64,
    low: 128,
    medium: 256,
    high: 512,
    xhigh: 1024,
};

function mapToolsPayload(body: ChatCompletionsRequest) {
    const toolDecls: any[] = [];
    for (const tool of body.tools ?? []) {
        if (!tool || tool.type !== "function") continue;
        const fn = (tool as any).function;
        if (!fn?.name) continue;
        toolDecls.push({
            name: fn.name,
            description: fn.description ?? "",
            parameters: fn.parameters ?? { type: "object" },
        });
    }
    if (!toolDecls.length) return null;

    const payload: { tools: any[]; toolConfig?: any } = {
        tools: [{ functionDeclarations: toolDecls }],
    };

    const choice = body.tool_choice;
    if (choice !== undefined) {
        const cfg: Record<string, unknown> = { mode: "AUTO" };
        if (typeof choice === "string") {
            if (choice === "none") cfg.mode = "NONE";
            else if (choice === "auto") cfg.mode = "AUTO";
            else {
                cfg.mode = "ANY";
                cfg.allowedFunctionNames = [choice];
            }
        } else if (choice && typeof choice === "object") {
            cfg.mode = "ANY";
            const name = (choice as any).function?.name;
            if (name) cfg.allowedFunctionNames = [name];
        }
        payload.toolConfig = { functionCallingConfig: cfg };
    }

    return payload;
}

/* ================== Helpers ================== */

type FinishReason = GatewayCompletionsChoice["finish_reason"];

function mapFinishReasonGoogle(raw: any): FinishReason {
    const v = typeof raw === "string" ? raw.toUpperCase() : null;
    switch (v) {
        case "STOP": return "stop";
        case "MAX_TOKENS": return "length";
        case "SAFETY":
        case "RECITATION": return "content_filter";
        case "OTHER": return "error";
        default: return "stop";
    }
}

// Thought-aware text extractor (we ALWAYS include reasoning)
function extractTextParts(parts: any[]) {
    const out: { text: string; type: "reasoning" | "assistant" }[] = [];
    for (const p of parts ?? []) {
        const t = typeof p?.text === "string" ? p.text : "";
        if (!t) continue;
        out.push({ text: t, type: p?.thought ? "reasoning" : "assistant" }); // thought parts exist when includeThoughts=true
    }
    return out;
}

function buildToolCallFromPart(part: any, idx: number): GatewayToolCall | null {
    const call = part?.functionCall;
    if (!call) return null;
    const name = call.name ?? `function_${idx}`;
    let args = "";
    if (typeof call.argsText === "string") args = call.argsText;
    else if (typeof call.args === "string") args = call.args;
    else if (call.args !== undefined) args = safeStringify(call.args);
    else if (call.arguments !== undefined) args = safeStringify(call.arguments);
    return {
        id: `${name}_${idx}`,
        type: "function",
        function: {
            name,
            arguments: args ?? "",
        },
    };
}

function applyFunctionCallDelta(
    call: any,
    store: GatewayToolCall[],
    map: Map<string, GatewayToolCall>
) {
    if (!call) return;
    const key = call.id ?? call.name ?? `function_${store.length}`;
    let existing = map.get(key);
    if (!existing) {
        existing = {
            id: `${key}_${store.length}`,
            type: "function",
            function: {
                name: call.name ?? key,
                arguments: "",
            },
        };
        map.set(key, existing);
        store.push(existing);
    }
    if (call.args !== undefined) {
        existing.function.arguments = typeof call.args === "string" ? call.args : safeStringify(call.args);
    } else if (call.arguments !== undefined) {
        existing.function.arguments = typeof call.arguments === "string" ? call.arguments : safeStringify(call.arguments);
    }
    if (typeof call.argsText === "string") {
        existing.function.arguments = (existing.function.arguments ?? "") + call.argsText;
    }
}

/* ================== Gateway -> Google request ================== */

async function mapGatewayToGoogleRequest(body: ChatCompletionsRequest) {
    const systemParts: string[] = [];
    const contents: Array<{ role: "user" | "model"; parts: GeminiContentPart[] }> = [];

    for (const message of body.messages ?? []) {
        if (message.role === "system") {
            const text = messageContentToPlaintext(message.content);
            if (text) systemParts.push(text);
            continue;
        }

        if (message.role === "assistant") {
            const parts = await normalizeAssistantMessage(message, contents.length);
            if (parts.length) contents.push({ role: "model", parts });
            continue;
        }

        if (message.role === "tool") {
            const parts = await normalizeToolMessage(message);
            if (parts.length) contents.push({ role: "user", parts });
            continue;
        }

        const parts = await normalizeMessageContent(message.content);
        contents.push({ role: "user", parts });
    }

    const req: any = { contents };

    if (systemParts.length) {
        req.systemInstruction = {
            role: "user",
            parts: [{ text: systemParts.join("\n\n") }],
        };
    }

    req.generationConfig ??= {};
    if (typeof body.max_output_tokens === "number") req.generationConfig.maxOutputTokens = body.max_output_tokens;
    if (typeof body.temperature === "number") req.generationConfig.temperature = body.temperature;
    if (typeof body.top_p === "number") req.generationConfig.topP = body.top_p;
    if (typeof body.top_k === "number") req.generationConfig.topK = body.top_k;
    if (typeof body.frequency_penalty === "number") req.generationConfig.frequencyPenalty = body.frequency_penalty;
    if (typeof body.presence_penalty === "number") req.generationConfig.presencePenalty = body.presence_penalty;
    if (typeof body.seed === "number") req.generationConfig.seed = body.seed;

    if (body.reasoning) {
        const effort = body.reasoning.effort ?? "medium";
        const budget = THINKING_BUDGET_MAP[effort] ?? THINKING_BUDGET_MAP.medium;
        req.generationConfig.thinkingConfig = { includeThoughts: true, thinkingBudget: budget };
    } else {
        req.generationConfig.thinkingConfig = { includeThoughts: true };
    }

    const responseFormat = body.response_format;
    if (
        (typeof responseFormat === "string" && responseFormat === "json_object") ||
        (typeof responseFormat === "object" && responseFormat?.type === "json_object")
    ) {
        req.generationConfig.responseMimeType = "application/json";
    }

    const tooling = mapToolsPayload(body);
    if (tooling?.tools) req.tools = tooling.tools;
    if (tooling?.toolConfig) req.toolConfig = tooling.toolConfig;

    if ((body as any).safetySettings) req.safetySettings = (body as any).safetySettings;
    return req;
}

function mapGoogleUsage(json: any): GatewayUsage | undefined {
    const responses = Array.isArray(json) ? json : [json];

    // Prefer detailed modality counts when present
    const mergedMeta: any = {
        promptTokensDetails: [],
        candidatesTokensDetails: [],
        cacheTokensDetails: [],
        toolUsePromptTokensDetails: [],
        promptTokenCount: 0,
        candidatesTokenCount: 0,
        totalTokenCount: 0,
        thoughtsTokenCount: 0,
        cachedContentTokenCount: 0,
        toolUsePromptTokenCount: 0,
    };

    for (const r of responses) {
        const um = r?.usageMetadata;
        if (!um) continue;
        mergedMeta.promptTokenCount += um.promptTokenCount ?? 0;
        mergedMeta.candidatesTokenCount += um.candidatesTokenCount ?? 0;
        mergedMeta.totalTokenCount += um.totalTokenCount ?? 0;
        mergedMeta.thoughtsTokenCount += um.thoughtsTokenCount ?? 0;
        mergedMeta.cachedContentTokenCount += um.cachedContentTokenCount ?? 0;
        mergedMeta.toolUsePromptTokenCount += um.toolUsePromptTokenCount ?? 0;
        if (Array.isArray(um.promptTokensDetails)) mergedMeta.promptTokensDetails.push(...um.promptTokensDetails);
        if (Array.isArray(um.candidatesTokensDetails)) mergedMeta.candidatesTokensDetails.push(...um.candidatesTokensDetails);
        if (Array.isArray(um.cacheTokensDetails)) mergedMeta.cacheTokensDetails.push(...um.cacheTokensDetails);
        if (Array.isArray(um.toolUsePromptTokensDetails)) mergedMeta.toolUsePromptTokensDetails.push(...um.toolUsePromptTokensDetails);
    }

    const usage = normalizeGoogleUsage(mergedMeta);
    if (usage) {
        // ensure total_tokens filled if provided
        if (mergedMeta.totalTokenCount && !usage.total_tokens) usage.total_tokens = mergedMeta.totalTokenCount;
        return usage as GatewayUsage;
    }
    return undefined;
}

function mapGoogleToGatewayChat(model: string, json: any, meta: { requestId: string; endpoint: Endpoint }): GatewayCompletionsResponse {
    // Gather both reasoning + assistant into separate choices
    const responses = Array.isArray(json) ? json : [json];
    let finish: FinishReason = "stop";
    const reasoningBuf: string[] = [];
    const assistantBuf: string[] = [];
    const toolCalls: GatewayToolCall[] = [];
    let nativeId: string | null = responses[0]?.responseId ?? null;

    for (const r of responses) {
        nativeId = r?.responseId ?? nativeId;
        const cands = r?.candidates ?? [];
        for (const cand of cands) {
            const parts = cand?.content?.parts ?? [];
            for (const part of parts) {
                const maybeTool = buildToolCallFromPart(part, toolCalls.length);
                if (maybeTool) {
                    toolCalls.push(maybeTool);
                    continue;
                }
                for (const { text, type } of extractTextParts([part])) {
                    (type === "reasoning" ? reasoningBuf : assistantBuf).push(text);
                }
            }
            if (cand?.finishReason) finish = mapFinishReasonGoogle(cand.finishReason);
        }
        if (r?.promptFeedback?.blockReason) finish = "content_filter"; // prompt blocked
    }

    const finalFinish: FinishReason = toolCalls.length ? "tool_calls" : finish;

    const usage = mapGoogleUsage(json);
    const choices: GatewayCompletionsChoice[] = [];
    let idx = 0;
    if (reasoningBuf.length) choices.push({ index: idx++, message: { role: "assistant", content: reasoningBuf.join("") }, finish_reason: finalFinish, reasoning: true });
    choices.push({
        index: idx++,
        message: {
            role: "assistant",
            content: assistantBuf.join(""),
            ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
        },
        finish_reason: finalFinish,
        reasoning: false,
    });

    return {
        id: meta.requestId,
        nativeResponseId: nativeId ?? "",
        created: Math.floor(Date.now() / 1000),
        model,
        provider: "google-ai-studio",
        choices,
        ...(usage ? { usage } : {}),
    };
}


/* ================== Streaming unifier (SSE) ================== */

function unifyGoogleStreamToSnapshot(
    upstream: Response,
    opts: { model: string; requestId: string; onFirstFrame?: (ms: number) => void; }
): Response {
    const reader = upstream.body?.getReader();
    const dec = new TextDecoder();
    const enc = new TextEncoder();

    let created = Math.floor(Date.now() / 1000);
    let nativeId: string | null = null;
    let lastFinish: FinishReason = "stop";
    let aggPrompt = 0, aggTotal = 0, aggThoughts = 0;
    const tStart = performance.now();
    let usage: GatewayUsage | undefined;

    type Seg = { type: "assistant" | "reasoning"; text: string };
    const segs: Seg[] = [];
    let currentType: Seg["type"] | null = null;
    const toolCalls: GatewayToolCall[] = [];
    const toolCallMap = new Map<string, GatewayToolCall>();

    const ts = new TransformStream();
    const writer = ts.writable.getWriter();
    const sse = (obj: any) => enc.encode(`data: ${JSON.stringify(obj)}\n\n`);

    async function pushDelta(t: Seg["type"], delta: string) {
        if (!delta) return;
        const frame = {
            nativeResponseId: nativeId,
            object: "chat.completion.chunk",
            created,
            model: opts.model,
            provider: "google-ai-studio",
            choices: [{ index: 0, delta: { role: "assistant", content: delta }, finish_reason: null, native_finish_reason: null }]
        };
        if (currentType === t && segs.length) segs[segs.length - 1].text += delta;
        else { segs.push({ type: t, text: delta }); currentType = t; }
        await writer.write(sse(frame));
    }

    (async () => {
        if (!reader) { try { await writer.close(); } catch { } return; }
        let buf = "";

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buf += dec.decode(value, { stream: true });
            if (opts.onFirstFrame) {
                opts.onFirstFrame(Math.round(performance.now() - tStart));
                opts.onFirstFrame = undefined; // fire once
            }

            const frames = buf.split(/\n\n/);
            buf = frames.pop() ?? "";

            for (const raw of frames) {
                // gather data lines only
                let data = "";
                for (const line of raw.split("\n")) {
                    const l = line.replace(/\r$/, "");
                    if (l.startsWith("data:")) data += l.slice(5).trimStart();
                }
                if (!data) continue;

                let payload: any; try { payload = JSON.parse(data); } catch { continue; }

                nativeId = payload?.responseId ?? payload?.id ?? nativeId;

                // Blocked prompt? Treat as content_filter and stop
                const block = payload?.promptFeedback?.blockReason;
                if (block) { lastFinish = "content_filter"; continue; }

                // usage aggregation (fields documented under UsageMetadata)
                const um = payload?.usageMetadata;
                if (um) {
                    aggPrompt = um.promptTokenCount ?? aggPrompt;
                    aggTotal = um.totalTokenCount ?? aggTotal;
                    aggThoughts = um.thoughtsTokenCount ?? aggThoughts;
                    if (!usage) {
                        usage = normalizeGoogleUsage(um) as any;
                    }
                }

                const cands = payload?.candidates ?? [];
                for (const cand of cands) {
                    const parts = cand?.content?.parts ?? [];
                    for (const part of parts) {
                        if (part?.functionCall) {
                            applyFunctionCallDelta(part.functionCall, toolCalls, toolCallMap);
                            continue;
                        }
                        for (const it of extractTextParts([part])) await pushDelta(it.type, it.text);
                    }
                    if (cand?.finishReason) {
                        // Google enums: STOP, MAX_TOKENS, SAFETY, RECITATION, OTHER  map to our reasons
                        lastFinish = mapFinishReasonGoogle(cand.finishReason);
                    }
                }
            }
        }

        const completion = Math.max(0, (aggTotal || 0) - (aggPrompt || 0)); // base completion excluding thoughts
        usage = (aggPrompt || aggTotal)
            ? { input_text_tokens: aggPrompt, output_text_tokens: completion, total_tokens: aggTotal }
            : undefined;
        if (usage && typeof aggThoughts === "number" && aggThoughts > 0) usage.reasoning_tokens = aggThoughts;

        const reasoningJoined = segs.filter(s => s.type === "reasoning").map(s => s.text).join("");
        const assistantJoined = segs.filter(s => s.type === "assistant").map(s => s.text).join("");

        const choices: any[] = [];
        let i = 0;
        const finalFinish = toolCalls.length ? "tool_calls" : lastFinish ?? "stop";
        if (reasoningJoined) choices.push({
            index: i++, message: { role: "assistant", content: reasoningJoined }, finish_reason: finalFinish, native_finish_reason: finalFinish, reasoning: true
        });
        choices.push({
            index: i++,
            message: { role: "assistant", content: assistantJoined, ...(toolCalls.length ? { tool_calls: toolCalls } : {}) },
            finish_reason: finalFinish,
            native_finish_reason: finalFinish,
            reasoning: false
        });

        await writer.write(sse({
            nativeResponseId: nativeId,
            object: "chat.completion",
            created,
            model: opts.model,
            provider: "google-ai-studio",
            choices,
            ...(usage ? { usage } : {}),
        }));

        try { await writer.close(); } catch { }
    })().catch(err => console.error("unifyGoogleStreamToSnapshot error:", err));

    const headers = new Headers();
    headers.set("Content-Type", "text/event-stream");
    headers.set("Cache-Control", "no-store");
    headers.set("x-gateway-request-id", opts.requestId);
    headers.set("x-gateway-stream-shape", "delta");
    return new Response(ts.readable, { status: upstream.status, headers });
}

async function bufferGoogleStreamToSnapshot(
    upstream: Response,
    opts: { model: string; requestId: string; }
) {
    const reader = upstream.body?.getReader();
    const dec = new TextDecoder();

    let buf = "";
    let nativeId: string | null = null;
    let lastFinish: FinishReason = "stop";
    let aggPrompt = 0, aggTotal = 0, aggThoughts = 0;
    const tStart = performance.now();
    let firstFrameMs: number | null = null;

    type Seg = { type: "assistant" | "reasoning"; text: string };
    const segs: Seg[] = [];
    const toolCalls: GatewayToolCall[] = [];
    const toolCallMap = new Map<string, GatewayToolCall>();

    if (!reader) throw new Error("google_stream_missing_body");

    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (firstFrameMs === null) {
            firstFrameMs = Math.round(performance.now() - tStart);
        }
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

            nativeId = payload?.responseId ?? payload?.id ?? nativeId;

            const block = payload?.promptFeedback?.blockReason;
            if (block) { lastFinish = "content_filter"; continue; }

            const um = payload?.usageMetadata;
            if (um) {
                aggPrompt = um.promptTokenCount ?? aggPrompt;
                aggTotal = um.totalTokenCount ?? aggTotal;
                aggThoughts = um.thoughtsTokenCount ?? aggThoughts;
            }

            const cands = payload?.candidates ?? [];
            for (const cand of cands) {
                const parts = cand?.content?.parts ?? [];
                for (const part of parts) {
                    if (part?.functionCall) {
                        applyFunctionCallDelta(part.functionCall, toolCalls, toolCallMap);
                        continue;
                    }
                    for (const it of extractTextParts([part])) {
                        segs.push({ type: it.type, text: it.text });
                    }
                }
                if (cand?.finishReason) {
                    lastFinish = mapFinishReasonGoogle(cand.finishReason);
                }
            }
        }
    }

    const completion = Math.max(0, (aggTotal || 0) - (aggPrompt || 0));
    const usage: any = (aggPrompt || aggTotal)
        ? { input_text_tokens: aggPrompt, output_text_tokens: completion, total_tokens: aggTotal }
        : undefined;
    if (usage && typeof aggThoughts === "number" && aggThoughts > 0) usage.reasoning_tokens = aggThoughts;

    const reasoningJoined = segs.filter(s => s.type === "reasoning").map(s => s.text).join("");
    const assistantJoined = segs.filter(s => s.type === "assistant").map(s => s.text).join("");

    const choices: any[] = [];
    let i = 0;
    const finalFinish = toolCalls.length ? "tool_calls" : lastFinish ?? "stop";
    if (reasoningJoined) choices.push({
        index: i++, message: { role: "assistant", content: reasoningJoined }, finish_reason: finalFinish, native_finish_reason: finalFinish, reasoning: true
    });
    choices.push({
        index: i++,
        message: {
            role: "assistant",
            content: assistantJoined,
            ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
        },
        finish_reason: finalFinish,
        native_finish_reason: finalFinish,
        reasoning: false
    });

    const normalized: GatewayCompletionsResponse = {
        id: opts.requestId,
        nativeResponseId: nativeId ?? undefined,
        created: Math.floor(Date.now() / 1000),
        model: opts.model,
        provider: "google-ai-studio",
        choices,
        ...(usage ? { usage } : {}),
    };

    return { normalized, firstFrameMs };
}
/* ================== Execute ================== */

export async function exec(args: ProviderExecuteArgs): Promise<AdapterResult> {
    const keyInfo = await resolveApiKey(args);
    const key = keyInfo.key;
    const { canonical, adapterPayload } = buildAdapterPayload(ChatCompletionsSchema, args.body, ["usage", "meta"]);
    const modifiedBody: ChatCompletionsRequest = {
        ...adapterPayload,
        model: args.providerModelSlug || args.model,
        stream: args.stream ?? canonical.stream ?? false,
    };
    const req = await mapGatewayToGoogleRequest(modifiedBody);

    const model = args.model;
    const providerModel = args.providerModelSlug || args.model;
    const urlBase = `${GOOGLE}/v1beta/models/${encodeURIComponent(providerModel)}`;
    const endpoint = `:streamGenerateContent`;

    const url = `${urlBase}${endpoint}?alt=sse&key=${encodeURIComponent(key)}`;

    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
    };

    const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(req) });

    const bill = {
        cost_cents: 0,
        currency: "USD" as const,
        usage: undefined as any,
        upstream_id: res.headers.get("x-request-id"),
        finish_reason: null,
    };

    if (args.stream) {
        const unified = unifyGoogleStreamToSnapshot(res, {
            model: args.model,
            requestId: args.meta.requestId,
            onFirstFrame: (ms) => { args.meta.latency_ms = ms; },
        });
        return { kind: "stream", upstream: unified, bill, keySource: keyInfo.source, byokKeyId: keyInfo.byokId };
    }

    const buffered = await bufferGoogleStreamToSnapshot(res, { model: args.model, requestId: args.meta.requestId });
    if (buffered.firstFrameMs !== null) args.meta.latency_ms = buffered.firstFrameMs;

    if (buffered.normalized?.usage) {
        const pricedUsage = computeBill(buffered.normalized.usage, args.pricingCard);
        bill.cost_cents = pricedUsage.pricing.total_cents;
        bill.currency = pricedUsage.pricing.currency;
        bill.usage = pricedUsage;
    } else {
        bill.usage = buffered.normalized?.usage;
    }

    return {
        kind: "completed",
        upstream: new Response(JSON.stringify(buffered.normalized), {
            status: res.status,
            headers: { "Content-Type": "application/json" },
        }),
        bill,
        normalized: buffered.normalized,
        keySource: keyInfo.source,
        byokKeyId: keyInfo.byokId,
    };
}





