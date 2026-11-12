import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const background: Promise<unknown>[] = [];
vi.mock("@/lib/start/wait-until", () => ({
	waitUntil: async (promise: Promise<unknown>) => {
		background.push(promise);
	},
}));

import { fetchOptionalPublicWebApi, fetchPublicWebApi } from "./client";

// An in-memory stand-in for the Workers Cache API's caches.default.
function memoryCache() {
	const entries = new Map<string, Response>();
	return {
		entries,
		match: vi.fn(async (key: Request) => entries.get(key.url)?.clone()),
		put: vi.fn(async (key: Request, response: Response) => {
			entries.set(key.url, response.clone());
		}),
		delete: vi.fn(async (key: Request) => entries.delete(key.url)),
	};
}

const settle = async () => {
	await Promise.all(background.splice(0));
};

describe("public web API render cache", () => {
	let cache: ReturnType<typeof memoryCache>;
	beforeEach(() => {
		process.env.WEB_API_ORIGIN = "https://web-api.test";
		cache = memoryCache();
		vi.stubGlobal("caches", { default: cache });
	});
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	it("serves a repeat read from the cache within a minute", async () => {
		const fetchMock = vi.spyOn(global, "fetch").mockImplementation(async () => Response.json({ model: { id: "openai/gpt-5" } }));
		await expect(fetchPublicWebApi("/api/_web/models/openai%2Fgpt-5")).resolves.toEqual({ model: { id: "openai/gpt-5" } });
		await settle();
		await expect(fetchPublicWebApi("/api/_web/models/openai%2Fgpt-5")).resolves.toEqual({ model: { id: "openai/gpt-5" } });
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect([...cache.entries.keys()][0]).toMatch(/^https:\/\/web-api\.test\/api\/_web\/models\/openai%2Fgpt-5\?__render=/);
	});

	it("serves a stale copy once and refreshes it in the background", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(0);
		const fetchMock = vi.spyOn(global, "fetch")
			.mockResolvedValueOnce(Response.json({ version: 1 }))
			.mockResolvedValueOnce(Response.json({ version: 2 }));
		await fetchPublicWebApi("/api/_web/benchmarks");
		await settle();
		vi.setSystemTime(61_000);
		await expect(fetchPublicWebApi("/api/_web/benchmarks")).resolves.toEqual({ version: 1 });
		await settle();
		expect(fetchMock).toHaveBeenCalledTimes(2);
		await expect(fetchPublicWebApi("/api/_web/benchmarks")).resolves.toEqual({ version: 2 });
	});

	it("drops a stale copy when the resource is gone", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(0);
		vi.spyOn(global, "fetch")
			.mockResolvedValueOnce(Response.json({ model: { id: "retired" } }))
			.mockResolvedValueOnce(new Response(null, { status: 404 }))
			.mockResolvedValueOnce(new Response(null, { status: 404 }));
		await fetchOptionalPublicWebApi("/api/_web/models/retired");
		await settle();
		vi.setSystemTime(61_000);
		await fetchOptionalPublicWebApi("/api/_web/models/retired");
		await settle();
		expect(cache.entries.size).toBe(0);
		await expect(fetchOptionalPublicWebApi("/api/_web/models/retired")).resolves.toBeNull();
	});

	it("refetches after a day instead of serving very old data", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(0);
		const fetchMock = vi.spyOn(global, "fetch")
			.mockResolvedValueOnce(Response.json({ version: 1 }))
			.mockResolvedValueOnce(Response.json({ version: 2 }));
		await fetchPublicWebApi("/api/_web/organisations");
		await settle();
		vi.setSystemTime(86_400_000);
		await expect(fetchPublicWebApi("/api/_web/organisations")).resolves.toEqual({ version: 2 });
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it("never caches failures", async () => {
		vi.spyOn(global, "fetch").mockResolvedValue(new Response(null, { status: 503 }));
		await expect(fetchPublicWebApi("/api/_web/benchmarks")).rejects.toEqual(expect.objectContaining({ status: 503 }));
		await settle();
		expect(cache.put).not.toHaveBeenCalled();
	});
});
