import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Journal, LLMock, flattenHeaders, type Mountable, type RecordConfig } from "@copilotkit/aimock";
import { decodeProtocol, encodeProtocol } from "@protocols/index";
import { resolveProviderExecutor } from "@executors/index";
import { OPENAI_COMPAT_CONFIG } from "@providers/openai-compatible/config";
import { resetHealthStateForTests } from "@pipeline/execute/health";
import { setupRuntimeFromEnv, teardownTestRuntime } from "../helpers/runtime";
import type { ExecutorCompletedResult, ExecutorResult } from "@executors/types";
import type { Endpoint } from "@core/types";
import type { IRChatRequest, IREmbeddingsRequest } from "@core/ir";
import type { GatewayBindings } from "@/runtime/env";
import { installLoopbackOnlyFetchGuard } from "../helpers/network-guard";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_ROOT = path.join(__dirname, "fixtures");

const AIMOCK_PORT = Number(process.env.AIMOCK_PORT ?? "4010");
const AIMOCK_HOST = process.env.AIMOCK_HOST ?? "127.0.0.1";
const AIMOCK_BASE_URL = process.env.AIMOCK_URL ?? `http://${AIMOCK_HOST}:${AIMOCK_PORT}`;
const WORKSPACE_ID = "ws_aimock_ci";

type TextProtocol = "openai.chat.completions" | "openai.responses" | "anthropic.messages";
type AimockCapability =
    | "image.generate"
    | "audio.speech"
    | "audio.transcription"
    | "video.generate"
    | "moderations"
    | "rerank";

let aimock: LLMock | null = null;
let restoreAimockFetch: (() => void) | null = null;

function readIncomingBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        req.on("data", (chunk) => {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
        req.on("error", reject);
    });
}

function createOpenAIRerankMount(): Mountable {
    let journal: Journal | null = null;

    return {
        setJournal(nextJournal) {
            journal = nextJournal;
        },
        async handleRequest(req: IncomingMessage, res: ServerResponse, pathname: string) {
            if (pathname !== "/") return false;

            const raw = await readIncomingBody(req);
            let body: Record<string, unknown>;
            try {
                body = JSON.parse(raw) as Record<string, unknown>;
            } catch {
                const headers = flattenHeaders(req.headers as Record<string, string | string[] | undefined>);
                journal?.add({
                    method: req.method ?? "POST",
                    path: req.url ?? pathname,
                    headers,
                    body: null,
                    service: "rerank",
                    response: {
                        status: 400,
                        fixture: null,
                    },
                });
                res.writeHead(400, { "Content-Type": "application/json" });
                res.end(JSON.stringify({
                    error: {
                        message: "Malformed JSON",
                        type: "invalid_request_error",
                        code: "invalid_json",
                    },
                }));
                return true;
            }

            const headers = flattenHeaders(req.headers as Record<string, string | string[] | undefined>);
            const query = typeof body.query === "string" ? body.query : "";
            const documents = Array.isArray(body.documents) ? body.documents : [];
            const results = query.includes("[aimock-rerank]")
                ? [
                    { index: 1, relevance_score: 0.92 },
                    { index: 0, relevance_score: 0.41 },
                ]
                : [];

            journal?.add({
                method: req.method ?? "POST",
                path: req.url ?? pathname,
                headers,
                body: null,
                service: "rerank",
                response: {
                    status: 200,
                    fixture: null,
                },
            });

            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({
                id: "rerank_aimock_123",
                model: body.model ?? "rerank-v1",
                results: results.map((entry) => ({
                    ...entry,
                    document: {
                        text: String(documents[entry.index] ?? ""),
                    },
                })),
            }));
            return true;
        },
    };
}

