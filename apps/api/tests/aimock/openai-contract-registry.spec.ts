import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { decodeProtocol } from "@protocols/index";
import { resolveProviderExecutor } from "@executors/index";
import type { IRChatRequest } from "@core/ir";
import {
    assertConformanceExpectations,
    buildModelConformanceMatrix,
    loadBundledProviderContract,
    ProviderContractRegistry,
    ProviderMockServer,
    registerOpenAIProvider,
} from "../../../../packages/testing/provider-mock/src/index";
import openAIModels from "../../../../packages/data/catalog/src/data/api_providers/openai/models.json";
import { setupRuntimeFromEnv, teardownTestRuntime } from "../helpers/runtime";
import { installLoopbackOnlyFetchGuard } from "../helpers/network-guard";

const mock = new ProviderMockServer();
let restoreFetch: (() => void) | undefined;

const OPENAI_PARAMETER_EXPECTATIONS = {
    callback_url: { outcome: "forwarded", requestValue: "https://example.test/webhook", upstreamPaths: ["callback_url"] },
    completion_window: { outcome: "forwarded", requestValue: "24h", upstreamPaths: ["completion_window"] },
    duration: { outcome: "transformed", requestValue: 4, upstreamPaths: ["seconds"] },
    endpoint: { outcome: "forwarded", requestValue: "/v1/responses", upstreamPaths: ["endpoint"] },
    frequency_penalty: { outcome: "forwarded", requestValue: 0.2, upstreamPaths: ["frequency_penalty"] },
    generate_audio: { outcome: "forwarded", requestValue: false, upstreamPaths: ["generate_audio"] },
    include: { outcome: "forwarded", requestValue: ["message.output_text.logprobs"], upstreamPaths: ["include"] },
    include_reasoning: { outcome: "transformed", requestValue: true, upstreamPaths: ["include"] },
    input: { outcome: "forwarded", requestValue: "mock input", upstreamPaths: ["input"] },
    input_image: { outcome: "transformed", requestValue: "https://example.test/input.png", upstreamPaths: ["input_reference"] },
    input_video: { outcome: "transformed", requestValue: "https://example.test/input.mp4", upstreamPaths: ["input_reference"] },
    language: { outcome: "forwarded", requestValue: "en", upstreamPaths: ["language"] },
    last_frame: { outcome: "forwarded", requestValue: "https://example.test/last.png", upstreamPaths: ["last_frame"] },
    logit_bias: { outcome: "forwarded", requestValue: { "42": 1 }, upstreamPaths: ["logit_bias"] },
    logprobs: { outcome: "forwarded", requestValue: true, upstreamPaths: ["logprobs"] },
    max_tokens: { outcome: "transformed", requestValue: 32, upstreamPaths: ["max_output_tokens", "max_completion_tokens"] },
    presence_penalty: { outcome: "forwarded", requestValue: 0.2, upstreamPaths: ["presence_penalty"] },
    prompt: { outcome: "forwarded", requestValue: "mock prompt", upstreamPaths: ["prompt"] },
    reasoning: { outcome: "transformed", requestValue: { effort: "medium" }, upstreamPaths: ["reasoning.effort", "reasoning_effort"] },
    "reasoning.mode": { outcome: "transformed", requestValue: "enabled", upstreamPaths: ["reasoning"] },
    reference_images: { outcome: "transformed", requestValue: ["https://example.test/reference.png"], upstreamPaths: ["input_reference"] },
    response_format: { outcome: "transformed", requestValue: { type: "json_object" }, upstreamPaths: ["text.format", "response_format"] },
    seed: { outcome: "forwarded", requestValue: 42, upstreamPaths: ["seed"] },
    size: { outcome: "forwarded", requestValue: "1024x1024", upstreamPaths: ["size"] },
    stop: { outcome: "forwarded", requestValue: ["STOP"], upstreamPaths: ["stop"] },
    structured_outputs: { outcome: "transformed", requestValue: true, upstreamPaths: ["text.format", "response_format"] },
    temperature: { outcome: "forwarded", requestValue: 0.4, upstreamPaths: ["temperature"] },
    timestamp_granularities: { outcome: "transformed", requestValue: ["word"], upstreamPaths: ["timestamp_granularities[]"] },
    tool_choice: { outcome: "forwarded", requestValue: "auto", upstreamPaths: ["tool_choice"] },
    tools: { outcome: "transformed", requestValue: [], upstreamPaths: ["tools"] },
    top_logprobs: { outcome: "forwarded", requestValue: 2, upstreamPaths: ["top_logprobs"] },
    top_p: { outcome: "forwarded", requestValue: 0.9, upstreamPaths: ["top_p"] },
    web_search_options: { outcome: "transformed", requestValue: {}, upstreamPaths: ["tools"] },
} as const;

