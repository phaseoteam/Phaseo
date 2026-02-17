import { describe, expect, it } from "vitest";
import { novitaQuirks } from "../../providers/novitaai/quirks";

describe("Novita quirks", () => {
	it("rewrites developer role and maps IR reasoning to Novita thinking params", () => {
		const request: Record<string, any> = {
			model: "deepseek/deepseek-r1-turbo",
			messages: [
				{ role: "developer", content: "Be concise." },
				{ role: "user", content: "hello" },
			],
		};

		novitaQuirks.transformRequest?.({
			request,
			model: "deepseek-r1-turbo",
			ir: {
				reasoning: {
					enabled: true,
				},
			} as any,
		});

		expect(request.messages[0].role).toBe("system");
		expect(request.enable_thinking).toBe(true);
		expect(request.separate_reasoning).toBe(true);
	});

	it("disables thinking when IR reasoning is explicitly disabled", () => {
		const request: Record<string, any> = {
			model: "deepseek/deepseek-r1-turbo",
			messages: [{ role: "user", content: "hello" }],
		};

		novitaQuirks.transformRequest?.({
			request,
			model: "deepseek-r1-turbo",
			ir: {
				reasoning: {
					enabled: false,
				},
			} as any,
		});

		expect(request.enable_thinking).toBe(false);
		expect(request.separate_reasoning).toBeUndefined();
	});

	it("extracts reasoning_content into IR reasoning parts", () => {
		const extracted = novitaQuirks.extractReasoning?.({
			rawContent: "Final answer",
			choice: {
				message: {
					content: "Final answer",
					reasoning_content: "thought process",
				},
			},
		});

		expect(extracted).toEqual({
			main: "Final answer",
			reasoning: ["thought process"],
		});
	});
});

