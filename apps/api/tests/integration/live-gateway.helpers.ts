import { parseSseFrames, readSseFrames, type ParsedSseFrame } from "../helpers/sse";
import { resolveGatewayApiKeyFromEnv } from "../helpers/gatewayKey";

export type GatewayModelProvider = {
    api_provider_id?: string;
    endpoint?: string;
    is_active_gateway?: boolean;
};

export type GatewayModel = {
    model_id?: string;
    endpoints?: string[];
    providers?: GatewayModelProvider[];
};

export type ModelsResponse = {
    total?: number;
    models?: GatewayModel[];
};

export type JsonResult = {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    contentType: string;
    text: string;
    json: any;
};

export type BinaryResult = {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    contentType: string;
    bytes: Buffer;
};

export type GatewayResult = JsonResult | BinaryResult;

export const GATEWAY_URL =
    process.env.GATEWAY_URL ??
    process.env.AI_STATS_BASE_URL ??
    process.env.OPENAI_GATEWAY_URL ??
    "http://127.0.0.1:8787/v1";
export const GATEWAY_API_KEY = resolveGatewayApiKeyFromEnv(process.env);
export const LIVE_RUN = (process.env.LIVE_RUN ?? "").trim() === "1";
export const INTERNAL_TEST_TOKEN =
    (process.env.LIVE_INTERNAL_TEST_TOKEN ?? process.env.GATEWAY_INTERNAL_TEST_TOKEN ?? "").trim();

export const TINY_PNG_DATA_URL =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const PROVIDER_ALIASES: Record<string, string> = {
    novita: "novitaai",
    "novita-ai": "novitaai",
    xai: "x-ai",
    "x-ai": "x-ai",
    google: "google-ai-studio",
    "google-ai-studio": "google-ai-studio",
    arcee: "arcee-ai",
    "arcee-ai": "arcee-ai",
};

let modelsCatalogPromise: Promise<GatewayModel[]> | null = null;

export function normalizeProviderId(providerId: string): string {
    const normalized = providerId.trim().toLowerCase();
    return PROVIDER_ALIASES[normalized] ?? normalized;
}

export function resolveGatewayUrl(pathname: string): string {
    const base = GATEWAY_URL.endsWith("/") ? GATEWAY_URL.slice(0, -1) : GATEWAY_URL;
    const suffix = pathname.startsWith("/") ? pathname : `/${pathname}`;
    return `${base}${suffix}`;
}

export function getHeaders(contentType = "application/json"): Record<string, string> {
    const headers: Record<string, string> = {
        Authorization: `Bearer ${GATEWAY_API_KEY}`,
    };
    if (contentType) headers["Content-Type"] = contentType;
    if (INTERNAL_TEST_TOKEN) headers["x-phaseo-internal-token"] = INTERNAL_TEST_TOKEN;
    return headers;
}

export function requireGatewayApiKey() {
    if (!GATEWAY_API_KEY) {
        throw new Error(
            "A gateway API key is required for live gateway tests. Set GATEWAY_API_KEY, AI_STATS_PERFORMANCE_TEST_KEY, AI_STATS_API_KEY, OPENAI_GATEWAY_API_KEY, PLAYGROUND_GATEWAY_KEY, or PLAYGROUND_KEY.",
        );
    }
}

function toHeadersObject(headers: Headers): Record<string, string> {
    return Object.fromEntries(Array.from(headers.entries()));
}

export async function parseGatewayResult(response: Response): Promise<GatewayResult> {
    const contentType = response.headers.get("content-type") ?? "";
    const headers = toHeadersObject(response.headers);
    if (contentType.includes("application/json")) {
        const text = await response.text();
        let json: any = null;
        try {
            json = text ? JSON.parse(text) : null;
        } catch {
            json = null;
        }
        return {
            status: response.status,
            statusText: response.statusText,
            headers,
            contentType,
            text,
            json,
        };
    }

    return {
        status: response.status,
        statusText: response.statusText,
        headers,
        contentType,
        bytes: Buffer.from(await response.arrayBuffer()),
    };
}

