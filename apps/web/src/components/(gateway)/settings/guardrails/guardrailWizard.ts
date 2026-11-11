import type { SettingsGuardrailRow } from "@/lib/fetchers/internal/settingsTypes";
import {
	buildGuardrailAssignmentRows,
	effectiveGuardrailPolicy,
	type AssignmentRowLabels,
	type AssignmentTargetType,
	type EffectiveGuardrailPolicy,
	type GuardrailAssignmentData,
	type GuardrailAssignmentRow,
} from "./guardrailAssignments";
import type {
	PromptInjectionAction,
	ProviderRestrictionMode,
	RateCounting,
	SensitiveInfoAction,
	SpendAction,
	SpendCounting,
	SpendPeriod,
	SensitiveInfoRulePayload,
} from "@/features/settings/guardrails/actions";
import { validateSensitiveInfoRulePayload } from "./sensitiveInfoPreview";

/** Nanodollars as US dollars: $12.50. */
export function formatUsd(nanos: number): string {
	return (nanos / 1e9).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Pure state for the new-guardrail flow: start (name + what it does), configure (only the chosen
// sections), assign (the whole workspace, departments, members and keys) and review. Kept out of the editor so it can be tested.

export const WIZARD_STEPS = ["start", "configure", "assign", "review"] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];

export const WIZARD_SECTIONS = ["access", "prompt-injection", "sensitive-info", "rate", "spend"] as const;
export type WizardSection = (typeof WIZARD_SECTIONS)[number];

/** Sections that make a guardrail of their own kind, alone. */
const EXCLUSIVE_SECTIONS: ReadonlySet<WizardSection> = new Set(["rate", "spend"]);

/** One kind per guardrail: a rate or spend guardrail has that section only. Access and safety sections combine. */
export function withSection(sections: WizardSection[], section: WizardSection, on: boolean): WizardSection[] {
	if (!on) return sections.filter((id) => id !== section);
	if (EXCLUSIVE_SECTIONS.has(section)) return [section];
	return WIZARD_SECTIONS.filter((id) => !EXCLUSIVE_SECTIONS.has(id) && (id === section || sections.includes(id)));
}

/** The kind a guardrail with these sections is saved as. */
export function wizardKind(sections: WizardSection[]): "access" | "safety" | "rate" | "spend" {
	if (sections.includes("rate")) return "rate";
	if (sections.includes("spend")) return "spend";
	return sections.includes("access") || !sections.length ? "access" : "safety";
}

/** The editor form fields the flow reads and writes. */
export type GuardrailWizardForm = {
	enabled: boolean;
	name: string;
	description: string;
	privacyEnablePaidMayTrain: boolean;
	privacyEnableFreeMayTrain: boolean;
	privacyEnableFreeMayPublishPrompts: boolean;
	privacyEnableInputOutputLogging: boolean;
	privacyZdrOnly: boolean;
	providerRestrictionMode: ProviderRestrictionMode;
	providerRestrictionProviderIds: string[];
	providerRestrictionEnforceAllowed: boolean;
	modelRestrictionMode: ProviderRestrictionMode;
	allowedApiModelIds: string[];
	promptInjectionEnabled: boolean;
	promptInjectionAction: PromptInjectionAction;
	sensitiveInfoEnabled: boolean;
	sensitiveInfoDefaultAction: SensitiveInfoAction;
	sensitiveInfoRules: SensitiveInfoRulePayload[];
	/** Rate limits as typed (blank for no limit), and how the guardrail counts. No default: it must be chosen. */
	rateRequestsPerMinute: string;
	rateTokensPerMinute: string;
	rateConcurrentRequests: string;
	rateFailClosed: boolean;
	rateCounting: RateCounting | null;
	/** The spend limit in dollars as typed, and the period, action and counting. None has a default. */
	spendLimit: string;
	spendPeriod: SpendPeriod | null;
	spendAction: SpendAction | null;
	spendCounting: SpendCounting | null;
	keyIds: string[];
	memberIds: string[];
	/** Departments and the whole workspace, set only by the new-guardrail flow. */
	departmentIds: string[];
	workspaceAssigned: boolean;
};

export const GUARDRAIL_TEMPLATE_IDS = [
	"zdr",
	"no-training",
	"approved-providers",
	"approved-models",
	"block-prompt-injection",
	"redact-personal-info",
	"rate-limit",
	"spend-limit",
] as const;
export type GuardrailTemplateId = (typeof GUARDRAIL_TEMPLATE_IDS)[number];

const PERSONAL_INFO_RULE_IDS = new Set(["email_address", "phone_number", "ssn", "credit_card_number"]);

type SectionFields = Partial<GuardrailWizardForm>;

const ACCESS_FIELDS = [
	"privacyEnablePaidMayTrain",
	"privacyEnableFreeMayTrain",
	"privacyEnableFreeMayPublishPrompts",
	"privacyEnableInputOutputLogging",
	"privacyZdrOnly",
	"providerRestrictionMode",
	"providerRestrictionProviderIds",
	"providerRestrictionEnforceAllowed",
	"modelRestrictionMode",
	"allowedApiModelIds",
] as const satisfies ReadonlyArray<keyof GuardrailWizardForm>;
const PROMPT_INJECTION_FIELDS = ["promptInjectionEnabled", "promptInjectionAction"] as const satisfies ReadonlyArray<keyof GuardrailWizardForm>;
const SENSITIVE_INFO_FIELDS = ["sensitiveInfoEnabled", "sensitiveInfoDefaultAction", "sensitiveInfoRules"] as const satisfies ReadonlyArray<keyof GuardrailWizardForm>;
const RATE_FIELDS = ["rateRequestsPerMinute", "rateTokensPerMinute", "rateConcurrentRequests", "rateFailClosed", "rateCounting"] as const satisfies ReadonlyArray<keyof GuardrailWizardForm>;
const SPEND_FIELDS = ["spendLimit", "spendPeriod", "spendAction", "spendCounting"] as const satisfies ReadonlyArray<keyof GuardrailWizardForm>;

const SECTION_FIELDS: Record<WizardSection, ReadonlyArray<keyof GuardrailWizardForm>> = {
	access: ACCESS_FIELDS,
	"prompt-injection": PROMPT_INJECTION_FIELDS,
	"sensitive-info": SENSITIVE_INFO_FIELDS,
	rate: RATE_FIELDS,
	spend: SPEND_FIELDS,
};

export type GuardrailTemplate = { id: GuardrailTemplateId; sections: WizardSection[]; patch: (form: GuardrailWizardForm) => SectionFields };

export const GUARDRAIL_TEMPLATES: Record<GuardrailTemplateId, GuardrailTemplate> = {
	zdr: { id: "zdr", sections: ["access"], patch: () => ({ privacyZdrOnly: true }) },
	"no-training": {
		id: "no-training",
		sections: ["access"],
		patch: () => ({ privacyEnablePaidMayTrain: false, privacyEnableFreeMayTrain: false, privacyEnableFreeMayPublishPrompts: false }),
	},
	"approved-providers": { id: "approved-providers", sections: ["access"], patch: () => ({ providerRestrictionMode: "allowlist" }) },
	"approved-models": { id: "approved-models", sections: ["access"], patch: () => ({ modelRestrictionMode: "allowlist" }) },
	"block-prompt-injection": {
		id: "block-prompt-injection",
		sections: ["prompt-injection"],
		patch: () => ({ promptInjectionEnabled: true, promptInjectionAction: "block" }),
	},
	"redact-personal-info": {
		id: "redact-personal-info",
		sections: ["sensitive-info"],
		patch: (form) => ({
			sensitiveInfoEnabled: true,
			sensitiveInfoDefaultAction: "redact",
			sensitiveInfoRules: form.sensitiveInfoRules.map((rule) => rule.kind === "builtin"
				? { ...rule, enabled: PERSONAL_INFO_RULE_IDS.has(rule.id), action: "redact" as const }
				: rule),
		}),
	},
	// Limits and counting start blank: nothing is limited until they are chosen.
	"rate-limit": { id: "rate-limit", sections: ["rate"], patch: () => ({}) },
	// The limit, period, action and counting all start blank.
	"spend-limit": { id: "spend-limit", sections: ["spend"], patch: () => ({}) },
};

/** Puts one section's fields back to their defaults, so a section taken out of the flow saves nothing. */
export function resetSection(form: GuardrailWizardForm, defaults: GuardrailWizardForm, section: WizardSection): GuardrailWizardForm {
	const next = { ...form } as Record<keyof GuardrailWizardForm, unknown>;
	for (const field of SECTION_FIELDS[section]) next[field] = defaults[field];
	return next as GuardrailWizardForm;
}

/** Turning a section on in the flow should do something straight away, so prompt injection and sensitive info start enabled. */
export function enableSection(form: GuardrailWizardForm, section: WizardSection): GuardrailWizardForm {
	if (section === "prompt-injection" && !form.promptInjectionEnabled) return { ...form, promptInjectionEnabled: true };
	if (section === "sensitive-info" && !form.sensitiveInfoEnabled) return { ...form, sensitiveInfoEnabled: true };
	return form;
}

/**
 * Starts the form again from a template. Settings from another template are dropped, but the name
 * is kept unless it is still the previous template's suggested name.
 */
export function applyTemplate(args: {
	form: GuardrailWizardForm;
	defaults: GuardrailWizardForm;
	templateId: GuardrailTemplateId;
	previousTemplateName: string | null;
	templateName: string;
}): { form: GuardrailWizardForm; sections: WizardSection[] } {
	const template = GUARDRAIL_TEMPLATES[args.templateId];
	let form = args.form;
	for (const section of WIZARD_SECTIONS) form = resetSection(form, args.defaults, section);
	form = { ...form, ...template.patch(form) };
	const name = form.name.trim();
	if (!name || (args.previousTemplateName !== null && name === args.previousTemplateName)) form = { ...form, name: args.templateName };
	return { form, sections: [...template.sections] };
}

export type WizardIssue =
	| "nameRequired"
	| "chooseSection"
	| "accessEmpty"
	| "providerAllowlistEmpty"
	| "modelAllowlistEmpty"
	| "promptInjectionOff"
	| "sensitiveInfoOff"
	| "rateLimitEmpty"
	| "rateLimitInvalid"
	| "rateCountingRequired"
	| "spendLimitEmpty"
	| "spendLimitInvalid"
	| "spendPeriodRequired"
	| "spendActionRequired"
	| "spendCountingRequired"
	| { sensitiveRule: string };

/** Largest values the database and the API accept. */
const RATE_MAX = { rateRequestsPerMinute: 2_147_483_647, rateTokensPerMinute: Number.MAX_SAFE_INTEGER, rateConcurrentRequests: 2_147_483_647 } as const;

/** A typed limit: null when blank, "invalid" unless it is a positive whole number in range. */
export function parseRateLimit(value: string, field: keyof typeof RATE_MAX): number | null | "invalid" {
	const text = value.replace(/[\s,_]/g, "");
	if (!text) return null;
	if (!/^\d+$/.test(text)) return "invalid";
	const limit = Number(text);
	return Number.isSafeInteger(limit) && limit > 0 && limit <= RATE_MAX[field] ? limit : "invalid";
}

/** The rate limits to save, or null when one is not a valid number. */
export function rateLimits(form: GuardrailWizardForm): { requestsPerMinute: number | null; tokensPerMinute: number | null; concurrentRequests: number | null } | null {
	const requestsPerMinute = parseRateLimit(form.rateRequestsPerMinute, "rateRequestsPerMinute");
	const tokensPerMinute = parseRateLimit(form.rateTokensPerMinute, "rateTokensPerMinute");
	const concurrentRequests = parseRateLimit(form.rateConcurrentRequests, "rateConcurrentRequests");
	if (requestsPerMinute === "invalid" || tokensPerMinute === "invalid" || concurrentRequests === "invalid") return null;
	return { requestsPerMinute, tokensPerMinute, concurrentRequests };
}

/**
 * What stops a rate section being saved, or null. A new rate guardrail must choose how it counts;
 * one made through the rate limits API (`legacyCounting`) may keep counting as it does.
 */
export function rateIssue(form: GuardrailWizardForm, options: { legacyCounting?: boolean } = {}): WizardIssue | null {
	const limits = rateLimits(form);
	if (!limits) return "rateLimitInvalid";
	if (limits.requestsPerMinute == null && limits.tokensPerMinute == null && limits.concurrentRequests == null) return "rateLimitEmpty";
	if (!form.rateCounting && !options.legacyCounting) return "rateCountingRequired";
	return null;
}

/** Largest spend limit, in nanodollars, that stays a safe integer (about $9 million). */
const SPEND_MAX_NANOS = Number.MAX_SAFE_INTEGER;

/**
 * A typed dollar limit in nanodollars: null when blank, "invalid" unless it is above zero, at most 2
 * decimals and in range. Commas count only as thousands separators ("1,250.50"); "12,50" is refused
 * rather than read as 1,250.
 */
export function parseSpendLimit(value: string): number | null | "invalid" {
	const spaced = value.replace(/[\s_$]/g, "");
	if (!spaced) return null;
	if (spaced.includes(",") && !/^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(spaced)) return "invalid";
	const text = spaced.replace(/,/g, "");
	const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text);
	if (!match) return "invalid";
	const nanos = Number(match[1]) * 1e9 + Number((match[2] ?? "").padEnd(2, "0")) * 1e7;
	return Number.isSafeInteger(nanos) && nanos > 0 && nanos <= SPEND_MAX_NANOS ? nanos : "invalid";
}

