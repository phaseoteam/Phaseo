import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveOpenAICompatConfig } from "../config";
import {
	setupRuntimeFromEnv,
	setupTestRuntime,
	teardownTestRuntime,
} from "../../../../tests/helpers/runtime";

beforeAll(() => {
	setupTestRuntime();
});

afterAll(() => {
	teardownTestRuntime();
});

describe("resolveOpenAICompatConfig errors", () => {
	it("throws a coded error when provider base URL configuration is missing", () => {
		teardownTestRuntime();
		setupRuntimeFromEnv({
			AMAZON_BEDROCK_API_KEY: "test-bedrock-key",
			AMAZON_BEDROCK_BASE_URL: "",
		} as any);

		expect(() => resolveOpenAICompatConfig("amazon-bedrock")).toThrowError(
			"amazon-bedrock_base_url_missing",
		);
		try {
			resolveOpenAICompatConfig("amazon-bedrock");
		} catch (error) {
			expect((error as any)?.code).toBe("amazon-bedrock_base_url_missing");
		}
	});
});
