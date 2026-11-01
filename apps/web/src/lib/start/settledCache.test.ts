import { describe, expect, it, vi } from "vitest";
import { settledCache } from "./settledCache";

describe("settledCache", () => {
	it("shares a settled value without reloading", async () => {
		const load = vi.fn(async (key: string) => `${key}!`);
		const get = settledCache(load);
		expect(await get("a")).toBe("a!");
		expect(await get("a")).toBe("a!");
		expect(load).toHaveBeenCalledTimes(1);
	});

	it("never hands one caller another caller's in-flight promise", async () => {
		const resolvers: Array<(value: string) => void> = [];
		const get = settledCache((_key: string) => new Promise<string>((resolve) => resolvers.push(resolve)));
		const first = get("a");
		const second = get("a");
		expect(resolvers).toHaveLength(2);
		resolvers[1]("second");
		expect(await second).toBe("second");
		resolvers[0]("first");
		expect(await first).toBe("second");
	});

	it("does not cache failures", async () => {
		const load = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce("ok");
		const get = settledCache(load);
		await expect(get("a")).rejects.toThrow("boom");
		expect(await get("a")).toBe("ok");
	});
});
