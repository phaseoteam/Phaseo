import { describe, expect, it } from "vitest";
import { validateProviderDocsCompliance } from "./providerDocsValidation";

function candidate(providerId: string): any {
	return { providerId };
}

describe("validateProviderDocsCompliance", () => {
	it("does not reject out-of-range numeric params at preflight (normalized later)", () => {
		const result = validateProviderDocsCompliance({
			endpoint: "responses",
			body: {
				model: "anthropic/claude-sonnet-4",
				temperature: 1.8,
				input: "hello",
			},
			requestId: "req_test",
			teamId: "team_test",
			model: "anthropic/claude-sonnet-4",
			providers: [candidate("anthropic")],
			requestedParams: ["temperature"],
		});

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.providers.map((p) => p.providerId)).toEqual(["anthropic"]);
		}
	});

	it("keeps anthropic provider when service_tier is requested", () => {
		const result = validateProviderDocsCompliance({
			endpoint: "responses",
			body: {
				model: "anthropic/claude-sonnet-4",
				service_tier: "priority",
				input: "hello",
			},
			requestId: "req_test",
			teamId: "team_test",
			model: "anthropic/claude-sonnet-4",
			providers: [candidate("anthropic")],
			requestedParams: ["service_tier"],
		});

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.providers.map((p) => p.providerId)).toEqual(["anthropic"]);
		}
	});

	it("keeps xai alias when /responses includes instructions (advisory only)", () => {
		const result = validateProviderDocsCompliance({
			endpoint: "responses",
			body: {
				model: "x-ai/grok-4",
				instructions: "be concise",
				input: "hello",
			},
			requestId: "req_test",
			teamId: "team_test",
			model: "x-ai/grok-4",
			providers: [candidate("xai"), candidate("openai")],
			requestedParams: ["instructions"],
		});

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.providers.map((p) => p.providerId)).toEqual(["xai", "openai"]);
		}
	});

	it("does not return validation_error when xai is the only provider and instructions are present", async () => {
		const result = validateProviderDocsCompliance({
			endpoint: "responses",
			body: {
				model: "x-ai/grok-4",
				instructions: "be concise",
				input: "hello",
			},
			requestId: "req_test",
			teamId: "team_test",
			model: "x-ai/grok-4",
			providers: [candidate("xai")],
			requestedParams: ["instructions"],
		});

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.providers.map((p) => p.providerId)).toEqual(["xai"]);
		}
	});
});