export async function postJson(pathname: string, body: Record<string, unknown>): Promise<GatewayResult> {
    const response = await fetch(resolveGatewayUrl(pathname), {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify(body),
    });
    return parseGatewayResult(response);
}

export async function getGateway(pathname: string): Promise<GatewayResult> {
    const response = await fetch(resolveGatewayUrl(pathname), {
        method: "GET",
        headers: {
            Authorization: `Bearer ${GATEWAY_API_KEY}`,
            ...(INTERNAL_TEST_TOKEN ? { "x-phaseo-internal-token": INTERNAL_TEST_TOKEN } : {}),
        },
    });
    return parseGatewayResult(response);
}

export async function postMultipart(pathname: string, buildForm: (form: FormData) => void): Promise<GatewayResult> {
    const form = new FormData();
    buildForm(form);
    const headers: Record<string, string> = {
        Authorization: `Bearer ${GATEWAY_API_KEY}`,
    };
    if (INTERNAL_TEST_TOKEN) headers["x-phaseo-internal-token"] = INTERNAL_TEST_TOKEN;
    const response = await fetch(resolveGatewayUrl(pathname), {
        method: "POST",
        headers,
        body: form,
    });
    return parseGatewayResult(response);
}

export async function postStream(pathname: string, body: Record<string, unknown>): Promise<ParsedSseFrame[]> {
    const response = await fetch(resolveGatewayUrl(pathname), {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify(body),
    });
    if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`Gateway ${response.status} ${response.statusText}: ${text}`);
    }
    return parseSseFrames(await readSseFrames(response));
}

export function assertOk(result: GatewayResult, context: string) {
    if (result.status < 200 || result.status >= 300) {
        const bodyText = "text" in result ? result.text : `<${result.contentType} ${result.bytes.length} bytes>`;
        throw new Error(`${context} failed (${result.status} ${result.statusText}): ${bodyText}`);
    }
}

export function usageFromPayload(payload: any): any {
    if (payload?.usage && typeof payload.usage === "object") return payload.usage;
    if (payload?.response?.usage && typeof payload.response.usage === "object") return payload.response.usage;
    return null;
}

export function usageTotal(usage: any): number {
    if (!usage || typeof usage !== "object") return 0;
    const direct = Number(usage.total_tokens ?? usage.totalTokens);
    if (Number.isFinite(direct) && direct > 0) return direct;
    const input = Number(
        usage.input_tokens ??
        usage.prompt_tokens ??
        usage.input_text_tokens ??
        usage.embedding_tokens ??
        0
    );
    const output = Number(
        usage.output_tokens ??
        usage.completion_tokens ??
        usage.output_text_tokens ??
        usage.output_audio_tokens ??
        0
    );
    return (Number.isFinite(input) ? input : 0) + (Number.isFinite(output) ? output : 0);
}

export function hasPricing(payload: any): boolean {
    if (typeof payload?.cost_nanos === "number" && payload.cost_nanos > 0) return true;
    return Array.isArray(payload?.pricing_lines) && payload.pricing_lines.length > 0;
}

export function extractResponseText(json: any): string {
    if (typeof json?.output_text === "string" && json.output_text.trim()) return json.output_text;
    const output = Array.isArray(json?.output) ? json.output : [];
    const textParts: string[] = [];
    for (const item of output) {
        if (item?.type !== "message") continue;
        for (const part of Array.isArray(item?.content) ? item.content : []) {
            if (typeof part?.text === "string") textParts.push(part.text);
        }
    }
    return textParts.join("\n");
}

export function extractChatText(json: any): string {
    const content = json?.choices?.[0]?.message?.content;
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
        return content
            .map((part: any) => String(part?.text ?? ""))
            .filter(Boolean)
            .join("\n");
    }
    return "";
}

export function extractMessagesText(json: any): string {
    const blocks = Array.isArray(json?.content) ? json.content : [];
    return blocks.map((block: any) => String(block?.text ?? block?.thinking ?? "")).join("\n");
}

