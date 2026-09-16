import { describe, expect, it } from "vitest";
import { parsePreviewModelTarget, sanitizeAppHeaders } from "./proxy";

describe("chat preview request gating", () => {
	it("parses the provider-qualified preview identifier", () => {
		expect(parsePreviewModelTarget("synthetic:synthetic/m01")).toEqual({
			providerSlug: "synthetic",
			modelSlug: "synthetic/m01",
		});
	});

	it("does not treat ordinary model identifiers as preview requests", () => {
		expect(parsePreviewModelTarget("openai/gpt-4o-mini")).toBeNull();
		expect(parsePreviewModelTarget("synthetic:m01")).toEqual({
			providerSlug: "synthetic",
			modelSlug: "m01",
		});
	});

	it("never accepts the internal testing headers from the browser", () => {
		expect(sanitizeAppHeaders({
			"x-phaseo-internal-token": "should-not-forward",
			"x-phaseo-testing-mode": "true",
			"x-title": "Phaseo Chat",
		})).toEqual({ "x-title": "Phaseo Chat" });
	});
});