/** What stops a spend section being saved, or null. Every setting must be chosen. */
export function spendIssue(form: GuardrailWizardForm): WizardIssue | null {
	const limit = parseSpendLimit(form.spendLimit);
	if (limit === "invalid") return "spendLimitInvalid";
	if (limit === null) return "spendLimitEmpty";
	if (!form.spendPeriod) return "spendPeriodRequired";
	if (!form.spendAction) return "spendActionRequired";
	if (!form.spendCounting) return "spendCountingRequired";
	return null;
}

/** Whether the access section restricts anything at all. A blocklist with nothing on it does not. */
export function accessRestricts(form: GuardrailWizardForm): boolean {
	return (
		form.privacyZdrOnly ||
		!form.privacyEnablePaidMayTrain ||
		!form.privacyEnableFreeMayTrain ||
		!form.privacyEnableFreeMayPublishPrompts ||
		!form.privacyEnableInputOutputLogging ||
		form.providerRestrictionMode === "allowlist" ||
		form.modelRestrictionMode === "allowlist" ||
		(form.providerRestrictionMode === "blocklist" && form.providerRestrictionProviderIds.length > 0) ||
		(form.modelRestrictionMode === "blocklist" && form.allowedApiModelIds.length > 0)
	);
}

/** The first thing stopping the user from leaving this step, or null. */
export function stepIssue(step: WizardStep, form: GuardrailWizardForm, sections: WizardSection[], translate: (key: string, values?: Record<string, unknown>) => string): WizardIssue | null {
	if (!form.name.trim()) return "nameRequired";
	if (!sections.length) return "chooseSection";
	if (step === "start") return null;
	if (sections.includes("access")) {
		// An empty allowlist blocks every provider or model, which is never what someone setting it up means.
		if (form.providerRestrictionMode === "allowlist" && !form.providerRestrictionProviderIds.length) return "providerAllowlistEmpty";
		if (form.modelRestrictionMode === "allowlist" && !form.allowedApiModelIds.length) return "modelAllowlistEmpty";
		if (!accessRestricts(form)) return "accessEmpty";
	}
	if (sections.includes("rate")) {
		const issue = rateIssue(form);
		if (issue) return issue;
	}
	if (sections.includes("spend")) {
		const issue = spendIssue(form);
		if (issue) return issue;
	}
	if (sections.includes("prompt-injection") && !form.promptInjectionEnabled) return "promptInjectionOff";
	if (sections.includes("sensitive-info")) {
		if (!form.sensitiveInfoEnabled || !form.sensitiveInfoRules.some((rule) => rule.enabled)) return "sensitiveInfoOff";
		for (const rule of form.sensitiveInfoRules) {
			const issue = validateSensitiveInfoRulePayload(rule, translate);
			if (issue) return { sensitiveRule: issue };
		}
	}
	return null;
}

