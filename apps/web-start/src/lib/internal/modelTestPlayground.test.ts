import { buildPlaygroundRequest, buildPlaygroundRuns, isExpectedParameterRejection, summarizeErrorPayload } from "./modelTestPlayground";

describe("model test playground", () => {
	it("builds a baseline and independent parameter probes for every provider", () => {
		const runs = buildPlaygroundRuns(["openai", "anthropic"], [{ id: "seed", key: "seed", label: "Seed", value: 42, expect: "accept" }], true);
		expect(runs).toHaveLength(4);
		expect(runs.map((run) => run.id)).toEqual(["openai:baseline:1", "openai:seed:1", "anthropic:baseline:1", "anthropic:seed:1"]);
	});

	it("locks each request to one provider without fallback", () => {
		const body = buildPlaygroundRequest({ endpoint: "responses", model: "openai/gpt-test", prompt: "hi", providerId: "openai", probe: null, customParameters: { model: "wrong", provider: { only: ["wrong"] }, stream: true } });
		expect(body.model).toBe("openai/gpt-test");
		expect(body.provider).toEqual({ only: ["openai"], allow_fallbacks: false });
		expect(body.stream).toBe(false);
	});

	it("does not mistake auth, routing, or rate-limit failures for parameter validation", () => {
		expect(isExpectedParameterRejection(400)).toBe(true);
		expect(isExpectedParameterRejection(422)).toBe(true);
		for (const status of [401, 403, 404, 429]) expect(isExpectedParameterRejection(status)).toBe(false);
	});

	it("extracts nested gateway error messages", () => {
		expect(summarizeErrorPayload({ error: { message: "unsupported parameter" } }, "failed")).toBe("unsupported parameter");
	});
});
