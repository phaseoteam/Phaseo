import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveGatewayApiKeyFromEnv } from "../helpers/gatewayKey";
import { serializeError } from "./active-providers.live.helpers";

type GatewayModelProvider = {
    api_provider_id?: string;
    endpoint?: string;
    is_active_gateway?: boolean;
};

type GatewayModel = {
    model_id?: string;
    endpoints?: string[];
    providers?: GatewayModelProvider[];
};

type ModelsResponse = {
    total?: number;
    models?: GatewayModel[];
};

type GatewayCallResult = {
    status: number;
    statusText: string;
    contentType: string;
    headers: Record<string, string>;
    json?: any;
    text?: string;
    bytes?: Buffer;
};

type ProviderRouteContext = {
    providerId: string;
    model: string;
    audioFixture: AudioFixture | null;
};

type AudioFixture = {
    bytes: Buffer;
    mimeType: string;
    filename: string;
};

type ScenarioRunRecord = {
    provider: string;
    surface: SurfaceId;
    route: string;
    model: string | null;
    status: "passed" | "failed" | "skipped_no_model";
    elapsedMs: number;
    note?: string;
    error?: string;
};

type SurfaceDefinition = {
    route: string;
    capabilityIds: string[];
    heavy?: boolean;
    timeoutMs?: number;
    run: (ctx: ProviderRouteContext) => Promise<void>;
};

const GATEWAY_URL = process.env.GATEWAY_URL ?? "http://127.0.0.1:8787/v1";
const GATEWAY_API_KEY = resolveGatewayApiKeyFromEnv(process.env);
const LIVE_RUN = (process.env.LIVE_RUN ?? "").trim() === "1";
const LIVE_MATRIX_RUN = (process.env.LIVE_PROVIDER_ENDPOINT_MATRIX_RUN ?? "0").trim() === "1";
const LIVE_MATRIX_INCLUDE_HEAVY = (process.env.LIVE_PROVIDER_ENDPOINT_MATRIX_INCLUDE_HEAVY ?? "0").trim() === "1";
const LIVE_MATRIX_POLL_ATTEMPTS = Number(process.env.LIVE_PROVIDER_ENDPOINT_MATRIX_POLL_ATTEMPTS ?? "4");
const LIVE_MATRIX_POLL_DELAY_MS = Number(process.env.LIVE_PROVIDER_ENDPOINT_MATRIX_POLL_DELAY_MS ?? "3000");
const LIVE_MATRIX_TEXT_MAX_OUTPUT_TOKENS = Number(process.env.LIVE_PROVIDER_ENDPOINT_MATRIX_TEXT_MAX_OUTPUT_TOKENS ?? "24");
const LIVE_MATRIX_RESULTS_PATH = (process.env.LIVE_PROVIDER_ENDPOINT_MATRIX_RESULTS_PATH ?? "").trim();
const describeLive = LIVE_RUN && LIVE_MATRIX_RUN ? describe : describe.skip;

const LIVE_PROVIDER_ALIASES: Record<string, string> = {
    arcee: "arcee-ai",
    "arcee-ai": "arcee-ai",
    xai: "x-ai",
    "x-ai": "x-ai",
    novita: "novitaai",
    "novita-ai": "novitaai",
};

type SurfaceId =
    | "responses_text"
    | "chat_text"
    | "messages_text"
    | "embeddings"
    | "moderations"
    | "rerank"
    | "audio_speech"
    | "audio_transcription"
    | "audio_translations"
    | "image_generations"
    | "video_generation";

const ALL_SURFACE_IDS: SurfaceId[] = [
    "responses_text",
    "chat_text",
    "messages_text",
    "embeddings",
    "moderations",
    "rerank",
    "audio_speech",
    "audio_transcription",
    "audio_translations",
    "image_generations",
    "video_generation",
];

