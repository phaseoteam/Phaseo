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
        await expect(pending).rejects.toThrow("Key version changed during read");
        await expect(getKeyVersion("kid", "key", { useL1Cache: true })).resolves.toBe(123);
    });

    it("fences warm reads during a pending publication", async () => {
        const { getKeyVersion, setKeyVersion } = await import("./kv");
        await getKeyVersion("kid", "key", { useL1Cache: true });
        let release!: () => void;
        runtime.cache.put.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
        const writing = setKeyVersion("kid", "key", 42);
        const reading = getKeyVersion("kid", "key", { useL1Cache: true });
        let settled = false;
        void reading.then(() => { settled = true; });
        await Promise.resolve();
        expect(settled).toBe(false);
        release();
        await writing;
        await expect(reading).resolves.toBe(42);
    });

    it("fails closed after publication failure until a successful retry", async () => {
        const { getKeyVersion, setKeyVersion } = await import("./kv");
        await getKeyVersion("id", "key", { useL1Cache: true });
        runtime.cache.put.mockRejectedValueOnce(new Error("publication failed"));
        await expect(setKeyVersion("id", "key", 42)).rejects.toThrow("publication failed");
        await expect(getKeyVersion("id", "key", { useL1Cache: true })).rejects.toThrow("publication failed");
        await expect(getKeyVersion("id", "key")).rejects.toThrow("publication failed");
        await setKeyVersion("id", "key", 43);
        await expect(getKeyVersion("id", "key", { useL1Cache: true })).resolves.toBe(43);
    });

    it("does not allow overlapping publications to reorder KV writes", async () => {
        const { setKeyVersion } = await import("./kv");
        let release!: () => void;
        runtime.cache.put.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
        const writing = setKeyVersion("id", "key", 42);
        await expect(setKeyVersion("id", "key", 43)).rejects.toThrow("already pending");
        release();
        await writing;
    });

    it("bounds all active reads and releases capacity after source failures", async () => {
        const { getKeyVersion } = await import("./kv");
        const releases: Array<() => void> = [];
        for (let i = 0; i < 128; i++) {
            runtime.cache.get.mockImplementationOnce(() => new Promise((_, reject) => {
                releases.push(() => reject(new Error("source failed")));
            }));
        }
        const reads = Array.from({ length: 128 }, (_, i) => getKeyVersion("id", `key-${i}`));
        const settled = Promise.allSettled(reads);
        await expect(getKeyVersion("id", "overflow")).rejects.toThrow("capacity exceeded");
        for (const release of releases) release();
        expect((await settled).every(result => result.status === "rejected")).toBe(true);
        await expect(getKeyVersion("id", "recovered")).resolves.toBe(0);
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
