import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	openAICompatHeaders,
	openAICompatUrl,
	resolveOpenAICompatRoute,
} from "../openai-compatible/config";
import { OPENAI_COMPAT_CONFIG } from "../openai-compatible/registry";
import { setupTestRuntime, teardownTestRuntime } from "../../../tests/helpers/runtime";

beforeAll(() => {
	setupTestRuntime();
});

afterAll(() => {
	teardownTestRuntime();
});

describe("Particle AI OpenAI-compatible configuration", () => {
	it("uses Particle's Chat Completions endpoint", () => {
		expect(OPENAI_COMPAT_CONFIG["particle-ai"]).toMatchObject({
			baseUrl: "https://api.particle.ai",
			pathPrefix: "/v1",
			apiKeyEnv: "PARTICLE_AI_API_KEY",
			supportsResponses: false,
		});
		expect(openAICompatUrl("particle-ai", "/chat/completions")).toBe(
			"https://api.particle.ai/v1/chat/completions",
		);
		expect(openAICompatHeaders("particle-ai", "test-particle-key")).toEqual(
			expect.objectContaining({
				Authorization: "Bearer test-particle-key",
			}),
		);
		expect(resolveOpenAICompatRoute("particle-ai", "particle-1")).toBe("chat");
	});
});
