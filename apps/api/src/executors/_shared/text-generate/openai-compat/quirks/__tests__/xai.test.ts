import { describe, expect, it } from "vitest";
import { xAiQuirks } from "../../providers/x-ai/quirks";

describe("xAI quirks", () => {
	describe("transformRequest", () => {
		it("downgrades json_schema and strips unsupported fields for reasoning models", () => {
			const request: Record<string, any> = {
				model: "grok-4-0709",
				response_format: {
					type: "json_schema",
					json_schema: {
						name: "answer",
						schema: {
							type: "object",
							properties: {
								answer: { type: "string" },
							},
							required: ["answer"],
						},
					},
				},
				messages: [{ role: "user", content: "Return one answer." }],
				presence_penalty: 0.4,
				frequency_penalty: 0.2,
				stop: ["DONE"],
			};

			xAiQuirks.transformRequest?.({
				request,
				ir: {} as any,
				model: request.model,
			});

			expect(request.response_format).toEqual({ type: "json_object" });
			expect(request.messages[0].role).toBe("system");
			expect(String(request.messages[0].content)).toContain("The JSON must match this schema");
			expect(request.presence_penalty).toBeUndefined();
			expect(request.frequency_penalty).toBeUndefined();
			expect(request.stop).toBeUndefined();
		});

		it("keeps penalties/stop for explicitly non-reasoning models", () => {
			const request: Record<string, any> = {
				model: "grok-4-1-fast-non-reasoning",
				messages: [{ role: "user", content: "hi" }],
				presence_penalty: 0.4,
				frequency_penalty: 0.2,
				stop: ["DONE"],
			};

			xAiQuirks.transformRequest?.({
				request,
				ir: {} as any,
				model: request.model,
			});

			expect(request.presence_penalty).toBe(0.4);
			expect(request.frequency_penalty).toBe(0.2);
			expect(request.stop).toEqual(["DONE"]);
		});
	});

	describe("normalizeResponse", () => {
		it("maps usage detail keys and fills totals plus requests", () => {
			const response: Record<string, any> = {
				usage: {
					prompt_tokens: 10,
					completion_tokens: 5,
					prompt_tokens_details: { cached_tokens: 2 },
					completion_tokens_details: { reasoning_tokens: 1 },
				},
			};

			xAiQuirks.normalizeResponse?.({ response, ir: {} as any });

			expect(response.usage.input_tokens).toBe(10);
			expect(response.usage.output_tokens).toBe(5);
			expect(response.usage.total_tokens).toBe(15);
			expect(response.usage.input_tokens_details).toEqual({ cached_tokens: 2 });
			expect(response.usage.output_tokens_details).toEqual({ reasoning_tokens: 1 });
			expect(response.usage.requests).toBe(1);
		});

		it("preserves explicit usage.requests", () => {
			const response: Record<string, any> = {
				usage: {
					prompt_tokens: 1,
					completion_tokens: 2,
					requests: 7,
				},
			};

			xAiQuirks.normalizeResponse?.({ response, ir: {} as any });

			expect(response.usage.requests).toBe(7);
		});
	});
});
