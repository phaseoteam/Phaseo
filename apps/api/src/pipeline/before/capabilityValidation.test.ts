import { describe, expect, it } from "vitest";
import { validateCapabilities } from "./capabilityValidation";

function provider(providerId: string, capabilityParams: Record<string, any>, maxOutputTokens?: number | null): any {
	return {
		providerId,
		capabilityParams,
		maxOutputTokens: maxOutputTokens ?? null,
	};
}

describe("validateCapabilities", () => {
	it("rejects unknown top-level params for text endpoints", async () => {
		const result = validateCapabilities({
			endpoint: "chat.completions",
			rawBody: {
				model: "openai/gpt-4o-mini",
				messages: [{ role: "user", content: "hello" }],
				foo: "bar",
			},
			body: {
				model: "openai/gpt-4o-mini",
				messages: [{ role: "user", content: "hello" }],
			},
			requestId: "req_unknown_param",
			teamId: "team_test",
			providers: [provider("openai", { max_tokens: {} })],
			model: "openai/gpt-4o-mini",
		});

		expect(result.ok).toBe(false);
		if (!result.ok) {
			const json = await result.response.json();
			expect(json.error).toBe("validation_error");
			expect(JSON.stringify(json.details ?? [])).toContain("\"unknown_param\"");
			expect(JSON.stringify(json.details ?? [])).toContain("\"foo\"");
		}
	});

	it("does not hard-reject when provider capability metadata does not list a requested param", async () => {
		const result = validateCapabilities({
			endpoint: "chat.completions",
			rawBody: {
				model: "openai/gpt-4o-mini",
				messages: [{ role: "user", content: "hello" }],
				temperature: 0.2,
			},
			body: {
				model: "openai/gpt-4o-mini",
				messages: [{ role: "user", content: "hello" }],
				temperature: 0.2,
			},
			requestId: "req_unsupported_param",
			teamId: "team_test",
			providers: [
				provider("openai", { top_p: {} }),
				provider("anthropic", { tools: {} }),
			],
			model: "openai/gpt-4o-mini",
		});

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.providers.map((p: any) => p.providerId)).toEqual(["openai", "anthropic"]);
			const support = result.paramRoutingDiagnostics.perParamSupport.find((item) => item.param === "temperature");
			expect(support?.supportedProviders).toEqual([]);
			expect(support?.unsupportedProviders).toEqual(["openai", "anthropic"]);
		}
	});

	it("keeps providers even when only some advertise requested params", () => {
		const result = validateCapabilities({
			endpoint: "chat.completions",
			rawBody: {
				model: "openai/gpt-4o-mini",
				messages: [{ role: "user", content: "hello" }],
				temperature: 0.2,
				max_tokens: 32,
			},
			body: {
				model: "openai/gpt-4o-mini",
				messages: [{ role: "user", content: "hello" }],
				temperature: 0.2,
				max_tokens: 32,
			},
			requestId: "req_routing_filter",
			teamId: "team_test",
			providers: [
				provider("openai", { temperature: {}, max_tokens: {} }, 4096),
				provider("anthropic", { top_p: {}, max_tokens: {} }, 4096),
			],
			model: "openai/gpt-4o-mini",
		});

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.providers.map((p: any) => p.providerId)).toEqual(["openai", "anthropic"]);
			expect(result.requestedParams).toEqual(["temperature", "max_tokens"]);
			expect(result.paramRoutingDiagnostics.providerCountBefore).toBe(2);
			expect(result.paramRoutingDiagnostics.providerCountAfter).toBe(2);
			expect(result.paramRoutingDiagnostics.droppedProviders).toEqual([]);
		}
	});

	it("treats max_output_tokens alias as max_tokens capability", () => {
		const result = validateCapabilities({
			endpoint: "messages",
			rawBody: {
				model: "anthropic/claude-sonnet-4.5",
				messages: [{ role: "user", content: "hello" }],
				max_output_tokens: 256,
			},
			body: {
				model: "anthropic/claude-sonnet-4.5",
				messages: [{ role: "user", content: "hello" }],
				max_output_tokens: 256,
			},
			requestId: "req_alias_max_tokens",
			teamId: "team_test",
			providers: [
				provider("anthropic", { max_tokens: {} }, 4096),
			],
			model: "anthropic/claude-sonnet-4.5",
		});

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.providers.map((p: any) => p.providerId)).toEqual(["anthropic"]);
			expect(result.requestedParams).toEqual(["max_tokens"]);
		}
	});

	it("records empty requested params diagnostics when request has no optional params", () => {
		const result = validateCapabilities({
			endpoint: "chat.completions",
			rawBody: {
				model: "openai/gpt-4o-mini",
				messages: [{ role: "user", content: "hello" }],
			},
			body: {
				model: "openai/gpt-4o-mini",
				messages: [{ role: "user", content: "hello" }],
			},
			requestId: "req_no_optional_params",
			teamId: "team_test",
			providers: [
				provider("openai", { temperature: {}, max_tokens: {} }, 4096),
			],
			model: "openai/gpt-4o-mini",
		});

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.requestedParams).toEqual([]);
			expect(result.paramRoutingDiagnostics.perParamSupport).toEqual([]);
			expect(result.paramRoutingDiagnostics.providerCountBefore).toBe(1);
			expect(result.paramRoutingDiagnostics.providerCountAfter).toBe(1);
		}
	});

	it("accepts usage/meta/debug as gateway fields without capability filtering", () => {
		const result = validateCapabilities({
			endpoint: "responses",
			rawBody: {
				model: "openai/gpt-4o-mini",
				input: "hello",
				usage: { include: true },
				meta: true,
				debug: { enabled: true },
			},
			body: {
				model: "openai/gpt-4o-mini",
				input: "hello",
				meta: true,
				debug: { enabled: true },
			},
			requestId: "req_gateway_fields_passthrough",
			teamId: "team_test",
			providers: [
				provider("openai", { tools: {} }, 4096),
			],
			model: "openai/gpt-4o-mini",
		});

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.requestedParams).toEqual([]);
			expect(result.providers.map((p: any) => p.providerId)).toEqual(["openai"]);
		}
	});

	it("does not hard-reject modalities based on param capability metadata", () => {
		const result = validateCapabilities({
			endpoint: "responses",
			rawBody: {
				model: "google/gemini-2-5-flash-image",
				input: "draw a blue square",
				modalities: ["text", "image"],
			},
			body: {
				model: "google/gemini-2-5-flash-image",
				input: "draw a blue square",
				modalities: ["text", "image"],
			},
			requestId: "req_modalities_passthrough",
			teamId: "team_test",
			providers: [
				// Intentionally omit "modalities" in capability params.
				provider("google-ai-studio", { temperature: {} }, 4096),
			],
			model: "google/gemini-2-5-flash-image",
		});

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.requestedParams).toContain("modalities");
			expect(result.providers.map((p: any) => p.providerId)).toEqual(["google-ai-studio"]);
		}
	});

	it("accepts image_config without filtering providers by capability metadata", () => {
		const result = validateCapabilities({
			endpoint: "responses",
			rawBody: {
				model: "google/gemini-2-5-flash-image",
				input: "draw a blue square",
				modalities: ["text", "image"],
				image_config: {
					aspect_ratio: "16:9",
				},
			},
			body: {
				model: "google/gemini-2-5-flash-image",
				input: "draw a blue square",
				modalities: ["text", "image"],
				image_config: {
					aspect_ratio: "16:9",
				},
			},
			requestId: "req_image_config_supported",
			teamId: "team_test",
			providers: [
				provider("google-ai-studio", { image_config: {}, temperature: {} }, 4096),
				provider("openai", { temperature: {} }, 4096),
			],
			model: "google/gemini-2-5-flash-image",
		});

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.requestedParams).toContain("image_config");
			expect(result.providers.map((p: any) => p.providerId)).toEqual(["google-ai-studio", "openai"]);
		}
	});

	it("tracks reasoning object children and supports flattened provider keys", () => {
		const result = validateCapabilities({
			endpoint: "responses",
			rawBody: {
				model: "openai/gpt-5-nano",
				input: "hello",
				reasoning: { effort: "high", summary: "detailed" },
			},
			body: {
				model: "openai/gpt-5-nano",
				input: "hello",
				reasoning: { effort: "high", summary: "detailed" },
			},
			requestId: "req_reasoning_children",
			teamId: "team_test",
			providers: [
				provider("openai", { "reasoning.effort": {}, "reasoning.summary": {} }, 4096),
			],
			model: "openai/gpt-5-nano",
		});

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.requestedParams).toEqual(["reasoning.effort", "reasoning.summary"]);
			expect(result.providers.map((p: any) => p.providerId)).toEqual(["openai"]);
		}
	});

	it("keeps reasoning requests when provider metadata is partial", async () => {
		const pass = validateCapabilities({
			endpoint: "responses",
			rawBody: {
				model: "z-ai/glm-4-7-flash:free",
				input: "hello",
				reasoning: { effort: "medium" },
			},
			body: {
				model: "z-ai/glm-4-7-flash:free",
				input: "hello",
				reasoning: { effort: "medium" },
			},
			requestId: "req_reasoning_enabled_supported",
			teamId: "team_test",
			providers: [provider("z-ai", { "reasoning.enabled": {} }, 4096)],
			model: "z-ai/glm-4-7-flash:free",
		});

		expect(pass.ok).toBe(true);
		if (pass.ok) {
			expect(pass.requestedParams).toEqual(["reasoning.effort"]);
			expect(pass.providers.map((p: any) => p.providerId)).toEqual(["z-ai"]);
		}
	});

	it("treats max_completion_tokens alias as max_tokens capability", () => {
		const result = validateCapabilities({
			endpoint: "chat.completions",
			rawBody: {
				model: "openai/gpt-4.1-mini",
				messages: [{ role: "user", content: "hello" }],
				max_completion_tokens: 256,
			},
			body: {
				model: "openai/gpt-4.1-mini",
				messages: [{ role: "user", content: "hello" }],
				max_completion_tokens: 256,
			},
			requestId: "req_alias_max_completion_tokens",
			teamId: "team_test",
			providers: [
				provider("openai", { max_tokens: {} }, 4096),
			],
			model: "openai/gpt-4.1-mini",
		});

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.requestedParams).toEqual(["max_tokens"]);
			expect(result.providers.map((p: any) => p.providerId)).toEqual(["openai"]);
		}
	});

	it("accepts responses models/plugins routing hints as gateway fields", () => {
		const result = validateCapabilities({
			endpoint: "responses",
			rawBody: {
				model: "openai/gpt-4.1-mini",
				models: ["openai/gpt-4.1-mini", "openai/gpt-4o-mini"],
				plugins: [{ id: "web" }],
				input: "hello",
			},
			body: {
				model: "openai/gpt-4.1-mini",
				models: ["openai/gpt-4.1-mini", "openai/gpt-4o-mini"],
				plugins: [{ id: "web" }],
				input: "hello",
			},
			requestId: "req_models_plugins_passthrough",
			teamId: "team_test",
			providers: [
				provider("openai", { tools: {} }, 4096),
			],
			model: "openai/gpt-4.1-mini",
		});

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.providers.map((p: any) => p.providerId)).toEqual(["openai"]);
		}
	});

	it("accepts chat route/session_id/trace routing fields", () => {
		const result = validateCapabilities({
			endpoint: "chat.completions",
			rawBody: {
				model: "openai/gpt-4.1-mini",
				messages: [{ role: "user", content: "hello" }],
				route: "fallback",
				session_id: "session-123",
				trace: { id: "trace_1" },
			},
			body: {
				model: "openai/gpt-4.1-mini",
				messages: [{ role: "user", content: "hello" }],
				route: "fallback",
				session_id: "session-123",
				trace: { id: "trace_1" },
			},
			requestId: "req_chat_routing_fields",
			teamId: "team_test",
			providers: [
				provider("openai", { max_tokens: {} }, 4096),
			],
			model: "openai/gpt-4.1-mini",
		});

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.providers.map((p: any) => p.providerId)).toEqual(["openai"]);
		}
	});
});
