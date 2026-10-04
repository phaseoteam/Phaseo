import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import type { GatewayBindings } from "@/runtime/env";
import { requestIdFor } from "@/runtime/request-id";
import { json, withRuntime } from "./utils";

describe("inference request identity", () => {
    it("keeps the public header and sanitized handler identity aligned", async () => {
        const app = new Hono<{ Bindings: GatewayBindings }>();
        app.use("*", async (context, next) => {
            const requestId = requestIdFor(context.req.raw);
            await next();
            context.header("x-request-id", requestId);
        });
        app.post("/v1/responses", withRuntime(async (request) => json({ request_id: requestIdFor(request) })));
        const response = await app.request("/v1/responses", { method: "POST", headers: { "x-request-id": "caller-id" } }, {
            SUPABASE_URL: "https://test.supabase.co",
            SUPABASE_SERVICE_ROLE_KEY: "test-key",
        } as GatewayBindings, { waitUntil() {}, passThroughOnException() {} });
        const body = await response.json() as { request_id: string };
        expect(response.status).toBe(200);
        expect(body.request_id).toMatch(/^G-[0-9A-HJKMNP-TV-Z]{26}$/);
        expect(response.headers.get("x-request-id")).toBe(body.request_id);
    });
});

describe("route JSON serialization", () => {
    it("removes exception and stack details recursively", async () => {
        const response = json({
            failure: new Error("database password leaked"),
            nested: {
                stack: "secret stack",
                stack_trace: "secret trace",
                safe: "visible",
            },
        }, 500);

        const serialized = await response.text();
        expect(JSON.parse(serialized)).toEqual({
            failure: { error: "internal_error" },
            nested: { safe: "visible" },
        });
        expect(serialized).not.toContain("database password leaked");
    });
});
