import { describe, expect, it } from "vitest";
import { getDefaultSensitiveInfoRules } from "./sensitiveInfoPreview";
import {
	applyTemplate,
	buildWizardAssignRows,
	describeGuardrail,
	draftGuardrailRow,
	enableSection,
	furthestReachableStep,
	parseRateLimit,
	parseSpendLimit,
	rateIssue,
	resetSection,
	stepIssue,
	withSection,
	wizardKind,
	type GuardrailWizardForm,
} from "./guardrailWizard";

const translate = (key: string) => key;

function defaults(): GuardrailWizardForm {
	return {
		enabled: true,
		name: "",
		description: "",
		privacyEnablePaidMayTrain: true,
		privacyEnableFreeMayTrain: true,
		privacyEnableFreeMayPublishPrompts: true,
		privacyEnableInputOutputLogging: true,
		privacyZdrOnly: false,
		providerRestrictionMode: "none",
		providerRestrictionProviderIds: [],
		providerRestrictionEnforceAllowed: false,
		modelRestrictionMode: "none",
		allowedApiModelIds: [],
		promptInjectionEnabled: false,
		promptInjectionAction: "block",
		sensitiveInfoEnabled: false,
		sensitiveInfoDefaultAction: "redact",
		sensitiveInfoRules: getDefaultSensitiveInfoRules("redact"),
		rateRequestsPerMinute: "",
		rateTokensPerMinute: "",
		rateConcurrentRequests: "",
		rateFailClosed: false,
		rateCounting: null,
		spendLimit: "",
		spendPeriod: null,
		spendAction: null,
		spendCounting: null,
		keyIds: [],
		memberIds: [],
		departmentIds: [],
		workspaceAssigned: false,
	};
}

describe("rate guardrails in the flow", () => {
	it("keeps rate on its own: one kind per guardrail", () => {
		expect(withSection(["access", "prompt-injection"], "rate", true)).toEqual(["rate"]);
		expect(withSection(["rate"], "access", true)).toEqual(["access"]);
		expect(withSection(["access"], "sensitive-info", true)).toEqual(["access", "sensitive-info"]);
		expect(withSection(["rate"], "rate", false)).toEqual([]);
		expect(wizardKind(["rate"])).toBe("rate");
		expect(wizardKind(["prompt-injection"])).toBe("safety");
		expect(wizardKind(["access", "sensitive-info"])).toBe("access");
	});

	it("starts the rate template with no limits and no counting", () => {
		const { form, sections } = applyTemplate({ form: { ...defaults(), privacyZdrOnly: true }, defaults: defaults(), templateId: "rate-limit", previousTemplateName: null, templateName: "Rate limit" });
		expect(sections).toEqual(["rate"]);
		expect(form).toMatchObject({ name: "Rate limit", privacyZdrOnly: false, rateRequestsPerMinute: "", rateCounting: null });
	});

	it("needs a valid limit and a chosen counting before configure can finish", () => {
		const form = { ...defaults(), name: "Batch" };
		expect(stepIssue("start", form, ["rate"], translate)).toBeNull();
		expect(stepIssue("configure", form, ["rate"], translate)).toBe("rateLimitEmpty");
		expect(stepIssue("configure", { ...form, rateRequestsPerMinute: "1.5" }, ["rate"], translate)).toBe("rateLimitInvalid");
		expect(stepIssue("configure", { ...form, rateRequestsPerMinute: "60" }, ["rate"], translate)).toBe("rateCountingRequired");
		expect(stepIssue("configure", { ...form, rateRequestsPerMinute: "60", rateCounting: "shared" }, ["rate"], translate)).toBeNull();
		expect(furthestReachableStep({ ...form, rateTokensPerMinute: "100,000", rateCounting: "each_key" }, ["rate"], translate)).toBe("review");
	});

	it("lets a guardrail made through the API keep counting as it does when edited", () => {
		const legacy = { ...defaults(), name: "Acceptance test", rateTokensPerMinute: "30" };
		expect(rateIssue(legacy)).toBe("rateCountingRequired");
		expect(rateIssue(legacy, { legacyCounting: true })).toBeNull();
		expect(rateIssue({ ...legacy, rateTokensPerMinute: "" }, { legacyCounting: true })).toBe("rateLimitEmpty");
	});

	it("reads typed limits as whole numbers in range", () => {
		expect(parseRateLimit("", "rateRequestsPerMinute")).toBeNull();
		expect(parseRateLimit(" 1 000 ", "rateRequestsPerMinute")).toBe(1000);
		expect(parseRateLimit("2,000,000", "rateTokensPerMinute")).toBe(2_000_000);
		expect(parseRateLimit("0", "rateConcurrentRequests")).toBe("invalid");
		expect(parseRateLimit("-3", "rateConcurrentRequests")).toBe("invalid");
		expect(parseRateLimit("3000000000", "rateRequestsPerMinute")).toBe("invalid");
	});

	it("previews the new rate limit on the rows it reaches, and describes it", () => {
		const form = { ...defaults(), name: "Batch", rateRequestsPerMinute: "60", rateConcurrentRequests: "4", rateCounting: "each_key" as const, rateFailClosed: true };
		expect(draftGuardrailRow(form, "draft", ["rate"])).toMatchObject({
			kind: "rate", rate_requests_per_minute: 60, rate_tokens_per_minute: null, rate_concurrent_requests: 4, rate_fail_closed: true, rate_counting: "each_key",
		});
		expect(draftGuardrailRow(form)).not.toHaveProperty("rate_requests_per_minute");
		const rows = buildWizardAssignRows({
			targetType: "key", untitled: "Untitled",
			keys: [{ id: "key-1", name: "Prod", prefix: "pk_1", status: "active" }], members: [], guardrails: [],
			guardrailKeyIdsByGuardrailId: {}, guardrailMemberIdsByGuardrailId: {},
			workspaceAssigned: false, departmentIds: [], memberIds: [], keyIds: ["key-1"],
			draft: draftGuardrailRow(form, "draft", ["rate"]),
		});
		expect(rows[0]).toMatchObject({ selected: true, changes: true, after: { requestsPerMinute: 60, concurrentRequests: 4, tokensPerMinute: null } });
		expect(describeGuardrail(form, ["rate"]).map((line) => line.key)).toEqual([
			"summaryRateRequests", "summaryRateConcurrent", "summaryRateCounting.each_key", "summaryRateFailClosed",
		]);
	});
});

