import { describe, expect, it } from "vitest";
import { isProviderCapabilityEnabled, resolveProviderExecutor } from "../index";

const KEY_EMBEDDINGS_PROVIDERS = [
	"openai",
	"google-ai-studio",
	"google-vertex",
	"alibaba-cloud",
	"alibaba",
	"qwen",
	"novita",
	"novitaai",
	"perplexity",
	"cohere",
	"voyage",
	"voyageai",
	"mistral",
	"deepinfra",
] as const;

const TEXT_ONLY_PROVIDERS = [
	"ai21",
	"arcee",
	"arcee-ai",
	"friendli",
] as const;

describe("embeddings provider executor coverage", () => {
	it("resolves embeddings executors for key providers", () => {
		for (const provider of KEY_EMBEDDINGS_PROVIDERS) {
			expect(
				resolveProviderExecutor(provider, "embeddings"),
				`${provider} should resolve embeddings executor`,
			).toBeTruthy();
			expect(
				isProviderCapabilityEnabled(provider, "embeddings"),
				`${provider} should enable embeddings`,
			).toBe(true);
		}
	});

	it("keeps known text-only providers disabled for embeddings", () => {
		for (const provider of TEXT_ONLY_PROVIDERS) {
			expect(resolveProviderExecutor(provider, "embeddings")).toBeNull();
			expect(isProviderCapabilityEnabled(provider, "embeddings")).toBe(false);
		}
	});
});
