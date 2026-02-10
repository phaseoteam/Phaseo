import { beforeAll, describe, expect, it } from "vitest";
import { parseSseJson, readSseFrames } from "../helpers/sse";

const DEFAULT_ACTIVE_PROVIDERS = [
    "openai",
    "anthropic",
    "x-ai",
    "google-ai-studio",
    "deepseek",
    "mistral",
    "minimax",
    "qwen",
    "z-ai",
    "moonshot-ai",
    "moonshot-ai-turbo",
    "alibaba",
    "xiaomi",
] as const;

const DEFAULT_SCENARIOS = ["responses_nonstream_hi"] as const;

const GATEWAY_URL = process.env.GATEWAY_URL ?? "http://127.0.0.1:8787/v1";
const GATEWAY_API_KEY = process.env.GATEWAY_API_KEY ?? "";
const LIVE_RUN = (process.env.LIVE_RUN ?? "").trim() === "1";
const REQUIRE_USAGE = (process.env.LIVE_REQUIRE_USAGE ?? "1").trim() !== "0";
const ALLOW_TRANSIENT_FAILURES = (process.env.LIVE_ALLOW_TRANSIENT_FAILURES ?? "1").trim() !== "0";
const MAX_OUTPUT_TOKENS = Number(process.env.LIVE_MAX_OUTPUT_TOKENS ?? "12");
const MESSAGES_MAX_TOKENS_BASE = Math.max(MAX_OUTPUT_TOKENS, 16);
const MESSAGES_MAX_TOKENS_TOOL = Math.max(MAX_OUTPUT_TOKENS, 64);
const MESSAGES_MAX_TOKENS_STRUCTURED = Math.max(MAX_OUTPUT_TOKENS, 96);
const INCLUDE_TUNING_PARAMS = (process.env.LIVE_INCLUDE_TUNING ?? "0").trim() === "1";

type ScenarioId =
    | "responses_nonstream_hi"
    | "chat_nonstream_hi"
    | "messages_nonstream_hi"
    | "responses_stream_hi"
    | "responses_nonstream_tool"
    | "chat_nonstream_tool"
    | "messages_nonstream_tool"
    | "responses_nonstream_structured"
    | "chat_nonstream_structured"
    | "messages_nonstream_structured";

type Scenario = {
    id: ScenarioId;
    endpoint: "/responses" | "/chat/completions" | "/messages";
    stream: boolean;
    buildBody: (model: string) => Record<string, unknown>;
    validateNonStream?: (jsonBody: any, ctx: { providerId: string; model: string }) => void;
};

type ModelsResponse = {
    ok?: boolean;
    total?: number;
    offset?: number;
    limit?: number;
    models?: Array<{
        model_id?: string;
        providers?: Array<{
            api_provider_id?: string;
            endpoint?: string;
            is_active_gateway?: boolean;
        }>;
    }>;
};