function createOpenAIChatMount(): Mountable {
    let journal: Journal | null = null;
    return {
        setJournal(nextJournal) { journal = nextJournal; },
        async handleRequest(req: IncomingMessage, res: ServerResponse, pathname: string) {
            if (!["/chat/completions", "/responses"].includes(pathname) || req.method !== "POST") return false;
            const body = JSON.parse(await readIncomingBody(req)) as Record<string, any>;
            const headers = flattenHeaders(req.headers as Record<string, string | string[] | undefined>);
            const serialized = JSON.stringify(body);
            const prompt = serialized.includes("[aimock-tool] weather")
                ? "[aimock-tool] weather"
                : serialized.includes("[aimock-structured] person")
                    ? "[aimock-structured] person"
                    : "[aimock-chat] hello";
            const toolDefinition = body.tools?.[0];
            const tool = prompt === "[aimock-tool] weather" ? (toolDefinition?.function ?? toolDefinition) : undefined;
            const content = prompt === "[aimock-structured] person"
                ? JSON.stringify({ name: "Ava", city: "London" })
                : "Hello from AIMock via Phaseo.";
            const toolCalls = tool ? [{ id: "call_aimock_weather", type: "function", function: { name: tool.name, arguments: JSON.stringify({ city: "London", unit: "celsius" }) } }] : undefined;
            const response = {
                id: "chatcmpl_cross_provider",
                object: "chat.completion",
                created: 1,
                model: body.model,
                choices: [{ index: 0, message: { role: "assistant", content: tool ? null : content, ...(toolCalls ? { tool_calls: toolCalls } : {}) }, finish_reason: tool ? "tool_calls" : "stop" }],
                usage: { prompt_tokens: 4, completion_tokens: 3, total_tokens: 7 },
            };
            journal?.add({ method: req.method, path: req.url ?? pathname, headers, body, service: "chat", response: { status: 200, fixture: null } });
            if (pathname === "/responses") {
                const responsesPayload = {
                    id: "resp_cross_provider",
                    object: "response",
                    created_at: 1,
                    status: "completed",
                    model: body.model,
                    output: tool ? [{ id: "fc_cross_provider", type: "function_call", status: "completed", call_id: "call_aimock_weather", name: tool.name, arguments: JSON.stringify({ city: "London", unit: "celsius" }) }] : [{ id: "msg_cross_provider", type: "message", status: "completed", role: "assistant", content: [{ type: "output_text", text: content, annotations: [] }] }],
                    usage: { input_tokens: 4, output_tokens: 3, total_tokens: 7 },
                };
                if (!body.stream) {
                    res.writeHead(200, { "Content-Type": "application/json" });
                    res.end(JSON.stringify(responsesPayload));
                    return true;
                }
                res.writeHead(200, { "Content-Type": "text/event-stream" });
                res.end(`event: response.completed\ndata: ${JSON.stringify({ type: "response.completed", response: responsesPayload })}\n\ndata: [DONE]\n\n`);
                return true;
            }
            if (!body.stream) {
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify(response));
                return true;
            }
            const chunk = { ...response, object: "chat.completion.chunk", choices: [{ index: 0, delta: { role: "assistant", ...(toolCalls ? { tool_calls: toolCalls.map((call) => ({ ...call, index: 0 })) } : { content }) }, finish_reason: null }] };
            const done = { ...response, object: "chat.completion.chunk", choices: [{ index: 0, delta: {}, finish_reason: tool ? "tool_calls" : "stop" }] };
            res.writeHead(200, { "Content-Type": "text/event-stream" });
            res.end(`data: ${JSON.stringify(chunk)}\n\ndata: ${JSON.stringify(done)}\n\ndata: [DONE]\n\n`);
            return true;
        },
    };
}

function createGoogleInteractionsMount(): Mountable {
    let journal: Journal | null = null;
    return {
        setJournal(nextJournal) { journal = nextJournal; },
        async handleRequest(req: IncomingMessage, res: ServerResponse, pathname: string) {
            if (pathname !== "/" || req.method !== "POST") return false;
            const body = JSON.parse(await readIncomingBody(req)) as Record<string, any>;
            const headers = flattenHeaders(req.headers as Record<string, string | string[] | undefined>);
            const serialized = JSON.stringify(body);
            const prompt = serialized.includes("[aimock-tool] weather")
                ? "[aimock-tool] weather"
                : serialized.includes("[aimock-structured] person")
                    ? "[aimock-structured] person"
                    : "[aimock-chat] hello";
            const tool = prompt === "[aimock-tool] weather" ? body.tools?.[0] : undefined;
            const content = prompt === "[aimock-structured] person"
                ? JSON.stringify({ name: "Ava", city: "London" })
                : "Hello from AIMock via Phaseo.";
            const payload = {
                id: "interaction_cross_provider",
                status: "completed",
                model: body.model,
                steps: tool
                    ? [{
                        type: "function_call",
                        id: "call_aimock_weather",
                        name: tool.name,
                        arguments: { city: "London", unit: "celsius" },
                    }]
                    : [{
                        type: "model_output",
                        content: [{ type: "text", text: content }],
                    }],
                usage: {
                    total_input_tokens: 4,
                    total_output_tokens: 3,
                    total_tokens: 7,
                },
            };
            journal?.add({ method: req.method, path: req.url ?? pathname, headers, body, service: "chat", response: { status: 200, fixture: null } });
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(payload));
            return true;
        },
    };
}