/** The first step that still has an issue, so the stepper never lets someone skip past one. */
export function furthestReachableStep(form: GuardrailWizardForm, sections: WizardSection[], translate: (key: string, values?: Record<string, unknown>) => string): WizardStep {
	if (stepIssue("start", form, sections, translate)) return "start";
	if (stepIssue("configure", form, sections, translate)) return "configure";
	return "review";
}

/** The guardrail as it would be saved, in the shape the assignments helpers read. */
export function draftGuardrailRow(form: GuardrailWizardForm, id = "draft", sections?: WizardSection[]): SettingsGuardrailRow {
	const rate = sections?.includes("rate") ? rateLimits(form) : null;
	const spendLimit = sections?.includes("spend") ? parseSpendLimit(form.spendLimit) : null;
	return {
		id,
		...(sections?.includes("spend") ? {
			kind: "spend" as const,
			spend_limit_nanos: typeof spendLimit === "number" ? spendLimit : null,
			spend_period: form.spendPeriod,
			spend_action: form.spendAction,
			spend_counting: form.spendCounting,
		} : {}),
		...(rate ? {
			kind: "rate" as const,
			rate_requests_per_minute: rate.requestsPerMinute,
			rate_tokens_per_minute: rate.tokensPerMinute,
			rate_concurrent_requests: rate.concurrentRequests,
			rate_fail_closed: form.rateFailClosed,
			rate_counting: form.rateCounting,
		} : {}),
		enabled: form.enabled,
		name: form.name,
		description: form.description || null,
		privacy_enable_paid_may_train: form.privacyEnablePaidMayTrain,
		privacy_enable_free_may_train: form.privacyEnableFreeMayTrain,
		privacy_enable_free_may_publish_prompts: form.privacyEnableFreeMayPublishPrompts,
		privacy_enable_input_output_logging: form.privacyEnableInputOutputLogging,
		privacy_zdr_only: form.privacyZdrOnly,
		provider_restriction_mode: form.providerRestrictionMode,
		provider_restriction_provider_ids: form.providerRestrictionProviderIds,
		provider_restriction_enforce_allowed: form.providerRestrictionEnforceAllowed,
		model_restriction_mode: form.modelRestrictionMode,
		allowed_api_model_ids: form.allowedApiModelIds,
		prompt_injection_enabled: form.promptInjectionEnabled,
		prompt_injection_action: form.promptInjectionAction,
		sensitive_info_enabled: form.sensitiveInfoEnabled,
		sensitive_info_default_action: form.sensitiveInfoDefaultAction,
		sensitive_info_rules: form.sensitiveInfoRules,
	};
}