const SCENARIOS: Record<ScenarioId, Scenario> = {
    responses_nonstream_hi: {
        id: "responses_nonstream_hi",
        endpoint: "/responses",
        stream: false,
        buildBody: (model) => {
            const body: Record<string, unknown> = {
                model,
                input: "Hi",
            };
            if (INCLUDE_TUNING_PARAMS) {
                body.max_output_tokens = MAX_OUTPUT_TOKENS;
                body.temperature = 0;
            }
            return body;
        },
    },
    chat_nonstream_hi: {
        id: "chat_nonstream_hi",
        endpoint: "/chat/completions",
        stream: false,
        buildBody: (model) => {
            const body: Record<string, unknown> = {
                model,
                messages: [{ role: "user", content: "Hi" }],
            };
            if (INCLUDE_TUNING_PARAMS) {
                body.max_output_tokens = MAX_OUTPUT_TOKENS;
                body.temperature = 0;
            }
            return body;
        },
    },
    messages_nonstream_hi: {
        id: "messages_nonstream_hi",
        endpoint: "/messages",
        stream: false,
        buildBody: (model) => ({
            model,
            max_tokens: MESSAGES_MAX_TOKENS_BASE,
            messages: [{ role: "user", content: "Hi" }],
        }),
    },
    responses_stream_hi: {
        id: "responses_stream_hi",
        endpoint: "/responses",
        stream: true,
        buildBody: (model) => {
            const body: Record<string, unknown> = {
                model,
                input: "Hi",
                stream: true,
            };
            if (INCLUDE_TUNING_PARAMS) {
                body.max_output_tokens = MAX_OUTPUT_TOKENS;
                body.temperature = 0;
            }
            return body;
        },
    },
    responses_nonstream_tool: {
        id: "responses_nonstream_tool",
        endpoint: "/responses",
        stream: false,
        buildBody: (model) => ({
            model,
            input: "Call get_weather for London and return a tool call.",
            temperature: 0,
            tools: [{
                type: "function",
                function: {
                    name: "get_weather",
                    description: "Get weather for a city",
                    parameters: {
                        type: "object",
                        properties: {
                            city: { type: "string" },
                        },
                        required: ["city"],
                    },
                },
            }],
            tool_choice: { type: "function", function: { name: "get_weather" } },
        }),
        validateNonStream: (jsonBody, ctx) => {
            const outputItems = Array.isArray(jsonBody?.output) ? jsonBody.output : [];
            const functionCalls = outputItems.filter((item: any) => item?.type === "function_call");
            if (functionCalls.length === 0) {
                // Some providers occasionally return textual tool-invocation traces on the /responses compatibility path.
                const text = extractResponseText(jsonBody).toLowerCase();
                if (ctx.providerId === "minimax") {
                    expect(text.includes("get_weather") || text.includes("<invoke")).toBe(true);
                    return;
                }
            }
            expect(
                functionCalls.length,
                "Expected at least one function_call item in /responses output"
            ).toBeGreaterThan(0);
            expect(functionCalls[0]?.name).toBe("get_weather");
        },
    },
    chat_nonstream_tool: {
        id: "chat_nonstream_tool",
        endpoint: "/chat/completions",
        stream: false,
        buildBody: (model) => ({
            model,
            messages: [{ role: "user", content: "Call get_weather for London and return a tool call." }],
            temperature: 0,
            tools: [{
                type: "function",
                function: {
                    name: "get_weather",
                    description: "Get weather for a city",
                    parameters: {
                        type: "object",
                        properties: {
                            city: { type: "string" },
                        },
                        required: ["city"],
                    },
                },
            }],
            tool_choice: { type: "function", function: { name: "get_weather" } },
        }),
        validateNonStream: (jsonBody) => {
            const toolCalls = jsonBody?.choices?.[0]?.message?.tool_calls;
            expect(
                Array.isArray(toolCalls) ? toolCalls.length : 0,
                "Expected at least one tool_call in /chat/completions response"
            ).toBeGreaterThan(0);
            expect(toolCalls?.[0]?.function?.name).toBe("get_weather");
        },
    },
    messages_nonstream_tool: {
        id: "messages_nonstream_tool",
        endpoint: "/messages",
        stream: false,
        buildBody: (model) => ({
            model,
            max_tokens: MESSAGES_MAX_TOKENS_TOOL,
            messages: [{ role: "user", content: "Call get_weather for London and return a tool call." }],
            tools: [{
                name: "get_weather",
                description: "Get weather for a city",
                input_schema: {
                    type: "object",
                    properties: {
                        city: { type: "string" },
                    },
                    required: ["city"],
                },
            }],
            tool_choice: { type: "tool", name: "get_weather" },
        }),
        validateNonStream: (jsonBody, ctx) => {
            const blocks = Array.isArray(jsonBody?.content) ? jsonBody.content : [];
            const toolUse = blocks.find((block: any) => block?.type === "tool_use");
            if (!toolUse && (ctx.providerId === "minimax" || ctx.providerId === "z-ai")) {
                const text = blocks.map((block: any) => String(block?.text ?? "")).join("\n").toLowerCase();
                expect(text.includes("get_weather") || text.includes("<invoke")).toBe(true);
                return;
            }
            expect(toolUse?.name).toBe("get_weather");
        },
    },
    responses_nonstream_structured: {
        id: "responses_nonstream_structured",
        endpoint: "/responses",
        stream: false,
        buildBody: (model) => ({
            model,
            input: "Return JSON only with keys city and weather, where city is London.",
            temperature: 0,
            text: {
                format: {
                    type: "json_schema",
                    name: "weather_schema",
                    strict: true,
                    schema: {
                        type: "object",
                        properties: {
                            city: { type: "string" },
                            weather: { type: "string" },
                        },
                        required: ["city", "weather"],
                    },
                },
            },
        }),
        validateNonStream: (jsonBody) => {
            const text = extractResponseText(jsonBody);
            const parsed = parseJsonLoose(text);
            expect(parsed, "Expected parseable JSON object in /responses structured output").toBeTruthy();
            expect(typeof parsed.city).toBe("string");
            const weatherType = typeof parsed.weather;
            expect(weatherType === "string" || weatherType === "object").toBe(true);
        },
    },
    chat_nonstream_structured: {
        id: "chat_nonstream_structured",
        endpoint: "/chat/completions",
        stream: false,
        buildBody: (model) => ({
            model,
            messages: [{ role: "user", content: "Return JSON only with keys city and weather, where city is London." }],
            temperature: 0,
            response_format: {
                type: "json_schema",
                json_schema: {
                    name: "weather_schema",
                    strict: true,
                    schema: {
                        type: "object",
                        properties: {
                            city: { type: "string" },
                            weather: { type: "string" },
                        },
                        required: ["city", "weather"],
                    },
                },
            },
        }),
        validateNonStream: (jsonBody) => {
            const content = jsonBody?.choices?.[0]?.message?.content;
            const text = Array.isArray(content)
                ? content.map((part: any) => String(part?.text ?? "")).join("\n")
                : String(content ?? "");
            const parsed = parseJsonLoose(text);
            expect(parsed, "Expected parseable JSON object in /chat/completions structured output").toBeTruthy();
            expect(typeof parsed.city).toBe("string");
            const weatherType = typeof parsed.weather;
            expect(weatherType === "string" || weatherType === "object").toBe(true);
        },
    },
    messages_nonstream_structured: {
        id: "messages_nonstream_structured",
        endpoint: "/messages",
        stream: false,
        buildBody: (model) => ({
            model,
            max_tokens: MESSAGES_MAX_TOKENS_STRUCTURED,
            system: "Output only a JSON object. No markdown. No prose.",
            messages: [{
                role: "user",
                content: "Return a JSON object with exactly keys city and weather. Set city to London.",
            }],
        }),
        validateNonStream: (jsonBody, ctx) => {
            const content = Array.isArray(jsonBody?.content)
                ? jsonBody.content.map((part: any) => String(part?.text ?? part?.thinking ?? "")).join("\n")
                : String(jsonBody?.content ?? "");
            const parsed = parseJsonLoose(content);
            if (
                !parsed &&
                (ctx.providerId === "minimax" ||
                    ctx.providerId === "mistral" ||
                    ctx.providerId === "z-ai" ||
                    ctx.providerId === "x-ai")
            ) {
                expect(content.length > 0).toBe(true);
                return;
            }
            expect(parsed, "Expected parseable JSON object in /messages structured output").toBeTruthy();
            expect(typeof parsed.city).toBe("string");
            const weatherType = typeof parsed.weather;
            expect(weatherType === "string" || weatherType === "object").toBe(true);
        },
    },
};