describe("spend guardrails in the flow", () => {
	it("keeps spend on its own: one kind per guardrail", () => {
		expect(withSection(["access", "prompt-injection"], "spend", true)).toEqual(["spend"]);
		expect(withSection(["rate"], "spend", true)).toEqual(["spend"]);
		expect(withSection(["spend"], "rate", true)).toEqual(["rate"]);
		expect(withSection(["spend"], "access", true)).toEqual(["access"]);
		expect(wizardKind(["spend"])).toBe("spend");
	});

	it("starts the spend template with nothing chosen", () => {
		const { form, sections } = applyTemplate({ form: { ...defaults(), privacyZdrOnly: true }, defaults: defaults(), templateId: "spend-limit", previousTemplateName: null, templateName: "Spend limit" });
		expect(sections).toEqual(["spend"]);
		expect(form).toMatchObject({ name: "Spend limit", privacyZdrOnly: false, spendLimit: "", spendPeriod: null, spendAction: null, spendCounting: null });
	});

	it("needs a valid limit and every choice made before configure can finish", () => {
		const form = { ...defaults(), name: "Contractors" };
		expect(stepIssue("configure", form, ["spend"], translate)).toBe("spendLimitEmpty");
		expect(stepIssue("configure", { ...form, spendLimit: "1.234" }, ["spend"], translate)).toBe("spendLimitInvalid");
		const limited = { ...form, spendLimit: "25" };
		expect(stepIssue("configure", limited, ["spend"], translate)).toBe("spendPeriodRequired");
		expect(stepIssue("configure", { ...limited, spendPeriod: "monthly" as const }, ["spend"], translate)).toBe("spendActionRequired");
		expect(stepIssue("configure", { ...limited, spendPeriod: "monthly" as const, spendAction: "block" as const }, ["spend"], translate)).toBe("spendCountingRequired");
		expect(furthestReachableStep({ ...limited, spendPeriod: "monthly", spendAction: "block", spendCounting: "shared" }, ["spend"], translate)).toBe("review");
	});

	it("reads typed dollar amounts as nanodollars", () => {
		expect(parseSpendLimit("")).toBeNull();
		expect(parseSpendLimit("25")).toBe(25_000_000_000);
		expect(parseSpendLimit("$1,250.5")).toBe(1_250_500_000_000);
		expect(parseSpendLimit("1,000,000")).toBe(1_000_000_000_000_000);
		// A decimal comma is refused, not read as thousands.
		expect(parseSpendLimit("12,50")).toBe("invalid");
		expect(parseSpendLimit("1,2345")).toBe("invalid");
		expect(parseSpendLimit("0.01")).toBe(10_000_000);
		expect(parseSpendLimit("0")).toBe("invalid");
		expect(parseSpendLimit("1.234")).toBe("invalid");
		expect(parseSpendLimit("-5")).toBe("invalid");
		expect(parseSpendLimit("99999999999")).toBe("invalid");
	});

	it("previews the new spend limit on the rows it reaches, and describes it", () => {
		const form = { ...defaults(), name: "Contractors", spendLimit: "25", spendPeriod: "daily" as const, spendAction: "block" as const, spendCounting: "each_key" as const };
		expect(draftGuardrailRow(form, "draft", ["spend"])).toMatchObject({
			kind: "spend", spend_limit_nanos: 25_000_000_000, spend_period: "daily", spend_action: "block", spend_counting: "each_key",
		});
		expect(draftGuardrailRow(form)).not.toHaveProperty("spend_limit_nanos");
		const rows = buildWizardAssignRows({
			targetType: "key", untitled: "Untitled",
			keys: [{ id: "key-1", name: "Prod", prefix: "pk_1", status: "active" }], members: [],
			guardrails: [{ id: "existing", name: "Monthly", enabled: true, kind: "spend", spend_limit_nanos: 10_000_000_000, spend_period: "daily", spend_action: "notify", spend_counting: "shared" }],
			guardrailKeyIdsByGuardrailId: { existing: ["key-1"] }, guardrailMemberIdsByGuardrailId: {},
			workspaceAssigned: false, departmentIds: [], memberIds: [], keyIds: ["key-1"],
			draft: draftGuardrailRow(form, "draft", ["spend"]),
		});
		// The existing $10 a day is lower, so the limit doesn't change, but blocking does.
		expect(rows[0]).toMatchObject({ selected: true, changes: true, after: { spendLimits: { daily: 10_000_000_000, weekly: null, monthly: null }, spendBlocks: true } });
		expect(describeGuardrail(form, ["spend"])).toEqual([
			{ key: "summarySpendLimit.daily", values: { amount: "$25.00" } },
			{ key: "summarySpendAction.block" },
			{ key: "summarySpendCounting.each_key" },
		]);
	});
});

