import { describe, expect, it } from "vitest";
import { arceeQuirks } from "../../providers/arcee/quirks";

describe("Arcee quirks", () => {
	it("maps IR reasoning.effort to reasoning_effort", () => {
		const request: Record<string, unknown> = {};
		const ir: any = {
			reasoning: {
				effort: "xhigh",
			},
		};

		arceeQuirks.transformRequest?.({ request, ir });

		expect(request.reasoning_effort).toBe("high");
		expect(request.reasoning).toBeUndefined();
	});

	it("maps disabled reasoning to minimal effort fallback", () => {
		const request: Record<string, unknown> = {};
		const ir: any = {
			reasoning: {
				enabled: false,
			},
		};

		arceeQuirks.transformRequest?.({ request, ir });

		expect(request.reasoning_effort).toBe("minimal");
	});

	it("preserves minimal reasoning effort", () => {
		const request: Record<string, unknown> = {};
		const ir: any = {
			reasoning: {
				effort: "minimal",
			},
		};

		arceeQuirks.transformRequest?.({ request, ir });

		expect(request.reasoning_effort).toBe("minimal");
	});

	it("preserves request when no reasoning config exists", () => {
		const request: Record<string, unknown> = {
			temperature: 0.2,
		};
		const ir: any = {};

		arceeQuirks.transformRequest?.({ request, ir });

		expect(request.temperature).toBe(0.2);
		expect(request.reasoning_effort).toBeUndefined();
	});
});