export function parseJsonLoose(value: string): any | null {
    const text = String(value ?? "").trim();
    if (!text) return null;
    try {
        return JSON.parse(text);
    } catch {
        const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
        if (fenced?.[1]) {
            try {
                return JSON.parse(fenced[1].trim());
            } catch {
                return null;
            }
        }
        const objectMatch = text.match(/\{[\s\S]*\}/);
        if (objectMatch?.[0]) {
            try {
                return JSON.parse(objectMatch[0]);
            } catch {
                return null;
            }
        }
        return null;
    }
}

export function extractStreamText(frames: ParsedSseFrame[]): string {
    const chunks: string[] = [];
    for (const frame of frames) {
        const json = frame.json;
        if (!json || typeof json !== "object") continue;
        if (typeof json.delta === "string") chunks.push(json.delta);
        for (const choice of Array.isArray(json.choices) ? json.choices : []) {
            if (typeof choice?.delta?.content === "string") chunks.push(choice.delta.content);
            if (typeof choice?.message?.content === "string") chunks.push(choice.message.content);
        }
        if (json?.type === "content_block_delta") {
            const delta = json?.delta;
            if (typeof delta?.text === "string") chunks.push(delta.text);
            if (typeof delta?.partial_json === "string") chunks.push(delta.partial_json);
        }
        chunks.push(extractResponseText(json));
        chunks.push(extractMessagesText(json));
    }
    return chunks.join("");
}

export function assertDoneFrame(frames: ParsedSseFrame[]) {
    const hasDoneFrame = frames.some((frame) => frame.data === "[DONE]");
    const hasTerminalEvent = frames.some((frame) => {
        if (typeof frame.eventName === "string" && /(?:done|completed|stop)$/i.test(frame.eventName)) {
            return true;
        }
        const json = frame.json;
        if (!json || typeof json !== "object") return false;
        const type = String(json?.type ?? "").toLowerCase();
        if (type === "response.completed" || type === "response.done" || type === "message_stop") return true;
        const finishReason = json?.choices?.[0]?.finish_reason;
        return typeof finishReason === "string" && finishReason.length > 0;
    });
    if (!hasDoneFrame && !hasTerminalEvent) {
        throw new Error("Expected stream terminal marker ([DONE] or terminal event)");
    }
}

export function hasStreamToolSignal(frames: ParsedSseFrame[]): boolean {
    for (const frame of frames) {
        if (
            frame.eventName === "response.function_call_arguments.delta" ||
            frame.eventName === "response.function_call_arguments.done" ||
            frame.eventName === "response.output_item.added" ||
            frame.eventName === "response.output_item.done"
        ) {
            return true;
        }
        const json = frame.json;
        if (!json || typeof json !== "object") continue;
        if (json?.type === "content_block_start" && json?.content_block?.type === "tool_use") return true;
        for (const choice of Array.isArray(json.choices) ? json.choices : []) {
            const toolCalls = choice?.delta?.tool_calls ?? choice?.message?.tool_calls;
            if (Array.isArray(toolCalls) && toolCalls.length > 0) return true;
        }
    }
    return false;
}

export function streamUsagePayload(frames: ParsedSseFrame[]): any {
    for (let index = frames.length - 1; index >= 0; index -= 1) {
        const usage = usageFromPayload(frames[index]?.json);
        if (usage) return { usage };
    }
    return {};
}

export async function fetchModelsCatalog(): Promise<GatewayModel[]> {
    if (!modelsCatalogPromise) {
        modelsCatalogPromise = (async () => {
            const out: GatewayModel[] = [];
            let offset = 0;
            const limit = 250;
            let total = Number.POSITIVE_INFINITY;

            while (offset < total) {
                const url = new URL(resolveGatewayUrl("/models"));
                url.searchParams.set("limit", String(limit));
                url.searchParams.set("offset", String(offset));

                const response = await fetch(url.toString(), {
                    method: "GET",
                    headers: {
                        Authorization: `Bearer ${GATEWAY_API_KEY}`,
                        ...(INTERNAL_TEST_TOKEN ? { "x-phaseo-internal-token": INTERNAL_TEST_TOKEN } : {}),
                    },
                });
                const payload = (await response.json()) as ModelsResponse;
                if (!response.ok) {
                    throw new Error(`Failed to load /models (${response.status}): ${JSON.stringify(payload)}`);
                }

                const models = payload.models ?? [];
                out.push(...models);
                total = typeof payload.total === "number" ? payload.total : models.length;
                offset += limit;
                if (!models.length) break;
            }

            return out;
        })();
    }
    return modelsCatalogPromise;
}

