import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	openAICompatHeaders,
	openAICompatUrl,
	resolveOpenAICompatKey,
	resolveOpenAICompatRoute,
} from "../openai-compatible/config";
import {
	setupRuntimeFromEnv,
	setupTestRuntime,
	teardownTestRuntime,
} from "../../../tests/helpers/runtime";

beforeAll(() => setupTestRuntime());
afterAll(() => teardownTestRuntime());

describe("OpenRouter provider configuration", () => {
	it("uses the direct OpenAI-compatible Chat Completions endpoint", () => {
		teardownTestRuntime();
		setupRuntimeFromEnv({ OPENROUTER_API_KEY: "test-openrouter-key" } as any);

		expect(resolveOpenAICompatRoute("openrouter", "stealth/union-alpha")).toBe("chat");
		expect(openAICompatUrl("openrouter", "/chat/completions", "stealth/union-alpha")).toBe(
			"https://openrouter.ai/api/v1/chat/completions",
		);
		expect(openAICompatHeaders("openrouter", "test-openrouter-key")).toMatchObject({
			Authorization: "Bearer test-openrouter-key",
			"Content-Type": "application/json",
		});
		expect(resolveOpenAICompatKey({ providerId: "openrouter", byokMeta: [] } as any)).toMatchObject({
			key: "test-openrouter-key",
			source: "gateway",
		});
	});
});