function createAnthropicMessagesMount(): Mountable {
    let journal: Journal | null = null;
    return {
        setJournal(nextJournal) { journal = nextJournal; },
        async handleRequest(req: IncomingMessage, res: ServerResponse, pathname: string) {
            if (!pathname.endsWith(":rawPredict") || req.method !== "POST") return false;
            const body = JSON.parse(await readIncomingBody(req)) as Record<string, any>;
            const headers = flattenHeaders(req.headers as Record<string, string | string[] | undefined>);
            const serialized = JSON.stringify(body);
            const tool = serialized.includes("[aimock-tool] weather") ? body.tools?.[0] : undefined;
            const text = serialized.includes("[aimock-structured] person")
                ? JSON.stringify({ name: "Ava", city: "London" })
                : "Hello from AIMock via Phaseo.";
            const block = tool
                ? { type: "tool_use", id: "toolu_aimock_weather", name: tool.name, input: {} }
                : { type: "text", text: "" };
            const events = [
                { type: "message_start", message: { id: "msg_vertex_aimock", type: "message", role: "assistant", model: body.model, content: [], stop_reason: null, usage: { input_tokens: 4, output_tokens: 0 } } },
                { type: "content_block_start", index: 0, content_block: block },
                tool
                    ? { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: JSON.stringify({ city: "London", unit: "celsius" }) } }
                    : { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } },
                { type: "content_block_stop", index: 0 },
                { type: "message_delta", delta: { stop_reason: tool ? "tool_use" : "end_turn", stop_sequence: null }, usage: { output_tokens: 3 } },
                { type: "message_stop" },
            ];
            journal?.add({ method: req.method, path: req.url ?? pathname, headers, body, service: "chat", response: { status: 200, fixture: null } });
            res.writeHead(200, { "Content-Type": "text/event-stream" });
            res.end(events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(""));
            return true;
        },
    };
}

function mimeTypeForSpeechCodec(codec: unknown): string {
    switch (String(codec ?? "").trim().toLowerCase()) {
        case "wav":
            return "audio/wav";
        case "pcm":
            return "audio/pcm";
        case "mulaw":
        case "alaw":
            return "audio/basic";
        case "mp3":
        default:
            return "audio/mpeg";
    }
}

function createXAiTtsMount(): Mountable {
    let journal: Journal | null = null;

    return {
        setJournal(nextJournal) {
            journal = nextJournal;
        },
        async handleRequest(req: IncomingMessage, res: ServerResponse, pathname: string) {
            if (pathname !== "/") return false;

            const raw = await readIncomingBody(req);
            const headers = flattenHeaders(req.headers as Record<string, string | string[] | undefined>);

            let body: Record<string, unknown>;
            try {
                body = JSON.parse(raw) as Record<string, unknown>;
            } catch {
                journal?.add({
                    method: req.method ?? "POST",
                    path: req.url ?? pathname,
                    headers,
                    body: null,
                    service: "speech",
                    response: {
                        status: 400,
                        fixture: null,
                    },
                });
                res.writeHead(400, { "Content-Type": "application/json" });
                res.end(JSON.stringify({
                    error: {
                        message: "Malformed JSON",
                        type: "invalid_request_error",
                        code: "invalid_json",
                    },
                }));
                return true;
            }

            const text = typeof body.text === "string" ? body.text : "";
            const codec = (body.output_format as Record<string, unknown> | undefined)?.codec;
            const mimeType = mimeTypeForSpeechCodec(codec);
            const matched = text.includes("[aimock-speech]");

            journal?.add({
                method: req.method ?? "POST",
                path: req.url ?? pathname,
                headers,
                body: null,
                service: "speech",
                response: {
                    status: matched ? 200 : 404,
                    fixture: null,
                },
            });

            if (!matched) {
                res.writeHead(404, { "Content-Type": "application/json" });
                res.end(JSON.stringify({
                    error: {
                        message: "No AIMock TTS fixture matched request.",
                        type: "not_found_error",
                        code: "aimock_tts_not_found",
                    },
                }));
                return true;
            }

            res.writeHead(200, { "Content-Type": mimeType });
            res.end(Buffer.from("AIMOCK_TTS_AUDIO"));
            return true;
        },
    };
}

function envValue(name: string, fallback: string): string {
    const value = process.env[name];
    if (!value) return fallback;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : fallback;
}

