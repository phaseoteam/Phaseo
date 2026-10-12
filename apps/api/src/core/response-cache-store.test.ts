import { describe, expect, it, vi } from "vitest";
import { createUpstashResponseCacheStore } from "./response-cache-store";

function upstashReply(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function createStore(fetchImpl: typeof fetch, maxRecordBytes?: number) {
	return createUpstashResponseCacheStore({
		url: "https://cache.example.upstash.io/",
		token: "test-token",
		fetchImpl,
		maxRecordBytes,
	});
}

describe("Upstash response cache store", () => {
	it("sends SET with an expiry and the bearer token", async () => {
		const fetchImpl = vi.fn().mockResolvedValue(upstashReply({ result: "OK" }));
		const store = createStore(fetchImpl);

		await expect(store.set("k", { a: 1 }, 120.7)).resolves.toBe(true);

		const [url, init] = fetchImpl.mock.calls[0]!;
		expect(url).toBe("https://cache.example.upstash.io");
		expect(init.method).toBe("POST");
		expect(init.headers.Authorization).toBe("Bearer test-token");
		expect(JSON.parse(init.body)).toEqual(["SET", "k", "{\"a\":1}", "EX", 120]);
	});

	it("parses stored JSON on GET and treats a missing key as a miss", async () => {
		const fetchImpl = vi.fn()
			.mockResolvedValueOnce(upstashReply({ result: "{\"a\":1}" }))
			.mockResolvedValueOnce(upstashReply({ result: null }));
		const store = createStore(fetchImpl);

		await expect(store.get("k")).resolves.toEqual({ a: 1 });
		await expect(store.get("missing")).resolves.toBeNull();
		expect(JSON.parse(fetchImpl.mock.calls[0]![1].body)).toEqual(["GET", "k"]);
	});

	it("skips values above the size cap without calling Upstash", async () => {
		const fetchImpl = vi.fn();
		const store = createStore(fetchImpl, 16);

		await expect(store.set("k", { text: "x".repeat(32) }, 60)).resolves.toBe(false);
		expect(fetchImpl).not.toHaveBeenCalled();
	});

	it("throws on Upstash errors without including the token", async () => {
		const fetchImpl = vi.fn().mockResolvedValue(upstashReply({ error: "WRONGPASS invalid password" }, 401));
		const store = createStore(fetchImpl);

		const error = await store.get("k").catch((caught: Error) => caught);
		expect(error).toBeInstanceOf(Error);
		expect((error as Error).message).toContain("upstash_GET_failed: 401");
		expect((error as Error).message).not.toContain("test-token");
	});

	it("sends DEL to clear an entry", async () => {
		const fetchImpl = vi.fn().mockResolvedValue(upstashReply({ result: 1 }));
		await createStore(fetchImpl).delete("k");
		expect(JSON.parse(fetchImpl.mock.calls[0]![1].body)).toEqual(["DEL", "k"]);
	});
});
