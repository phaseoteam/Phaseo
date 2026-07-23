import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { decodeProtocol, encodeProtocol } from "@protocols/index";
import { doRequestWithIR, type PipelineTiming } from "@pipeline/execute";
import { adapterFor } from "@providers/index";
import { Timer } from "@pipeline/telemetry/timer";
import type { PipelineContext, ProviderCandidate } from "@pipeline/before/types";
import type { IRChatRequest } from "@core/ir";
import {
    getAimock,
    isScenarioEnabled,
    resetAimockState,
    startAimock,
    stopAimock,
} from "./harness";

const PROTOCOL = "openai.chat.completions" as const;

type FailoverCase = {
    gatewayModel: string;
    expectedPrimaryStatus: number;
    prompt: string;
    primaryModel: string;
    secondaryModel: string;
    expectedText: string;
};

async function waitForAimockRequests(expectedCount: number, timeoutMs = 250) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const requests = getAimock().getRequests();
        if (requests.length >= expectedCount) {
            return requests;
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
    return getAimock().getRequests();
}

function candidate(providerId: string, providerModelSlug: string, baseWeight: number): ProviderCandidate {
    const adapter = adapterFor(providerId, "chat.completions");
    if (!adapter) {
        throw new Error(`missing adapter for ${providerId}`);
    }
    return {
        providerId,
        providerStatus: "active",
        providerRoutingStatus: "active",
        modelRoutingStatus: "active",
        capabilityStatus: "active",
        adapter,
        baseWeight,
        byokMeta: [],
        pricingCard: {
            provider: providerId,
            model: providerModelSlug,
            endpoint: "chat.completions",
            effective_from: null,
            effective_to: null,
            currency: "USD",
            version: null,
            rules: [],
        },
        providerModelSlug,
        capabilityParams: null,
        maxInputTokens: null,
        maxOutputTokens: null,
    };
}

function buildContext(testCase: FailoverCase): PipelineContext {
    const body = {
        model: testCase.gatewayModel,
        messages: [{ role: "user", content: testCase.prompt }],
        provider: {
            order: ["openai", "x-ai"],
        },
    };

    return {
        endpoint: "chat.completions",
        capability: "text.generate",
        requestId: `req_aimock_${crypto.randomUUID()}`,
        protocol: PROTOCOL,
        meta: {
            apiKeyId: "kid_aimock",
            apiKeyRef: "kid_aimock",
            apiKeyKid: "kid_aimock",
            requestId: `req_aimock_${crypto.randomUUID()}`,
            stream: false,
            keySource: "gateway",
            byokKeyId: null,
            testId: `aimock-${crypto.randomUUID()}`,
        },
        rawBody: body,
        body,
        model: body.model,
        workspaceId: "ws_aimock_ci",
        stream: false,
        providers: [
            candidate("openai", testCase.primaryModel, 100),
            candidate("x-ai", testCase.secondaryModel, 10),
        ],
        pricing: {},
        gating: {
            key: { ok: true, reason: null, resetAt: null },
            keyLimit: { ok: true, reason: null, resetAt: null },
            credit: { ok: true, reason: null, resetAt: null },
        },
        teamSettings: {
            routingMode: null,
            byokFallbackEnabled: false,
            betaChannelEnabled: false,
            billingMode: "wallet",
        },
    };
}

describe("AIMock pipeline failover", () => {
    beforeAll(async () => {
        await startAimock();
    });

    afterAll(async () => {
        await stopAimock();
    });

    beforeEach(() => {
        resetAimockState();
    });

    if (isScenarioEnabled("failover")) {
        it.each<FailoverCase>([
            {
                gatewayModel: "aimock-fallback-gateway-model",
                expectedPrimaryStatus: 500,
                prompt: "[aimock-fallback] route",
                primaryModel: "aimock-primary-fallback",
                secondaryModel: "aimock-secondary-fallback",
                expectedText: "Fallback provider succeeded",
            },
            {
                gatewayModel: "aimock-fallback-429-gateway-model",
                expectedPrimaryStatus: 429,
                prompt: "[aimock-fallback-429] route",
                primaryModel: "aimock-primary-fallback-429",
                secondaryModel: "aimock-secondary-fallback-429",
                expectedText: "Fallback provider recovered after rate limit",
            },
        ])("falls back from the first provider to the next deterministic upstream (%s)", async (testCase) => {
            const ctx = buildContext(testCase);
            const ir = decodeProtocol(PROTOCOL, ctx.body) as IRChatRequest;
            ir.stream = false;

            const timing: PipelineTiming = {
                timer: new Timer(),
                internal: { adapterMarked: false },
            };
            timing.timer.mark("request_start");

            const outcome = await doRequestWithIR(ctx, ir, timing);
            expect(outcome).not.toBeInstanceOf(Response);
            expect("ok" in outcome && outcome.ok).toBe(true);
            if (!("ok" in outcome) || !outcome.ok) {
                throw new Error("expected successful failover result");
            }

            expect(outcome.result.provider).toBe("x-ai");

            const payload = encodeProtocol(PROTOCOL, outcome.result.ir as any, ctx.requestId);
            expect(payload?.choices?.[0]?.message?.content).toContain(testCase.expectedText);

            expect(ctx.attemptErrors).toEqual(expect.arrayContaining([
                expect.objectContaining({
                    provider: "openai",
                    type: "upstream_non_2xx",
                    status: testCase.expectedPrimaryStatus,
                }),
            ]));

            const requests = await waitForAimockRequests(1);
            const providerModels = requests.map((request) => request?.body?.model);
            expect(providerModels).toContain(testCase.secondaryModel);

            const primaryIndex = providerModels.indexOf(testCase.primaryModel);
            const secondaryIndex = providerModels.indexOf(testCase.secondaryModel);
            if (primaryIndex >= 0 && secondaryIndex >= 0) {
                expect(primaryIndex).toBeLessThan(secondaryIndex);
            }

            for (const request of requests) {
                expect(request?.headers["x-test-id"]).toBe(ctx.meta.testId);
            }
        });
    }
});
