import { afterEach, describe, expect, it } from "vitest";
import { openAICompatUrl } from "../openai-compatible/config";
import { setupRuntimeFromEnv, teardownTestRuntime } from "../../../tests/helpers/runtime";

describe("Relace OpenAI-compatible configuration", () => {
	afterEach(() => teardownTestRuntime());

	it("routes chat completions to the documented search model endpoint", () => {
		setupRuntimeFromEnv({} as any);

		expect(openAICompatUrl("relace", "/chat/completions")).toBe(
			"https://models.relace.ai/v1/search/chat/completions",
		);
	});

	it("honors the Relace base URL override without losing the search prefix", () => {
		setupRuntimeFromEnv({ RELACE_BASE_URL: "https://relace.example/" } as any);

		expect(openAICompatUrl("relace", "/chat/completions")).toBe(
			"https://relace.example/v1/search/chat/completions",
		);
	});

	it("uses Relace's direct model endpoint for hosted open models", () => {
		setupRuntimeFromEnv({} as any);

		expect(openAICompatUrl("relace", "/chat/completions", "deepseek/deepseek-v4.1-flash-20260910")).toBe(
			"https://models.relace.ai/v1/chat/completions",
		);
	});
});
