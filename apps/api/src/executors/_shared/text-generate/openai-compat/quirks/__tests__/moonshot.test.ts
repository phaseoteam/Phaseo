import { describe, expect, it } from "vitest";
import { moonshotQuirks } from "../../providers/moonshot-ai/quirks";

describe("Moonshot quirks", () => {
	it("rewrites developer role and downgrades json_schema payloads", () => {
		const request: Record<string, any> = {
			model: "moonshot-v1-8k",
			messages: [
				{ role: "developer", content: "Respond in strict JSON." },
				{ role: "user", content: "Give one city." },
			],
			response_format: {
				type: "json_schema",
				json_schema: {
					name: "answer",
					schema: {
						type: "object",
						properties: {
							city: { type: "string" },
						},
						required: ["city"],
					},
				},
			},
		};

		moonshotQuirks.transformRequest?.({ request, ir: {} as any });

		expect(request.messages[0].role).toBe("system");
		expect(request.response_format).toEqual({ type: "json_object" });
		expect(String(request.messages[0].content)).toContain("The JSON must match this schema");
	});
});
