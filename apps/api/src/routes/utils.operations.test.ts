import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import { withRuntime } from "./utils";
import { dispatchBackground, getCache, type GatewayBindings } from "@/runtime/env";
import { markProviderDispatch } from "@/runtime/request-operations";
import { guardFreeModelAdmission } from "@/pipeline/execute/free-model-admission";
import type { PipelineContext } from "@/pipeline/before/types";
import type { PriceCard } from "@/pipeline/pricing";

afterEach(() => vi.restoreAllMocks());
describe("sampled route operations", () => {
    it.each(["0", "1"])("includes rejected admission in the existing final sample only (rate %s)", async rate => {
        const log = vi.spyOn(console, "log").mockImplementation(() => {});
        const pending: Promise<unknown>[] = [];
        const coordinator = vi.fn();
        const owner = "10000000-0000-4000-8000-000000000001";
        const app = new Hono<{ Bindings: GatewayBindings }>();
        app.get("/", withRuntime(async () => (await guardFreeModelAdmission({ workspaceOwnerUserId: owner,
            workspaceRuntimeExpiresAt: Date.now() + 60_000 } as PipelineContext,
        { rules: [{ pricing_plan: "free", price_per_unit: "0" }] } as PriceCard, "gateway"))!));
        const response = await app.fetch(new Request("https://gateway.example/"), {
            GATEWAY_OPERATION_SAMPLE_RATE: rate, GATEWAY_FREE_MODEL_QUOTA_ENABLED: "true",
            SUPABASE_URL: "https://db.example", SUPABASE_SERVICE_ROLE_KEY: "test-only", GATEWAY_CACHE: {},
            FREE_MODEL_RATE_LIMITER: { limit: vi.fn(async () => ({ success: false })) },
            FREE_MODEL_QUOTA: { getByName: coordinator },
        } as unknown as GatewayBindings, {
            waitUntil: promise => { pending.push(promise); }, passThroughOnException() {}, props: {},
        });
        expect(response.status).toBe(429);
        await Promise.all(pending);
        expect(coordinator).not.toHaveBeenCalled();
        expect(log).toHaveBeenCalledTimes(rate === "1" ? 1 : 0);
        if (rate === "1") expect(log).toHaveBeenCalledWith("gateway_operations", expect.objectContaining({
            quotaAdmission: "edge_limited", total: {}, beforeDispatchMs: null, complete: true,
        }));
        expect(JSON.stringify(log.mock.calls)).not.toContain(owner);
    });
    it("waits for SSE completion and background writes without consuming the stream eagerly", async () => {
        const log = vi.spyOn(console, "log").mockImplementation(() => {});
        const pending: Promise<unknown>[] = [];
        let pulls = 0;
        const app = new Hono<{ Bindings: GatewayBindings }>();
        app.get("/", withRuntime(async () => {
            await getCache().get("auth");
            markProviderDispatch();
            return new Response(new ReadableStream({
                async pull(controller) {
                    pulls++;
                    await getCache().get("stream");
                    dispatchBackground(getCache().put("accounting", "test"));
                    controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
                    controller.close();
                },
            }, { highWaterMark: 0 }), { headers: { "content-type": "text/event-stream" } });
        }));
        const bindings = {
            GATEWAY_OPERATION_SAMPLE_RATE: "1", SUPABASE_URL: "https://db.example", SUPABASE_SERVICE_ROLE_KEY: "test-only",
            GATEWAY_CACHE: { get: vi.fn(async () => null), put: vi.fn(async () => {}) },
        } as unknown as GatewayBindings;
        const response = await app.fetch(new Request("https://gateway.example/"), bindings, {
            waitUntil: promise => { pending.push(promise); }, passThroughOnException() {}, props: {},
        });
        expect(await response.text()).toBe("data: [DONE]\n\n");
        await Promise.all(pending);
        expect(pulls).toBe(1);
        expect(log).toHaveBeenCalledWith("gateway_operations", expect.objectContaining({
            total: { kvRead: 2, kvWrite: 1 }, beforeDispatch: { kvRead: 1 }, complete: true,
        }));
    });
});
