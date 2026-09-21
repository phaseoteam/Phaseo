import { describe, expect, it } from "vitest";
import { XIAOMI_OPENAI_COMPAT_CONFIGS } from "./config";

describe("Xiaomi OpenAI-compatible routing", () => {
	it("uses Chat Completions for MiMo models", () => {
		expect(XIAOMI_OPENAI_COMPAT_CONFIGS.xiaomi.supportsResponses).toBe(false);
	});
});