function buildRecordConfig(): RecordConfig | undefined {
    if ((process.env.AISTATS_AIMOCK_RECORD ?? "0").trim() !== "1") return undefined;
    return {
        providers: {
            openai: envValue("AISTATS_AIMOCK_RECORD_OPENAI_URL", "https://api.openai.com"),
            anthropic: envValue("AISTATS_AIMOCK_RECORD_ANTHROPIC_URL", "https://api.anthropic.com"),
            gemini: envValue("AISTATS_AIMOCK_RECORD_GEMINI_URL", "https://generativelanguage.googleapis.com"),
        },
        fixturePath: path.join(FIXTURES_ROOT, "recorded"),
        proxyOnly: (process.env.AISTATS_AIMOCK_PROXY_ONLY ?? "0").trim() === "1",
    };
}

function buildAimockBindings(): Partial<GatewayBindings> {
    const bindings: Record<string, string | KVNamespace> = {
        SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
        OPENAI_API_KEY: envValue("OPENAI_API_KEY", "test-openai-key"),
        OPENAI_BASE_URL: AIMOCK_BASE_URL,
        X_AI_API_KEY: envValue("X_AI_API_KEY", "test-xai-key"),
        XAI_BASE_URL: AIMOCK_BASE_URL,
        ANTHROPIC_API_KEY: envValue("ANTHROPIC_API_KEY", "test-anthropic-key"),
        ANTHROPIC_BASE_URL: AIMOCK_BASE_URL,
        GOOGLE_AI_STUDIO_API_KEY: envValue("GOOGLE_AI_STUDIO_API_KEY", "test-google-key"),
        GOOGLE_AI_STUDIO_BASE_URL: AIMOCK_BASE_URL,
        GOOGLE_BASE_URL: AIMOCK_BASE_URL,
        GOOGLE_VERTEX_PROJECT: "aimock-project",
        GOOGLE_VERTEX_LOCATION: "us-east5",
        NODE_ENV: "test",
    };

    for (const config of Object.values(OPENAI_COMPAT_CONFIG)) {
        if (config.apiKeyEnv) {
            bindings[config.apiKeyEnv] = envValue(config.apiKeyEnv, `test-${config.apiKeyEnv.toLowerCase()}`);
        }
        if (config.baseUrlEnv) {
            bindings[config.baseUrlEnv] = AIMOCK_BASE_URL;
        }
    }

    return bindings as Partial<GatewayBindings>;
}

function endpointForProtocol(protocol: TextProtocol): Endpoint {
    if (protocol === "openai.responses") return "responses";
    if (protocol === "anthropic.messages") return "messages";
    return "chat.completions";
}

function endpointForCapability(capability: AimockCapability): Endpoint {
    switch (capability) {
        case "image.generate":
            return "images.generations";
        case "audio.speech":
            return "audio.speech";
        case "audio.transcription":
            return "audio.transcription";
        case "video.generate":
            return "video.generation";
        case "moderations":
            return "moderations";
        case "rerank":
            return "rerank";
    }
}

function defaultModelForProvider(providerId: string): string {
    if (providerId === "anthropic") return "aimock-anthropic-model";
    if (providerId === "google-ai-studio") return "gemini-2.5-flash";
    return "aimock-openai-model";
}

function pricingCard(providerId: string, model: string, endpoint: Endpoint) {
    return {
        provider: providerId,
        model,
        endpoint,
        effective_from: null,
        effective_to: null,
        currency: "USD",
        version: null,
        rules: [],
    };
}

export function isScenarioEnabled(id: string): boolean {
    const raw = process.env.AISTATS_AIMOCK_SCENARIOS ?? "";
    const requested = raw.split(/[\s,]+/).map((value) => value.trim()).filter(Boolean);
    if (!requested.length) return true;
    return requested.includes(id);
}

export function isProviderEnabled(providerId: string): boolean {
    const raw = process.env.AISTATS_AIMOCK_PROVIDERS ?? "";
    const requested = raw.split(/[\s,]+/).map((value) => value.trim()).filter(Boolean);
    if (!requested.length) return true;
    return requested.includes(providerId);
}

