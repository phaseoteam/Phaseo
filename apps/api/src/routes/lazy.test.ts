import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import type { Env } from "@/runtime/types";
import { lazyRouter } from "./lazy";

describe("lazy route initialization", () => {
    it("preserves methods, nested paths, query/body, bindings and outer headers at different mounts", async () => {
        const load = vi.fn(async () => new Hono<Env>().post("/:id", async c => c.json({
            id: c.req.param("id"), q: c.req.query("q"), body: await c.req.json(), environment: c.env.ENV,
        })));
        const handler = lazyRouter(null, load);
        const child = new Hono<Env>().all("/files/*", handler);
        const app = new Hono<Env>();
        app.use("*", async (c, next) => { await next(); c.header("x-outer", "preserved"); });
        app.route("/v1", child);
        expect(load).not.toHaveBeenCalled();
        for (const [router, prefix] of [[app, "/v1"], [child, ""]] as const) {
            const response = await router.request(`https://example.com${prefix}/files/one?q=two`, {
                method: "POST", body: JSON.stringify({ value: 3 }), headers: { "content-type": "application/json" },
            }, { ENV: "test" } as Env["Bindings"]);
            expect(response.status).toBe(200);
            expect(await response.json()).toEqual({ id: "one", q: "two", body: { value: 3 }, environment: "test" });
            if (prefix) expect(response.headers.get("x-outer")).toBe("preserved");
        }
        expect(load).toHaveBeenCalledTimes(1);
    });

    it("continues to later routes only for unmatched paths and preserves explicit 404 responses", async () => {
        const app = new Hono<Env>();
        app.all("*", lazyRouter("/", async () => new Hono<Env>().get("/owned", c => c.text("private", 404))));
        app.get("*", c => c.text("fallback"));
        expect(await (await app.request("/other")).text()).toBe("fallback");
        expect(await (await app.request("/owned")).text()).toBe("private");
    });

    it("keeps parent request and authentication context isolated across concurrent requests", async () => {
        const app = new Hono<Env>();
        app.use("*", async (c, next) => {
            c.set("requestId", c.req.header("x-test-id"));
            c.set("ctx", { workspaceId: c.req.header("x-test-id") });
            await next();
            c.header("x-inner-user", c.get("ctx")?.userId ?? "missing");
        });
        app.all("/auth/*", lazyRouter(null, async () => new Hono<Env>().get("/me", async c => {
            await Promise.resolve();
            c.set("ctx", { ...c.get("ctx"), userId: `user-${c.get("requestId")}` });
            return c.json({ requestId: c.get("requestId"), workspaceId: c.get("ctx")?.workspaceId });
        })));
        await Promise.all(["one", "two"].map(async id => {
            const response = await app.request("/auth/me", { headers: { "x-test-id": id } });
            expect(await response.json()).toEqual({ requestId: id, workspaceId: id });
            expect(response.headers.get("x-inner-user")).toBe(`user-${id}`);
        }));
    });

    it("retains parent error handling and retries failed initialization", async () => {
        const load = vi.fn().mockRejectedValueOnce(new Error("load failed"))
            .mockResolvedValue(new Hono<Env>().get("/", () => { throw new Error("handler failed"); }));
        const app = new Hono<Env>();
        app.all("/auth", lazyRouter("/auth", load));
        app.onError((error, c) => c.json({ error: error.message }, 503));
        expect(await (await app.request("/auth")).json()).toEqual({ error: "load failed" });
        expect(await (await app.request("/auth")).json()).toEqual({ error: "handler failed" });
        expect(load).toHaveBeenCalledTimes(2);
    });
});
