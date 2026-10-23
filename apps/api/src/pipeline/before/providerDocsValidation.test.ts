import { describe, expect, it } from "vitest";
import { validateProviderDocsCompliance } from "./providerDocsValidation";

function candidate(providerId: string): any {
	return { providerId };
}

describe("validateProviderDocsCompliance", () => {
	it("does not reject out-of-range numeric params at preflight (normalized later)", () => {
		const result = validateProviderDocsCompliance({
			endpoint: "responses",
			body: {
				model: "anthropic/claude-sonnet-4",
				temperature: 1.8,
				input: "hello",
			},
			requestId: "req_test",
			workspaceId: "team_test",
			model: "anthropic/claude-sonnet-4",
			providers: [candidate("anthropic")],
			requestedParams: ["temperature"],
		});

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.providers.map((p) => p.providerId)).toEqual(["anthropic"]);
		}
	});

	it("keeps anthropic provider when service_tier is requested", () => {
		const result = validateProviderDocsCompliance({
			endpoint: "responses",
			body: {
				model: "anthropic/claude-sonnet-4",
				service_tier: "priority",
				input: "hello",
			},
			requestId: "req_test",
			workspaceId: "team_test",
			model: "anthropic/claude-sonnet-4",
			providers: [candidate("anthropic")],
			requestedParams: ["service_tier"],
		});

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.providers.map((p) => p.providerId)).toEqual(["anthropic"]);
		}
	});

	it("keeps xai alias when /responses includes instructions (advisory only)", () => {
		const result = validateProviderDocsCompliance({
			endpoint: "responses",
			body: {
				model: "x-ai/grok-4",
				instructions: "be concise",
				input: "hello",
			},
			requestId: "req_test",
			workspaceId: "team_test",
			model: "x-ai/grok-4",
			providers: [candidate("xai"), candidate("openai")],
			requestedParams: ["instructions"],
		});

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.providers.map((p) => p.providerId)).toEqual(["xai", "openai"]);
		}
	});

	it("does not return validation_error when xai is the only provider and instructions are present", async () => {
		const result = validateProviderDocsCompliance({
			endpoint: "responses",
			body: {
				model: "x-ai/grok-4",
				instructions: "be concise",
				input: "hello",
			},
			requestId: "req_test",
			workspaceId: "team_test",
			model: "x-ai/grok-4",
			providers: [candidate("xai")],
			requestedParams: ["instructions"],
		});

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.providers.map((p) => p.providerId)).toEqual(["xai"]);
		}
	});

	describe("allowed_tools naming a tool the request does not define", () => {
		const body = {
			model: "gpt-5",
			messages: [{ role: "user", content: "hi" }],
			tools: [{ type: "function", function: { name: "get_weather", parameters: {} } }],
			tool_choice: {
				type: "allowed_tools",
				allowed_tools: { mode: "required", tools: [{ type: "function", function: { name: "missing" } }] },
			},
		};
		const validate = (providers: string[], requestBody: any = body) => validateProviderDocsCompliance({
			endpoint: "chat.completions",
			body: requestBody,
			requestId: "req_test",
			workspaceId: "team_test",
			model: "openai/gpt-5",
			providers: providers.map(candidate),
			requestedParams: ["tool_choice"],
		});

		it("keeps only the providers sent allowed_tools itself", () => {
			const result = validate(["anthropic", "openai", "groq"]);
			expect(result.ok).toBe(true);
			if (result.ok) expect(result.providers.map((p) => p.providerId)).toEqual(["openai"]);
		});

		it("returns a 400 when no provider can enforce it", async () => {
			const result = validate(["anthropic"]);
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.response.status).toBe(400);
				const payload = await result.response.json();
				expect(payload.code).toBe("validation_error");
				expect(payload.error.code).toBe("validation_error");
				expect(payload.description).toContain("\"missing\"");
			}
		});

		it("keeps every provider when each allowed tool is defined (Responses)", () => {
			const result = validateProviderDocsCompliance({
				endpoint: "responses",
				body: {
					model: "gpt-5",
					input: "hi",
					tools: [{ type: "function", name: "get_weather", parameters: {} }, { type: "function", name: "search", parameters: {} }],
					tool_choice: { type: "allowed_tools", mode: "auto", tools: [{ type: "function", name: "get_weather" }] },
				},
				requestId: "req_test",
				workspaceId: "team_test",
				model: "openai/gpt-5",
				providers: [candidate("anthropic"), candidate("openai")],
				requestedParams: ["tool_choice"],
			});
			expect(result.ok).toBe(true);
			if (result.ok) expect(result.providers.map((p) => p.providerId)).toEqual(["anthropic", "openai"]);
		});
	});

	it("rejects a forced tool choice for Sonnet 5.5, Fable 5.1 and Mythos 5.1 with a clear 400", async () => {
		const tools = [{ name: "get_weather", input_schema: { type: "object", properties: {} } }];
		for (const [model, label] of [
			["anthropic/claude-sonnet-5.5", "Sonnet 5.5"],
			["anthropic/claude-fable-5.1", "Fable 5.1"],
			["anthropic/claude-mythos-5.1", "Mythos 5.1"],
		]) {
			for (const toolChoice of [{ type: "any" }, { type: "tool", name: "get_weather" }]) {
				const result = validateProviderDocsCompliance({
					endpoint: "messages",
					body: { model, max_tokens: 64, messages: [{ role: "user", content: "Weather?" }], tools, tool_choice: toolChoice },
					requestId: "req_test",
					workspaceId: "team_test",
					model,
					providers: [candidate("anthropic"), candidate("amazon-bedrock"), candidate("google-vertex")],
					requestedParams: ["tool_choice"],
				});
				expect(result.ok).toBe(false);
				if (!result.ok) {
					expect(result.response.status).toBe(400);
					const body = await result.response.json() as any;
					expect(JSON.stringify(body)).toContain(`${label}: forced tool choice is not supported`);
				}
			}
			const auto = validateProviderDocsCompliance({
				endpoint: "messages",
				body: { model, max_tokens: 64, messages: [{ role: "user", content: "Weather?" }], tools, tool_choice: { type: "auto" }, temperature: 0.2 },
				requestId: "req_test",
				workspaceId: "team_test",
				model,
				providers: [candidate("anthropic")],
				requestedParams: ["tool_choice", "temperature"],
			});
			expect(auto.ok).toBe(true);
		}
		// Sonnet 5 and Fable 5 still accept forced tool use.
		for (const model of ["anthropic/claude-sonnet-5", "anthropic/claude-fable-5"]) {
			expect(validateProviderDocsCompliance({
				endpoint: "messages",
				body: { model, max_tokens: 64, messages: [{ role: "user", content: "Weather?" }], tools, tool_choice: { type: "any" } },
				requestId: "req_test",
				workspaceId: "team_test",
				model,
				providers: [candidate("anthropic")],
				requestedParams: ["tool_choice"],
			}).ok).toBe(true);
		}
	});
});
