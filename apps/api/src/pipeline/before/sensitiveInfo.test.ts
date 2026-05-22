import { describe, expect, it } from "vitest";
import { applySensitiveInfoGuardrails, inspectSensitiveInfo } from "./sensitiveInfo";

const workspacePolicy = {
	providerAllowlist: null,
	providerBlocklist: null,
	allowedApiModels: null,
	promptInjectionAction: null,
	promptInjectionGuardrailIds: [],
	sensitiveInfoRules: [
		{ id: "email_address", kind: "builtin" as const, action: "redact" as const },
		{ id: "credit_card_number", kind: "builtin" as const, action: "block" as const },
	],
	sensitiveInfoGuardrailIds: ["gr_sensitive"],
	enforceAllowed: false,
	activeGuardrailIds: ["gr_sensitive"],
};

describe("sensitive info guardrails", () => {
	it("detects deterministic sensitive info", () => {
		const detections = inspectSensitiveInfo("Contact test@example.com", [
			{ id: "email_address", kind: "builtin", action: "redact" },
		]);

		expect(detections).toHaveLength(1);
		expect(detections[0]?.detectorId).toBe("email_address");
	});

	it("redacts configured matches for chat completions", () => {
		const result = applySensitiveInfoGuardrails({
			body: {
				messages: [{ role: "user", content: "Reach me at test@example.com" }],
			},
			rawBody: {
				messages: [{ role: "user", content: "Reach me at test@example.com" }],
			},
			endpoint: "chat.completions",
			workspacePolicy: {
				...workspacePolicy,
				sensitiveInfoRules: [
					{ id: "email_address", kind: "builtin", action: "redact" },
				],
			},
			requestId: "req_123",
			workspaceId: "ws_123",
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.body.messages[0].content).toContain("[EMAIL]");
		expect(result.rawBody.messages[0].content).toContain("[EMAIL]");
		expect(result.enforcement?.action).toBe("redact");
		expect(result.enforcement?.redactionCount).toBe(1);
	});

	it("blocks requests when a blocking sensitive rule matches", async () => {
		const result = applySensitiveInfoGuardrails({
			body: {
				messages: [{ role: "user", content: "Use card 4242 4242 4242 4242" }],
			},
			rawBody: {
				messages: [{ role: "user", content: "Use card 4242 4242 4242 4242" }],
			},
			endpoint: "chat.completions",
			workspacePolicy,
			requestId: "req_123",
			workspaceId: "ws_123",
		});

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.response.status).toBe(403);
		const payload = await result.response.json();
		expect(payload.error).toBe("guardrail_blocked");
		expect(payload.reason).toBe("sensitive_info_detected");
		expect(payload.guardrail_enforcement?.action).toBe("block");
	});

	it("supports custom regex sensitive info rules", () => {
		const detections = inspectSensitiveInfo("Internal code ACCT-123456", [
			{
				id: "custom-acct",
				kind: "custom",
				name: "Account ID",
				pattern: "ACCT-[0-9]{6}",
				flags: "i",
				action: "redact",
			},
		]);

		expect(detections).toHaveLength(1);
		expect(detections[0]?.detectorId).toBe("custom:custom-acct");
		expect(detections[0]?.category).toBe("custom_pattern");
	});

	it("redacts configured custom regex matches", () => {
		const result = applySensitiveInfoGuardrails({
			body: {
				messages: [{ role: "user", content: "Internal code ACCT-123456" }],
			},
			rawBody: {
				messages: [{ role: "user", content: "Internal code ACCT-123456" }],
			},
			endpoint: "chat.completions",
			workspacePolicy: {
				...workspacePolicy,
				sensitiveInfoRules: [
					{
						id: "custom-acct",
						kind: "custom",
						name: "Account ID",
						pattern: "ACCT-[0-9]{6}",
						flags: "i",
						action: "redact",
					},
				],
			},
			requestId: "req_123",
			workspaceId: "ws_123",
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.body.messages[0].content).toContain("[ACCOUNT_ID]");
		expect(result.enforcement?.redactionCount).toBe(1);
	});

	it("keeps entity heuristics disabled unless explicitly configured", () => {
		const detections = inspectSensitiveInfo(
			"My name is John Smith and I live at 123 Market Street.",
			[{ id: "email_address", kind: "builtin", action: "redact" }],
		);

		expect(detections).toHaveLength(0);
	});

	it("detects contextual person names and physical addresses when enabled", () => {
		const detections = inspectSensitiveInfo(
			"My name is John Smith and mail it to 123 Market Street, San Francisco, CA 94105.",
			[
				{ id: "person_name", kind: "builtin", action: "redact" },
				{ id: "physical_address", kind: "builtin", action: "redact" },
			],
		);

		expect(detections.map((detection) => detection.ruleId)).toEqual([
			"person_name",
			"physical_address",
		]);
		expect(detections.every((detection) => detection.variant === "entity_heuristic")).toBe(true);
	});
});
