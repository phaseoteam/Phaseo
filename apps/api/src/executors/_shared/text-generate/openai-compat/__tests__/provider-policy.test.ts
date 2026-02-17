import { describe, expect, it } from "vitest";
import { sanitizeOpenAICompatRequest } from "../provider-policy";

describe("sanitizeOpenAICompatRequest", () => {
	it("preserves instructions for xai responses route", () => {
		const { request, dropped } = sanitizeOpenAICompatRequest({
			providerId: "xai",
			route: "responses",
			model: "grok-4",
			request: {
				model: "grok-4",
				instructions: "be concise",
				input: "hello",
			},
		});

		expect(request.instructions).toBe("be concise");
		expect(dropped).toEqual([]);
	});

	it("preserves service_tier for x-ai", () => {
		for (const providerId of ["x-ai", "xai"]) {
			const { request, dropped } = sanitizeOpenAICompatRequest({
				providerId,
				route: "chat",
				model: "grok-4",
				request: {
					model: "grok-4",
					service_tier: "standard",
					messages: [{ role: "user", content: "hi" }],
				},
			});

			expect(request.service_tier).toBe("standard");
			expect(dropped).toEqual([]);
		}
	});

	it("does not rewrite service_tier values", () => {
		const { request } = sanitizeOpenAICompatRequest({
			providerId: "openai",
			route: "chat",
			model: "gpt-5.2-codex",
			request: {
				model: "gpt-5.2-codex",
				service_tier: "standard",
				messages: [{ role: "user", content: "hi" }],
			},
		});

		expect(request.service_tier).toBe("standard");
	});

	it("preserves qwen max_tokens as provided", () => {
		const { request } = sanitizeOpenAICompatRequest({
			providerId: "qwen",
			route: "chat",
			model: "qwen-max",
			request: {
				model: "qwen-max",
				max_tokens: 512,
			},
		});

		expect(request.max_tokens).toBe(512);
		expect(request.max_completion_tokens).toBeUndefined();
	});

	it("preserves alibaba max_tokens as provided", () => {
		const { request } = sanitizeOpenAICompatRequest({
			providerId: "alibaba",
			route: "chat",
			model: "qwen-max",
			request: {
				model: "qwen-max",
				max_tokens: 256,
			},
		});

		expect(request.max_tokens).toBe(256);
		expect(request.max_completion_tokens).toBeUndefined();
	});

	it("preserves Groq fields and message name", () => {
		const { request, dropped } = sanitizeOpenAICompatRequest({
			providerId: "groq",
			route: "chat",
			model: "llama-3.3-70b-versatile",
			request: {
				model: "llama-3.3-70b-versatile",
				logprobs: true,
				top_logprobs: 5,
				logit_bias: { "42": 1 },
				messages: [
					{ role: "user", name: "alice", content: "hello" },
				],
			},
		});

		expect(request.logprobs).toBe(true);
		expect(request.top_logprobs).toBe(5);
		expect(request.logit_bias).toEqual({ "42": 1 });
		expect(request.messages[0].name).toBe("alice");
		expect(dropped).toEqual([]);
	});

	it("preserves Cerebras fields", () => {
		const { request, dropped } = sanitizeOpenAICompatRequest({
			providerId: "cerebras",
			route: "chat",
			model: "llama3.1-70b",
			request: {
				model: "llama3.1-70b",
				frequency_penalty: 0.5,
				presence_penalty: 0.5,
				logit_bias: { "42": 1 },
			},
		});

		expect(request.frequency_penalty).toBe(0.5);
		expect(request.presence_penalty).toBe(0.5);
		expect(request.logit_bias).toEqual({ "42": 1 });
		expect(dropped).toEqual([]);
	});

	it("preserves Mistral payload fields", () => {
		const { request, dropped } = sanitizeOpenAICompatRequest({
			providerId: "mistral",
			route: "chat",
			model: "mistral-large-latest",
			request: {
				model: "mistral-large-latest",
				seed: 7,
				stream_options: { include_usage: true },
				user: "user_123",
				temperature: 1.3,
				messages: [{ role: "user", content: "hello" }],
			},
		});

		expect(request.seed).toBe(7);
		expect(request.random_seed).toBeUndefined();
		expect(request.stream_options).toEqual({ include_usage: true });
		expect(request.user).toBe("user_123");
		expect(request.temperature).toBe(1.3);
		expect(dropped).toEqual([]);
	});

	it("preserves Anthropic-style controls for bedrock/vertex gateways", () => {
		for (const providerId of ["amazon-bedrock", "google-vertex"]) {
			const { request, dropped } = sanitizeOpenAICompatRequest({
				providerId,
				route: "chat",
				model: "claude-sonnet-4",
				request: {
					model: "claude-sonnet-4",
					frequency_penalty: 0.2,
					presence_penalty: 0.2,
					logit_bias: { "42": 1 },
					logprobs: true,
					top_logprobs: 5,
				},
			});

			expect(request.frequency_penalty).toBe(0.2);
			expect(request.presence_penalty).toBe(0.2);
			expect(request.logit_bias).toEqual({ "42": 1 });
			expect(request.logprobs).toBe(true);
			expect(request.top_logprobs).toBe(5);
			expect(dropped).toEqual([]);
		}
	});
});