const SURFACE_CAPABILITY_ALIASES: Record<SurfaceId, string[]> = {
    responses_text: ["text.generate"],
    chat_text: ["text.generate"],
    messages_text: ["text.generate"],
    embeddings: ["embeddings", "text.embed"],
    moderations: ["moderations", "moderation", "moderations.create", "text.moderate"],
    rerank: ["rerank", "rerank.create", "text.rerank"],
    audio_speech: ["audio.speech", "audio.generate"],
    audio_transcription: ["audio.transcription", "audio.transcribe"],
    audio_translations: ["audio.translations", "audio.translate"],
    image_generations: ["images.generations", "images.generate", "image.generate", "image.generations"],
    video_generation: ["video.generation", "video.generate", "video.generations"],
};

const HEAVY_SURFACES = new Set<SurfaceId>(["video_generation"]);

const PROVIDER_SURFACE_CANDIDATES: Partial<Record<SurfaceId, Record<string, string[]>>> = {
    responses_text: {
        openai: ["openai/gpt-5-nano", "openai/gpt-5.4-nano"],
        "google-ai-studio": ["google/gemini-2.5-flash-lite", "google/gemini-2.5-flash"],
        anthropic: ["anthropic/claude-3.5-haiku", "anthropic/claude-3-haiku"],
    },
    chat_text: {
        openai: ["openai/gpt-5-nano", "openai/gpt-5.4-nano"],
    },
    messages_text: {
        anthropic: ["anthropic/claude-3.5-haiku", "anthropic/claude-3-haiku"],
    },
    embeddings: {
        openai: ["openai/text-embedding-3-small"],
    },
    moderations: {
        openai: ["openai/omni-moderation-latest", "openai/text-moderation-latest"],
    },
    rerank: {
        cohere: ["cohere/rerank-v3.5", "cohere/rerank-english-v3.0"],
    },
    audio_speech: {
        openai: ["openai/gpt-4o-mini-tts"],
        "google-ai-studio": ["google/gemini-3.1-flash-tts-preview", "google/gemini-2.5-flash-preview-tts"],
        xiaomi: ["xiaomi/mimo-v2.5-tts"],
    },
    audio_transcription: {
        openai: ["openai/gpt-4o-mini-transcribe", "openai/gpt-4o-transcribe"],
    },
    audio_translations: {
        openai: ["openai/gpt-4o-mini-transcribe", "openai/gpt-4o-transcribe"],
    },
    image_generations: {
        openai: ["openai/gpt-image-1-mini", "openai/gpt-image-1"],
        "google-ai-studio": ["google/gemini-2.5-flash-image"],
        "black-forest-labs": ["black-forest-labs/flux-2-klein-4b", "black-forest-labs/flux-2-krea-4b"],
        "x-ai": ["x-ai/grok-imagine-image", "x-ai/grok-image-1"],
    },
    video_generation: {
        openai: ["openai/sora-2"],
        "google-ai-studio": ["google/veo-3.1-fast-preview", "google/veo-3-fast-preview"],
        minimax: ["minimax/hailuo-02"],
    },
};

const SURFACE_RUNS: ScenarioRunRecord[] = [];
const selectedSurfaces = surfaceList();
const discoveredBySurface = new Map<SurfaceId, Map<string, string[]>>();
const selectedModelBySurfaceProvider = new Map<string, string>();
let sharedAudioFixture: AudioFixture | null = null;

function resultKey(surface: SurfaceId, providerId: string): string {
    return `${surface}::${providerId}`;
}

function normalizeLiveProviderId(value: string): string {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return "";
    return LIVE_PROVIDER_ALIASES[normalized] ?? normalized;
}

function parseList(value: string | undefined): string[] {
    return String(value ?? "")
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
}

function surfaceList(): SurfaceId[] {
    const requested = parseList(process.env.LIVE_PROVIDER_ENDPOINT_MATRIX_SURFACES).filter(
        (value): value is SurfaceId => (ALL_SURFACE_IDS as string[]).includes(value)
    );
    const base = requested.length ? requested : [...ALL_SURFACE_IDS];
    return base.filter((surface) => LIVE_MATRIX_INCLUDE_HEAVY || !HEAVY_SURFACES.has(surface));
}

function providerListFilter(): Set<string> | null {
    const requested = parseList(process.env.LIVE_PROVIDER_ENDPOINT_MATRIX_PROVIDERS).map(normalizeLiveProviderId);
    return requested.length ? new Set(requested) : null;
}

