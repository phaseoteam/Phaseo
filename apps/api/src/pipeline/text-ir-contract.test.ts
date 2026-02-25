import { describe, expect, it } from "vitest";
import {
	buildTextIRContractErrorResponse,
	validateTextIRContract,
} from "./text-ir-contract";
import type { IRChatRequest } from "@core/ir";

function baseIR(overrides: Partial<IRChatRequest> = {}): IRChatRequest {
	return {
		model: "openai/gpt-5-nano",
		stream: false,
		messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
		...overrides,
	};
}

describe("validateTextIRContract", () => {
	it("accepts a basic text request", () => {
		expect(validateTextIRContract(baseIR())).toEqual([]);
	});

	it("rejects json_schema response_format without schema object", () => {
		const issues = validateTextIRContract(
			baseIR({
				responseFormat: {
					type: "json_schema",
					schema: undefined as any,
				},
			}),
		);
		expect(issues[0]?.code).toBe("response_format_json_schema_missing_schema");
	});

	it("rejects unsupported response_format type", () => {
		const issues = validateTextIRContract(
			baseIR({
				responseFormat: {
					type: "xml" as any,
				},
			}),
		);
		expect(issues[0]?.code).toBe("response_format_type_invalid");
	});
});

describe("buildTextIRContractErrorResponse", () => {
	it("returns 400 with request_id and debug issues when enabled", async () => {
		const response = buildTextIRContractErrorResponse(
			[{
				code: "response_format_type_invalid",
				message: "response_format.type must be one of: text, json_object, json_schema.",
				path: "response_format.type",
			}],
			{
				requestId: "req_abc",
				meta: { debug: { enabled: true } },
			} as any,
		);
		const payload = await response.json();

		expect(response.status).toBe(400);
		expect(payload.error).toBe("invalid_request");
		expect(payload.request_id).toBe("req_abc");
		expect(Array.isArray(payload.issues)).toBe(true);
	});
});