export type WizardAssignRow = GuardrailAssignmentRow & {
	selected: boolean;
	/** Set on a row a broader selection already covers: the whole workspace, one of its departments or its key's principal member. */
	coveredVia: { level: "workspace" } | { level: "department" | "member"; id: string; name: string } | null;
	/** What the row's guardrails add up to with the new one, or null when the new one won't apply to it. */
	after: EffectiveGuardrailPolicy | null;
	/** Whether the new guardrail tightens anything for this row. */
	changes: boolean;
};

/** Who the new guardrail is assigned to. */
export type WizardSelection = { workspaceAssigned: boolean; departmentIds: string[]; memberIds: string[]; keyIds: string[] };

/** Whether two policies enforce the same rules; how many guardrails produce them doesn't matter. */
function sameRules(a: EffectiveGuardrailPolicy, b: EffectiveGuardrailPolicy): boolean {
	const { activeCount: _a, ...left } = a;
	const { activeCount: _b, ...right } = b;
	return JSON.stringify(left) === JSON.stringify(right);
}

export function buildWizardAssignRows(args: GuardrailAssignmentData & AssignmentRowLabels & WizardSelection & {
	targetType: AssignmentTargetType;
	draft: SettingsGuardrailRow;
}): WizardAssignRow[] {
	const rows = buildGuardrailAssignmentRows(args);
	const guardrailById = new Map(args.guardrails.map((guardrail) => [guardrail.id, guardrail]));
	const memberById = new Map(args.members.map((member) => [member.id, member]));
	const departmentById = new Map((args.departments ?? []).map((department) => [department.id, department]));
	const principalByKeyId = new Map(args.keys.map((key) => [key.id, key.principalUserId ?? null]));
	const selectedIds = new Set(args.targetType === "key" ? args.keyIds : args.targetType === "member" ? args.memberIds : args.targetType === "department" ? args.departmentIds : []);
	const departmentIds = new Set(args.departmentIds);
	const memberIds = new Set(args.memberIds);
	const coveredBy = (row: GuardrailAssignmentRow): WizardAssignRow["coveredVia"] => {
		if (args.workspaceAssigned) return { level: "workspace" };
		if (row.type === "key") {
			const principalId = principalByKeyId.get(row.id) ?? null;
			const principal = principalId && memberIds.has(principalId) ? memberById.get(principalId) : undefined;
			if (principal) return { level: "member", id: principal.id, name: principal.name };
		}
		const scopes = row.type === "key" ? args.keyDepartmentIds?.[row.id] : row.type === "member" ? args.memberDepartmentIds?.[row.id] : undefined;
		const department = (scopes ?? []).map((id) => departmentIds.has(id) ? departmentById.get(id) : undefined).find(Boolean);
		return department ? { level: "department", id: department.id, name: department.name } : null;
	};
	return rows.map((row) => {
		const selected = row.type === "workspace" ? args.workspaceAssigned : selectedIds.has(row.id);
		const coveredVia = row.type === "workspace" ? null : coveredBy(row);
		if (!selected && !coveredVia) return { ...row, selected, coveredVia, after: null, changes: false };
		const current = row.guardrails.map((guardrail) => guardrailById.get(guardrail.id)).filter((guardrail): guardrail is SettingsGuardrailRow => Boolean(guardrail));
		const after = effectiveGuardrailPolicy([...current, args.draft]);
		return { ...row, selected, coveredVia, after, changes: sameRules(after, row.effective) === false };
	});
}

