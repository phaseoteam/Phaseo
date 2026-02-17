import { describe, expect, it } from "vitest";
import { deepseekQuirks } from "../../providers/deepseek/quirks";

describe("DeepSeek quirks", () => {
	it("keeps json_object response_format and rewrites developer role", () => {
		const request: Record<string, any> = {
			response_format: { type: "json_object" },
			messages: [
				{ role: "developer", content: "Be concise." },
				{ role: "user", content: "hi" },
			],
		};

		deepseekQuirks.transformRequest?.({ request, ir: {} as any });

		expect(request.response_format).toEqual({ type: "json_object" });
		expect(request.messages[0].role).toBe("system");
	});

	it("downgrades json_schema to json_object and injects schema instructions", () => {
		const request: Record<string, any> = {
			response_format: {
				type: "json_schema",
				json_schema: {
					name: "answer",
					schema: {
						type: "object",
						properties: { city: { type: "string" } },
						required: ["city"],
					},
				},
			},
			messages: [{ role: "user", content: "Give one city." }],
		};

		deepseekQuirks.transformRequest?.({ request, ir: {} as any });

		expect(request.response_format).toEqual({ type: "json_object" });
		expect(request.messages[0].role).toBe("system");
		expect(String(request.messages[0].content)).toContain("The JSON must match this schema");
	});
});