const openAIModelMatrix = buildModelConformanceMatrix(openAIModels as any, OPENAI_PARAMETER_EXPECTATIONS as any, {
    now: "2026-07-12T00:00:00Z",
});
const openAITextBaselines = openAIModelMatrix.cases.filter((entry) =>
    entry.kind === "baseline" && entry.capability === "text.generate");

async function executeOpenAITextModel(
    model: string,
    requestId: string,
    options: { body?: Record<string, unknown>; protocol?: "openai.responses" | "openai.chat.completions"; capabilityParams?: any } = {},
) {
    const executor = resolveProviderExecutor("openai", "text.generate");
    if (!executor) throw new Error("missing OpenAI text executor");
    const protocol = options.protocol ?? "openai.responses";
    const body = options.body ?? { model, input: "model conformance" };
    const ir = decodeProtocol(protocol, body) as IRChatRequest;
    ir.stream = false;
    return executor({
        ir,
        requestId,
        workspaceId: "ws_provider_mock",
        providerId: "openai",
        endpoint: "responses",
        protocol,
        capability: "text.generate",
        providerModelSlug: model,
        capabilityParams: options.capabilityParams ?? null,
        maxInputTokens: null,
        maxOutputTokens: null,
        byokMeta: [],
        pricingCard: { provider: "openai", model, endpoint: "responses", effective_from: null, effective_to: null, currency: "USD", version: null, rules: [] },
        meta: { returnMeta: false, trace: null, testId: "openai-model-conformance" },
    });
}

