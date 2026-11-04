import { describe, expect, it } from "vitest";
import { applyReasoningParams } from "../reasoning";

function apply(providerId: string, providerModelSlug: string, reasoning: Record<string, unknown>) {
	const request: Record<string, any> = {};
	applyReasoningParams({ ir: { model: providerModelSlug, reasoning } as any, request, providerId, providerModelSlug });
	return request;
}

describe("Particle AI reasoning", () => {
	it.each([
		[{ effort: "max" }, { reasoning_effort: "max" }],
		[{ effort: "none" }, { reasoning_effort: "none" }],
		[{ effort: "minimal" }, { reasoning_effort: "minimal" }],
		[{ enabled: false }, { reasoning_effort: "none" }],
		[{ enabled: false, effort: "high" }, { reasoning_effort: "none" }],
		[{ enabled: true }, { reasoning_effort: "high" }],
		[{ summary: "auto" }, {}],
	])("maps %j to %j", (reasoning, expected) => {
		expect(apply("particle-ai", "particle-1", reasoning)).toEqual(expected);
	});
});

describe("Tencent Cloud Hy reasoning", () => {
	it.each([
		["hy4", { effort: "high" }, { reasoning_effort: "high" }],
		["hy4", { effort: "max" }, { reasoning_effort: "high" }],
		["hy4", { effort: "medium" }, { reasoning_effort: "high" }],
		["hy4", { effort: "minimal" }, { reasoning_effort: "low" }],
		["hy4", { effort: "low" }, { reasoning_effort: "low" }],
		["hy4", { effort: "none" }, { thinking: { type: "disabled" } }],
		["hy4-preview", { enabled: false }, { thinking: { type: "disabled" } }],
		["hy3", { enabled: true }, { reasoning_effort: "high" }],
	])("maps %s %j to %j", (model, reasoning, expected) => {
		expect(apply("tencent-cloud", model, reasoning)).toEqual(expected);
	});

	it("leaves non-Hy TokenHub models on the default path", () => {
		expect(apply("tencent-cloud", "glm-5.3", { effort: "high" })).toEqual({});
	});
});
