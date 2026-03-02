import { describe, expect, it } from "vitest";
import { novitaQuirks } from "../../providers/novitaai/quirks";

describe("Novita quirks", () => {
	it.each([
		"zai-org/glm-4.5",
		"deepseek/deepseek-v3.1",
		"deepseek/deepseek-v3.1-terminus",
		"deepseek/deepseek-v3.2-exp",
	])("maps reasoning to enable_thinking for supported model %s", (model) => {
		const request: Record<string, any> = {
			model,
			messages: [{ role: "user", content: "hello" }],
		};

		novitaQuirks.transformRequest?.({
			request,
			model,
			ir: {
				reasoning: {
					enabled: true,
				},
			} as any,
		});

		expect(request.enable_thinking).toBe(true);
	});

	it("rewrites developer role and maps reasoning to enable_thinking for supported models", () => {
		const request: Record<string, any> = {
			model: "deepseek/deepseek-v3.1",
			messages: [
				{ role: "developer", content: "Be concise." },
				{ role: "user", content: "hello" },
			],
		};

		novitaQuirks.transformRequest?.({
			request,
			model: "deepseek/deepseek-v3.1",
			ir: {
				reasoning: {
					enabled: true,
				},
			} as any,
		});

		expect(request.messages[0].role).toBe("system");
		expect(request.enable_thinking).toBe(true);
		expect(request.separate_reasoning).toBeUndefined();
	});

	it("maps reasoning.enabled=false to enable_thinking=false on supported models", () => {
		const request: Record<string, any> = {
			model: "zai-org/glm-4.5",
			messages: [{ role: "user", content: "hello" }],
		};

		novitaQuirks.transformRequest?.({
			request,
			model: "zai-org/glm-4.5",
			ir: {
				reasoning: {
					enabled: false,
				},
			} as any,
		});

		expect(request.enable_thinking).toBe(false);
		expect(request.separate_reasoning).toBeUndefined();
	});

	it("only maps enable_thinking for explicit Novita-supported models", () => {
		const request: Record<string, any> = {
			model: "deepseek/deepseek-r1-turbo",
			messages: [{ role: "user", content: "hello" }],
		};

		novitaQuirks.transformRequest?.({
			request,
			model: "deepseek/deepseek-r1-turbo",
			ir: {
				reasoning: {
					enabled: true,
				},
			} as any,
		});

		expect(request.enable_thinking).toBeUndefined();
	});

	it("maps separate_reasoning only for deepseek/deepseek-r1-turbo", () => {
		const request: Record<string, any> = {
			model: "deepseek/deepseek-r1-turbo",
			messages: [{ role: "user", content: "hello" }],
		};

		novitaQuirks.transformRequest?.({
			request,
			model: "deepseek/deepseek-r1-turbo",
			ir: {
				reasoning: {
					enabled: true,
				},
			} as any,
		});

		expect(request.separate_reasoning).toBe(true);
	});

	it("accepts gateway-prefixed Novita model IDs for allowlist matching", () => {
		const request: Record<string, any> = {
			model: "novitaai/deepseek/deepseek-v3.2-exp",
			messages: [{ role: "user", content: "hello" }],
		};

		novitaQuirks.transformRequest?.({
			request,
			ir: {
				reasoning: {
					effort: "high",
				},
			} as any,
		});

		expect(request.enable_thinking).toBe(true);
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

