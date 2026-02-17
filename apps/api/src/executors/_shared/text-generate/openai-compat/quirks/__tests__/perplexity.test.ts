import { describe, expect, it } from "vitest";
import { perplexityQuirks } from "../../providers/perplexity/quirks";

describe("Perplexity quirks", () => {
	it("rewrites developer role and maps reasoning effort", () => {
		const request: Record<string, any> = {
			model: "sonar-reasoning-pro",
			messages: [
				{ role: "developer", content: "Be concise." },
				{ role: "user", content: "hello" },
			],
		};

		perplexityQuirks.transformRequest?.({
			request,
			ir: {
				reasoning: {
					effort: "xhigh",
				},
			} as any,
		});

		expect(request.messages[0].role).toBe("system");
		expect(request.reasoning_effort).toBe("high");
	});

	it("defaults reasoning_effort when reasoning is enabled", () => {
		const request: Record<string, any> = {
			model: "sonar-reasoning-pro",
			messages: [{ role: "user", content: "hello" }],
		};

		perplexityQuirks.transformRequest?.({
			request,
			ir: {
				reasoning: {
					enabled: true,
				},
			} as any,
		});

		expect(request.reasoning_effort).toBe("medium");
	});

	it("maps xlow effort to minimal", () => {
		const request: Record<string, any> = {
			model: "sonar-reasoning-pro",
			messages: [{ role: "user", content: "hello" }],
		};

		perplexityQuirks.transformRequest?.({
			request,
			ir: {
				reasoning: {
					effort: "xlow",
				},
			} as any,
		});

		expect(request.reasoning_effort).toBe("minimal");
	});

	it("extracts reasoning_content to IR reasoning", () => {
		const extracted = perplexityQuirks.extractReasoning?.({
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
