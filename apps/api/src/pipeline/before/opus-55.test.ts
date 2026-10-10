import { describe, expect, it } from "vitest";
import { validateProviderDocsCompliance } from "./providerDocsValidation";
import { applyWorkspacePolicy } from "./workspacePolicy";
import { calculateMaxTries } from "../execute/utils";
import { getEffectiveRoutingHints } from "../requestRouting";

function validate(endpoint: "messages" | "responses" | "chat.completions", body: any, providerId = "google-vertex") {
	return validateProviderDocsCompliance({ endpoint, body, model: "anthropic/claude-opus-5.5", providers: [{ providerId } as any], requestedParams: [], requestId: "req", workspaceId: "workspace" });
}

describe("Opus 5.5 request preflight", () => {
	it.each(["google-vertex", "amazon-bedrock"])("keeps strict %s pinning with no provider fallback", providerId => {
		const body = { model: "anthropic/claude-opus-5.5", provider: { only: [providerId], allow_fallbacks: false } };
		const providers = [providerId, "anthropic"].map(id => ({ providerId: id, providerStatus: "active", providerRoutingStatus: "active", modelRoutingStatus: "active", capabilityStatus: "active", byokMeta: [], pricingCard: null } as any));
		const result = applyWorkspacePolicy({ providers, resolvedModel: body.model, body, workspacePolicy: null });
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.providers.map(p => p.providerId)).toEqual([providerId]);
		const missing = applyWorkspacePolicy({ providers: providers.slice(1), resolvedModel: body.model, body, workspacePolicy: null });
		expect(missing.ok).toBe(false);
		expect(calculateMaxTries(2, getEffectiveRoutingHints(body).allowFallbacks)).toBe(1);
	});
	it.each([
		["chat.completions", { messages: [{ role: "user", content: "Hi" }], temperature: 0 }],
		["chat.completions", { messages: [{ role: "user", content: "Hi" }], tool_choice: "required" }],
		["responses", { input: "Hi", reasoning: { effort: "none" } }],
		["responses", { input: [{ type: "message", role: "assistant", content: "Prefill" }] }],
		["messages", { messages: [{ role: "user", content: "Hi" }], thinking: { type: "disabled" } }],
		["messages", { messages: [{ role: "assistant", content: "Prefill" }] }],
	] as const)("returns an actionable 400 for unsupported options on %s", async (endpoint, body) => {
		const result = validate(endpoint, body);
		expect(result.ok).toBe(false);
		if (result.ok) throw new Error("expected validation failure");
		expect(result.response.status).toBe(400);
		const error = await result.response.json() as any;
		expect(error.error).toBe("validation_error");
		expect(JSON.stringify(error)).toContain("Opus 5.5");
	});

	it("rejects Bedrock strict tools despite stale catalogue advertising structured outputs", () => {
		const result = validate("responses", { input: "Hi", tools: [{ type: "function", name: "lookup", strict: true, parameters: { type: "object" } }] }, "amazon-bedrock");
		expect(result.ok).toBe(false);
	});

	it("does not remove compatible Vertex routes when Bedrock cannot provide structured output", () => {
		const body = { input: "Hi", text: { format: { type: "json_schema", name: "answer", schema: { type: "object" } } } };
		const result = validateProviderDocsCompliance({ endpoint: "responses", body, model: "anthropic/claude-opus-5.5", providers: [{ providerId: "amazon-bedrock" } as any, { providerId: "google-vertex" } as any], requestedParams: [], requestId: "req", workspaceId: "workspace" });
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.providers.map(p => p.providerId)).toEqual(["google-vertex"]);
			expect(result.body).toBe(body);
		}
	});
});
