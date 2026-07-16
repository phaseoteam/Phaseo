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
	it("allows stream+tools and prefers providers that support both params", () => {
		const result = validateCapabilities({
			endpoint: "chat.completions",
			rawBody: {
				model: "openai/gpt-5-nano",
				messages: [{ role: "user", content: "Call the lookup tool." }],
				stream: true,
				tools: [{
					type: "function",
					function: {
						name: "lookup",
						parameters: { type: "object", properties: {}, additionalProperties: false },
					},
				}],
			},
			body: {
				model: "openai/gpt-5-nano",
				messages: [{ role: "user", content: "Call the lookup tool." }],
				stream: true,
				tools: [{
					type: "function",
					function: {
						name: "lookup",
						parameters: { type: "object", properties: {}, additionalProperties: false },
					},
				}],
			},
			requestId: "req_stream_tools_provider_specific",
			workspaceId: "team_test",
			providers: [
				provider("openai", { stream: {}, tools: {}, max_tokens: {} }, 4096),
				provider("provider-without-tools-stream-combo", { stream: {}, max_tokens: {} }, 4096),
			],
			model: "openai/gpt-5-nano",
		});

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.requestedParams).toContain("tools");
			expect(result.providers.map((p: any) => p.providerId)).toEqual(["openai"]);
		}
	});

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
			workspaceId: "team_test",
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
			workspaceId: "team_test",
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

	it("prefers providers that support more requested params", () => {
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
			workspaceId: "team_test",
			providers: [
				provider("openai", { temperature: {}, max_tokens: {} }, 4096),
				provider("anthropic", { top_p: {}, max_tokens: {} }, 4096),
			],
			model: "openai/gpt-4o-mini",
		});

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.providers.map((p: any) => p.providerId)).toEqual(["openai"]);
			expect(result.requestedParams).toEqual(["temperature", "max_tokens"]);
			expect(result.paramRoutingDiagnostics.providerCountBefore).toBe(2);
			expect(result.paramRoutingDiagnostics.providerCountAfter).toBe(1);
			expect(result.paramRoutingDiagnostics.droppedProviders).toEqual([
				{
					providerId: "anthropic",
					unsupportedParams: ["temperature"],
				},
			]);
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
			workspaceId: "team_test",
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

	it("accepts top-level reasoning_effort when the provider exposes reasoning effort", () => {
		const result = validateCapabilities({
			endpoint: "chat.completions",
			rawBody: {
				model: "moonshotai/kimi-k3",
				messages: [{ role: "user", content: "hello" }],
				reasoning_effort: "max",
			},
			body: {
				model: "moonshotai/kimi-k3",
				messages: [{ role: "user", content: "hello" }],
				reasoning: { effort: "max" },
			},
			requestId: "req_kimi_k3_reasoning_effort",
			workspaceId: "team_test",
			providers: [provider("moonshotai", { "reasoning.effort": {} }, 1_048_576)],
			model: "moonshotai/kimi-k3",
		});

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.requestedParams).toEqual(["reasoning.effort"]);
			expect(result.providers.map((entry: any) => entry.providerId)).toEqual(["moonshotai"]);
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
			workspaceId: "team_test",
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
			workspaceId: "team_test",
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

	it("treats provider_options.openai.context_management as a routable OpenAI param", () => {
		const result = validateCapabilities({
			endpoint: "responses",
			rawBody: {
				model: "openai/gpt-5-nano",
				input: "hello",
				provider_options: {
					openai: {
						context_management: {
							type: "compaction",
							compact_threshold: 0.8,
						},
					},
				},
			},
			body: {
				model: "openai/gpt-5-nano",
				input: "hello",
				provider_options: {
					openai: {
						context_management: {
							type: "compaction",
							compact_threshold: 0.8,
						},
					},
				},
			},
			requestId: "req_provider_options_context_management",
			workspaceId: "team_test",
			providers: [
				provider("openai", {}, 4096),
				provider("anthropic", {}, 4096),
			],
			model: "openai/gpt-5-nano",
		});

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.requestedParams).toContain("provider_options.openai.context_management");
			expect(result.providers.map((p: any) => p.providerId)).toEqual(["openai"]);
		}
	});

	it("ignores empty provider_options for requested param extraction", () => {
		const result = validateCapabilities({
			endpoint: "responses",
			rawBody: {
				model: "openai/gpt-5-nano",
				input: "hello",
				provider_options: {},
			},
			body: {
				model: "openai/gpt-5-nano",
				input: "hello",
				provider_options: {},
			},
			requestId: "req_provider_options_empty",
			workspaceId: "team_test",
			providers: [
				provider("openai", {}, 4096),
			],
			model: "openai/gpt-5-nano",
		});

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.requestedParams).toEqual([]);
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
			workspaceId: "team_test",
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

	it("prefers providers that explicitly support image_config", () => {
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
			workspaceId: "team_test",
			providers: [
				provider("google-ai-studio", { image_config: {}, temperature: {} }, 4096),
				provider("openai", { temperature: {} }, 4096),
			],
			model: "google/gemini-2-5-flash-image",
		});

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.requestedParams).toContain("image_config");
			expect(result.providers.map((p: any) => p.providerId)).toEqual(["google-ai-studio"]);
		}
	});

	it("treats native web search tools as a web_search_options capability request", () => {
		const result = validateCapabilities({
			endpoint: "responses",
			rawBody: {
				model: "openai/gpt-4.1",
				input: "Find the latest news.",
				tools: [{ type: "web_search_preview" }],
				tool_choice: "web_search_preview",
			},
			body: {
				model: "openai/gpt-4.1",
				input: "Find the latest news.",
				tools: [{ type: "web_search_preview" }],
				tool_choice: "web_search_preview",
			},
			requestId: "req_native_web_search",
			workspaceId: "team_test",
			providers: [
				provider("openai", { web_search_options: {}, tools: {} }, 4096),
				provider("provider-without-web-search", { tools: {} }, 4096),
			],
			model: "openai/gpt-4.1",
		});

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.requestedParams).toContain("web_search_options");
			expect(result.providers.map((p: any) => p.providerId)).toEqual(["openai"]);
		}
	});

	it("accepts explicit web_search_options and routes by that capability", () => {
		const result = validateCapabilities({
			endpoint: "responses",
			rawBody: {
				model: "openai/gpt-4.1",
				input: "Find the latest news.",
				web_search_options: {
					search_context_size: "high",
				},
			},
			body: {
				model: "openai/gpt-4.1",
				input: "Find the latest news.",
				web_search_options: {
					search_context_size: "high",
				},
			},
			requestId: "req_explicit_web_search_options",
			workspaceId: "team_test",
			providers: [
				provider("openai", { web_search_options: {} }, 4096),
				provider("provider-without-web-search", { tools: {} }, 4096),
			],
			model: "openai/gpt-4.1",
		});

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.requestedParams).toContain("web_search_options");
			expect(result.providers.map((p: any) => p.providerId)).toEqual(["openai"]);
		}
	});

	it("accepts explicit web_search_options on the messages surface", () => {
		const result = validateCapabilities({
			endpoint: "messages",
			rawBody: {
				model: "anthropic/claude-3-5-sonnet",
				messages: [{ role: "user", content: "Find the latest news." }],
				max_tokens: 1024,
				web_search_options: {
					search_context_size: "high",
				},
			},
			body: {
				model: "anthropic/claude-3-5-sonnet",
				messages: [{ role: "user", content: "Find the latest news." }],
				max_tokens: 1024,
				web_search_options: {
					search_context_size: "high",
				},
			},
			requestId: "req_messages_web_search_options",
			workspaceId: "team_test",
			providers: [
				provider("anthropic", { web_search_options: {} }, 4096),
				provider("provider-without-web-search", { tools: {} }, 4096),
			],
			model: "anthropic/claude-3-5-sonnet",
		});

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.requestedParams).toContain("web_search_options");
			expect(result.providers.map((p: any) => p.providerId)).toEqual(["anthropic"]);
		}
	});

	it("treats native anthropic web search tools as a web_search_options capability request", () => {
		const result = validateCapabilities({
			endpoint: "messages",
			rawBody: {
				model: "anthropic/claude-3-5-sonnet",
				messages: [{ role: "user", content: "Find the latest news." }],
				max_tokens: 1024,
				tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }],
				tool_choice: { type: "tool", name: "web_search" },
			},
			body: {
				model: "anthropic/claude-3-5-sonnet",
				messages: [{ role: "user", content: "Find the latest news." }],
				max_tokens: 1024,
				tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }],
				tool_choice: { type: "tool", name: "web_search" },
			},
			requestId: "req_messages_native_web_search",
			workspaceId: "team_test",
			providers: [
				provider("anthropic", { web_search_options: {}, tools: {} }, 4096),
				provider("provider-without-web-search", { tools: {} }, 4096),
			],
			model: "anthropic/claude-3-5-sonnet",
		});

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.requestedParams).toContain("web_search_options");
			expect(result.providers.map((p: any) => p.providerId)).toEqual(["anthropic"]);
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
			workspaceId: "team_test",
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

	it("tracks responses reasoning.effort for Meta reasoning support", () => {
		const result = validateCapabilities({
			endpoint: "responses",
			rawBody: {
				model: "meta/muse-spark-1.1",
				input: "hello",
				reasoning: { effort: "xhigh" },
			},
			body: {
				model: "meta/muse-spark-1.1",
				input: "hello",
				reasoning: { effort: "xhigh" },
			},
			requestId: "req_meta_reasoning_effort",
			workspaceId: "team_test",
			providers: [
				provider("meta", { "reasoning.effort": {} }, 1_000_000),
			],
			model: "meta/muse-spark-1.1",
		});

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.requestedParams).toEqual(["reasoning.effort"]);
			expect(result.providers.map((p: any) => p.providerId)).toEqual(["meta"]);
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
			workspaceId: "team_test",
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
			workspaceId: "team_test",
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
			workspaceId: "team_test",
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

	it("accepts messages plugins as a gateway field", () => {
		const result = validateCapabilities({
			endpoint: "messages",
			rawBody: {
				model: "anthropic/claude-sonnet-4.5",
				max_tokens: 512,
				messages: [{ role: "user", content: "hello" }],
				plugins: [{ id: "response-healing" }],
			},
			body: {
				model: "anthropic/claude-sonnet-4.5",
				max_tokens: 512,
				messages: [{ role: "user", content: "hello" }],
				plugins: [{ id: "response-healing" }],
			},
			requestId: "req_messages_plugins_passthrough",
			workspaceId: "team_test",
			providers: [provider("anthropic", { max_tokens: {} }, 4096)],
			model: "anthropic/claude-sonnet-4.5",
		});

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.providers.map((p: any) => p.providerId)).toEqual(["anthropic"]);
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
			workspaceId: "team_test",
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

	it("hard-filters providers when routing.require_parameters is enabled", () => {
		const result = validateCapabilities({
			endpoint: "chat.completions",
			rawBody: {
				model: "openai/gpt-4o-mini",
				messages: [{ role: "user", content: "hello" }],
				temperature: 0.2,
				max_tokens: 32,
				routing: {
					require_parameters: true,
				},
			},
			body: {
				model: "openai/gpt-4o-mini",
				messages: [{ role: "user", content: "hello" }],
				temperature: 0.2,
				max_tokens: 32,
				routing: {
					require_parameters: true,
				},
			},
			requestId: "req_require_params",
			workspaceId: "team_test",
			providers: [
				provider("openai", { temperature: {}, max_tokens: {} }, 4096),
				provider("anthropic", { max_tokens: {} }, 4096),
			],
			model: "openai/gpt-4o-mini",
		});

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.providers.map((p: any) => p.providerId)).toEqual(["openai"]);
		}
	});

	it("accepts the first-class routing object as a gateway field", () => {
		const result = validateCapabilities({
			endpoint: "responses",
			rawBody: {
				model: "openai/gpt-4o-mini",
				input: "hello",
				routing: {
					mode: "latency",
				},
			},
			body: {
				model: "openai/gpt-4o-mini",
				input: "hello",
				routing: {
					mode: "latency",
				},
			},
			requestId: "req_gateway_routing_field",
			workspaceId: "team_test",
			providers: [provider("openai", { tools: {} }, 4096)],
			model: "openai/gpt-4o-mini",
		});

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.requestedParams).toEqual([]);
		}
	});

	it("filters providers that do not support response_format", () => {
		const result = validateCapabilities({
			endpoint: "chat.completions",
			rawBody: {
				model: "openai/gpt-4o-mini",
				messages: [{ role: "user", content: "hello" }],
				response_format: { type: "json_object" },
			},
			body: {
				model: "openai/gpt-4o-mini",
				messages: [{ role: "user", content: "hello" }],
				response_format: { type: "json_object" },
			},
			requestId: "req_response_format_filter",
			workspaceId: "team_test",
			providers: [
				provider("openai", { response_format: {} }, 4096),
				provider("anthropic", { tools: {} }, 4096),
			],
			model: "openai/gpt-4o-mini",
		});

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.providers.map((p: any) => p.providerId)).toEqual(["openai"]);
		}
	});

	it("filters providers that do not support structured outputs", () => {
		const result = validateCapabilities({
			endpoint: "responses",
			rawBody: {
				model: "openai/gpt-4o-mini",
				input: "hello",
				response_format: {
					type: "json_schema",
					json_schema: {
						name: "payload",
						schema: {
							type: "object",
							properties: {
								ok: { type: "boolean" },
							},
						},
					},
				},
			},
			body: {
				model: "openai/gpt-4o-mini",
				input: "hello",
				response_format: {
					type: "json_schema",
					json_schema: {
						name: "payload",
						schema: {
							type: "object",
							properties: {
								ok: { type: "boolean" },
							},
						},
					},
				},
			},
			requestId: "req_structured_outputs_filter",
			workspaceId: "team_test",
			providers: [
				provider("openai", { structured_outputs: {} }, 4096),
				provider("anthropic", { response_format: {} }, 4096),
			],
			model: "openai/gpt-4o-mini",
		});

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.providers.map((p: any) => p.providerId)).toEqual(["openai"]);
		}
	});
});
