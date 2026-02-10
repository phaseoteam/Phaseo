import { describe, expect, it } from "vitest";
import { extractUpstreamUnsupportedParamSignal } from "./error-handler";

describe("extractUpstreamUnsupportedParamSignal", () => {
	it("returns null for before-stage errors", () => {
		const signal = extractUpstreamUnsupportedParamSignal({
			stage: "before",
			body: {
				error: "validation_error",
				details: [{ keyword: "unsupported_param", path: ["temperature"] }],
			},
		});
		expect(signal).toBeNull();
	});

	it("extracts unsupported param code/path from execute-stage details", () => {
		const signal = extractUpstreamUnsupportedParamSignal({
			stage: "execute",
			body: {
				error: "validation_error",
				details: [{
					keyword: "unsupported_param",
					path: ["reasoning", "effort"],
					params: { param: "reasoning.effort" },
				}],
			},
		});

		expect(signal).toEqual({
			internalCode: "UPSTREAM_UNSUPPORTED_PARAM",
			param: "reasoning.effort",
			path: "reasoning.effort",
			keyword: "unsupported_param",
		});
	});

	it("extracts combo code when upstream returns unsupported_param_combo", () => {
		const signal = extractUpstreamUnsupportedParamSignal({
			stage: "execute",
			body: {
				error: "validation_error",
				details: [{
					keyword: "unsupported_param_combo",
					path: ["parameters"],
					message: "No provider supports all requested parameters",
				}],
			},
		});

		expect(signal?.internalCode).toBe("UPSTREAM_UNSUPPORTED_PARAM_COMBO");
		expect(signal?.path).toBe("parameters");
	});

	it("falls back to message heuristics when details are absent", () => {
		const signal = extractUpstreamUnsupportedParamSignal({
			stage: "execute",
			body: {
				error: {
					code: "invalid_request",
					message: "Provider does not support parameter \"instructions\" on this endpoint.",
				},
			},
		});

		expect(signal?.internalCode).toBe("UPSTREAM_UNSUPPORTED_PARAM");
		expect(signal?.param).toBe("instructions");
	});
});

