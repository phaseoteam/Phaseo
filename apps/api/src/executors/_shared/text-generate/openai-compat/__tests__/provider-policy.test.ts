import { describe, expect, it } from "vitest";
import { sanitizeOpenAICompatRequest } from "../provider-policy";

describe("sanitizeOpenAICompatRequest", () => {
	it("drops instructions for xai responses route", () => {
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

		expect(request.instructions).toBeUndefined();
		expect(dropped).toContain("instructions");
	});

	it("drops service_tier for x-ai", () => {
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

			expect(request.service_tier).toBeUndefined();
			expect(dropped).toContain("service_tier");
		}
	});

	it("maps legacy standard service_tier to default", () => {
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

		expect(request.service_tier).toBe("default");
	});

	it("maps qwen max_tokens to max_completion_tokens", () => {
		const { request } = sanitizeOpenAICompatRequest({
			providerId: "qwen",
			route: "chat",
			model: "qwen-max",
			request: {
				model: "qwen-max",
				max_tokens: 512,
			},
		});

		expect(request.max_tokens).toBeUndefined();
		expect(request.max_completion_tokens).toBe(512);
	});

	it("maps alibaba max_tokens to max_completion_tokens", () => {
		const { request } = sanitizeOpenAICompatRequest({
			providerId: "alibaba",
			route: "chat",
			model: "qwen-max",
			request: {
				model: "qwen-max",
				max_tokens: 256,
			},
		});

		expect(request.max_tokens).toBeUndefined();
		expect(request.max_completion_tokens).toBe(256);
	});

	it("drops unsupported Groq fields", () => {
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

		expect(request.logprobs).toBeUndefined();
		expect(request.top_logprobs).toBeUndefined();
		expect(request.logit_bias).toBeUndefined();
		expect(request.messages[0].name).toBeUndefined();
		expect(dropped).toEqual(expect.arrayContaining(["logprobs", "top_logprobs", "logit_bias"]));
	});

	it("drops unsupported Cerebras fields", () => {
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

		expect(request.frequency_penalty).toBeUndefined();
		expect(request.presence_penalty).toBeUndefined();
		expect(request.logit_bias).toBeUndefined();
		expect(dropped).toEqual(expect.arrayContaining(["frequency_penalty", "presence_penalty", "logit_bias"]));
	});

	it("normalizes Mistral chat payload fields", () => {
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

		expect(request.seed).toBeUndefined();
		expect(request.random_seed).toBe(7);
		expect(request.stream_options).toBeUndefined();
		expect(request.user).toBeUndefined();
		expect(request.temperature).toBe(1.3);
		expect(dropped).toEqual(expect.arrayContaining(["seed", "stream_options", "user"]));
	});

	it("drops out-of-range Mistral temperature", () => {
		const { request, dropped } = sanitizeOpenAICompatRequest({
			providerId: "mistral",
			route: "chat",
			model: "mistral-large-latest",
			request: {
				model: "mistral-large-latest",
				temperature: 1.7,
				messages: [{ role: "user", content: "hello" }],
			},
		});

		expect(request.temperature).toBeUndefined();
		expect(dropped).toContain("temperature");
	});

	it("drops Anthropic-incompatible controls for bedrock/vertex gateways", () => {
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

			expect(request.frequency_penalty).toBeUndefined();
			expect(request.presence_penalty).toBeUndefined();
			expect(request.logit_bias).toBeUndefined();
			expect(request.logprobs).toBeUndefined();
			expect(request.top_logprobs).toBeUndefined();
			expect(dropped).toEqual(
				expect.arrayContaining(["frequency_penalty", "presence_penalty", "logit_bias", "logprobs", "top_logprobs"]),
			);
		}
	});
});