/** One plain-language line of what the guardrail does, as a message key plus its values. */
export type WizardSummaryLine = { key: string; values?: Record<string, string | number> };

export function describeGuardrail(form: GuardrailWizardForm, sections: WizardSection[]): WizardSummaryLine[] {
	const lines: WizardSummaryLine[] = [];
	if (sections.includes("access")) {
		if (form.privacyZdrOnly) lines.push({ key: "summaryZdr" });
		if (!form.privacyEnablePaidMayTrain) lines.push({ key: "summaryNoPaidTraining" });
		if (!form.privacyEnableFreeMayTrain) lines.push({ key: "summaryNoFreeTraining" });
		if (!form.privacyEnableFreeMayPublishPrompts) lines.push({ key: "summaryNoPublishing" });
		if (!form.privacyEnableInputOutputLogging) lines.push({ key: "summaryNoLogging" });
		if (form.providerRestrictionMode === "allowlist") lines.push({ key: "summaryProvidersAllowed", values: { count: form.providerRestrictionProviderIds.length } });
		else if (form.providerRestrictionMode === "blocklist" && form.providerRestrictionProviderIds.length) lines.push({ key: "summaryProvidersBlocked", values: { count: form.providerRestrictionProviderIds.length } });
		if (form.modelRestrictionMode === "allowlist") lines.push({ key: "summaryModelsAllowed", values: { count: form.allowedApiModelIds.length } });
		else if (form.modelRestrictionMode === "blocklist" && form.allowedApiModelIds.length) lines.push({ key: "summaryModelsBlocked", values: { count: form.allowedApiModelIds.length } });
	}
	if (sections.includes("prompt-injection") && form.promptInjectionEnabled) {
		lines.push({ key: "summaryPromptInjection", values: { action: form.promptInjectionAction } });
	}
	if (sections.includes("sensitive-info") && form.sensitiveInfoEnabled) {
		const enabled = form.sensitiveInfoRules.filter((rule) => rule.enabled);
		if (enabled.length) lines.push({ key: "summarySensitiveInfo", values: { count: enabled.length } });
	}
	if (sections.includes("rate")) {
		const limits = rateLimits(form);
		if (limits?.requestsPerMinute != null) lines.push({ key: "summaryRateRequests", values: { count: limits.requestsPerMinute } });
		if (limits?.tokensPerMinute != null) lines.push({ key: "summaryRateTokens", values: { count: limits.tokensPerMinute } });
		if (limits?.concurrentRequests != null) lines.push({ key: "summaryRateConcurrent", values: { count: limits.concurrentRequests } });
		if (form.rateCounting) lines.push({ key: `summaryRateCounting.${form.rateCounting}` });
		if (form.rateFailClosed) lines.push({ key: "summaryRateFailClosed" });
	}
	if (sections.includes("spend")) {
		const limit = parseSpendLimit(form.spendLimit);
		if (typeof limit === "number" && form.spendPeriod) {
			lines.push({ key: `summarySpendLimit.${form.spendPeriod}`, values: { amount: formatUsd(limit) } });
		}
		if (form.spendAction) lines.push({ key: `summarySpendAction.${form.spendAction}` });
		if (form.spendCounting) lines.push({ key: `summarySpendCounting.${form.spendCounting}` });
	}
	return lines;
}
