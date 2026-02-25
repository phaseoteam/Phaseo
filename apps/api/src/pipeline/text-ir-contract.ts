// Purpose: Shared contract checks for text.generate IR payloads.
// Why: Enforce endpoint-agnostic text IR invariants in one place.
// How: Validates IR fields and returns a client-safe 400 response payload when needed.

import type { IRChatRequest, IRResponseFormat } from "@core/ir";
import type { PipelineContext } from "./before/types";

export type TextIRContractIssue = {
	code:
		| "response_format_type_invalid"
		| "response_format_json_schema_missing_schema";
	message: string;
	path?: string;
};

function isValidResponseFormatType(
	value: unknown,
): value is IRResponseFormat["type"] {
	return value === "text" || value === "json_object" || value === "json_schema";
}

export function validateTextIRContract(ir: IRChatRequest): TextIRContractIssue[] {
	const issues: TextIRContractIssue[] = [];

	if (ir.responseFormat) {
		const format = ir.responseFormat as Record<string, any>;
		if (!isValidResponseFormatType(format.type)) {
			issues.push({
				code: "response_format_type_invalid",
				path: "response_format.type",
				message:
					"response_format.type must be one of: text, json_object, json_schema.",
			});
		}

		if (
			format.type === "json_schema" &&
			(!format.schema || typeof format.schema !== "object" || Array.isArray(format.schema))
		) {
			issues.push({
				code: "response_format_json_schema_missing_schema",
				path: "response_format.json_schema.schema",
				message:
					"response_format type json_schema requires a schema object.",
			});
		}
	}

	return issues;
}

export function buildTextIRContractErrorResponse(
	issues: TextIRContractIssue[],
	ctx?: PipelineContext,
): Response {
	const primary =
		issues[0]?.message ?? "Invalid text.generate IR request.";
	const payload: Record<string, unknown> = {
		error: "invalid_request",
		description: primary,
	};

	if (ctx?.requestId) {
		payload.request_id = ctx.requestId;
	}

	if (ctx?.meta?.debug?.enabled) {
		payload.issues = issues;
	}

	return new Response(JSON.stringify(payload), {
		status: 400,
		headers: { "Content-Type": "application/json" },
	});
}
