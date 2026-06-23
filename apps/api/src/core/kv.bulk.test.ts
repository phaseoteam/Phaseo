import { beforeEach, describe, expect, it, vi } from "vitest";

const runtime = vi.hoisted(() => {
	const store = new Map<string, string>();
	const cache = {
		get: vi.fn(async (key: string | string[], type?: "text" | "json") => {
			if (Array.isArray(key)) {
				const map = new Map<string, string | null>();
				for (const item of key) {
					map.set(item, store.get(item) ?? null);
				}
				return map;
			}
			return store.get(key) ?? null;
		}),
		put: vi.fn(async (key: string, value: string) => {
			store.set(key, value);
		}),
		delete: vi.fn(async (key: string) => {
			store.delete(key);
		}),
	};
	return { store, cache };
});

vi.mock("@/runtime/env", () => ({
	getCache: () => runtime.cache as unknown as KVNamespace,
}));

describe("getTextMany", () => {
	beforeEach(() => {
		runtime.store.clear();
		runtime.cache.get.mockClear();
	});

	it("reads multiple text values in one KV operation", async () => {
		runtime.store.set("a", "alpha");
		runtime.store.set("b", "beta");

		const { getTextMany } = await import("./kv");
		await expect(getTextMany(["a", "b", "missing"])).resolves.toEqual({
			a: "alpha",
			b: "beta",
			missing: null,
		});
		expect(runtime.cache.get).toHaveBeenCalledTimes(1);
		expect(runtime.cache.get).toHaveBeenCalledWith(["a", "b", "missing"], "text");
	});

	it("falls back to parallel single-key reads when bulk reads fail", async () => {
		runtime.store.set("a", "alpha");
		runtime.store.set("b", "beta");
		runtime.cache.get.mockImplementationOnce(async () => {
			throw new Error("bulk unsupported");
		});

		const { getTextMany } = await import("./kv");
		await expect(getTextMany(["a", "b"])).resolves.toEqual({
			a: "alpha",
			b: "beta",
		});
		expect(runtime.cache.get).toHaveBeenCalledTimes(3);
		expect(runtime.cache.get).toHaveBeenNthCalledWith(2, "a", "text");
		expect(runtime.cache.get).toHaveBeenNthCalledWith(3, "b", "text");
	});
});
