import { describe, expect, it } from "vitest";
import { validateProviderDocsCompliance } from "./providerDocsValidation";

function run(body: Record<string, unknown>, providers: string[], endpoint: "chat.completions" | "responses" | "messages" = "chat.completions") {
	return validateProviderDocsCompliance({
		endpoint,
		body: { model: "lg/k-exaone-2.5", ...body },
		requestId: "req_test",
		workspaceId: "team_test",
		model: "lg/k-exaone-2.5",
		providers: providers.map((providerId) => ({ providerId }) as any),
		requestedParams: Object.keys(body),
	});
}

const messages = [{ role: "user", content: "hi" }];

describe("always-reasoning providers (LG K-EXAONE)", () => {
	it.each([
		["reasoning_effort none", { messages, reasoning_effort: "none" }],
		["reasoning.enabled false", { messages, reasoning: { enabled: false } }],
	])("rejects %s when only LG can serve the model", async (_label, body) => {
		const result = run(body, ["lg"]);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.response.status).toBe(400);
		const json = await result.response.json() as any;
		expect(JSON.stringify(json)).toContain("cannot turn reasoning off");
	});

	it("skips LG but keeps other providers when reasoning is disabled", () => {
		const result = run({ messages, reasoning_effort: "none" }, ["lg", "friendli"]);
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.providers.map((p) => p.providerId)).toEqual(["friendli"]);
	});

	it.each(["low", "medium", "high", "max"])("keeps LG for reasoning_effort %s", (effort) => {
		const result = run({ messages, reasoning_effort: effort }, ["lg"]);
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.providers.map((p) => p.providerId)).toEqual(["lg"]);
	});

	it("keeps LG when the request says nothing about reasoning", () => {
		const result = run({ messages }, ["lg"]);
		expect(result.ok).toBe(true);
	});

	it("rejects a Responses request that disables reasoning", () => {
		const result = run({ input: "hi", reasoning: { effort: "none" } }, ["lg"], "responses");
		expect(result.ok).toBe(false);
	});
});
