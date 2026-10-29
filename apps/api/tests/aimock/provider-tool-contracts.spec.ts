import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { IRChatRequest } from "@core/ir";
import { resolveProviderExecutor } from "@executors/index";
import { decodeProtocol } from "@protocols/index";
import {
    loadBundledProviderContract,
    ProviderMockServer,
    registerAnthropicProvider,
    registerGoogleAIStudioProvider,
    registerNovitaProvider,
    registerXAIProvider,
} from "../../../../packages/testing/provider-mock/src/index";
import { setupRuntimeFromEnv, teardownTestRuntime } from "../helpers/runtime";
import { installLoopbackOnlyFetchGuard } from "../helpers/network-guard";

const mock = new ProviderMockServer();
let restoreFetch: (() => void) | undefined;

const tool = {
    type: "function",
    function: {
        name: "lookup_weather",
        description: "Look up weather for a city",
        parameters: {
            type: "object",
            properties: { city: { type: "string" } },
            required: ["city"],
            additionalProperties: false,
        },
        strict: true,
    },
};

// Active text.generate models that declared the tools parameter in the catalogue (2026-10-28).
const TOOL_MODELS_BY_PROVIDER: Record<string, string[]> = {
    anthropic: [
        "claude-haiku-4-5-20251001", "claude-opus-4-5-20251101", "claude-opus-4-6", "claude-opus-4-7",
        "claude-opus-5", "claude-sonnet-4-5-20250929", "claude-opus-4-8",
    ],
    "google-ai-studio": [
        "gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.5-pro", "gemini-3-flash-preview",
        "gemini-3.1-flash-lite", "gemini-3.1-pro-preview", "gemini-3.1-pro-preview-customtools", "gemini-3.5-flash",
        "gemini-robotics-er-1.6-preview", "gemini-robotics-er-2-preview",
    ],
    "x-ai": ["grok-4.20-multi-agent-beta-0309", "grok-4.3", "grok-4.5", "grok-4.6", "grok-build-0.1"],
};

const modelCases = Object.entries(TOOL_MODELS_BY_PROVIDER).flatMap(([providerId, models]) =>
    models.map((model) => [providerId, model] as const));

async function execute(providerId: string, model: string, requestId: string, additionalBody: Record<string, unknown> = {}) {
    const executor = resolveProviderExecutor(providerId, "text.generate");
    if (!executor) throw new Error(`missing text executor for ${providerId}`);
    const ir = decodeProtocol("openai.chat.completions", {
        model,
        messages: [{ role: "user", content: "What is the weather in London?" }],
        tools: [tool],
        tool_choice: "required",
        ...additionalBody,
    }) as IRChatRequest;
    ir.stream = false;
    return executor({
        ir,
        requestId,
        workspaceId: "ws_provider_tool_contract",
        providerId,
        endpoint: "chat.completions",
        protocol: "openai.chat.completions",
        capability: "text.generate",
        providerModelSlug: model,
        capabilityParams: null,
        maxInputTokens: null,
        maxOutputTokens: 256,
        byokMeta: [],
        pricingCard: { provider: providerId, model, endpoint: "chat.completions", effective_from: null, effective_to: null, currency: "USD", version: null, rules: [] },
        meta: { returnMeta: false, trace: null, testId: `tools-${providerId}` },
    });
}

function expectToolCall(result: Awaited<ReturnType<typeof execute>>) {
    expect(result.kind).toBe("completed");
    expect(result.upstream.status).toBe(200);
    expect((result.kind === "completed" ? result.ir : undefined) as any).toMatchObject({
        choices: [{ message: { toolCalls: [{ name: "lookup_weather", arguments: JSON.stringify({ city: "London" }) }] }, finishReason: "tool_calls" }],
    });
}

