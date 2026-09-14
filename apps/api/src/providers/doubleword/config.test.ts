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
afterAll(teardownTestRuntime);

describe("Doubleword OpenAI-compatible configuration", () => {
	it("uses the documented Responses endpoint and API key", () => {
		teardownTestRuntime();
		setupRuntimeFromEnv({ DOUBLEWORD_API_KEY: "doubleword-test-key" } as any);

		setupRuntimeFromEnv({ DOUBLEWORD_API_KEY: "doubleword-test-key" } as any);

		expect(resolveOpenAICompatRoute("doubleword", "deepseek-ai/DeepSeek-V4.1-Flash")).toBe("responses");
		expect(openAICompatUrl("doubleword", "/responses")).toBe(
			"https://api.doubleword.ai/v1/responses",
		);
		expect(resolveOpenAICompatKey({ providerId: "doubleword", byokMeta: [] } as any))
			.toMatchObject({ key: "doubleword-test-key", source: "gateway" });
		expect(openAICompatHeaders("doubleword", "doubleword-test-key")).toMatchObject({
			Authorization: "Bearer doubleword-test-key",
			"Content-Type": "application/json",
		});
	});
});