function resultsReportPath(): string {
    if (LIVE_MATRIX_RESULTS_PATH) return path.resolve(LIVE_MATRIX_RESULTS_PATH);
    const slug = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
    return path.resolve(process.cwd(), "reports", "provider-live", `provider-endpoint-matrix-${slug}.json`);
}

function writeResultsReport() {
    const reportPath = resultsReportPath();
    const totals = {
        passed: 0,
        failed: 0,
        skipped_no_model: 0,
    };

    for (const run of SURFACE_RUNS) {
        if (run.status === "passed") totals.passed += 1;
        if (run.status === "failed") totals.failed += 1;
        if (run.status === "skipped_no_model") totals.skipped_no_model += 1;
    }

    const payload = {
        generated_at: new Date().toISOString(),
        gateway_url: GATEWAY_URL,
        include_heavy: LIVE_MATRIX_INCLUDE_HEAVY,
        selected_surfaces: selectedSurfaces,
        totals,
        runs: SURFACE_RUNS,
    };

    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify(payload, null, 2), "utf8");
    console.log(`[provider-endpoint-matrix] results report: ${reportPath}`);
}

function resolveGatewayUrl(pathname: string): string {
    const base = GATEWAY_URL.endsWith("/") ? GATEWAY_URL.slice(0, -1) : GATEWAY_URL;
    const suffix = pathname.startsWith("/") ? pathname : `/${pathname}`;
    return `${base}${suffix}`;
}

function getAuthHeaders(contentType = "application/json"): Record<string, string> {
    return {
        Authorization: `Bearer ${GATEWAY_API_KEY}`,
        "Content-Type": contentType,
    };
}

async function fetchModelsCatalog(): Promise<GatewayModel[]> {
    const out: GatewayModel[] = [];
    let offset = 0;
    const limit = 250;
    let total = Number.POSITIVE_INFINITY;

    while (offset < total) {
        const url = new URL(resolveGatewayUrl("/models"));
        url.searchParams.set("offset", String(offset));
        url.searchParams.set("limit", String(limit));

        const res = await fetch(url.toString(), {
            method: "GET",
            headers: {
                Authorization: `Bearer ${GATEWAY_API_KEY}`,
            },
        });
        const payload = (await res.json()) as ModelsResponse;
        if (!res.ok) {
            throw new Error(`Failed to load /models (${res.status}): ${JSON.stringify(payload)}`);
        }
        const models = payload.models ?? [];
        out.push(...models);
        total = typeof payload.total === "number" ? payload.total : models.length;
        offset += limit;
        if (!models.length) break;
    }

    return out;
}

function surfaceIdsForCapability(value: string): SurfaceId[] {
    const normalized = value.trim().toLowerCase();
    const out = new Set<SurfaceId>();
    for (const [surfaceId, aliases] of Object.entries(SURFACE_CAPABILITY_ALIASES) as Array<[SurfaceId, string[]]>) {
        if (aliases.includes(normalized)) out.add(surfaceId);
    }
    return [...out];
}

function addDiscoveredModel(surfaceId: SurfaceId, providerId: string, modelId: string) {
    const byProvider = discoveredBySurface.get(surfaceId) ?? new Map<string, string[]>();
    const existing = byProvider.get(providerId) ?? [];
    if (!existing.includes(modelId)) existing.push(modelId);
    byProvider.set(providerId, existing);
    discoveredBySurface.set(surfaceId, byProvider);
}

function discoverSurfaceModels(models: GatewayModel[]) {
    const providerFilter = providerListFilter();
    for (const model of models) {
        const modelId = String(model.model_id ?? "").trim();
        if (!modelId) continue;
        for (const provider of model.providers ?? []) {
            if (provider.is_active_gateway === false) continue;
            const providerId = normalizeLiveProviderId(String(provider.api_provider_id ?? ""));
            if (!providerId) continue;
            if (providerFilter && !providerFilter.has(providerId)) continue;

            const rawCapabilities = provider.endpoint
                ? [String(provider.endpoint)]
                : Array.isArray(model.endpoints)
                    ? model.endpoints.map((entry) => String(entry))
                    : [];

            for (const rawCapability of rawCapabilities) {
                for (const surfaceId of surfaceIdsForCapability(rawCapability)) {
                    if (!selectedSurfaces.includes(surfaceId)) continue;
                    addDiscoveredModel(surfaceId, providerId, modelId);
                }
            }
        }
    }
}

