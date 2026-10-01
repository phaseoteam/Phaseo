import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import { withRuntime } from "./utils";
import { dispatchBackground, getCache, type GatewayBindings } from "@/runtime/env";
import { markProviderDispatch } from "@/runtime/request-operations";

afterEach(() => vi.restoreAllMocks());
describe("sampled route operations", () => {
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
