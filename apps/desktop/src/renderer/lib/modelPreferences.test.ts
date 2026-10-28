import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { preferredModel, readModelPreferences, rememberModel, setDefaultModel } from "./modelPreferences";

beforeEach(() => {
	const data = new Map<string, string>();
	vi.stubGlobal("localStorage", { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value) });
	vi.stubGlobal("window", new EventTarget());
});
afterEach(() => vi.unstubAllGlobals());
describe("new-chat model preferences", () => {
	it("remembers actual selections across accounts, preserving a specific default", () => {
		rememberModel({ harness: "phaseo", accountId: "first", model: "openai/one", reasoningEffort: "high" });
		setDefaultModel({ harness: "phaseo", accountId: "first", model: "openai/fixed" });
		rememberModel({ harness: "phaseo", accountId: "second", model: "openai/two", serviceTier: "fast" });
		const preferences = readModelPreferences();
		expect(preferences.recentSelection?.model).toBe("openai/two");
		expect(preferences.defaultSelection?.model).toBe("openai/fixed");
		expect(preferences.recent).toHaveLength(2);
		expect(preferredModel(preferences, "phaseo", "first", [{ id: "openai/fixed", name: "Fixed" }, { id: "openai/one", name: "One" }])?.model).toBe("openai/fixed");
		expect(preferredModel(preferences, "phaseo", "second", [{ id: "openai/one", name: "One" }])).toBeUndefined();
		setDefaultModel(); expect(readModelPreferences().defaultSelection).toBeUndefined();
	});
	it("does not restore unavailable models or manufacture an automatic default", () => {
		rememberModel({ harness: "codex", model: "default" });
		expect(readModelPreferences().recent).toEqual([]);
		rememberModel({ harness: "codex", model: "retired-model" });
		expect(preferredModel(readModelPreferences(), "codex", undefined, [{ id: "other-model", name: "Other" }])).toBeUndefined();
		localStorage.setItem("phaseo.desktop.modelPreferences", JSON.stringify({ defaultSelection: { harness: "unknown", model: "fake" }, recent: [null, { harness: "codex", model: 42 }] }));
		expect(readModelPreferences().recent).toEqual([]);
		expect(readModelPreferences().defaultSelection).toBeUndefined();
	});
});
