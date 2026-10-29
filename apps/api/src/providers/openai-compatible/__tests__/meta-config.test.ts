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
	it("routes Muse Spark models through Responses", () => {
		expect(resolveOpenAICompatRoute("meta", "muse-spark-1.1")).toBe("responses");
		expect(resolveOpenAICompatRoute("meta", "muse-spark-1.2")).toBe("responses");
		expect(resolveOpenAICompatRoute("meta-contributor", "muse-spark-1.2-contributor")).toBe("responses");
	});

	it("builds the Meta Model API responses endpoint", () => {
		teardownTestRuntime();
		setupRuntimeFromEnv({
			META_MODEL_API_KEY: "test-meta-key",
		} as any);

		expect(openAICompatUrl("meta", "/responses")).toBe(
			"https://api.meta.ai/v1/responses",
		);
		expect(openAICompatUrl("meta-contributor", "/responses")).toBe(
			"https://api.meta.ai/v1/responses",
		);
		expect(openAICompatUrl("meta", "/images/generations")).toBe(
			"https://api.meta.ai/v1/images/generations",
		);
		expect(openAICompatUrl("meta", "/images/edits")).toBe(
			"https://api.meta.ai/v1/images/edits",
		);
	});

	it("supports the gateway and official Meta Model API key names", () => {
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
			MODEL_API_KEY: "test-official-meta-key",
		} as any);

		expect(resolveOpenAICompatKey({
			providerId: "meta",
			byokMeta: [],
		} as any).key).toBe("test-official-meta-key");
		expect(resolveOpenAICompatKey({
			providerId: "meta-contributor",
			byokMeta: [],
		} as any).key).toBe("test-official-meta-key");

		teardownTestRuntime();
		setupRuntimeFromEnv({
			MODEL_API_KEY: "test-official-meta-key",
			META_MODEL_API_KEY: "test-legacy-meta-key",
		} as any);

		expect(resolveOpenAICompatKey({
			providerId: "meta",
			byokMeta: [],
		} as any).key).toBe("test-official-meta-key");

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