function textParameterBody(model: string, parameter: string): {
    protocol: "openai.responses" | "openai.chat.completions";
    body: Record<string, unknown>;
} {
    const responses: Record<string, unknown> = { model, input: "parameter conformance" };
    switch (parameter) {
        case "max_tokens": responses.max_output_tokens = 32; break;
        case "reasoning": responses.reasoning = { effort: "medium" }; break;
        case "reasoning.mode": responses.reasoning = { effort: "medium", mode: "pro" }; break;
        case "response_format": responses.text = { format: { type: "json_object" } }; break;
        case "structured_outputs": responses.text = { format: { type: "json_schema", name: "result", strict: true, schema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"], additionalProperties: false } } }; break;
        case "tools": responses.tools = [{ type: "function", name: "lookup", description: "Lookup", parameters: { type: "object", properties: {} } }]; break;
        case "tool_choice": responses.tools = [{ type: "function", name: "lookup", parameters: { type: "object", properties: {} } }]; responses.tool_choice = "auto"; break;
        case "include_reasoning": responses.include = ["reasoning.encrypted_content"]; break;
        case "include": responses.include = ["message.output_text.logprobs"]; break;
        case "seed": responses.seed = 42; break;
        case "temperature": responses.temperature = 0.4; break;
        case "top_p": responses.top_p = 0.9; break;
        case "frequency_penalty": responses.frequency_penalty = 0.2; break;
        case "presence_penalty": responses.presence_penalty = 0.2; break;
        case "logit_bias": responses.logit_bias = { "42": 1 }; break;
        case "logprobs": responses.include = ["message.output_text.logprobs"]; break;
        case "top_logprobs": responses.include = ["message.output_text.logprobs"]; responses.top_logprobs = 2; break;
        case "web_search_options": responses.tools = [{ type: "web_search_preview" }]; break;
        case "stop": return { protocol: "openai.chat.completions", body: { model, messages: [{ role: "user", content: "parameter conformance" }], stop: ["STOP"] } };
        default: throw new Error(`no text parameter request fixture for ${parameter}`);
    }
    return { protocol: "openai.responses", body: responses };
}

function hasPath(value: unknown, path: string): boolean {
    const normalized = path.replace(/\[\]$/, "");
    let current: any = value;
    for (const segment of normalized.split(".")) {
        if (current == null || typeof current !== "object" || !(segment in current)) return false;
        current = current[segment];
    }
    return path.endsWith("[]") ? Array.isArray(current) : true;
}

function expectedOpenAIUpstreamModel(providerModelSlug: string): string {
    if (/^gpt-5\.6-(?:luna|sol|terra)-pro$/i.test(providerModelSlug)) {
        return providerModelSlug.slice(0, -4);
    }
    return providerModelSlug;
}

describe("OpenAI contract registry gateway E2E", () => {
    beforeAll(async () => {
        const contract = await loadBundledProviderContract("openai");
        new ProviderContractRegistry().register(contract).assertCoverage("openai");
        registerOpenAIProvider(mock, contract, { text: "OpenAI registry gateway response." });
        await mock.start();
        restoreFetch = installLoopbackOnlyFetchGuard();
        setupRuntimeFromEnv({
            OPENAI_API_KEY: "test-openai-key",
            OPENAI_BASE_URL: mock.url,
            NODE_ENV: "test",
        } as any);
    });

    afterAll(async () => {
        teardownTestRuntime();
        restoreFetch?.();
        await mock.stop();
    });

    it("runs a Responses request through the real OpenAI executor and official contract", async () => {
        const executor = resolveProviderExecutor("openai", "text.generate");
        expect(executor).toBeTruthy();
        const ir = decodeProtocol("openai.responses", {
            model: "gpt-5.4-nano",
            input: "hello from the registry",
        }) as IRChatRequest;
        ir.stream = false;

        const result = await executor!({
            ir,
            requestId: "req_openai_registry_e2e",
            workspaceId: "ws_provider_mock",
            providerId: "openai",
            endpoint: "responses",
            protocol: "openai.responses",
            capability: "text.generate",
            providerModelSlug: "gpt-5.4-nano",
            capabilityParams: null,
            maxInputTokens: null,
            maxOutputTokens: null,
            byokMeta: [],
            pricingCard: {
                provider: "openai",
                model: "gpt-5.4-nano",
                endpoint: "responses",
                effective_from: null,
                effective_to: null,
                currency: "USD",
                version: null,
                rules: [],
            },
            meta: { returnMeta: false, returnUpstreamRequest: true, trace: null, testId: "openai-registry" },
        });

        expect(result.kind).toBe("completed");
        expect(result.kind === "completed" && result.rawResponse?.output?.[0]?.content?.[0]?.text)
            .toBe("OpenAI registry gateway response.");
        const request = mock.getLastRequest();
        expect(request).toMatchObject({
            providerId: "openai",
            operationId: "createResponse",
            path: "/v1/responses",
            headers: { "x-test-id": "openai-registry" },
            response: { status: 200 },
        });
        expect(request?.body).toMatchObject({
            model: "gpt-5.4-nano",
            store: false,
            safety_identifier: "ws_provider_mock",
            metadata: { phaseo_request_id: "req_openai_registry_e2e" },
        });
        expect(request?.validationIssues).toEqual([]);
    });

    it("round-trips a strict function tool through the real OpenAI Responses executor", async () => {
        const result = await executeOpenAITextModel("gpt-5.4-nano", "req_openai_tool_contract", {
            protocol: "openai.responses",
            body: {
                model: "gpt-5.4-nano",
                input: "What is the weather in London?",
                tools: [{
                    type: "function",
                    name: "lookup_weather",
                    description: "Look up weather for a city",
                    parameters: { type: "object", properties: { city: { type: "string" } }, required: ["city"], additionalProperties: false },
                    strict: true,
                }],
                tool_choice: "required",
            },
        });
        const request = mock.getLastRequest();
        expect(result.upstream.status, JSON.stringify(request, null, 2)).toBe(200);
        expect(result.kind).toBe("completed");
        expect(result.kind === "completed" && (result.ir as any)?.choices?.[0]?.message?.toolCalls?.[0], JSON.stringify(result.kind === "completed" ? { ir: result.ir, rawResponse: result.rawResponse } : result, null, 2)).toMatchObject({
            name: "lookup_weather",
            arguments: JSON.stringify({ city: "London" }),
        });
        expect(request?.body).toMatchObject({
            tools: [{ type: "function", name: "lookup_weather", strict: true }],
            tool_choice: "required",
        });
        expect(request?.validationIssues).toEqual([]);
    });

    it("has an explicit expected outcome for every active OpenAI model parameter", () => {
        expect(() => assertConformanceExpectations(openAIModelMatrix)).not.toThrow();
        expect(openAIModelMatrix.activeModels).toBeGreaterThan(50);
        expect(openAIModelMatrix.capabilities).toEqual(expect.arrayContaining([
            "text.generate",
            "text.embed",
            "image.generate",
            "audio.speech",
            "video.generate",
            "batch",
        ]));
        expect(openAIModelMatrix.cases.filter((entry) => entry.kind === "parameter").length).toBeGreaterThan(300);
    });

    it.each(openAITextBaselines)("validates model baseline: $modelId", async (testCase) => {
        const requestId = `req_model_${testCase.providerModelSlug.replace(/[^a-z0-9]+/gi, "_")}`;
        const result = await executeOpenAITextModel(testCase.providerModelSlug, requestId);
        expect(result.kind).toBe("completed");
        const request = mock.getLastRequest();
        expect(request?.response.status).toBe(200);
        expect(request?.validationIssues).toEqual([]);
        expect(request?.body).toMatchObject({ model: expectedOpenAIUpstreamModel(testCase.providerModelSlug) });
        if (/^gpt-5\.6-(?:luna|sol|terra)-pro$/i.test(testCase.providerModelSlug)) {
            expect(request?.body).toMatchObject({ reasoning: { mode: "pro" } });
        }
    });

    it("executes every declared OpenAI text model + parameter expectation", async () => {
        const executableParameters = new Set([
            "max_tokens",
            "temperature",
            "top_p",
            "seed",
            "stop",
            "frequency_penalty",
            "presence_penalty",
            "logit_bias",
            "response_format",
            "structured_outputs",
        ]);
        const cases = openAIModelMatrix.cases.filter((entry) =>
            entry.kind === "parameter" &&
            entry.capability === "text.generate" &&
            executableParameters.has(entry.parameter ?? ""));
        const failures: string[] = [];
        for (const testCase of cases) {
            try {
                const fixture = textParameterBody(testCase.providerModelSlug, testCase.parameter!);
                const model = (openAIModels as any[]).find((entry) => entry.api_model_id === testCase.modelId);
                const capability = model?.capabilities?.find((entry: any) => entry.capability_id === "text.generate");
                const allowlist = Array.isArray(capability?.params)
                    ? capability.params.map((entry: any) => typeof entry === "string" ? entry : entry.param_id).filter(Boolean)
                    : Object.keys(capability?.params ?? {});
                const result = await executeOpenAITextModel(testCase.providerModelSlug, `req_param_${failures.length}_${testCase.parameter}`, {
                    ...fixture,
                    capabilityParams: { request: { allowlist } },
                });
                const request = mock.getLastRequest();
                if (testCase.expected?.outcome === "rejected") {
                    if (request?.response.status === 200) failures.push(`${testCase.id}: expected rejection`);
                    continue;
                }
                if (result.kind !== "completed" || request?.response.status !== 200) {
                    failures.push(`${testCase.id}: request failed with ${request?.response.status}`);
                    continue;
                }
                const paths = testCase.expected?.upstreamPaths ?? [];
                const present = paths.some((path) => hasPath(request.body, path));
                if (testCase.expected?.outcome === "dropped" ? present : !present) {
                    failures.push(`${testCase.id}: expected ${testCase.expected?.outcome} at one of [${paths.join(", ")}]`);
                }
            } catch (error) {
                failures.push(`${testCase.id}: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
        expect(failures).toEqual([]);
        expect(cases.length).toBeGreaterThan(150);
    }, 60_000);
});