describe("applyTemplate", () => {
	it("fills in the template's settings and suggests its name", () => {
		const { form, sections } = applyTemplate({ form: defaults(), defaults: defaults(), templateId: "zdr", previousTemplateName: null, templateName: "Zero data retention" });
		expect(sections).toEqual(["access"]);
		expect(form).toMatchObject({ privacyZdrOnly: true, name: "Zero data retention" });
	});

	it("keeps a name the user typed when switching templates", () => {
		const typed = { ...defaults(), name: "Contractors" };
		const first = applyTemplate({ form: typed, defaults: defaults(), templateId: "zdr", previousTemplateName: null, templateName: "Zero data retention" });
		const second = applyTemplate({ form: first.form, defaults: defaults(), templateId: "block-prompt-injection", previousTemplateName: "Zero data retention", templateName: "Block prompt injection" });
		expect(second.form.name).toBe("Contractors");
	});

	it("replaces the previous template's suggested name and drops its settings", () => {
		const first = applyTemplate({ form: defaults(), defaults: defaults(), templateId: "zdr", previousTemplateName: null, templateName: "Zero data retention" });
		const second = applyTemplate({ form: first.form, defaults: defaults(), templateId: "block-prompt-injection", previousTemplateName: "Zero data retention", templateName: "Block prompt injection" });
		expect(second.sections).toEqual(["prompt-injection"]);
		expect(second.form).toMatchObject({ name: "Block prompt injection", privacyZdrOnly: false, promptInjectionEnabled: true, promptInjectionAction: "block" });
	});

	it("turns on only the personal info patterns for the redact template", () => {
		const { form } = applyTemplate({ form: defaults(), defaults: defaults(), templateId: "redact-personal-info", previousTemplateName: null, templateName: "Redact personal info" });
		expect(form.sensitiveInfoEnabled).toBe(true);
		expect(form.sensitiveInfoRules.filter((rule) => rule.enabled).map((rule) => rule.id).sort()).toEqual(["credit_card_number", "email_address", "phone_number", "ssn"]);
		expect(form.sensitiveInfoRules.every((rule) => rule.action === "redact")).toBe(true);
	});
});

