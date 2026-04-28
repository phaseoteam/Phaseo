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
    prompt: string;
    primaryModel: string;
    secondaryModel: string;
    expectedText: string;
};

function candidate(providerId: string, providerModelSlug: string, baseWeight: number): ProviderCandidate {
    const adapter = adapterFor(providerId, "chat.completions");
    if (!adapter) {
        throw new Error(`missing adapter for ${providerId}`);
    }
    return {
        providerId,
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
        model: "aimock-openai-model",
        messages: [{ role: "user", content: testCase.prompt }],
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
                prompt: "[aimock-fallback] route",
                primaryModel: "aimock-primary-fallback",
                secondaryModel: "aimock-secondary-fallback",
                expectedText: "Fallback provider succeeded",
            },
            {
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

            const requests = getAimock().getRequests();
            expect(requests.length).toBe(2);
            expect(requests[0]?.body?.model).toBe(testCase.primaryModel);
            expect(requests[1]?.body?.model).toBe(testCase.secondaryModel);
            expect(requests[0]?.headers["x-test-id"]).toBe(ctx.meta.testId);
            expect(requests[1]?.headers["x-test-id"]).toBe(ctx.meta.testId);
        });
    }
});
