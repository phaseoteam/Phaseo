import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ProviderMockServer } from "../../../../packages/testing/provider-mock/src/index";
import { decodeProtocol } from "@protocols/index";
import { resolveProviderExecutor } from "@executors/index";
import { setupRuntimeFromEnv, teardownTestRuntime } from "../helpers/runtime";
import { installLoopbackOnlyFetchGuard } from "../helpers/network-guard";
import type { IRChatRequest } from "@core/ir";

const mock = new ProviderMockServer();
let restoreFetch: (() => void) | undefined;

function chatStream(text: string): string {
    return [
        `data: ${JSON.stringify({
            id: "chatcmpl_provider_mock",
            object: "chat.completion.chunk",
            created: 1,
            model: "mock-model",
            choices: [{ index: 0, delta: { role: "assistant", content: text }, finish_reason: null }],
        })}`,
        `data: ${JSON.stringify({
            id: "chatcmpl_provider_mock",
            object: "chat.completion.chunk",
            created: 1,
            model: "mock-model",
            choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
            usage: { prompt_tokens: 3, completion_tokens: 1, total_tokens: 4 },
        })}`,
        "data: [DONE]",
        "",
    ].join("\n\n");
}

describe("provider contract adaptation E2E", () => {
    beforeAll(async () => {
        mock.registerOpenApi("deepseek", {
            openapi: "3.1.0",
            paths: {
                "/v1/chat/completions": {
                    post: {
                        operationId: "createChatCompletion",
                        requestBody: {
                            content: {
                                "application/json": {
                                    schema: {
                                        type: "object",
                                        required: ["model", "messages"],
                                        additionalProperties: false,
                                        properties: {
                                            model: { type: "string" },
                                            messages: { type: "array" },
                                            stream: { type: "boolean" },
                                            stream_options: { type: "object" },
                                        },
                                    },
                                },
                            },
                        },
                        responses: { "200": {} },
                    },
                },
            },
        }, {
            defaultResponse: {
                headers: { "content-type": "text/event-stream" },
                body: chatStream("adapted"),
            },
        });
        await mock.start();
        restoreFetch = installLoopbackOnlyFetchGuard();
        setupRuntimeFromEnv({
            DEEPSEEK_API_KEY: "test-deepseek-key",
            DEEPSEEK_BASE_URL: mock.url,
            NODE_ENV: "test",
        } as any);
    });

    afterAll(async () => {
        teardownTestRuntime();
        restoreFetch?.();
        await mock.stop();
    });

    it("retries once without the parameter rejected by the provider contract", async () => {
        const executor = resolveProviderExecutor("deepseek", "text.generate");
        expect(executor).toBeTruthy();
        const ir = decodeProtocol("openai.chat.completions", {
            model: "mock-model",
            messages: [{ role: "user", content: "hello" }],
            service_tier: "priority",
        }) as IRChatRequest;
        ir.stream = false;

        const result = await executor!({
            ir,
            requestId: "req_provider_contract_adaptation",
            workspaceId: "ws_provider_mock",
            providerId: "deepseek",
            endpoint: "chat.completions",
            protocol: "openai.chat.completions",
            capability: "text.generate",
            providerModelSlug: "mock-model",
            capabilityParams: null,
            maxInputTokens: null,
            maxOutputTokens: null,
            byokMeta: [],
            pricingCard: {
                provider: "deepseek",
                model: "mock-model",
                endpoint: "chat.completions",
                effective_from: null,
                effective_to: null,
                currency: "USD",
                version: null,
                rules: [],
            },
            meta: { returnMeta: false, trace: null, testId: "drops-service-tier" },
        });

        expect(result.kind).toBe("completed");
        expect(result.kind === "completed" && result.rawResponse?.choices?.[0]?.message?.content).toBe("adapted");
        const attempts = mock.getRequests({ providerId: "deepseek" });
        expect(attempts).toHaveLength(2);
        expect(attempts[0]?.body).toMatchObject({ service_tier: "priority" });
        expect(attempts[0]?.response.status).toBe(400);
        expect(attempts[1]?.body).not.toHaveProperty("service_tier");
        expect(attempts[1]?.response.status).toBe(200);
        expect(attempts.every((attempt) => attempt.headers["x-test-id"] === "drops-service-tier")).toBe(true);
    });
});
