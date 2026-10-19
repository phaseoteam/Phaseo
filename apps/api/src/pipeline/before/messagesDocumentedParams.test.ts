// Documented /v1/messages parameters (simulator finding N11).
import { describe, expect, it } from "vitest";
import { AnthropicMessagesSchema } from "@core/schemas";
import { extractRequestedParams, getUnknownTopLevelParams } from "./paramCapabilities";
import { validateSynchronousTextServiceTierRequest } from "./serviceTierValidation";

const base = {
	model: "anthropic/claude-sonnet-5",
	max_tokens: 256,
	messages: [{ role: "user", content: "Hello" }],
};

describe("/v1/messages documented parameters", () => {
	it("accepts session_id, reasoning and provider_options", () => {
		const body = {
			...base,
			session_id: "sess_123",
			reasoning: { effort: "high", summary: "auto" },
			provider_options: { anthropic: { cache_control: { type: "ephemeral", scope: "agent" } } },
		};
		expect(AnthropicMessagesSchema.safeParse(body).success).toBe(true);
		expect(getUnknownTopLevelParams("messages", body)).toEqual([]);
	});

	it("routes reasoning like thinking and keeps session_id out of the requested params", () => {
		const params = extractRequestedParams("messages", {
			...base,
			session_id: "sess_123",
			reasoning: { effort: "high" },
		});
		expect(params).toContain("reasoning.effort");
		expect(params).not.toContain("session_id");
	});

	it("still rejects parameters the Messages API does not document", () => {
		expect(getUnknownTopLevelParams("messages", { ...base, mcp_servers: [] })).toEqual(["mcp_servers"]);
	});

	it.each(["auto", "standard_only"])("accepts Anthropic's service_tier %s", (serviceTier) => {
		const body = { ...base, service_tier: serviceTier };
		expect(AnthropicMessagesSchema.safeParse(body).success).toBe(true);
		expect(validateSynchronousTextServiceTierRequest({
			endpoint: "messages",
			body,
			requestId: "req_test",
			workspaceId: "workspace_test",
		}).ok).toBe(true);
	});
});
