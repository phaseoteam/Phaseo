import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { listSettings, setSetting } from "./appSettings";
import { panelAnimationDurationKey } from "./animations";

beforeEach(() => {
	const values = new Map<string, string>();
	vi.stubGlobal("window", { localStorage: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) } });
});
afterEach(() => vi.unstubAllGlobals());

it("lets agents discover the panel duration and save both instant and slow motion on the device", async () => {
	expect((await listSettings("panel animation duration")).settings).toEqual([expect.objectContaining({ key: "panelAnimationDurationMs", kept: "device", type: "integer", minimum: 0, maximum: 400, value: 200 })]);
	for (const value of [0, 400]) {
		expect(await setSetting("panelAnimationDurationMs", value)).toEqual({ key: "panelAnimationDurationMs", value });
		expect(window.localStorage.getItem(panelAnimationDurationKey)).toBe(String(value));
		expect((await listSettings("panelAnimationDurationMs")).settings[0].value).toBe(value);
	}
});

it("rejects invalid agent durations without replacing the saved choice", async () => {
	await setSetting("panelAnimationDurationMs", 250);
	for (const invalid of [-1, 401, 1.5, "200", null, NaN, Infinity, {}]) await expect(setSetting("panelAnimationDurationMs", invalid)).rejects.toThrow("integer from 0 to 400");
	expect(window.localStorage.getItem(panelAnimationDurationKey)).toBe("250");
});
