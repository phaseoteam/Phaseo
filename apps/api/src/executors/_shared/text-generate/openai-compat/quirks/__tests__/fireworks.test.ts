import { describe, expect, it } from "vitest";
import { fireworksQuirks } from "../../providers/fireworks/quirks";

describe("Fireworks quirks", () => {
	it("normalizes responses payload to OpenAI field names", () => {
		const request: Record<string, any> = {
			model: "accounts/fireworks/models/llama-v3p3-70b-instruct",
			input_items: [{
				type: "message",
				role: "user",
				content: [{ type: "input_text", text: "hello" }],
			}],
			tools: [{
				type: "function",
				function: {
					name: "lookup",
					description: "Lookup records",
					parameters: { type: "object", properties: {} },
				},
			}],
			tool_choice: {
				type: "function",
				function: {
					name: "lookup",
				},
			},
			response_format: {
				type: "json_schema",
				json_schema: {
					name: "result",
					schema: {
						type: "object",
						properties: {
							answer: { type: "string" },
						},
						required: ["answer"],
					},
					strict: true,
				},
			},
		};

		fireworksQuirks.transformRequest?.({
			request,
			ir: {} as any,
			model: request.model,
		});

		expect(request.input_items).toBeUndefined();
		expect(request.input).toHaveLength(1);
		expect(request.tools).toEqual([{
			type: "function",
			name: "lookup",
			description: "Lookup records",
			parameters: { type: "object", properties: {} },
		}]);
		expect(request.tool_choice).toEqual({
			type: "function",
			name: "lookup",
		});
		expect(request.response_format).toBeUndefined();
		expect(request.text).toEqual({
			format: {
				type: "json_schema",
				name: "result",
				schema: {
					type: "object",
					properties: {
						answer: { type: "string" },
					},
					required: ["answer"],
				},
				strict: true,
			},
		});
	});

	it("keeps chat payload unchanged", () => {
		const request: Record<string, any> = {
			model: "accounts/fireworks/models/llama-v3p3-70b-instruct",
			messages: [{ role: "user", content: "hello" }],
			response_format: { type: "json_object" },
		};

		fireworksQuirks.transformRequest?.({
			request,
			ir: {} as any,
			model: request.model,
		});

		expect(request.messages).toEqual([{ role: "user", content: "hello" }]);
		expect(request.response_format).toEqual({ type: "json_object" });
		expect(request.text).toBeUndefined();
		expect(request.input).toBeUndefined();
	});

	it("maps json_object response format to text.format for responses payloads", () => {
		const request: Record<string, any> = {
			model: "accounts/fireworks/models/llama-v3p3-70b-instruct",
			input_items: [{
				type: "message",
				role: "user",
				content: [{ type: "input_text", text: "hello" }],
			}],
			response_format: { type: "json_object" },
		};

		fireworksQuirks.transformRequest?.({
			request,
			ir: {} as any,
			model: request.model,
		});

		expect(request.input).toHaveLength(1);
		expect(request.response_format).toBeUndefined();
		expect(request.text).toEqual({
			format: { type: "json_object" },
		});
	});
});