function parseModelOverrides(): Map<string, string> {
    const out = new Map<string, string>();
    for (const entry of parseList(process.env.LIVE_PROVIDER_ENDPOINT_MATRIX_MODEL_OVERRIDES)) {
        const eq = entry.indexOf("=");
        if (eq <= 0) continue;
        const key = entry.slice(0, eq).trim().toLowerCase();
        const value = entry.slice(eq + 1).trim();
        if (!key || !value) continue;
        out.set(key, value);
    }
    return out;
}

const modelOverrides = parseModelOverrides();

function scoreModelId(surfaceId: SurfaceId, providerId: string, modelId: string): number {
    const lower = modelId.toLowerCase();
    let score = 100;
    const add = (needle: string, delta: number) => {
        if (lower.includes(needle)) score += delta;
    };

    add(":free", -100);
    add("nano", -60);
    add("mini", -50);
    add("flash-lite", -50);
    add("flash", -40);
    add("lite", -35);
    add("haiku", -35);
    add("small", -30);
    add("micro", -25);
    add("tiny", -25);
    add("turbo", -20);
    add("fast", -20);
    add("4b", -20);
    add("schnell", -15);
    add("pro", 35);
    add("large", 30);
    add("max", 35);
    add("sonnet", 30);
    add("opus", 50);
    add("thinking", 25);

    if (surfaceId === "audio_speech") add("tts", -40);
    if (surfaceId === "video_generation") add("preview", -10);
    if (surfaceId === "image_generations") add("image", -10);
    if (surfaceId === "audio_transcription" || surfaceId === "audio_translations") add("transcribe", -30);
    if (surfaceId === "moderations") add("moderation", -30);
    if (surfaceId === "rerank") add("rerank", -30);
    if (surfaceId === "embeddings") add("embedding", -30);

    if (providerId === "openai" && surfaceId === "audio_speech" && lower.includes("gpt-4o-mini-tts")) score -= 50;
    if (providerId === "openai" && (surfaceId === "audio_transcription" || surfaceId === "audio_translations") && lower.includes("mini-transcribe")) score -= 40;
    if (providerId === "google-ai-studio" && surfaceId === "audio_speech" && lower.includes("tts")) score -= 30;
    if (providerId === "google-ai-studio" && surfaceId === "image_generations" && lower.includes("flash-image")) score -= 40;
    if (providerId === "black-forest-labs" && surfaceId === "image_generations" && lower.includes("klein")) score -= 30;
    if (providerId === "x-ai" && surfaceId === "image_generations" && lower.includes("imagine")) score -= 30;

    return score;
}

function pickPreferredExactCandidate(surfaceId: SurfaceId, providerId: string, candidates: string[]): string | null {
    const exactPrefs = PROVIDER_SURFACE_CANDIDATES[surfaceId]?.[providerId] ?? [];
    const lookup = new Map(candidates.map((candidate) => [candidate.toLowerCase(), candidate]));
    for (const preferred of exactPrefs) {
        const resolved = lookup.get(preferred.toLowerCase());
        if (resolved) return resolved;
    }
    return null;
}

function chooseModel(surfaceId: SurfaceId, providerId: string, candidates: string[]): string {
    const exactKey = `${providerId}.${surfaceId}`;
    const providerKey = providerId;
    const surfaceKey = surfaceId;

    const override = modelOverrides.get(exactKey) ?? modelOverrides.get(providerKey) ?? modelOverrides.get(surfaceKey);
    if (override) return override;

    const exact = pickPreferredExactCandidate(surfaceId, providerId, candidates);
    if (exact) return exact;

    return [...candidates].sort((left, right) => {
        const scoreDelta = scoreModelId(surfaceId, providerId, left) - scoreModelId(surfaceId, providerId, right);
        if (scoreDelta !== 0) return scoreDelta;
        return left.localeCompare(right);
    })[0];
}

function getVoiceForProvider(providerId: string): string | undefined {
    if (providerId === "openai") return "alloy";
    if (providerId === "google-ai-studio") return "Kore";
    if (providerId === "xiaomi") return "Mia";
    return undefined;
}

