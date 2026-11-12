import { afterEach, describe, expect, it } from "vitest";
import { openAICompatHeaders, openAICompatUrl, resolveOpenAICompatKey, resolveOpenAICompatRoute } from "../openai-compatible/config";
import { setupRuntimeFromEnv, teardownTestRuntime } from "../../../tests/helpers/runtime";
import { supportsAdapterBackedCapability } from "../capabilities";
import { buildProviderCandidatesWithDiagnostics } from "@pipeline/before/utils";

afterEach(teardownTestRuntime);

describe("Reflection configuration", () => {
	it("admits Reflection to text generation preflight", () => {
		const result = buildProviderCandidatesWithDiagnostics({
			endpoint: "text.generate",
			pricing: {},
			providers: [{ providerId: "reflection", supportsEndpoint: true }],
		} as any);
		expect(result.diagnostics.droppedMissingAdapter).toEqual([]);
		expect(result.candidates.map(candidate => candidate.providerId)).toEqual(["reflection"]);
	});
	it("uses the documented endpoint and a snapshotted bearer key", () => {
		setupRuntimeFromEnv({ REFLECTION_API_KEY: "reflection-test-key" });
		expect(openAICompatUrl("reflection", "/chat/completions")).toBe("https://api.reflection.ai/openai/v1/chat/completions");
		expect(resolveOpenAICompatKey({ providerId: "reflection", byokMeta: [] } as any)).toMatchObject({ key: "reflection-test-key", source: "gateway" });
		expect(openAICompatHeaders("reflection", "reflection-test-key").Authorization).toBe("Bearer reflection-test-key");
		expect(resolveOpenAICompatRoute("reflection", "Beam-501B-A23B")).toBe("chat");
		expect(supportsAdapterBackedCapability("reflection", "image.generate")).toBe(false);
	});
	it("does not duplicate the prefix in a configured base URL", () => {
		setupRuntimeFromEnv({ REFLECTION_BASE_URL: "https://api.reflection.ai/openai/v1" });
		expect(openAICompatUrl("reflection", "/models")).toBe("https://api.reflection.ai/openai/v1/models");
	});
});