export async function startAimock(): Promise<LLMock> {
    if (aimock) return aimock;

    const record = buildRecordConfig();
    aimock = new LLMock({
        host: AIMOCK_HOST,
        port: AIMOCK_PORT,
        strict: !record,
        logLevel: (process.env.AISTATS_AIMOCK_LOG_LEVEL as "silent" | "info" | "debug" | undefined) ?? "silent",
        journalMaxEntries: 0,
        record,
    });

    const fixtureDirs = [
        path.join(FIXTURES_ROOT, "chat"),
        path.join(FIXTURES_ROOT, "responses"),
        path.join(FIXTURES_ROOT, "routing"),
    ];

    if (record && fs.existsSync(record.fixturePath ?? "")) {
        fixtureDirs.push(record.fixturePath!);
    }

    for (const dir of fixtureDirs) {
        if (fs.existsSync(dir)) {
            aimock.loadFixtureDir(dir);
        }
    }

    aimock.onEmbedding(/\[aimock-embedding\]/, {
        embedding: [0.11, 0.22, 0.33, 0.44],
    });
    aimock.onImage(/\[aimock-image\]/, {
        image: {
            url: "https://example.com/aimock/skyline.png",
            revisedPrompt: "Deterministic AIMock skyline",
        },
    });
    aimock.onSpeech(/\[aimock-speech\]/, {
        audio: Buffer.from("AIMOCK_TTS_AUDIO").toString("base64"),
        format: "mp3",
    });
    aimock.onTranscription({
        transcription: {
            text: "Deterministic transcription from AIMock.",
            language: "english",
            duration: 1.25,
            words: [
                { word: "Deterministic", start: 0, end: 0.4 },
                { word: "transcription", start: 0.41, end: 0.9 },
            ],
            segments: [
                { id: 0, text: "Deterministic transcription from AIMock.", start: 0, end: 1.25 },
            ],
        },
    });
    aimock.onVideo(/\[aimock-video\]/, {
        video: {
            id: "video_aimock_123",
            status: "completed",
            url: "https://example.com/aimock/video.mp4",
        },
    });
    aimock.onModerate(/\[aimock-moderation\]/, {
        flagged: true,
        categories: {
            violence: true,
            harassment: false,
        },
        category_scores: {
            violence: 0.97,
            harassment: 0.02,
        },
    });
    aimock.onRerank(/\[aimock-rerank\]/, [
        { index: 1, relevance_score: 0.92 },
        { index: 0, relevance_score: 0.41 },
    ]);
    aimock.mount("/v1/rerank", createOpenAIRerankMount());
    aimock.mount("/v1/tts", createXAiTtsMount());
    aimock.mount("/v1beta/interactions", createGoogleInteractionsMount());
    aimock.mount("/v1/openai", createOpenAIChatMount());
    aimock.mount("/api/v1", createOpenAIChatMount());
    aimock.mount("/v1/projects/aimock-project/locations/us-east5/publishers/anthropic/models", createAnthropicMessagesMount());

    await aimock.start();
    if (!record) {
        restoreAimockFetch = installLoopbackOnlyFetchGuard();
    }
    return aimock;
}

export async function stopAimock(): Promise<void> {
    if (!aimock) return;
    restoreAimockFetch?.();
    restoreAimockFetch = null;
    await aimock.stop();
    aimock = null;
}

export function resetAimockState(): void {
    if (!aimock) return;
    aimock.clearRequests();
    aimock.resetMatchCounts();
    resetHealthStateForTests();
    teardownTestRuntime();
    setupRuntimeFromEnv(buildAimockBindings());
}

export function getAimock(): LLMock {
    if (!aimock) {
        throw new Error("AIMock has not been started");
    }
    return aimock;
}

export async function executeTextProtocol(args: {
    providerId: string;
    protocol: TextProtocol;
    body: Record<string, unknown>;
    stream?: boolean;
    providerModelSlug?: string;
    testId?: string;
}) {
    const executor = resolveProviderExecutor(args.providerId, "text.generate");
    if (!executor) {
        throw new Error(`missing text executor for provider ${args.providerId}`);
    }

    const endpoint = endpointForProtocol(args.protocol);
    const model = typeof args.body.model === "string" ? args.body.model : defaultModelForProvider(args.providerId);
    const body = {
        ...args.body,
        model,
    };
    const ir = decodeProtocol(args.protocol as any, body) as IRChatRequest;
    ir.stream = Boolean(args.stream);

    const requestId = `req_aimock_${crypto.randomUUID()}`;
    const testId = args.testId ?? `aimock-${crypto.randomUUID()}`;

    const result = await executor({
        ir,
        requestId,
        workspaceId: WORKSPACE_ID,
        providerId: args.providerId,
        endpoint,
        protocol: args.protocol as any,
        capability: "text.generate",
        providerModelSlug: args.providerModelSlug ?? model,
        capabilityParams: null,
        maxInputTokens: null,
        maxOutputTokens: null,
        byokMeta: [],
        pricingCard: pricingCard(args.providerId, model, endpoint),
        meta: {
            returnMeta: false,
            trace: null,
            testId,
        },
    });

    const encoded =
        result.kind === "completed" && result.ir
            ? encodeProtocol(args.protocol as any, result.ir, requestId)
            : null;

    return {
        requestId,
        testId,
        result,
        encoded,
    };
}

