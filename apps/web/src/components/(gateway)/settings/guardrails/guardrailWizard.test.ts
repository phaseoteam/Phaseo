import { getDefaultSensitiveInfoRules } from "./sensitiveInfoPreview";
import {
	applyTemplate,
	buildWizardAssignRows,
	describeGuardrail,
	draftGuardrailRow,
	enableSection,
	furthestReachableStep,
	resetSection,
	stepIssue,
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
		keyIds: [],
		memberIds: [],
		departmentIds: [],
		workspaceAssigned: false,
	};
}

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
});
