import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HARNESS_MODELS_FRESH_MS, HarnessModelCache } from "./harnessModelCache";

const first = [{ id: "sonnet", name: "Sonnet" }], second = [{ id: "opus", name: "Opus" }];
let root = "", file = "";
beforeEach(() => { root = mkdtempSync(path.join(tmpdir(), "phaseo-harness-models-")); file = path.join(root, "cache", "harness-models.json"); });
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("local harness model lists", () => {
	it("asks the harness only when nothing is kept, then serves the list at once, even after a restart", async () => {
		let now = 0; const discover = vi.fn().mockResolvedValue(first);
		const cache = new HarnessModelCache(file, undefined, () => now);
		expect(await cache.get("claude", undefined, "project", discover)).toEqual(first); await cache.flush();
		now += HARNESS_MODELS_FRESH_MS - 1;
		expect(await new HarnessModelCache(file, undefined, () => now).get("claude", undefined, "project", discover)).toEqual(first);
		expect(discover).toHaveBeenCalledOnce();
	});
	it("serves an old list at once, asks again in the background and reports a change", async () => {
		let now = 0; const onChange = vi.fn(); const cache = new HarnessModelCache(file, onChange, () => now);
		await cache.refresh("codex", "account", undefined, async () => first); now = HARNESS_MODELS_FRESH_MS;
		let resolve!: (models: typeof second) => void; const discover = vi.fn(() => new Promise<typeof second>(done => { resolve = done; }));
		expect(await cache.get("codex", "account", undefined, discover)).toEqual(first); expect(await cache.get("codex", "account", undefined, discover)).toEqual(first);
		expect(discover).toHaveBeenCalledOnce();
		resolve(second); await vi.waitFor(() => expect(onChange).toHaveBeenCalledExactlyOnceWith("codex", "account"));
		expect(await cache.get("codex", "account", undefined, discover)).toEqual(second);
	});
	it("lends a new project the newest list from the same harness and account, not another's", async () => {
		const onChange = vi.fn(); const cache = new HarnessModelCache(file, onChange);
		await cache.refresh("claude", undefined, "one", async () => first);
		await cache.refresh("codex", undefined, "two", async () => second);
		const discover = vi.fn().mockResolvedValue(second);
		expect(await cache.get("claude", undefined, "three", discover)).toEqual(first);
		await vi.waitFor(() => expect(onChange).toHaveBeenCalledWith("claude", undefined));
		expect(await cache.get("claude", undefined, "three", discover)).toEqual(second);
		expect(await cache.get("claude", "other-account", "three", async () => [])).toEqual([]);
	});
	it("forgets a harness's lists when it fails to answer, so the next read reports the error", async () => {
		let now = 0; const onChange = vi.fn(), warn = vi.fn(); const cache = new HarnessModelCache(file, onChange, () => now, warn);
		await cache.refresh("claude", undefined, "one", async () => first);
		await cache.refresh("claude", undefined, "two", async () => first); now = HARNESS_MODELS_FRESH_MS;
		const failing = vi.fn().mockRejectedValue(new Error("claude is not installed"));
		expect(await cache.get("claude", undefined, "one", failing)).toEqual(first);
		await vi.waitFor(() => expect(onChange).toHaveBeenCalledWith("claude", undefined));
		expect(warn).toHaveBeenCalledWith(expect.stringContaining("not installed"));
		await expect(cache.get("claude", undefined, "two", failing)).rejects.toThrow("not installed");
	});
	it("ignores a corrupt file", async () => {
		const { mkdirSync, writeFileSync } = await import("node:fs"); mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, "{");
		expect(await new HarnessModelCache(file).get("pi", undefined, undefined, async () => first)).toEqual(first);
	});
});