export async function executeEmbeddingScenario(args: {
    providerId: string;
    input: string | string[];
    model?: string;
    testId?: string;
}) {
    const executor = resolveProviderExecutor(args.providerId, "embeddings");
    if (!executor) {
        throw new Error(`missing embeddings executor for provider ${args.providerId}`);
    }

    const model = args.model ?? defaultModelForProvider(args.providerId);
    const ir: IREmbeddingsRequest = {
        model,
        input: args.input,
    };
    const requestId = `req_aimock_${crypto.randomUUID()}`;
    const testId = args.testId ?? `aimock-${crypto.randomUUID()}`;

    const result = await executor({
        ir,
        requestId,
        workspaceId: WORKSPACE_ID,
        providerId: args.providerId,
        endpoint: "embeddings",
        capability: "embeddings",
        providerModelSlug: model,
        capabilityParams: null,
        maxInputTokens: null,
        maxOutputTokens: null,
        byokMeta: [],
        pricingCard: pricingCard(args.providerId, model, "embeddings"),
        meta: {
            returnMeta: false,
            trace: null,
            testId,
        },
    });

    return {
        requestId,
        testId,
        result,
    };
}

export async function executeCapabilityScenario(args: {
    providerId: string;
    capability: AimockCapability;
    ir: Record<string, unknown>;
    providerModelSlug?: string;
    testId?: string;
}) {
    const executor = resolveProviderExecutor(args.providerId, args.capability);
    if (!executor) {
        throw new Error(`missing ${args.capability} executor for provider ${args.providerId}`);
    }

    const endpoint = endpointForCapability(args.capability);
    const model =
        typeof args.ir.model === "string" && args.ir.model.trim().length > 0
            ? args.ir.model
            : defaultModelForProvider(args.providerId);
    const ir = {
        ...args.ir,
        model,
    };
    const requestId = `req_aimock_${crypto.randomUUID()}`;
    const testId = args.testId ?? `aimock-${crypto.randomUUID()}`;

    const result = await executor({
        ir,
        requestId,
        workspaceId: WORKSPACE_ID,
        providerId: args.providerId,
        endpoint,
        capability: args.capability,
        providerModelSlug: args.providerModelSlug ?? model,
        capabilityParams: null,
        maxInputTokens: null,
        maxOutputTokens: null,
        byokMeta: [],
        pricingCard: pricingCard(args.providerId, String(model), endpoint),
        meta: {
            returnMeta: false,
            trace: null,
            testId,
        },
    });

    return {
        requestId,
        testId,
        result,
    };
}

export function expectCompleted(result: ExecutorResult): ExecutorCompletedResult {
    if (result.kind !== "completed" || !result.ir) {
        throw new Error(`expected completed executor result, got ${result.kind}`);
    }
    return result as ExecutorCompletedResult;
}

export function extractProtocolText(protocol: TextProtocol, payload: any): string {
    if (protocol === "openai.chat.completions") {
        return String(payload?.choices?.[0]?.message?.content ?? "");
    }
    if (protocol === "openai.responses") {
        const output = Array.isArray(payload?.output) ? payload.output : [];
        return output
            .flatMap((item: any) => Array.isArray(item?.content) ? item.content : [])
            .filter((item: any) => item?.type === "output_text")
            .map((item: any) => String(item?.text ?? ""))
            .join("");
    }
    const content = Array.isArray(payload?.content) ? payload.content : [];
    return content
        .filter((item: any) => item?.type === "text")
        .map((item: any) => String(item?.text ?? ""))
        .join("");
}

export function readStreamFromResult(result: ExecutorResult): ReadableStream<Uint8Array> {
    if (result.kind !== "stream") {
        throw new Error(`expected stream executor result, got ${result.kind}`);
    }
    if (result.stream) return result.stream;
    if (result.upstream.body) return result.upstream.body;
    throw new Error("stream executor result did not expose a body");
}