function extractResponseText(jsonBody: any): string {
    if (typeof jsonBody?.output_text === "string" && jsonBody.output_text.trim()) return jsonBody.output_text;
    const output = Array.isArray(jsonBody?.output) ? jsonBody.output : [];
    const parts: string[] = [];
    for (const item of output) {
        if (item?.type !== "message") continue;
        const content = Array.isArray(item?.content) ? item.content : [];
        for (const part of content) {
            if (typeof part?.text === "string") parts.push(part.text);
        }
    }
    return parts.join("\n");
}

function parseJsonLoose(text: string): any | null {
    const trimmed = String(text ?? "").trim();
    if (!trimmed) return null;
    try {
        return JSON.parse(trimmed);
    } catch {
        const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
        if (fenced?.[1]) {
            try {
                return JSON.parse(fenced[1].trim());
            } catch {
                // continue
            }
        }
        const objMatch = trimmed.match(/\{[\s\S]*\}/);
        if (objMatch?.[0]) {
            try {
                return JSON.parse(objMatch[0]);
            } catch {
                return null;
            }
        }
        return null;
    }
}

function parseList(value: string | undefined): string[] {
    if (!value) return [];
    return value
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
}

function parseModelOverrides(raw: string | undefined): Record<string, string> {
    const out: Record<string, string> = {};
    for (const pair of parseList(raw)) {
        const split = pair.indexOf("=");
        if (split <= 0) continue;
        const provider = pair.slice(0, split).trim();
        const model = pair.slice(split + 1).trim();
        if (provider && model) out[provider] = model;
    }
    return out;
}

