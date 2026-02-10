// Purpose: Shared OpenAI-compatible text adapter and transformations.
// Why: Consolidates OpenAI-style quirks across many providers.
// How: Maps IR to OpenAI formats and normalizes streaming events.

// Z.AI Quirks Tests
import { describe, expect, it } from "vitest";
import { zaiQuirks } from "../../providers/z-ai/quirks";

describe("Z.AI Quirks", () => {
	describe("transformRequest", () => {
		it("enables thinking when reasoning.enabled=true", () => {
			const request: Record<string, any> = {};
			zaiQuirks.transformRequest!({
				request,
				ir: { reasoning: { enabled: true } } as any,
			});
			expect(request.thinking).toEqual({
				type: "enabled",
				clear_thinking: false,
			});
		});

		it("disables thinking when reasoning.enabled=false", () => {
			const request: Record<string, any> = {};
			zaiQuirks.transformRequest!({
				request,
				ir: { reasoning: { enabled: false } } as any,
			});
			expect(request.thinking).toEqual({
				type: "disabled",
				clear_thinking: false,
			});
		});
	});

	describe("normalizeResponse", () => {
		it("should convert first message to reasoning when there are 2+ messages", () => {
			const response = {
				output: [
					{
						type: "message",
						id: "msg_1",
						role: "assistant",
						content: [{ type: "output_text", text: "Thinking..." }],
					},
					{
						type: "message",
						id: "msg_2",
						role: "assistant",
						content: [{ type: "output_text", text: "Answer..." }],
					},
				],
			};

			zaiQuirks.normalizeResponse!({ response, ir: null as any });

			expect(response.output[0].type).toBe("reasoning");
			expect(response.output[1].type).toBe("message");
		});

		it("should handle output_items instead of output", () => {
			const response = {
				output_items: [
					{
						type: "message",
						id: "msg_1",
						content: [{ type: "output_text", text: "Thinking..." }],
					},
					{
						type: "message",
						id: "msg_2",
						content: [{ type: "output_text", text: "Answer..." }],
					},
				],
			};

			zaiQuirks.normalizeResponse!({ response, ir: null as any });

			expect(response.output_items[0].type).toBe("reasoning");
			expect(response.output_items[1].type).toBe("message");
		});

		it("should not modify when there is only 1 message", () => {
			const response = {
				output: [
					{
						type: "message",
						id: "msg_1",
						content: [{ type: "output_text", text: "Answer..." }],
					},
				],
			};

			zaiQuirks.normalizeResponse!({ response, ir: null as any });

			expect(response.output[0].type).toBe("message");
		});

		it("should not modify when there are already reasoning items", () => {
			const response = {
				output: [
					{
						type: "reasoning",
						id: "reasoning_1",
						content: [{ type: "output_text", text: "Thinking..." }],
					},
					{
						type: "message",
						id: "msg_1",
						content: [{ type: "output_text", text: "Answer..." }],
					},
				],
			};

			zaiQuirks.normalizeResponse!({ response, ir: null as any });

			expect(response.output[0].type).toBe("reasoning");
			expect(response.output[1].type).toBe("message");
		});
	});
});

