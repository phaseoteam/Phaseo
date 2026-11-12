import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { IRChatRequest } from "@core/ir";
import type { ExecutorExecuteArgs } from "@executors/types";
import { executor } from "../index";
import { installFetchMock } from "../../../../../tests/helpers/mock-fetch";
import { setupTestRuntime, teardownTestRuntime } from "../../../../../tests/helpers/runtime";

vi.mock("@supabase/supabase-js", () => ({
	createClient: () => ({}),
}));

beforeAll(() => setupTestRuntime());
afterAll(() => teardownTestRuntime());

function buildArgs(model: string, overrides: Partial<IRChatRequest>): ExecutorExecuteArgs {
	return {
		ir: {
			model: `google/${model}`,
			stream: false,
			messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
			...overrides,
		},
		requestId: "req_google_legacy_thinking",
		workspaceId: "team_test",
		providerId: "google-ai-studio",
		endpoint: "chat.completions",
		protocol: "openai.chat.completions",
		capability: "text.generate",
		providerModelSlug: model,
		capabilityParams: null,
		byokMeta: [],
		pricingCard: null as any,
		meta: {},
	} as ExecutorExecuteArgs;
}

async function generationConfigFor(model: string, overrides: Partial<IRChatRequest>): Promise<any> {
	const mock = installFetchMock([{
		match: (url) => url.includes(`/models/${model}:`),
		response: Response.json({
			candidates: [{ index: 0, content: { role: "model", parts: [{ text: "OK" }] }, finishReason: "STOP" }],
			usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 },
		}),
	}]);
	try {
		await executor(buildArgs(model, overrides));
		expect(mock.calls).toHaveLength(1);
		return mock.calls[0].bodyJson.generationConfig;
	} finally {
		mock.restore();
	}
}

// https://ai.google.dev/gemini-api/docs/generate-content/latest-model: Argon takes low, medium
// and high; minimal is an error and thinking_budget is deprecated.
describe("google-ai-studio Gemini 4 Argon thinking", () => {
	it.each([
		["minimal", "LOW"],
		["low", "LOW"],
		["medium", "MEDIUM"],
		["high", "HIGH"],
		["xhigh", "HIGH"],
	])("maps effort %s to thinkingLevel %s", async (effort, level) => {
		const config = await generationConfigFor("gemini-4-argon", { reasoning: { effort: effort as any } });
		expect(config.thinkingConfig.thinkingLevel).toBe(level);
		expect(config.thinkingConfig).not.toHaveProperty("thinkingBudget");
	});

	it("never sends thinkingBudget for a budget or a bare enable", async () => {
		for (const reasoning of [{ maxTokens: 2048 }, { enabled: true }]) {
			const config = await generationConfigFor("gemini-4-argon", { reasoning });
			expect(config.thinkingConfig.thinkingLevel).toBe("HIGH");
			expect(config.thinkingConfig).not.toHaveProperty("thinkingBudget");
		}
	});

	it("sends LOW, not MINIMAL, when thinking is disabled", async () => {
		const config = await generationConfigFor("gemini-4-argon", { reasoning: { enabled: false } });
		expect(config.thinkingConfig).toEqual({ includeThoughts: false, thinkingLevel: "LOW" });
	});
});

describe("google-ai-studio generateContent seed", () => {
	it("sends seed as generationConfig.seed", async () => {
		const config = await generationConfigFor("gemini-3.1-flash-lite-image", { seed: 42 });
		expect(config.seed).toBe(42);
	});
});
