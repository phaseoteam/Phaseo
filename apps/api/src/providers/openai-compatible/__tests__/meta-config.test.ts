// Purpose: Meta Model API OpenAI-compatible routing coverage.
// Why: Muse Spark uses the Responses API and the Meta Model API key only.
// How: Tests route, URL, and gateway key resolution in isolation from provider-wide fixtures.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupRuntimeFromEnv, setupTestRuntime, teardownTestRuntime } from "../../../../tests/helpers/runtime";
import { openAICompatUrl, resolveOpenAICompatKey, resolveOpenAICompatRoute } from "../config";

beforeAll(() => {
	setupTestRuntime();
});

afterAll(() => {
	teardownTestRuntime();
});

describe("Meta OpenAI-compatible config", () => {
	it("routes Muse Spark 1.1 through Responses", () => {
		expect(resolveOpenAICompatRoute("meta", "muse-spark-1.1")).toBe("responses");
	});

	it("builds the Meta Model API responses endpoint", () => {
		teardownTestRuntime();
		setupRuntimeFromEnv({
			META_MODEL_API_KEY: "test-meta-key",
		} as any);

		expect(openAICompatUrl("meta", "/responses")).toBe(
			"https://api.llama.com/compat/v1/responses",
		);
	});

	it("uses META_MODEL_API_KEY without LLAMA_API_KEY fallback", () => {
		teardownTestRuntime();
		setupRuntimeFromEnv({
			META_MODEL_API_KEY: "test-meta-key",
		} as any);

		const resolved = resolveOpenAICompatKey({
			providerId: "meta",
			byokMeta: [],
		} as any);

		expect(resolved.key).toBe("test-meta-key");

		teardownTestRuntime();
		setupRuntimeFromEnv({
			LLAMA_API_KEY: "test-llama-key",
		} as any);

		expect(() => resolveOpenAICompatKey({
			providerId: "meta",
			byokMeta: [],
		} as any)).toThrowError("meta_key_missing");
	});
});
