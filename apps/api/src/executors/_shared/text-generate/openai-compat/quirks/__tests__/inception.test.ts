import { describe, expect, it } from "vitest";
import { inceptionQuirks } from "../../providers/inception/quirks";

describe("Inception quirks", () => {
	it("maps IR reasoning to top-level Inception fields", () => {
		const request: Record<string, any> = {
			model: "mercury-2",
			messages: [{ role: "user", content: "hello" }],
		};

		inceptionQuirks.transformRequest?.({
			request,
			ir: {
				reasoning: {
					effort: "xhigh",
					summary: "concise",
				},
				vendor: {
					inception: {
						reasoning_summary_wait: true,
						diffusing: false,
					},
				},
			} as any,
		});

		expect(request.reasoning_effort).toBe("xhigh");
		expect(request.reasoning_summary).toBe("concise");
		expect(request.reasoning_summary_wait).toBe(true);
		expect(request.diffusing).toBe(false);
		expect(request.reasoning).toBeUndefined();
	});

	it("extracts reasoning_content", () => {
		const extracted = inceptionQuirks.extractReasoning?.({
			rawContent: "Final answer",
			choice: {
				message: {
					content: "Final answer",
					reasoning_content: "internal reasoning",
				},
			},
		});

		expect(extracted).toEqual({
			main: "Final answer",
			reasoning: ["internal reasoning"],
		});
	});
});

