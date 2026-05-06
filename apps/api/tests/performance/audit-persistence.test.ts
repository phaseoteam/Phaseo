import { beforeEach, describe, expect, it, vi } from "vitest";

function percentile(values: number[], p: number): number {
        const sorted = values.slice().sort((a, b) => a - b);
        const index = Math.ceil((p / 100) * sorted.length) - 1;
        return sorted[Math.max(0, index)];
}

const runtime = vi.hoisted(() => {
        const gatewayUpsert = vi.fn(async () => ({ error: null }));

        const supabase = {
                from: vi.fn((table: string) => {
                        if (table !== "gateway_generations") {
                                throw new Error(`Unexpected table: ${table}`);
                        }
                        return {
                                upsert: gatewayUpsert,
                        };
                }),
        };

        return {
                gatewayUpsert,
                supabase,
        };
});

const ensureAppId = vi.hoisted(() => vi.fn(async () => "app_perf_audit"));

vi.mock("@/runtime/env", () => ({
        getSupabaseAdmin: () => runtime.supabase,
}));

vi.mock("@/pipeline/after/apps", () => ({
        ensureAppId,
}));

const { persistGenerationToSupabase } = await import("@/pipeline/audit/database");

describe("persistGenerationToSupabase performance", () => {
        beforeEach(() => {
                runtime.gatewayUpsert.mockClear();
                runtime.supabase.from.mockClear();
                ensureAppId.mockClear();
        });

        it("keeps request audit persistence under 5ms p95 for the mocked hot path", async () => {
                const args = {
                        requestId: "req_perf_audit",
                        workspaceId: "team_perf_audit",
                        provider: "openai",
                        model: "gpt-5.4-nano",
                        endpoint: "responses" as const,
                        stream: false,
                        isByok: false,
                        generationMs: 42,
                        latencyMs: 21,
                        usagePriced: {
                                input_tokens: 10,
                                output_tokens: 5,
                        },
                        totalCents: 1.23,
                        currency: "USD" as const,
                        finishReason: "stop",
                        appTitle: "Perf Audit App",
                        referer: "https://example.com/audit",
                };

                await persistGenerationToSupabase(args);

                runtime.gatewayUpsert.mockClear();
                runtime.supabase.from.mockClear();
                ensureAppId.mockClear();

                const samples: number[] = [];
                const iterations = 300;
                for (let i = 0; i < iterations; i += 1) {
                        const started = performance.now();
                        await persistGenerationToSupabase({
                                ...args,
                                requestId: `req_perf_audit_${i}`,
                        });
                        samples.push(performance.now() - started);
                }

                const p50 = percentile(samples, 50);
                const p95 = percentile(samples, 95);
                const p99 = percentile(samples, 99);
                const avg =
                        samples.reduce((sum, value) => sum + value, 0) /
                        samples.length;

                console.log(
                        `[perf][audit-persistence] iterations=${iterations} avg=${avg.toFixed(3)}ms p50=${p50.toFixed(3)}ms p95=${p95.toFixed(3)}ms p99=${p99.toFixed(3)}ms`,
                );

                expect(p95).toBeLessThan(5);
                expect(ensureAppId).toHaveBeenCalledTimes(iterations);
                expect(runtime.supabase.from).toHaveBeenCalledTimes(iterations);
                expect(runtime.gatewayUpsert).toHaveBeenCalledTimes(iterations);
        });
});
