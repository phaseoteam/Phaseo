import { describe, expect, it } from "vitest";
import { prepareServerToolsForTextRequest } from "./server-tools";

describe("prepareServerToolsForTextRequest", () => {
	it("rejects web_search_preview tools", () => {
		const result = prepareServerToolsForTextRequest(
			{
				model: "openai/gpt-5-nano",
				tools: [{ type: "web_search_preview" }],
			},
			"openai.responses",
		);
		expect(result.ok).toBe(false);
		if (result.ok) {
			throw new Error("Expected prepareServerToolsForTextRequest to fail");
		}
		expect(result.message).toContain("web_search_preview");
		expect(result.message).toContain("temporarily disabled");
	});

	it("rejects web_search tool choice", () => {
		const result = prepareServerToolsForTextRequest(
			{
				model: "openai/gpt-5-nano",
				tool_choice: "web_search",
			},
			"openai.responses",
		);
		expect(result.ok).toBe(false);
		if (result.ok) {
			throw new Error("Expected prepareServerToolsForTextRequest to fail");
		}
		expect(result.message).toContain("web_search");
		expect(result.message).toContain("temporarily disabled");
	});

	it("continues to accept gateway datetime tool", () => {
		const result = prepareServerToolsForTextRequest(
			{
				model: "openai/gpt-5-nano",
				tools: [{ type: "gateway:datetime" }],
			},
			"openai.responses",
		);
		expect(result.ok).toBe(true);
		if (!result.ok) {
			throw new Error("Expected prepareServerToolsForTextRequest to succeed");
		}
		expect(result.config.enabled).toBe(true);
		expect(Array.isArray(result.body.tools)).toBe(true);
		expect(
			(result.body.tools as Array<{ type?: string }>).some(
				(tool) => tool.type === "function",
			),
		).toBe(true);
	});
});

