import { describe, expect, it } from "vitest";
import { groqQuirks } from "../../providers/groq/quirks";

describe("Groq quirks", () => {
	it("removes unsupported chat fields and message name", () => {
		const request: Record<string, any> = {
			model: "llama-3.3-70b-versatile",
			logprobs: true,
			top_logprobs: 5,
			logit_bias: { "42": 1 },
			n: 4,
			messages: [
				{ role: "user", name: "alice", content: "hello" },
			],
		};

		groqQuirks.transformRequest?.({
			request,
			ir: {} as any,
			model: request.model,
		});

		expect(request.logprobs).toBeUndefined();
		expect(request.top_logprobs).toBeUndefined();
		expect(request.logit_bias).toBeUndefined();
		expect(request.n).toBeUndefined();
		expect(request.messages).toEqual([
			{ role: "user", content: "hello" },
		]);
	});

	it("normalizes responses payload to OpenAI field names and drops unsupported params", () => {
		const request: Record<string, any> = {
			model: "llama-3.3-70b-versatile",
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
			store: true,
			truncation: "auto",
			include: ["usage"],
			previous_response_id: "resp_prev_1",
			prompt: "reuse me",
			prompt_cache_key: "cache_1",
			safety_identifier: "safety_1",
		};

		groqQuirks.transformRequest?.({
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
		expect(request.store).toBeUndefined();
		expect(request.truncation).toBeUndefined();
		expect(request.include).toBeUndefined();
		expect(request.previous_response_id).toBeUndefined();
		expect(request.prompt).toBeUndefined();
		expect(request.prompt_cache_key).toBeUndefined();
		expect(request.safety_identifier).toBeUndefined();
	});
});