describe("provider-native tool contract E2E", () => {
    beforeAll(async () => {
        registerAnthropicProvider(mock, await loadBundledProviderContract("anthropic"));
        registerGoogleAIStudioProvider(mock, await loadBundledProviderContract("google-ai-studio"));
        registerXAIProvider(mock, await loadBundledProviderContract("x-ai"));
        registerNovitaProvider(mock, await loadBundledProviderContract("novita"));
        await mock.start();
        restoreFetch = installLoopbackOnlyFetchGuard();
        setupRuntimeFromEnv({
            ANTHROPIC_API_KEY: "test-anthropic-key",
            ANTHROPIC_BASE_URL: mock.url,
            GOOGLE_AI_STUDIO_API_KEY: "test-google-key",
            GOOGLE_AI_STUDIO_BASE_URL: mock.url,
            GOOGLE_BASE_URL: mock.url,
            X_AI_API_KEY: "test-xai-key",
            XAI_BASE_URL: mock.url,
            NOVITA_API_KEY: "test-novita-key",
            NOVITA_BASE_URL: mock.url,
            NODE_ENV: "test",
        } as any);
    });

    afterAll(async () => {
        teardownTestRuntime();
        restoreFetch?.();
        await mock.stop();
    });

    it("maps OpenAI tools to Anthropic input_schema and normalizes tool_use", async () => {
        const result = await execute("anthropic", "claude-sonnet-4-5", "req_anthropic_tools");
        expectToolCall(result);
        const request = mock.getLastRequest();
        expect(request?.providerId).toBe("anthropic");
        expect(request?.body).toMatchObject({
            tools: [{ name: "lookup_weather", input_schema: tool.function.parameters }],
            tool_choice: { type: "any" },
        });
        expect(request?.validationIssues).toEqual([]);
    });

    it("maps OpenAI tools to Gemini Interactions functions and normalizes function calls", async () => {
        const result = await execute("google-ai-studio", "gemini-2.5-flash", "req_google_tools");
        expectToolCall(result);
        const request = mock.getLastRequest();
        expect(request?.providerId).toBe("google-ai-studio");
        expect(request?.body).toMatchObject({
            tools: [{
                type: "function",
                name: "lookup_weather",
                parameters: {
                    type: "object",
                    properties: { city: { type: "string" } },
                    required: ["city"],
                },
            }],
            generation_config: { tool_choice: "any" },
        });
        expect(request?.validationIssues).toEqual([]);
    });

    it("maps OpenAI tools to xAI Responses function tools and normalizes function_call", async () => {
        const result = await execute("x-ai", "grok-4", "req_xai_tools");
        expectToolCall(result);
        const request = mock.getLastRequest();
        expect(request?.providerId).toBe("x-ai");
        expect(request?.body).toMatchObject({
            tools: [{ type: "function", name: "lookup_weather", parameters: tool.function.parameters }],
            tool_choice: "required",
            store: false,
            stream: true,
        });
        expect(request?.validationIssues).toEqual([]);
    });

    it("validates Novita tools against the Mintlify-compiled contract", async () => {
        const result = await execute("novita", "deepseek/deepseek-v4-pro", "req_novita_tools", { max_tokens: 32 });
        const request = mock.getLastRequest();
        expect(request?.body, JSON.stringify({ result: result.kind === "completed" ? result.rawResponse : null, request }, null, 2)).toMatchObject({ tools: [{ type: "function" }] });
        expectToolCall(result);
        expect(request?.providerId).toBe("novita");
        expect(request?.path).toBe("/openai/v1/chat/completions");
        expect(request?.body).toMatchObject({
            model: "deepseek/deepseek-v4-pro",
            max_tokens: 32,
            tools: [{ type: "function", function: { name: "lookup_weather", strict: true } }],
        });
        expect(request?.validationIssues).toEqual([]);
    });

    it.each(modelCases)("executes the declared tool contract for %s model %s", async (providerId, model) => {
        const result = await execute(providerId, model, `req_tools_${providerId}_${model}`);
        expectToolCall(result);
        const request = mock.getLastRequest();
        expect(request?.providerId).toBe(providerId);
        expect(request?.validationIssues).toEqual([]);
    });
});
