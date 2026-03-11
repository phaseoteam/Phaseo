import { describe, expect, it } from "vitest";
import { resolveXAiModelForRequest } from "@/executors/x-ai/text-generate";

describe("resolveXAiModelForRequest", () => {
	it("routes grok-4-fast base model to non-reasoning by default", () => {
		const resolved = resolveXAiModelForRequest("grok-4-fast", undefined, "x-ai/grok-4-fast");
		expect(resolved).toBe("grok-4-fast-non-reasoning");
	});

	it("routes grok-4-fast base model to reasoning when reasoning.enabled=true", () => {
		const resolved = resolveXAiModelForRequest(
			"grok-4-fast",
			{ enabled: true },
			"x-ai/grok-4-fast",
		);
		expect(resolved).toBe("grok-4-fast-reasoning");
	});

	it("routes grok-4.20-beta-0309 base model to non-reasoning by default", () => {
		const resolved = resolveXAiModelForRequest(
			"grok-4.20-beta-0309",
			undefined,
			"x-ai/grok-4.20-beta-0309",
		);
		expect(resolved).toBe("grok-4.20-beta-0309-non-reasoning");
	});

	it("routes grok-4.20-beta-0309 base model to reasoning when reasoning.enabled=true", () => {
		const resolved = resolveXAiModelForRequest(
			"grok-4.20-beta-0309",
			{ enabled: true },
			"x-ai/grok-4.20-beta-0309",
		);
		expect(resolved).toBe("grok-4.20-beta-0309-reasoning");
	});

	it("keeps explicit reasoning variant when no reasoning override is provided", () => {
		const resolved = resolveXAiModelForRequest(
			"grok-4-fast-reasoning",
			undefined,
			"x-ai/grok-4-fast-reasoning",
		);
		expect(resolved).toBe("grok-4-fast-reasoning");
	});

	it("keeps explicit non-reasoning variant when no reasoning override is provided", () => {
		const resolved = resolveXAiModelForRequest(
			"grok-4-fast-non-reasoning",
			undefined,
			"x-ai/grok-4-fast-non-reasoning",
		);
		expect(resolved).toBe("grok-4-fast-non-reasoning");
	});

	it("allows explicit reasoning override to force reasoning variant", () => {
		const resolved = resolveXAiModelForRequest(
			"grok-4-fast-non-reasoning",
			{ enabled: true },
			"x-ai/grok-4-fast-non-reasoning",
		);
		expect(resolved).toBe("grok-4-fast-reasoning");
	});

	it("allows explicit non-reasoning override to force non-reasoning variant", () => {
		const resolved = resolveXAiModelForRequest(
			"grok-4-fast-reasoning",
			{ enabled: false },
			"x-ai/grok-4-fast-reasoning",
		);
		expect(resolved).toBe("grok-4-fast-non-reasoning");
	});

	it("returns unknown models unchanged", () => {
		const resolved = resolveXAiModelForRequest(
			"grok-3-mini",
			{ enabled: true },
			"x-ai/grok-3-mini",
		);
		expect(resolved).toBe("grok-3-mini");
	});
});
