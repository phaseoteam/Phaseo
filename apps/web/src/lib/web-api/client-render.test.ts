import { test, expect, afterEach, vi } from "vitest";
import { fetchPublicWebApi, fetchOptionalPublicWebApi } from "./client";

// Server rendering has no per-render memo outside React Server Components:
// the route's QueryClient shares reads within a request, and Cloudflare owns
// freshness between requests. These tests pin that nothing is retained
// across reads at this layer.

afterEach(() => {
	vi.restoreAllMocks();
	Reflect.deleteProperty(globalThis, "window");
});

test("never retains a public response for a later read", async () => {
	const network = vi.spyOn(global, "fetch").mockImplementation(async () => Response.json({ model: { name: "GPT" } }));
	await expect(fetchPublicWebApi("/api/_web/models/openai%2Fgpt")).resolves.toEqual({ model: { name: "GPT" } });
	await expect(fetchOptionalPublicWebApi("/api/_web/models/openai%2Fgpt")).resolves.toEqual({ model: { name: "GPT" } });
	expect(network).toHaveBeenCalledTimes(2);
});

test("keeps paths and query projections distinct", async () => {
	const network = vi.spyOn(global, "fetch").mockImplementation(async () => Response.json({ models: [] }));
	await Promise.all([
		fetchPublicWebApi("/api/_web/models?projection=cards"),
		fetchPublicWebApi("/api/_web/models?projection=detail"),
		fetchPublicWebApi("/api/_web/benchmarks"),
	]);
	expect(network).toHaveBeenCalledTimes(3);
	expect(network.mock.calls.map(([url]) => String(url).replace(/^.*\/api\/_web\//, ""))).toEqual(["models?projection=cards", "models?projection=detail", "benchmarks"]);
});

test("returns null for a missing optional read and retries it next time", async () => {
	const network = vi.spyOn(global, "fetch").mockImplementation(async () => new Response(null, { status: 404 }));
	await expect(fetchOptionalPublicWebApi("/api/_web/models/missing")).resolves.toBeNull();
	await expect(fetchOptionalPublicWebApi("/api/_web/models/missing")).resolves.toBeNull();
	expect(network).toHaveBeenCalledTimes(2);
});

test("does not retain upstream failures for the next request", async () => {
	const network = vi.spyOn(global, "fetch")
		.mockResolvedValueOnce(new Response(null, { status: 503 }))
		.mockResolvedValueOnce(Response.json({ models: [] }));
	await expect(fetchPublicWebApi("/api/_web/models")).rejects.toMatchObject({ status: 503 });
	await expect(fetchPublicWebApi("/api/_web/models")).resolves.toEqual({ models: [] });
	expect(network).toHaveBeenCalledTimes(2);
});

test("keeps a caller's aborted request separate from other public reads", async () => {
	const network = vi.spyOn(global, "fetch").mockImplementation(async (_url, init) => {
		init?.signal?.throwIfAborted();
		return Response.json({ models: [] });
	});
	const controller = new AbortController();
	controller.abort();
	await expect(fetchPublicWebApi("/api/_web/models", { signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
	await expect(fetchPublicWebApi("/api/_web/models")).resolves.toEqual({ models: [] });
	expect(network).toHaveBeenCalledTimes(2);
});

test("sends credentialed reads with their credentials", async () => {
	const network = vi.spyOn(global, "fetch").mockImplementation(async () => Response.json({ models: [] }));
	await Promise.all([
		fetchPublicWebApi("/api/_web/models", { credentials: "same-origin" }),
		fetchPublicWebApi("/api/_web/models"),
	]);
	expect(network).toHaveBeenCalledTimes(2);
	expect(network.mock.calls.map(([, init]) => init?.credentials)).toEqual(["same-origin", "omit"]);
});

test("uses relative URLs in the browser", async () => {
	Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
	const network = vi.spyOn(global, "fetch").mockImplementation(async () => Response.json({ models: [] }));
	await fetchPublicWebApi("/api/_web/models");
	expect(network.mock.calls.every(([url]) => url === "/api/_web/models")).toBe(true);
});
