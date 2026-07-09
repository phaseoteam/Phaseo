import { describe, expect, it } from "vitest";
import { sakanaQuirks } from "../../providers/sakana/quirks";

describe("Sakana quirks", () => {
	it("maps supported reasoning effort to reasoning_effort", () => {
		const request: Record<string, unknown> = {};
		const ir: any = {
			reasoning: {
				effort: "xhigh",
			},
		};

		sakanaQuirks.transformRequest?.({ request, ir });

		expect(request.reasoning_effort).toBe("xhigh");
		expect(request.reasoning).toBeUndefined();
	});

	it("maps reasoning enabled=true to default high effort", () => {
		const request: Record<string, unknown> = {};
		const ir: any = {
			reasoning: {
				enabled: true,
			},
		};

		sakanaQuirks.transformRequest?.({ request, ir });

		expect(request.reasoning_effort).toBe("high");
	});

	it("omits unsupported disabled reasoning effort", () => {
		const request: Record<string, unknown> = {
			reasoning: { effort: "none" },
		};
		const ir: any = {
			reasoning: {
				effort: "none",
			},
		};

		sakanaQuirks.transformRequest?.({ request, ir });

		expect(request.reasoning_effort).toBeUndefined();
		expect(request.reasoning).toBeUndefined();
	});
});