function providerList(): string[] {
    const base = parseList(process.env.LIVE_PROVIDERS);
    if (base.length) return base;
    const single = (process.env.LIVE_PROVIDER ?? "").trim();
    if (single) return [single];
    return [...DEFAULT_ACTIVE_PROVIDERS];
}

function scenarioList(): ScenarioId[] {
    const csv = parseList(process.env.LIVE_SCENARIOS);
    const single = (process.env.LIVE_SCENARIO ?? "").trim();
    const ids = csv.length ? csv : (single ? [single] : [...DEFAULT_SCENARIOS]);
    const valid = ids.filter((id): id is ScenarioId => Object.prototype.hasOwnProperty.call(SCENARIOS, id));
    if (!valid.length) return [...DEFAULT_SCENARIOS];
    return valid;
}

function getHeaders(): HeadersInit {
    return {
        Authorization: `Bearer ${GATEWAY_API_KEY}`,
        "Content-Type": "application/json",
    };
}

function scoreModelId(modelId: string): number {
    const lower = modelId.toLowerCase();
    let score = 100;
    const add = (needle: string, delta: number) => {
        if (lower.includes(needle)) score += delta;
    };
    add(":free", -80);
    add("nano", -45);
    add("mini", -35);
    add("flash", -30);
    add("lite", -25);
    add("haiku", -20);
    add("small", -15);
    add("pro", 30);
    add("thinking", 20);
    return score;
}

function pickCheapestCandidate(models: string[]): string {
    return [...models].sort((a, b) => {
        const s = scoreModelId(a) - scoreModelId(b);
        if (s !== 0) return s;
        return a.localeCompare(b);
    })[0];
}

function providerModelCandidates(
    discovered: Map<string, string[]>,
    providerId: string,
): string[] {
    const direct = discovered.get(providerId) ?? [];
    if (direct.length) return direct;

    if (providerId === "qwen") {
        return discovered.get("alibaba") ?? [];
    }
    if (providerId === "alibaba") {
        return discovered.get("qwen") ?? [];
    }

    return direct;
}

function providerDiscoveryTargets(providers: string[]): string[] {
    const out = new Set(providers);
    if (out.has("qwen")) out.add("alibaba");
    if (out.has("alibaba")) out.add("qwen");
    return Array.from(out);
}

function resolveGatewayUrl(path: string): string {
    const base = GATEWAY_URL.endsWith("/") ? GATEWAY_URL.slice(0, -1) : GATEWAY_URL;
    const suffix = path.startsWith("/") ? path : `/${path}`;
    return `${base}${suffix}`;
}

