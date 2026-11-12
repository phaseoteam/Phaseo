import { describe, expect, it } from "vitest";
import { describeRetiredModel, retiredModelNotice } from "./retiredModels";

const NOW = Date.parse("2026-10-12T12:00:00Z");

describe("retiredModelNotice", () => {
	it("treats a retired status as retired even without a date", () => {
		expect(retiredModelNotice("deepseek/deepseek-v3.1", {
			status: "retired",
			retiredAt: null,
			replacementModel: "deepseek/deepseek-v3.2",
		}, NOW)).toEqual({ model: "deepseek/deepseek-v3.1", retiredAt: null, replacementModel: "deepseek/deepseek-v3.2" });
	});

	it("treats a past retirement date as retired", () => {
		expect(retiredModelNotice("a/b", { status: "deprecated", retiredAt: "2026-10-01T00:00:00Z", replacementModel: null }, NOW))
			.toEqual({ model: "a/b", retiredAt: "2026-10-01T00:00:00Z", replacementModel: null });
	});

	it("ignores active, deprecated and future-dated models and unknown names", () => {
		expect(retiredModelNotice("a/b", { status: "active", retiredAt: null, replacementModel: "a/c" }, NOW)).toBeNull();
		expect(retiredModelNotice("a/b", { status: "deprecated", retiredAt: "2026-11-01T00:00:00Z", replacementModel: "a/c" }, NOW)).toBeNull();
		expect(retiredModelNotice("a/b", null, NOW)).toBeNull();
	});
});

describe("describeRetiredModel", () => {
	it("names the date and suggested model when known", () => {
		expect(describeRetiredModel({ model: "a/b", retiredAt: "2026-10-01T00:00:00Z", replacementModel: "a/c" }))
			.toBe('Model "a/b" was retired on 2026-10-01 and no provider serves it any more. Use "a/c" instead.');
		expect(describeRetiredModel({ model: "a/b", retiredAt: null, replacementModel: null }))
			.toBe('Model "a/b" is retired and no provider serves it any more.');
	});
});
