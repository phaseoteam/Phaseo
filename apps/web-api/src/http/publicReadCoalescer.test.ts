import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { createPublicReadCoalescer } from "./publicReadCoalescer";
import { PUBLIC_LIVE_DATA_CACHE } from "@/cache/publicLiveData";
import { publicCacheHeaders } from "./cache";
import type { Env } from "@/env";

const env = { ENV: "production", SUPABASE_URL: "https://example.supabase.co" } as Env;

function fixture() {
	const app = new Hono<{ Bindings: Env }>();
	let calls = 0;
	let release!: () => void;
	const gate = new Promise<void>((resolve) => { release = resolve; });
	app.use("*", createPublicReadCoalescer());
	app.all("*", async (c) => { calls++; await gate; return c.json({ call: calls }); });
	return { app, release, calls: () => calls };
}

describe("public read coalescing", () => {
	it("shares concurrent anonymous misses, then allows a fresh read after purge", async () => {
		const f = fixture();
		const first = f.app.request("/stats?a=1&b=2", {}, env);
		const second = f.app.request("/stats?b=2&a=1", {}, env);
		f.release();
		const [a, b] = await Promise.all([first, second]);
		expect(f.calls()).toBe(1);
		expect(await a.json()).toEqual(await b.json());
		await f.app.request("/stats?a=1&b=2", {}, env);
		expect(f.calls()).toBe(2);
	});

	it("reads the shared body once and gives every caller its own Response", async () => {
		// Workers forbid reading another request's body stream, so the leader
		// must consume the handler's response itself and never hand it (or a
		// clone tied to its stream) to another caller.
		const app = new Hono<{ Bindings: Env }>();
		let calls = 0;
		let handlerResponse: Response | undefined;
		let release!: () => void;
		const gate = new Promise<void>((resolve) => { release = resolve; });
		app.use("*", createPublicReadCoalescer());
		app.get("*", async () => {
			calls++;
			await gate;
			handlerResponse = new Response(JSON.stringify({ call: calls }), { status: 200, headers: { "content-type": "application/json", "x-origin": "handler" } });
			return handlerResponse;
		});
		const pending = [1, 2, 3].map(() => app.request("/stats", {}, env));
		release();
		const responses = await Promise.all(pending);
		expect(calls).toBe(1);
		expect(handlerResponse?.bodyUsed).toBe(true);
		expect(responses).not.toContain(handlerResponse);
		expect(new Set(responses).size).toBe(3);
		expect(new Set(responses.map((response) => response.body)).size).toBe(3);
		for (const response of responses) {
			expect(response.status).toBe(200);
			expect(response.headers.get("x-origin")).toBe("handler");
		}
		// Consuming one body leaves the others readable.
		expect(await responses[1]!.json()).toEqual({ call: 1 });
		expect(responses[0]!.bodyUsed).toBe(false);
		expect(await responses[0]!.json()).toEqual({ call: 1 });
		expect(await responses[2]!.json()).toEqual({ call: 1 });
	});

	it("lets waiting callers do their own work when the leader fails", async () => {
		const app = new Hono<{ Bindings: Env }>();
		let calls = 0;
		let release!: () => void;
		const gate = new Promise<void>((resolve) => { release = resolve; });
		app.use("*", createPublicReadCoalescer());
		app.get("*", async (c) => {
			calls++;
			if (calls === 1) {
				await gate;
				const broken = new ReadableStream<Uint8Array>({ pull(controller) { controller.error(new Error("upstream reset")); } }, { highWaterMark: 0 });
				return new Response(broken, { status: 200 });
			}
			return c.json({ call: calls });
		});
		const leader = app.request("/stats", {}, env);
		const follower = app.request("/stats", {}, env);
		release();
		const [leaderResponse, followerResponse] = await Promise.all([leader, follower]);
		expect(leaderResponse.status).toBe(500);
		expect(followerResponse.status).toBe(200);
		expect(await followerResponse.json()).toEqual({ call: 2 });
		expect(calls).toBe(2);
	});

	it("shares bodiless responses", async () => {
		const app = new Hono<{ Bindings: Env }>();
		let calls = 0;
		let release!: () => void;
		const gate = new Promise<void>((resolve) => { release = resolve; });
		app.use("*", createPublicReadCoalescer());
		app.get("*", async (c) => { calls++; await gate; return c.body(null, 204); });
		const pending = [app.request("/stats", {}, env), app.request("/stats", {}, env)];
		release();
		const responses = await Promise.all(pending);
		expect(calls).toBe(1);
		expect(responses.map((response) => response.status)).toEqual([204, 204]);
	});

	it("keeps different filters and environments separate", async () => {
		const f = fixture();
		const requests = [f.app.request("/stats?days=1", {}, env),
			f.app.request("/stats?days=7", {}, env),
			f.app.request("/stats?days=1", {}, { ...env, ENV: "staging" }),
			f.app.request("/stats?days=1", {}, { ENV: "production", NEXT_PUBLIC_SUPABASE_URL: "https://fallback-a.supabase.co" }),
			f.app.request("/stats?days=1", {}, { ENV: "production", NEXT_PUBLIC_SUPABASE_URL: "https://fallback-b.supabase.co" })];
		f.release();
		await Promise.all(requests);
		expect(f.calls()).toBe(5);
	});

	it.each([{ Authorization: "Bearer private" }, { Cookie: "session=private" }])("does not share credentialed reads %j", async (headers) => {
		const f = fixture();
		const requests = [f.app.request("/stats", { headers }, env), f.app.request("/stats", { headers }, env)];
		f.release();
		await Promise.all(requests);
		expect(f.calls()).toBe(2);
	});

	it("does not share writes", async () => {
		const f = fixture();
		const requests = [f.app.request("/stats", { method: "POST" }, env), f.app.request("/stats", { method: "POST" }, env)];
		f.release();
		await Promise.all(requests);
		expect(f.calls()).toBe(2);
	});

	it("does not retain error responses", async () => {
		const app = new Hono<{ Bindings: Env }>();
		let calls = 0;
		app.use("*", createPublicReadCoalescer());
		app.get("*", (c) => { calls++; return c.json({ error: "unavailable" }, 503); });
		expect((await app.request("/stats", {}, env)).status).toBe(503);
		expect((await app.request("/stats", {}, env)).status).toBe(503);
		expect(calls).toBe(2);
	});

	it("retains the 15-minute shared cache and bounded stale policy", () => {
		const headers = publicCacheHeaders(PUBLIC_LIVE_DATA_CACHE);
		expect(headers["Cloudflare-CDN-Cache-Control"]).toBe("public, max-age=900, stale-while-revalidate=900, stale-if-error=3600");
		expect(headers["Cache-Control"]).toBe("public, max-age=0");
	});
});