describe("sections", () => {
	it("starts prompt injection and sensitive info switched on when added", () => {
		expect(enableSection(defaults(), "prompt-injection").promptInjectionEnabled).toBe(true);
		expect(enableSection(defaults(), "sensitive-info").sensitiveInfoEnabled).toBe(true);
	});

	it("puts a removed section back to its defaults and leaves the others alone", () => {
		const form = { ...defaults(), privacyZdrOnly: true, promptInjectionEnabled: true, name: "x" };
		expect(resetSection(form, defaults(), "access")).toMatchObject({ privacyZdrOnly: false, promptInjectionEnabled: true, name: "x" });
	});
});

describe("stepIssue", () => {
	it("needs a name and at least one check before configuring", () => {
		expect(stepIssue("start", defaults(), ["access"], translate)).toBe("nameRequired");
		expect(stepIssue("start", { ...defaults(), name: "x" }, [], translate)).toBe("chooseSection");
		expect(stepIssue("start", { ...defaults(), name: "x" }, ["access"], translate)).toBeNull();
	});

	it("refuses an empty allowlist, which would block everything", () => {
		const form = { ...defaults(), name: "x", providerRestrictionMode: "allowlist" as const };
		expect(stepIssue("configure", form, ["access"], translate)).toBe("providerAllowlistEmpty");
		expect(stepIssue("configure", { ...form, providerRestrictionProviderIds: ["openai"] }, ["access"], translate)).toBeNull();
		expect(stepIssue("configure", { ...defaults(), name: "x", modelRestrictionMode: "allowlist" }, ["access"], translate)).toBe("modelAllowlistEmpty");
	});

	it("refuses a chosen check that does nothing", () => {
		const named = { ...defaults(), name: "x" };
		expect(stepIssue("configure", named, ["access"], translate)).toBe("accessEmpty");
		expect(stepIssue("configure", { ...named, providerRestrictionMode: "blocklist" }, ["access"], translate)).toBe("accessEmpty");
		expect(stepIssue("configure", named, ["prompt-injection"], translate)).toBe("promptInjectionOff");
		const noRules = { ...named, sensitiveInfoEnabled: true, sensitiveInfoRules: named.sensitiveInfoRules.map((rule) => ({ ...rule, enabled: false })) };
		expect(stepIssue("configure", noRules, ["sensitive-info"], translate)).toBe("sensitiveInfoOff");
	});

	it("reports a broken custom pattern", () => {
		const form = {
			...defaults(),
			name: "x",
			sensitiveInfoEnabled: true,
			sensitiveInfoRules: [{ id: "c1", kind: "custom" as const, enabled: true, action: "redact" as const, name: "Ticket", pattern: "(" }],
		};
		expect(stepIssue("configure", form, ["sensitive-info"], translate)).toMatchObject({ sensitiveRule: expect.any(String) });
	});

	it("lets the stepper reach only as far as the first step with an issue", () => {
		expect(furthestReachableStep(defaults(), [], translate)).toBe("start");
		expect(furthestReachableStep({ ...defaults(), name: "x" }, ["access"], translate)).toBe("configure");
		expect(furthestReachableStep({ ...defaults(), name: "x", privacyZdrOnly: true }, ["access"], translate)).toBe("review");
	});
});

describe("describeGuardrail", () => {
	it("lists what the chosen checks do, and nothing from checks left out", () => {
		const form = { ...defaults(), privacyZdrOnly: true, providerRestrictionMode: "allowlist" as const, providerRestrictionProviderIds: ["a", "b"], promptInjectionEnabled: true };
		expect(describeGuardrail(form, ["access"])).toEqual([
			{ key: "summaryZdr" },
			{ key: "summaryProvidersAllowed", values: { count: 2 } },
		]);
		expect(describeGuardrail(form, ["access", "prompt-injection"]).at(-1)).toEqual({ key: "summaryPromptInjection", values: { action: "block" } });
	});
});

