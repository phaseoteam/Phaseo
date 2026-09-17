import { beforeEach, describe, expect, it, vi } from "vitest";

const fromMock = vi.fn();

vi.mock("@/runtime/env", () => ({
    getSupabaseAdmin: () => ({ from: fromMock }),
}));

import { persistGatewayUpstreamRequests } from "./upstream-requests";

describe("persistGatewayUpstreamRequests", () => {
    beforeEach(() => {
        fromMock.mockReset();
    });

    it("persists ordered retry and failover rows with the parent total on the final success", async () => {
        const insertMock = vi.fn().mockResolvedValue({ error: null });
        fromMock.mockReturnValue({ insert: insertMock });

        await persistGatewayUpstreamRequests({
            insertedRow: {
                id: "request-row-id",
                created_at: "2026-07-26T12:00:00.000Z",
                workspace_id: "workspace-id",
            },
            requestId: "request-id",
            workspaceId: "workspace-id",
            appId: "app-id",
            keyId: "key-id",
            endpoint: "responses",
            modelId: "openai/gpt-5.4-mini",
            provider: "openai",
            providerApiModelId: "openai:gpt-5.4-mini",
            providerModelSlug: "gpt-5.4-mini",
            providerAttempts: [
                {
                    attempt_number: 1,
                    provider: "provider-a",
                    model: "openai/gpt-5.4-mini",
                    outcome: "upstream_non_2xx",
                    status: 429,
                    duration_ms: 35,
                    started_at_unix_ms: 1000,
                    retryable: true,
                    upstream_error_code: "rate_limit",
                },
                {
                    attempt_number: 2,
                    provider: "openai",
                    model: "openai/gpt-5.4-mini",
                    outcome: "success",
                    status: 200,
                    duration_ms: 42,
                },
            ],
            statusCode: 200,
            success: true,
            nativeResponseId: "resp_123",
            finishReason: "stop",
            usage: { input_tokens: 20, output_tokens: 10, total_tokens: 30 },
            totalNanos: 125_000,
            currency: "USD",
            latencyMs: 180,
            generationMs: 150,
            totalMs: 210,
            context: "test",
        });

        expect(fromMock).toHaveBeenCalledWith("gateway_upstream_requests");
        expect(insertMock).toHaveBeenCalledTimes(1);
        const rows = insertMock.mock.calls[0][0];
        expect(rows).toHaveLength(2);
        expect(rows[0]).toMatchObject({
            sequence: 1,
            provider: "provider-a",
            status_code: 429,
            success: false,
            cost_nanos: 0,
            total_ms: 35,
            error_code: "rate_limit",
            metadata: expect.objectContaining({ started_at_unix_ms: 1000 }),
        });
        expect(rows[1]).toMatchObject({
            sequence: 2,
            provider: "openai",
            status_code: 200,
            success: true,
            native_response_id: "resp_123",
            finish_reason: "stop",
            duration_ms: 42,
            latency_ms: 180,
            generation_ms: 150,
            total_ms: 210,
            cost_nanos: 125_000,
            usage: { input_tokens: 20, output_tokens: 10, total_tokens: 30 },
        });
    });

    it("creates a synthetic final row when routing attempts are unavailable", async () => {
        const insertMock = vi.fn().mockResolvedValue({ error: null });
        fromMock.mockReturnValue({ insert: insertMock });

        await persistGatewayUpstreamRequests({
            insertedRow: {
                id: "request-row-id",
                created_at: "2026-07-26T12:00:00.000Z",
                workspace_id: "workspace-id",
            },
            requestId: "request-id",
            workspaceId: "workspace-id",
            endpoint: "chat.completions",
            modelId: "anthropic/claude-sonnet-4.5",
            provider: "anthropic",
            statusCode: 200,
            success: true,
            totalNanos: 50,
            totalMs: 90,
            context: "test",
        });

        expect(insertMock.mock.calls[0][0]).toEqual([
            expect.objectContaining({
                sequence: 1,
                attempt_number: 1,
                provider: "anthropic",
                status_code: 200,
                success: true,
                cost_nanos: 50,
                total_ms: 90,
            }),
        ]);
    });

    it("does not turn missing metrics or a gateway error status into upstream observations", async () => {
        const insertMock = vi.fn().mockResolvedValue({ error: null });
        fromMock.mockReturnValue({ insert: insertMock });

        await persistGatewayUpstreamRequests({
            insertedRow: {
                id: "request-row-id",
                created_at: "2026-07-26T12:00:00.000Z",
                workspace_id: "workspace-id",
            },
            requestId: "request-id",
            workspaceId: "workspace-id",
            endpoint: "responses",
            modelId: "openai/gpt-5.4-mini",
            provider: "provider-a",
            providerAttempts: [{
                attempt_number: 1,
                provider: "provider-a",
                model: "openai/gpt-5.4-mini",
                outcome: "blocked",
                status: null,
                duration_ms: "",
                request_build_ms: null,
            }],
            statusCode: 503,
            success: false,
            latencyMs: null,
            generationMs: null,
            totalMs: null,
            context: "test",
        });

        expect(insertMock.mock.calls[0][0]).toEqual([
            expect.objectContaining({
                status_code: null,
                duration_ms: null,
                latency_ms: null,
                generation_ms: null,
                total_ms: null,
                request_build_ms: null,
            }),
        ]);
    });
});
