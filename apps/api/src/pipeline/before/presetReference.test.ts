import { describe, expect, it } from "vitest";
import { parsePresetReference, pinnedPresetModel } from "./presetReference";

describe("parsePresetReference", () => {
	it("reads workspace and public references with and without a pinned version", () => {
		expect(parsePresetReference("@triage")).toEqual({ publisher: null, slug: "triage", ref: null, base: "@triage" });
		expect(parsePresetReference("@acme/triage")).toEqual({ publisher: "acme", slug: "triage", ref: null, base: "@acme/triage" });
		expect(parsePresetReference("@triage@v3")).toEqual({ publisher: null, slug: "triage", ref: "v3", base: "@triage" });
		expect(parsePresetReference("@acme/triage@production")).toEqual({ publisher: "acme", slug: "triage", ref: "production", base: "@acme/triage" });
		expect(parsePresetReference("@triage@2026.10.27.2")?.ref).toBe("2026.10.27.2");
		expect(parsePresetReference("@triage@1.2.0-beta+build/5")).toMatchObject({ slug: "triage", ref: "1.2.0-beta+build/5", publisher: null });
		expect(parsePresetReference("@triage@")?.ref).toBe("");
	});

	it("ignores model IDs that are not presets", () => {
		expect(parsePresetReference("openai/gpt-5")).toBeNull();
		expect(parsePresetReference("")).toBeNull();
	});

	it("builds pinned model IDs", () => {
		expect(pinnedPresetModel("@triage", "v3")).toBe("@triage@v3");
		expect(pinnedPresetModel("@triage", null)).toBe("@triage");
	});
});