export async function resolveModelFromCatalog(args: {
    preferredModelIds: string[];
    providerId?: string;
    endpoint?: string;
}): Promise<string> {
    const preferred = args.preferredModelIds.map((value) => value.toLowerCase());
    const models = await fetchModelsCatalog();
    const exactMatch = new Map<string, string>();

    for (const model of models) {
        const modelId = String(model.model_id ?? "").trim();
        if (!modelId) continue;
        const providers = Array.isArray(model.providers) ? model.providers : [];
        const endpoints = Array.isArray(model.endpoints) ? model.endpoints.map((value) => String(value)) : [];
        const providerOk = !args.providerId || providers.some((provider) =>
            normalizeProviderId(String(provider.api_provider_id ?? "")) === normalizeProviderId(args.providerId) &&
            provider.is_active_gateway !== false &&
            (!args.endpoint || String(provider.endpoint ?? "") === args.endpoint || endpoints.includes(args.endpoint))
        );
        if (!providerOk) continue;
        exactMatch.set(modelId.toLowerCase(), modelId);
    }

    for (const candidate of preferred) {
        const found = exactMatch.get(candidate);
        if (found) return found;
    }

    const first = Array.from(exactMatch.values()).sort((left, right) => left.localeCompare(right))[0];
    if (first) return first;
    return args.preferredModelIds[0];
}

export async function resolveProvidersForModel(args: {
    modelId: string;
    endpoint?: string;
}): Promise<string[]> {
    const target = args.modelId.toLowerCase();
    const models = await fetchModelsCatalog();
    for (const model of models) {
        const modelId = String(model.model_id ?? "").trim();
        if (modelId.toLowerCase() !== target) continue;
        const endpoints = Array.isArray(model.endpoints) ? model.endpoints.map((value) => String(value)) : [];
        const providers = Array.isArray(model.providers) ? model.providers : [];
        return providers
            .filter((provider) => {
                if (provider.is_active_gateway === false) return false;
                if (!args.endpoint) return true;
                return String(provider.endpoint ?? "") === args.endpoint || endpoints.includes(args.endpoint);
            })
            .map((provider) => normalizeProviderId(String(provider.api_provider_id ?? "")))
            .filter(Boolean);
    }
    return [];
}

export function createSilentWav(durationMs = 1100, sampleRate = 16000): {
    bytes: Buffer;
    mimeType: string;
    filename: string;
} {
    const sampleCount = Math.max(1, Math.floor((durationMs / 1000) * sampleRate));
    const channelCount = 1;
    const bitsPerSample = 16;
    const blockAlign = channelCount * (bitsPerSample / 8);
    const byteRate = sampleRate * blockAlign;
    const dataSize = sampleCount * blockAlign;
    const buffer = Buffer.alloc(44 + dataSize);
    buffer.write("RIFF", 0, "ascii");
    buffer.writeUInt32LE(36 + dataSize, 4);
    buffer.write("WAVE", 8, "ascii");
    buffer.write("fmt ", 12, "ascii");
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20);
    buffer.writeUInt16LE(channelCount, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(byteRate, 28);
    buffer.writeUInt16LE(blockAlign, 32);
    buffer.writeUInt16LE(bitsPerSample, 34);
    buffer.write("data", 36, "ascii");
    buffer.writeUInt32LE(dataSize, 40);
    return {
        bytes: buffer,
        mimeType: "audio/wav",
        filename: "sample.wav",
    };
}

export function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createOpenAiBatchJsonl(args: {
    model: string;
    count: number;
}): string {
    const lines: string[] = [];
    for (let index = 0; index < args.count; index += 1) {
        lines.push(JSON.stringify({
            custom_id: `req_${index + 1}`,
            method: "POST",
            url: "/v1/responses",
            body: {
                model: args.model,
                input: `Reply with exactly OK ${index + 1}`,
                max_output_tokens: 24,
            },
        }));
    }
    return `${lines.join("\n")}\n`;
}