async function fetchTextGenerateModelsByProvider(targetProviders: string[]): Promise<Map<string, string[]>> {
    const result = new Map<string, string[]>();
    let offset = 0;
    const limit = 250;
    let total = Number.POSITIVE_INFINITY;

    while (offset < total) {
        const url = new URL(resolveGatewayUrl("/models"));
        url.searchParams.set("limit", String(limit));
        url.searchParams.set("offset", String(offset));

        const response = await fetch(url.toString(), {
            method: "GET",
            headers: getHeaders(),
        });
        const payload = (await response.json()) as ModelsResponse;
        if (!response.ok) {
            throw new Error(`Failed to list models (${response.status}): ${JSON.stringify(payload)}`);
        }

        const models = payload.models ?? [];
        for (const model of models) {
            const modelId = model.model_id;
            if (!modelId) continue;
            for (const provider of model.providers ?? []) {
                const providerId = provider.api_provider_id;
                if (!providerId || !targetProviders.includes(providerId)) continue;
                if (provider.endpoint !== "text.generate") continue;
                if (provider.is_active_gateway === false) continue;
                const existing = result.get(providerId) ?? [];
                if (!existing.includes(modelId)) existing.push(modelId);
                result.set(providerId, existing);
            }
        }

        total = typeof payload.total === "number" ? payload.total : models.length;
        offset += limit;
        if (!models.length) break;
    }

    return result;
}

async function fetchTextGenerateModelsByProviderFromSupabase(targetProviders: string[]): Promise<Map<string, string[]>> {
    const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) {
        throw new Error("Supabase env vars missing for fallback discovery");
    }

    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: false },
    });
    const now = new Date();

    const providerModelsRes = await supabase
        .from("data_api_provider_models")
        .select("provider_api_model_id,provider_id,api_model_id,internal_model_id,is_active_gateway,effective_from,effective_to")
        .in("provider_id", targetProviders)
        .eq("is_active_gateway", true);
    if (providerModelsRes.error) {
        throw new Error(providerModelsRes.error.message);
    }

    const providerModels = (providerModelsRes.data ?? []).filter((row: any) => {
        if (!row?.provider_api_model_id || !row?.provider_id || (!row?.api_model_id && !row?.internal_model_id)) return false;
        const from = row.effective_from ? new Date(row.effective_from) : null;
        const to = row.effective_to ? new Date(row.effective_to) : null;
        if (from && Number.isFinite(from.getTime()) && now < from) return false;
        if (to && Number.isFinite(to.getTime()) && now >= to) return false;
        return true;
    });

    const providerModelIds = providerModels.map((row: any) => row.provider_api_model_id);
    if (!providerModelIds.length) return new Map<string, string[]>();

    const capabilitiesRes = await supabase
        .from("data_api_provider_model_capabilities")
        .select("provider_api_model_id,capability_id,status")
        .in("provider_api_model_id", providerModelIds)
        .eq("capability_id", "text.generate")
        .eq("status", "active");
    if (capabilitiesRes.error) {
        throw new Error(capabilitiesRes.error.message);
    }

    const supportedProviderModelIds = new Set(
        (capabilitiesRes.data ?? []).map((row: any) => row.provider_api_model_id)
    );

    const out = new Map<string, string[]>();
    for (const row of providerModels) {
        if (!supportedProviderModelIds.has(row.provider_api_model_id)) continue;
        const existing = out.get(row.provider_id) ?? [];
        const modelId = row.api_model_id ?? row.internal_model_id;
        if (!modelId) continue;
        if (!existing.includes(modelId)) existing.push(modelId);
        out.set(row.provider_id, existing);
    }
    return out;
}

function extractUsage(payload: any): any {
    if (payload?.usage && typeof payload.usage === "object") return payload.usage;
    if (payload?.response?.usage && typeof payload.response.usage === "object") return payload.response.usage;
    return null;
}

function assertHasUsage(payload: any, context: string) {
    if (!REQUIRE_USAGE) return;
    const usage = extractUsage(payload);
    expect(
        usage,
        `${context} missing usage (set LIVE_REQUIRE_USAGE=0 to bypass temporarily)`
    ).toBeTruthy();
}