describe("buildWizardAssignRows", () => {
	const existing = { id: "g1", name: "Team policy", enabled: true, prompt_injection_enabled: true, prompt_injection_action: "flag" };
	const base = {
		keys: [
			{ id: "k1", name: "Prod", prefix: "aistats_ab", status: "active", principalUserId: "u1" },
			{ id: "k2", name: "CI", prefix: "aistats_cd", status: "active", principalUserId: null },
		],
		members: [{ id: "u1", name: "Sam", role: "admin" }],
		guardrails: [existing],
		guardrailKeyIdsByGuardrailId: { g1: ["k2"] },
		guardrailMemberIdsByGuardrailId: {},
		untitled: "Untitled",
	};
	const none = { workspaceAssigned: false, departmentIds: [] as string[] };

	it("shows the policy with the new guardrail only for the rows it will reach", () => {
		const draft = draftGuardrailRow({ ...defaults(), name: "ZDR", privacyZdrOnly: true });
		const [prod, ci] = buildWizardAssignRows({ ...base, ...none, targetType: "key", draft, keyIds: ["k2"], memberIds: [] });
		expect(prod).toMatchObject({ selected: false, after: null, changes: false });
		expect(ci).toMatchObject({ selected: true, changes: true });
		expect(ci.after).toMatchObject({ zdrOnly: true, promptInjection: "flag", activeCount: 2 });
	});

	it("marks a key as covered when its principal member is selected", () => {
		const draft = draftGuardrailRow({ ...defaults(), name: "ZDR", privacyZdrOnly: true });
		const [prod] = buildWizardAssignRows({ ...base, ...none, targetType: "key", draft, keyIds: [], memberIds: ["u1"] });
		expect(prod.coveredVia).toEqual({ level: "member", id: "u1", name: "Sam" });
		expect(prod.after?.zdrOnly).toBe(true);
	});

	it("says nothing changes when the row's guardrails are already as strict", () => {
		const draft = draftGuardrailRow({ ...defaults(), name: "Flag", promptInjectionEnabled: true, promptInjectionAction: "flag" });
		const [, ci] = buildWizardAssignRows({ ...base, ...none, targetType: "key", draft, keyIds: ["k2"], memberIds: [] });
		// One more active guardrail, but the same rules.
		expect(ci.after).toMatchObject({ promptInjection: "flag", activeCount: 2 });
		expect(ci.changes).toBe(false);
	});

	it("does not count a guardrail that is turned off", () => {
		const draft = draftGuardrailRow({ ...defaults(), name: "ZDR", privacyZdrOnly: true, enabled: false });
		const [, ci] = buildWizardAssignRows({ ...base, ...none, targetType: "key", draft, keyIds: ["k2"], memberIds: [] });
		expect(ci.after).toEqual(ci.effective);
		expect(ci.changes).toBe(false);
	});

	it("covers every row when the whole workspace is chosen", () => {
		const draft = draftGuardrailRow({ ...defaults(), name: "ZDR", privacyZdrOnly: true });
		const rows = buildWizardAssignRows({ ...base, ...none, workspaceAssigned: true, targetType: "key", draft, keyIds: [], memberIds: [] });
		expect(rows.map((row) => row.coveredVia)).toEqual([{ level: "workspace" }, { level: "workspace" }]);
		expect(rows.every((row) => row.after?.zdrOnly)).toBe(true);
	});

	it("marks keys and members covered through a chosen department", () => {
		const draft = draftGuardrailRow({ ...defaults(), name: "ZDR", privacyZdrOnly: true });
		const withDepartments = { ...base, departments: [{ id: "d1", name: "Engineering" }], keyDepartmentIds: { k1: ["d1"] }, memberDepartmentIds: { u1: ["d1"] } };
		const [prod, ci] = buildWizardAssignRows({ ...withDepartments, ...none, departmentIds: ["d1"], targetType: "key", draft, keyIds: [], memberIds: [] });
		expect(prod?.coveredVia).toEqual({ level: "department", id: "d1", name: "Engineering" });
		expect(ci?.coveredVia).toBeNull();
		const [sam] = buildWizardAssignRows({ ...withDepartments, ...none, departmentIds: ["d1"], targetType: "member", draft, keyIds: [], memberIds: [] });
		expect(sam?.coveredVia).toEqual({ level: "department", id: "d1", name: "Engineering" });
		const [engineering] = buildWizardAssignRows({ ...withDepartments, ...none, departmentIds: ["d1"], targetType: "department", draft, keyIds: [], memberIds: [] });
		expect(engineering).toMatchObject({ selected: true, changes: true });
	});

	it("counts a no-training guardrail as a change for a row with no training rules", () => {
		const draft = draftGuardrailRow({ ...defaults(), name: "No training", privacyEnablePaidMayTrain: false, privacyEnableFreeMayTrain: false });
		const [prod] = buildWizardAssignRows({ ...base, ...none, targetType: "key", draft, keyIds: ["k1"], memberIds: [] });
		expect(prod?.after).toMatchObject({ noPaidTraining: true, noFreeTraining: true });
		expect(prod?.changes).toBe(true);
	});
});
