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

describe("key version safety", () => {
    beforeEach(async () => {
        runtime.store.clear();
        runtime.cache.get.mockClear();
        const { __resetKeyVersionL1ForTests } = await import("./kv");
        __resetKeyVersionL1ForTests();
    });

    it("does not turn a failed version read into version zero", async () => {
        runtime.cache.get.mockRejectedValueOnce(new Error("KV unavailable"));
        const { getKeyVersion } = await import("./kv");
        await expect(getKeyVersion("kid", "key", { useL1Cache: true })).rejects.toThrow("KV unavailable");
        runtime.store.set("gateway:keyver:kid:key", "123");
        await expect(getKeyVersion("kid", "key", { useL1Cache: true })).resolves.toBe(123);
    });

    it.each(["", "garbage", "-1", "1.5", "Infinity", "9007199254740992"])("rejects malformed marker %j", async (marker) => {
        runtime.store.set("gateway:keyver:kid:key", marker);
        const { getKeyVersion } = await import("./kv");
        await expect(getKeyVersion("kid", "key")).rejects.toThrow("Invalid key version");
    });

    it("uses version zero only for an absent marker", async () => {
        const { getKeyVersion } = await import("./kv");
        await expect(getKeyVersion("kid", "key")).resolves.toBe(0);
    });

    it("does not let a late old marker read overwrite a locally published version", async () => {
        let release!: (value: string) => void;
        runtime.cache.get.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
        const { getKeyVersion, setKeyVersion } = await import("./kv");
        const pending = getKeyVersion("kid", "key", { useL1Cache: true });
        await setKeyVersion("kid", "key", 123);
        release("0");
        await pending;
        await expect(getKeyVersion("kid", "key", { useL1Cache: true })).resolves.toBe(123);
    });
});

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
