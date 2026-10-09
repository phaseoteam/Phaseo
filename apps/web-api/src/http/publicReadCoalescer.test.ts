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