function toHeadersObject(headers: Headers): Record<string, string> {
    return Object.fromEntries(Array.from(headers.entries()));
}

async function parseGatewayResult(res: Response): Promise<GatewayCallResult> {
    const contentType = res.headers.get("content-type") ?? "";
    const headers = toHeadersObject(res.headers);
    if (contentType.includes("application/json")) {
        const text = await res.text();
        let json: any = null;
        try {
            json = text ? JSON.parse(text) : null;
        } catch {
            json = null;
        }
        return {
            status: res.status,
            statusText: res.statusText,
            contentType,
            headers,
            json,
            text,
        };
    }

    const bytes = Buffer.from(await res.arrayBuffer());
    return {
        status: res.status,
        statusText: res.statusText,
        contentType,
        headers,
        bytes,
    };
}

async function postJson(pathname: string, body: Record<string, unknown>): Promise<GatewayCallResult> {
    const res = await fetch(resolveGatewayUrl(pathname), {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify(body),
    });
    return parseGatewayResult(res);
}

async function postMultipart(
    pathname: string,
    buildForm: (form: FormData) => void,
): Promise<GatewayCallResult> {
    const form = new FormData();
    buildForm(form);
    const res = await fetch(resolveGatewayUrl(pathname), {
        method: "POST",
        headers: {
            Authorization: `Bearer ${GATEWAY_API_KEY}`,
        },
        body: form,
    });
    return parseGatewayResult(res);
}

async function getJson(pathname: string): Promise<GatewayCallResult> {
    const res = await fetch(resolveGatewayUrl(pathname), {
        method: "GET",
        headers: {
            Authorization: `Bearer ${GATEWAY_API_KEY}`,
        },
    });
    return parseGatewayResult(res);
}

function assertOk(result: GatewayCallResult, context: string) {
    expect(result.status, `${context} should return 2xx`).toBeGreaterThanOrEqual(200);
    expect(result.status, `${context} should return 2xx`).toBeLessThan(300);
}

function extractResponsesText(payload: any): string {
    if (typeof payload?.output_text === "string" && payload.output_text.trim()) return payload.output_text.trim();
    const output = Array.isArray(payload?.output) ? payload.output : [];
    const parts: string[] = [];
    for (const item of output) {
        if (item?.type !== "message" || !Array.isArray(item.content)) continue;
        for (const block of item.content) {
            if (typeof block?.text === "string" && block.text.trim()) parts.push(block.text.trim());
        }
    }
    return parts.join("\n").trim();
}

function extractChatText(payload: any): string {
    const message = payload?.choices?.[0]?.message;
    if (typeof message?.content === "string") return message.content.trim();
    if (Array.isArray(message?.content)) {
        return message.content
            .map((part: any) => String(part?.text ?? ""))
            .join("\n")
            .trim();
    }
    return "";
}

function extractMessagesText(payload: any): string {
    const blocks = Array.isArray(payload?.content) ? payload.content : [];
    return blocks
        .map((block: any) => String(block?.text ?? ""))
        .join("\n")
        .trim();
}

function extractImageCount(payload: any): number {
    const data = Array.isArray(payload?.data) ? payload.data : [];
    return data.filter((item: any) => typeof item?.b64_json === "string" || typeof item?.url === "string").length;
}

