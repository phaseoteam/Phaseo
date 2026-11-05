import { describe, expect, it } from "vitest";
import {
	validateStructuredOutputResponse,
	validateToolCallResponses,
} from "./response-validation";
import { validateJsonSchemaValue } from "@/plugins/response-healing";

const toolRequest = {
	tools: [{
		type: "function",
		function: {
			name: "get_weather",
			parameters: {
				type: "object",
				properties: { city: { type: "string" } },
				required: ["city"],
			},
		},
	}],
};

function toolResponse(name: string, args: string) {
	return {
		choices: [{ message: { tool_calls: [{ function: { name, arguments: args } }] } }],
	};
}

describe("validateToolCallResponses", () => {
	it("tracks invalid JSON, schema mismatches, and unknown tool names", () => {
		expect(validateToolCallResponses(toolRequest, toolResponse("get_weather", "{"))).toMatchObject({
			totalCalls: 1,
			invalidCalls: 1,
			invalidJson: 1,
		});
		expect(validateToolCallResponses(toolRequest, toolResponse("get_weather", '{"city":42}'))).toMatchObject({
			invalidCalls: 1,
			schemaMismatch: 1,
		});
		expect(validateToolCallResponses(toolRequest, toolResponse("delete_everything", "{}"))).toMatchObject({
			invalidCalls: 1,
			unknownToolName: 1,
		});
	});

	it("reads empty arguments as an empty object", () => {
		const noArgs = { tools: [{ type: "function", function: { name: "now", parameters: { type: "object", properties: {} } } }] };
		expect(validateToolCallResponses(noArgs, toolResponse("now", ""))).toMatchObject({ totalCalls: 1, invalidCalls: 0 });
		// A tool that needs arguments still fails, on its schema rather than as broken JSON.
		expect(validateToolCallResponses(toolRequest, toolResponse("get_weather", ""))).toMatchObject({
			invalidCalls: 1,
			invalidJson: 0,
			schemaMismatch: 1,
		});
	});

	it("does not fail a call on a schema pattern too risky to evaluate", () => {
		const patterned = {
			tools: [{
				type: "function",
				function: {
					name: "set_mode",
					parameters: { type: "object", properties: { mode: { type: "string", pattern: "^(fast|slow)$" } } },
				},
			}],
		};
		expect(validateToolCallResponses(patterned, toolResponse("set_mode", '{"mode":"fast"}'))).toMatchObject({ invalidCalls: 0 });
	});

	it("accepts a known tool with valid arguments", () => {
		expect(validateToolCallResponses(toolRequest, toolResponse("get_weather", '{"city":"London"}'))).toEqual({
			totalCalls: 1,
			invalidCalls: 0,
			invalidJson: 0,
			schemaMismatch: 0,
			unknownToolName: 0,
		});
	});
});

describe("validateStructuredOutputResponse", () => {
	const request = {
		response_format: {
			type: "json_schema",
			json_schema: {
				schema: {
					type: "object",
					properties: { answer: { type: "string" } },
					required: ["answer"],
				},
			},
		},
	};

	it("distinguishes invalid JSON, schema mismatches, and missing output", () => {
		expect(validateStructuredOutputResponse(request, { output_text: "{" }).errorReason).toBe("invalid_json");
		expect(validateStructuredOutputResponse(request, { output_text: '{"answer":42}' }).errorReason).toBe("schema_mismatch");
		expect(validateStructuredOutputResponse(request, { choices: [{ message: { content: "" } }] })).toMatchObject({
			basis: "json_parse",
			errorReason: "missing_output",
		});
	});

	it("does not rate a reply it could not read", () => {
		for (const response of [null, {}, { type: "message_stop" }]) {
			expect(validateStructuredOutputResponse(request, response)).toEqual({
				attempted: true,
				succeeded: false,
				basis: "unobserved",
				errorReason: null,
			});
		}
	});

	it("does not rate a turn that called tools instead of answering", () => {
		const response = {
			choices: [{ message: { content: null, tool_calls: [{ function: { name: "lookup", arguments: "{}" } }] } }],
		};
		expect(validateStructuredOutputResponse(request, response)).toMatchObject({ basis: "unobserved", errorReason: null });
	});

	it("reads the answer, not reasoning, from a Responses reply", () => {
		const responsesRequest = { text: { format: { type: "json_schema", name: "a", schema: request.response_format.json_schema.schema } } };
		const response = {
			object: "response",
			output: [
				{ type: "reasoning", content: [{ type: "reasoning_text", text: "Let me think about the answer." }] },
				{ type: "message", content: [{ type: "output_text", text: '{"answer":"yes"}' }] },
			],
		};
		expect(validateStructuredOutputResponse(responsesRequest, response)).toMatchObject({ succeeded: true });
	});

	it("checks Messages output_config.format against text blocks, not thinking", () => {
		const messagesRequest = { output_config: { format: { type: "json_schema", schema: request.response_format.json_schema.schema } } };
		const response = {
			type: "message",
			content: [
				{ type: "thinking", thinking: "Considering." },
				{ type: "text", text: '{"answer":"yes"}' },
			],
		};
		expect(validateStructuredOutputResponse(messagesRequest, response)).toMatchObject({ attempted: true, succeeded: true });
	});

	it("joins Chat content parts", () => {
		const response = { choices: [{ message: { content: [{ type: "text", text: '{"answer":' }, { type: "text", text: '"yes"}' }] } }] };
		expect(validateStructuredOutputResponse(request, response)).toMatchObject({ succeeded: true });
	});

	it("accepts a response matching the requested schema", () => {
		expect(validateStructuredOutputResponse(request, { output_text: '{"answer":"yes"}' })).toMatchObject({
			succeeded: true,
			basis: "schema_validation",
			errorReason: null,
		});
	});
});

describe("request-supplied schema patterns", () => {
	it("rejects backtracking-heavy patterns without evaluating them", () => {
		const unsafePattern = `^(${String.fromCharCode(97)}+)+$`;
		const result = validateJsonSchemaValue(
			"a".repeat(4096) + "!",
			{ type: "string", pattern: unsafePattern },
		);
		expect(result.ok).toBe(false);
		expect(result.errors[0]).toContain("unsafe pattern");
	});
});