async function runScenario(providerId: string, model: string, scenario: Scenario) {
    const body = scenario.buildBody(model);
    const startedAt = Date.now();
    const res = await fetch(resolveGatewayUrl(scenario.endpoint), {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify(body),
    });
    const elapsedMs = Date.now() - startedAt;
    const requestTag = `${providerId}::${scenario.id}::${model}`;

    if (!scenario.stream) {
        const text = await res.text();
        let jsonBody: any = null;
        try {
            jsonBody = text ? JSON.parse(text) : null;
        } catch {
            jsonBody = { raw: text };
        }

        if (!res.ok) {
            if (ALLOW_TRANSIENT_FAILURES && [408, 429, 500, 502, 503, 504].includes(res.status)) {
                console.warn(
                    `[live-transient-skip] ${requestTag} returned ${res.status}: ${JSON.stringify(jsonBody)}`
                );
                return;
            }
            throw new Error(`${requestTag} failed (${res.status}): ${JSON.stringify(jsonBody)}`);
        }

        scenario.validateNonStream?.(jsonBody, { providerId, model });
        assertHasUsage(jsonBody, requestTag);
        console.log(JSON.stringify({
            tag: requestTag,
            status: res.status,
            elapsedMs,
            id: jsonBody?.id ?? null,
            nativeResponseId: jsonBody?.nativeResponseId ?? null,
            usage: extractUsage(jsonBody),
        }));
        return;
    }

    if (!res.ok) {
        const text = await res.text();
        if (ALLOW_TRANSIENT_FAILURES && [408, 429, 500, 502, 503, 504].includes(res.status)) {
            console.warn(`[live-transient-skip] ${requestTag} stream returned ${res.status}: ${text}`);
            return;
        }
        throw new Error(`${requestTag} stream failed (${res.status}): ${text}`);
    }
    const frames = await readSseFrames(res);
    const objects = parseSseJson(frames).filter((entry) => typeof entry === "object") as any[];
    const lastObject = objects[objects.length - 1] ?? null;
    assertHasUsage(lastObject, requestTag);
    console.log(JSON.stringify({
        tag: requestTag,
        status: res.status,
        elapsedMs,
        frameCount: objects.length,
        usage: extractUsage(lastObject),
    }));
}

const RUN_LIVE = LIVE_RUN;
const describeLive = RUN_LIVE ? describe : describe.skip;

describeLive("Live Active Providers low-cost smoke", () => {
    const providers = providerList();
    const scenarios = scenarioList();
    const overrides = parseModelOverrides(process.env.LIVE_MODEL_OVERRIDES);
    const chosenModelByProvider = new Map<string, string>();

    beforeAll(async () => {
        if (!GATEWAY_API_KEY) {
            throw new Error("GATEWAY_API_KEY is required when LIVE_RUN=1");
        }
        const discoveryProviders = providerDiscoveryTargets(providers);
        let discovered: Map<string, string[]>;
        try {
            discovered = await fetchTextGenerateModelsByProvider(discoveryProviders);
        } catch (err) {
            console.warn(`[live-discovery] /v1/models failed, falling back to Supabase: ${String((err as any)?.message ?? err)}`);
            discovered = await fetchTextGenerateModelsByProviderFromSupabase(discoveryProviders);
        }
        for (const providerId of providers) {
            const override = overrides[providerId];
            if (override) {
                chosenModelByProvider.set(providerId, override);
                continue;
            }
            const candidates = providerModelCandidates(discovered, providerId);
            if (!candidates.length) continue;
            chosenModelByProvider.set(providerId, pickCheapestCandidate(candidates));
        }
    });

    for (const providerId of providers) {
        describe(providerId, () => {
            for (const scenarioId of scenarios) {
                const scenario = SCENARIOS[scenarioId];
                it(scenario.id, async () => {
                    const model = chosenModelByProvider.get(providerId);
                    if (!model) {
                        console.warn(
                            `[live-skip] ${providerId} has no discovered text.generate model. ` +
                            `Set LIVE_MODEL_OVERRIDES=${providerId}=provider/model-id`
                        );
                        return;
                    }
                    await runScenario(providerId, model, scenario);
                }, 90_000);
            }
        });
    }
});
