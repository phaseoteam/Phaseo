import {
	buildSensitiveInfoPreview,
	getDefaultSensitiveInfoRules,
	validateSensitiveInfoRulePayload,
} from "./sensitiveInfoPreview";

describe("buildSensitiveInfoPreview", () => {
	test("detects and redacts deterministic sensitive info rules", () => {
		const preview = buildSensitiveInfoPreview({
			text: "Email me at test@example.com or call +1 (415) 555-1212.",
			rules: getDefaultSensitiveInfoRules("redact"),
		});

		expect(preview.action).toBe("redact");
		expect(preview.matches.map((match) => match.ruleId)).toEqual([
			"email_address",
			"phone_number",
		]);
		expect(preview.redactedText).toContain("[EMAIL]");
		expect(preview.redactedText).toContain("[PHONE]");
	});

	test("elevates to block when any enabled rule is configured to block", () => {
		const rules = getDefaultSensitiveInfoRules("flag").map((rule) =>
			rule.id === "credit_card_number"
				? { ...rule, action: "block" as const }
				: rule,
		);
		const preview = buildSensitiveInfoPreview({
			text: "Use 4242 4242 4242 4242 for the test card.",
			rules,
		});

		expect(preview.action).toBe("block");
		expect(preview.matches[0]?.ruleId).toBe("credit_card_number");
	});

	test("ignores disabled rules", () => {
		const rules = getDefaultSensitiveInfoRules("redact").map((rule) =>
			rule.id === "ip_address" ? { ...rule, enabled: false } : rule,
		);
		const preview = buildSensitiveInfoPreview({
			text: "Origin IP is 203.0.113.7.",
			rules,
		});

		expect(preview.action).toBeNull();
		expect(preview.matches).toHaveLength(0);
	});

	test("supports custom regex rules in preview", () => {
		const preview = buildSensitiveInfoPreview({
			text: "Internal reference ACCT-123456 should stay out of prompts.",
			rules: [
				...getDefaultSensitiveInfoRules("flag"),
				{
					id: "custom-acct",
					kind: "custom" as const,
					enabled: true,
					action: "redact" as const,
					name: "Account ID",
					pattern: "ACCT-[0-9]{6}",
					flags: "i",
				},
			],
		});

		expect(preview.action).toBe("redact");
		expect(preview.matches.some((match) => match.ruleId === "custom-acct")).toBe(true);
		expect(preview.redactedText).toContain("[ACCOUNT_ID]");
	});

	test("reports invalid custom regex rules", () => {
		const issue = validateSensitiveInfoRulePayload({
			id: "custom-bad",
			kind: "custom",
			enabled: true,
			action: "redact",
			name: "Broken pattern",
			pattern: "[unterminated",
			flags: "i",
		});

		expect(issue).toBeTruthy();
	});

	test("keeps higher-latency entity heuristics disabled by default", () => {
		const preview = buildSensitiveInfoPreview({
			text: "My name is John Smith and I live at 123 Market Street.",
			rules: getDefaultSensitiveInfoRules("redact"),
		});

		expect(preview.matches).toHaveLength(0);
	});

	test("detects contextual person-name and address heuristics when explicitly enabled", () => {
		const rules = getDefaultSensitiveInfoRules("redact").map((rule) => {
			if (rule.id === "person_name" || rule.id === "physical_address") {
				return { ...rule, enabled: true };
			}
			return rule;
		});
		const preview = buildSensitiveInfoPreview({
			text: "My name is John Smith and ship it to 123 Market Street, San Francisco, CA 94105.",
			rules,
		});

		expect(preview.matches.map((match) => match.ruleId)).toEqual([
			"person_name",
			"physical_address",
		]);
		expect(preview.redactedText).toContain("[PERSON_NAME]");
		expect(preview.redactedText).toContain("[ADDRESS]");
	});
});
