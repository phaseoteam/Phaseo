import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auditFailure: vi.fn(), auditSuccess: vi.fn(), charge: vi.fn(), load: vi.fn(async () => ({ version: "historical-price", rules: [] })) }));
vi.mock("../audit", () => ({ auditFailure: mocks.auditFailure, auditSuccess: mocks.auditSuccess }));
vi.mock("./charge", () => ({ recordUsageAndChargeOnce: mocks.charge }));
vi.mock("./guards", () => ({ guardUpstreamStatus: async () => ({ ok: true }) }));
vi.mock("./payload", () => ({
    enrichSuccessPayload: async (_ctx: unknown, result: any) => result.normalized,
    extractFinishReason: () => "stop",
}));
vi.mock("@/plugins/registry", () => ({ applyResponsePlugins: async ({ payload }: any) => ({ payload, executions: [] }) }));
vi.mock("./pricing", () => ({
    loadProviderPricing: mocks.load,
    calculatePricing: () => { throw new Error("pricing_rule_missing:cached_read_text_tokens"); },
}));
vi.mock("@/runtime/env", () => ({ ensureRuntimeForBackground: () => () => {}, dispatchBackground: () => {} }));

import { finalizeRequest } from "./index";

describe("non-stream accounting failures", () => {
    it("records available evidence when stream pricing cannot be loaded", async () => {
        mocks.auditFailure.mockClear();
        mocks.load.mockRejectedValueOnce(new Error("pricing_database_unavailable"));
        const ctx: any = { requestId: "stream-request", billingRequestId: "stream-billing", workspaceId: "workspace", model: "apodex", endpoint: "responses", stream: true, body: {}, meta: {}, providers: [] };
        const result: any = { provider: "novita", upstream: new Response(null, { status: 200 }), bill: { usage: { input_tokens: 10 }, upstream_id: "provider-stream" } };
        const response = await finalizeRequest({ pre: { ok: true, ctx }, exec: { ok: true, result }, endpoint: ctx.endpoint });
        expect(response.status).toBe(500);
        expect(mocks.auditFailure).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
            usage: { input_tokens: 10 }, nativeResponseId: "provider-stream",
            detailMetadata: expect.objectContaining({ accounting_finalization: expect.objectContaining({ response_delivered: false, billing_request_id: "stream-billing" }) }),
        }));
        mocks.auditFailure.mockClear();
    });
    it("persists provider response, metering and billing identity when pricing fails", async () => {
        const usage = { input_tokens: 100, output_tokens: 20, input_tokens_details: { cached_tokens: 40 } };
        const providerResponse = { id: "provider-response", usage, choices: [{ message: { content: "hello" } }] };
        const ctx: any = {
            requestId: "public-request", billingRequestId: "billing-request", workspaceId: "workspace",
            model: "apodex/apodex-1.1-mini:free", endpoint: "chat.completions", stream: false,
            body: {}, meta: {}, providers: [], timer: { span: (_name: string, fn: () => unknown) => fn() },
        };
        const result: any = {
            provider: "novita", upstream: new Response(null, { status: 200 }),
            normalized: providerResponse, rawResponse: providerResponse, mappedRequest: { model: "apodex" },
            bill: { usage: null, currency: "USD", cost_cents: 0, upstream_id: "provider-response" },
        };
        const response = await finalizeRequest({ pre: { ok: true, ctx }, exec: { ok: true, result }, endpoint: ctx.endpoint });
        expect(response.status).toBe(500);
        expect(mocks.auditSuccess).not.toHaveBeenCalled();
        expect(mocks.charge).not.toHaveBeenCalled();
        expect(mocks.auditFailure).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
            usage, nativeResponseId: "provider-response", providerResponse, gatewayResponse: providerResponse,
            providerRequest: { model: "apodex" }, errorCode: "gateway:nonstream_finalization_failed",
            detailMetadata: expect.objectContaining({ accounting_finalization: expect.objectContaining({
                billing_request_id: "billing-request", raw_usage: usage, finish_reason: "stop",
                pricing_card: { version: "historical-price", rules: [] }, billing_status: "pending_reconciliation",
            }) }),
        }));
    });
});
