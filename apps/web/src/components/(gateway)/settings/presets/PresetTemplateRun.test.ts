import { sdkCode } from "@/lib/chat/sdkExport";
import { readTemplateRunError, readTemplateRunErrorCode, readTemplateRunReply, templateRunBody } from "./PresetTemplateRun";

describe("running a preset template", () => {
	it("sends the reference as model and prompt id with an empty conversation", () => {
		expect(templateRunBody("@support-triage", { company: "Acme" })).toEqual({
			model: "@support-triage",
			messages: [],
			prompt: { id: "@support-triage", variables: { company: "Acme" } },
		});
	});

	it("exports code that sends the same body", () => {
		const request = { endpoint: "/chat/completions", body: templateRunBody("@support-triage", { vip: true }) };
		const python = sdkCode(request, "sdk-python");
		expect(python).toContain('"id": "@support-triage"');
		expect(python).toContain('"vip": True');
		expect(sdkCode(request, "sdk-typescript")).toContain("client.chat.completions.create(");
		expect(sdkCode(request, "curl")).toContain("--url 'https://api.phaseo.app/v1'/chat/completions");
	});

	it("reads the reply text, model and token counts", () => {
		expect(readTemplateRunReply({
			model: "anthropic/claude-haiku-5.5",
			choices: [{ message: { role: "assistant", content: "Priority: high" } }],
			usage: { prompt_tokens: 42, completion_tokens: 5 },
		})).toEqual({ text: "Priority: high", model: "anthropic/claude-haiku-5.5", inputTokens: 42, outputTokens: 5 });
	});

	it("shows tool calls when the model replies with no text", () => {
		const reply = readTemplateRunReply({
			choices: [{ message: { content: null, tool_calls: [{ function: { name: "assign", arguments: "{\"team\":\"billing\"}" } }] } }],
		});
		expect(reply.text).toBe('assign({"team":"billing"})');
		expect(reply.inputTokens).toBeNull();
	});

	it("lists every template problem the gateway reported", () => {
		expect(readTemplateRunError({
			error: { code: "validation_error", message: "first" },
			details: [{ message: "Template \"@t\" needs variable \"ticket\" (string)" }, { message: "Variable \"vip\" must be true or false, not a string" }],
		})).toBe("Template \"@t\" needs variable \"ticket\" (string)\nVariable \"vip\" must be true or false, not a string");
		expect(readTemplateRunError({ error: { code: "not_found", message: "Preset not found" } })).toBe("Preset not found");
		expect(readTemplateRunError({ error: "chat_privacy_review_required" })).toBe("chat_privacy_review_required");
		expect(readTemplateRunError(null)).toBeNull();
	});

	it("recognises a workspace with no credits however the code is placed", () => {
		expect(readTemplateRunErrorCode({ error: { code: "insufficient_funds", message: "insufficient_funds" }, code: "insufficient_funds" })).toBe("insufficient_funds");
		expect(readTemplateRunErrorCode({ error: "insufficient_funds" })).toBe("insufficient_funds");
		expect(readTemplateRunErrorCode({ error: { code: "validation_error" } })).toBe("validation_error");
		expect(readTemplateRunErrorCode(null)).toBeNull();
	});
});