function createSilentWav(durationMs = 1100, sampleRate = 16000): AudioFixture {
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

async function ensureAudioFixture(): Promise<AudioFixture> {
    if (sharedAudioFixture) return sharedAudioFixture;

    const audioSpeechProviders = discoveredBySurface.get("audio_speech");
    if (audioSpeechProviders) {
        for (const [providerId, models] of audioSpeechProviders.entries()) {
            if (!models.length) continue;
            const model = selectedModelBySurfaceProvider.get(resultKey("audio_speech", providerId)) ?? chooseModel("audio_speech", providerId, models);
            const body: Record<string, unknown> = {
                model,
                input: "hello from ai stats",
                provider: { only: [providerId] },
            };
            const voice = getVoiceForProvider(providerId);
            if (voice) body.voice = voice;
            if (providerId === "openai") body.response_format = "mp3";
            const result = await postJson("/audio/speech", body);
            if (result.status >= 200 && result.status < 300 && result.bytes && result.bytes.length > 0) {
                sharedAudioFixture = {
                    bytes: result.bytes,
                    mimeType: result.contentType || "audio/mpeg",
                    filename: result.contentType.includes("wav") ? "sample.wav" : "sample.mp3",
                };
                return sharedAudioFixture;
            }
        }
    }

    sharedAudioFixture = createSilentWav();
    return sharedAudioFixture;
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runAsyncCreateAndPoll(args: {
    createPath: string;
    statusPath: (id: string) => string;
    body: Record<string, unknown>;
    acceptedStatuses?: string[];
}) {
    const create = await postJson(args.createPath, args.body);
    assertOk(create, `${args.createPath} create`);
    expect(typeof create.json?.id).toBe("string");
    const id = String(create.json?.id);
    let latest = create.json;
    const accepted = new Set(args.acceptedStatuses ?? ["queued", "in_progress", "completed", "failed"]);

    for (let attempt = 1; attempt <= LIVE_MATRIX_POLL_ATTEMPTS; attempt += 1) {
        if (attempt > 1) await sleep(LIVE_MATRIX_POLL_DELAY_MS);
        const status = await getJson(args.statusPath(id));
        assertOk(status, `${args.createPath} status`);
        latest = status.json;
        const normalizedStatus = String(latest?.status ?? "").trim().toLowerCase();
        if (accepted.has(normalizedStatus)) {
            if (normalizedStatus === "completed" || normalizedStatus === "failed") break;
        }
    }

    const finalStatus = String(latest?.status ?? "").trim().toLowerCase();
    expect(accepted.has(finalStatus), `Unexpected async status: ${finalStatus}`).toBe(true);
}

const SURFACES: Record<SurfaceId, SurfaceDefinition> = {
    responses_text: {
        route: "/responses",
        capabilityIds: SURFACE_CAPABILITY_ALIASES.responses_text,
        timeoutMs: 120_000,
        run: async ({ providerId, model }) => {
            const result = await postJson("/responses", {
                model,
                input: "Hi",
                max_output_tokens: LIVE_MATRIX_TEXT_MAX_OUTPUT_TOKENS,
                provider: { only: [providerId] },
            });
            assertOk(result, "/responses");
            expect(extractResponsesText(result.json), "/responses should return text").not.toBe("");
        },
    },
    chat_text: {
        route: "/chat/completions",
        capabilityIds: SURFACE_CAPABILITY_ALIASES.chat_text,
        timeoutMs: 120_000,
        run: async ({ providerId, model }) => {
            const result = await postJson("/chat/completions", {
                model,
                messages: [{ role: "user", content: "Hi" }],
                max_output_tokens: LIVE_MATRIX_TEXT_MAX_OUTPUT_TOKENS,
                provider: { only: [providerId] },
            });
            assertOk(result, "/chat/completions");
            expect(extractChatText(result.json), "/chat/completions should return text").not.toBe("");
        },
    },
    messages_text: {
        route: "/messages",
        capabilityIds: SURFACE_CAPABILITY_ALIASES.messages_text,
        timeoutMs: 120_000,
        run: async ({ providerId, model }) => {
            const result = await postJson("/messages", {
                model,
                max_tokens: Math.max(LIVE_MATRIX_TEXT_MAX_OUTPUT_TOKENS, 32),
                messages: [{ role: "user", content: "Hi" }],
                provider: { only: [providerId] },
            });
            assertOk(result, "/messages");
            expect(extractMessagesText(result.json), "/messages should return text").not.toBe("");
        },
    },
    embeddings: {
        route: "/embeddings",
        capabilityIds: SURFACE_CAPABILITY_ALIASES.embeddings,
        timeoutMs: 120_000,
        run: async ({ providerId, model }) => {
            const result = await postJson("/embeddings", {
                model,
                input: "hello embeddings",
                provider: { only: [providerId] },
            });
            assertOk(result, "/embeddings");
            expect(Array.isArray(result.json?.data), "/embeddings should return data").toBe(true);
            expect(result.json?.data?.length ?? 0).toBeGreaterThan(0);
        },
    },
    moderations: {
        route: "/moderations",
        capabilityIds: SURFACE_CAPABILITY_ALIASES.moderations,
        timeoutMs: 120_000,
        run: async ({ providerId, model }) => {
            const result = await postJson("/moderations", {
                model,
                input: "Hello world",
                provider: { only: [providerId] },
            });
            assertOk(result, "/moderations");
            expect(Array.isArray(result.json?.results) || typeof result.json === "object").toBe(true);
        },
    },
    rerank: {
        route: "/rerank",
        capabilityIds: SURFACE_CAPABILITY_ALIASES.rerank,
        timeoutMs: 120_000,
        run: async ({ providerId, model }) => {
            const result = await postJson("/rerank", {
                model,
                query: "Which document is about London?",
                documents: ["London is a city.", "Bananas are yellow."],
                top_n: 1,
                provider: { only: [providerId] },
            });
            assertOk(result, "/rerank");
            const hasResults = Array.isArray(result.json?.results) || Array.isArray(result.json?.data);
            expect(hasResults, "/rerank should return result items").toBe(true);
        },
    },
    audio_speech: {
        route: "/audio/speech",
        capabilityIds: SURFACE_CAPABILITY_ALIASES.audio_speech,
        timeoutMs: 180_000,
        run: async ({ providerId, model }) => {
            const body: Record<string, unknown> = {
                model,
                input: "hello",
                provider: { only: [providerId] },
            };
            const voice = getVoiceForProvider(providerId);
            if (voice) body.voice = voice;
            if (providerId === "openai") body.response_format = "mp3";
            const result = await postJson("/audio/speech", body);
            assertOk(result, "/audio/speech");
            expect(result.bytes?.length ?? 0, "/audio/speech should return audio bytes").toBeGreaterThan(0);
        },
    },
    audio_transcription: {
        route: "/audio/transcriptions",
        capabilityIds: SURFACE_CAPABILITY_ALIASES.audio_transcription,
        timeoutMs: 180_000,
        run: async ({ providerId, model, audioFixture }) => {
            const fixture = audioFixture ?? (await ensureAudioFixture());
            const result = await postMultipart("/audio/transcriptions", (form) => {
                form.set("model", model);
                form.set("provider", JSON.stringify({ only: [providerId] }));
                form.set("file", new Blob([fixture.bytes], { type: fixture.mimeType }), fixture.filename);
            });
            assertOk(result, "/audio/transcriptions");
            const text = String(result.json?.text ?? result.json?.transcript ?? "");
            expect(text.length >= 0 && typeof result.json === "object").toBe(true);
        },
    },
    audio_translations: {
        route: "/audio/translations",
        capabilityIds: SURFACE_CAPABILITY_ALIASES.audio_translations,
        timeoutMs: 180_000,
        run: async ({ providerId, model, audioFixture }) => {
            const fixture = audioFixture ?? (await ensureAudioFixture());
            const result = await postMultipart("/audio/translations", (form) => {
                form.set("model", model);
                form.set("provider", JSON.stringify({ only: [providerId] }));
                form.set("file", new Blob([fixture.bytes], { type: fixture.mimeType }), fixture.filename);
            });
            assertOk(result, "/audio/translations");
            expect(typeof result.json === "object").toBe(true);
        },
    },
    image_generations: {
        route: "/images/generations",
        capabilityIds: SURFACE_CAPABILITY_ALIASES.image_generations,
        timeoutMs: 180_000,
        run: async ({ providerId, model }) => {
            const result = await postJson("/images/generations", {
                model,
                prompt: "blue square",
                n: 1,
                provider: { only: [providerId] },
            });
            assertOk(result, "/images/generations");
            expect(extractImageCount(result.json), "/images/generations should return image data").toBeGreaterThan(0);
        },
    },
    video_generation: {
        route: "/videos",
        capabilityIds: SURFACE_CAPABILITY_ALIASES.video_generation,
        heavy: true,
        timeoutMs: 420_000,
        run: async ({ providerId, model }) => {
            const body: Record<string, unknown> = {
                model,
                prompt: "A simple gray sphere slowly rotating on a plain white background.",
                provider: { only: [providerId] },
            };

            if (providerId === "google-ai-studio") {
                body.duration_seconds = 2;
                body.aspect_ratio = "16:9";
                body.generate_audio = false;
            } else if (providerId === "openai") {
                body.seconds = 4;
                body.resolution = "720x1280";
                body.quality = "standard";
            } else if (providerId === "minimax") {
                body.duration_seconds = 6;
                body.resolution = "512p";
            }

            await runAsyncCreateAndPoll({
                createPath: "/videos",
                statusPath: (id) => `/videos/${encodeURIComponent(id)}`,
                body,
            });
        },
    },
};

async function initializeMatrix() {
    if (!LIVE_RUN || !LIVE_MATRIX_RUN || !GATEWAY_API_KEY) return;
    const catalog = await fetchModelsCatalog();
    discoverSurfaceModels(catalog);
    for (const surfaceId of selectedSurfaces) {
        const providers = discoveredBySurface.get(surfaceId) ?? new Map<string, string[]>();
        for (const [providerId, models] of providers.entries()) {
            if (!models.length) continue;
            selectedModelBySurfaceProvider.set(resultKey(surfaceId, providerId), chooseModel(surfaceId, providerId, models));
        }
    }
}

await initializeMatrix();

describeLive("Provider endpoint live matrix", () => {
    beforeAll(async () => {
        if (!GATEWAY_API_KEY) {
            throw new Error("GATEWAY_API_KEY is required when LIVE_RUN=1 and LIVE_PROVIDER_ENDPOINT_MATRIX_RUN=1");
        }

        console.log(
            `[provider-endpoint-matrix] selected surfaces=${selectedSurfaces.join(", ")} include_heavy=${LIVE_MATRIX_INCLUDE_HEAVY}`
        );
        for (const surfaceId of selectedSurfaces) {
            const providers = discoveredBySurface.get(surfaceId) ?? new Map<string, string[]>();
            const summary = Array.from(providers.entries()).map(([providerId]) => ({
                providerId,
                model: selectedModelBySurfaceProvider.get(resultKey(surfaceId, providerId)) ?? null,
            }));
            console.log(`[provider-endpoint-matrix] ${surfaceId} providers=${summary.length}`);
            console.log(JSON.stringify(summary, null, 2));
        }
    }, 120_000);

    afterAll(() => {
        writeResultsReport();
    });

    for (const surfaceId of selectedSurfaces) {
        const surface = SURFACES[surfaceId];
        const providerIds = Array.from((discoveredBySurface.get(surfaceId) ?? new Map<string, string[]>()).keys()).sort();
        describe(surfaceId, () => {
            if (providerIds.length === 0) {
                it("has no discovered providers in this environment", () => {
                    expect(providerIds.length).toBe(0);
                });
                return;
            }

            for (const providerId of providerIds) {
                it(
                    providerId,
                    async () => {
                        const startedAt = Date.now();
                        const model = selectedModelBySurfaceProvider.get(resultKey(surfaceId, providerId));
                        if (!model) {
                            SURFACE_RUNS.push({
                                provider: providerId,
                                surface: surfaceId,
                                route: surface.route,
                                model: null,
                                status: "skipped_no_model",
                                elapsedMs: Date.now() - startedAt,
                                note: "No discovered model for provider/capability pair",
                            });
                            return;
                        }

                        try {
                            const audioFixture = surfaceId === "audio_transcription" || surfaceId === "audio_translations"
                                ? await ensureAudioFixture()
                                : null;
                            await surface.run({ providerId, model, audioFixture });
                            SURFACE_RUNS.push({
                                provider: providerId,
                                surface: surfaceId,
                                route: surface.route,
                                model,
                                status: "passed",
                                elapsedMs: Date.now() - startedAt,
                            });
                        } catch (error) {
                            SURFACE_RUNS.push({
                                provider: providerId,
                                surface: surfaceId,
                                route: surface.route,
                                model,
                                status: "failed",
                                elapsedMs: Date.now() - startedAt,
                                error: serializeError(error),
                            });
                            throw error;
                        }
                    },
                    surface.timeoutMs ?? 180_000,
                );
            }
        });
    }
});
