import type {
	SettingsGuardrailKey,
	SettingsGuardrailMember,
	SettingsGuardrailRow,
} from "@/lib/fetchers/internal/settingsTypes";
import {
	buildGuardrailAssignmentRows,
	effectiveGuardrailPolicy,
	type AssignmentTargetType,
	type EffectiveGuardrailPolicy,
	type GuardrailAssignmentRow,
} from "./guardrailAssignments";
import type {
	PromptInjectionAction,
	ProviderRestrictionMode,
	SensitiveInfoAction,
	SensitiveInfoRulePayload,
} from "@/app/(dashboard)/settings/guardrails/actions";
import { validateSensitiveInfoRulePayload } from "./sensitiveInfoPreview";

// Pure state for the new-guardrail flow: start (name + what it does), configure (only the chosen
// sections), assign (keys and members) and review. Kept out of the editor so it can be tested.

export const WIZARD_STEPS = ["start", "configure", "assign", "review"] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];

export const WIZARD_SECTIONS = ["access", "prompt-injection", "sensitive-info"] as const;
export type WizardSection = (typeof WIZARD_SECTIONS)[number];

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
	keyIds: string[];
	memberIds: string[];
};

export const GUARDRAIL_TEMPLATE_IDS = [
	"zdr",
	"no-training",
	"approved-providers",
	"approved-models",
	"block-prompt-injection",
	"redact-personal-info",
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

const SECTION_FIELDS: Record<WizardSection, ReadonlyArray<keyof GuardrailWizardForm>> = {
	access: ACCESS_FIELDS,
	"prompt-injection": PROMPT_INJECTION_FIELDS,
	"sensitive-info": SENSITIVE_INFO_FIELDS,
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
	| { sensitiveRule: string };

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
export function draftGuardrailRow(form: GuardrailWizardForm, id = "draft"): SettingsGuardrailRow {
	return {
		id,
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
	/** Set on a key whose principal member is selected: the gateway applies the guardrail through them. */
	coveredVia: { id: string; name: string } | null;
	/** What the row's guardrails add up to with the new one, or null when the new one won't apply to it. */
	after: EffectiveGuardrailPolicy | null;
	/** Whether the new guardrail tightens anything for this row. */
	changes: boolean;
};

/** Whether two policies enforce the same rules; how many guardrails produce them doesn't matter. */
function sameRules(a: EffectiveGuardrailPolicy, b: EffectiveGuardrailPolicy): boolean {
	const { activeCount: _a, ...left } = a;
	const { activeCount: _b, ...right } = b;
	return JSON.stringify(left) === JSON.stringify(right);
}

export function buildWizardAssignRows(args: {
	targetType: AssignmentTargetType;
	keys: SettingsGuardrailKey[];
	members: SettingsGuardrailMember[];
	guardrails: SettingsGuardrailRow[];
	guardrailKeyIdsByGuardrailId: Record<string, string[]>;
	guardrailMemberIdsByGuardrailId: Record<string, string[]>;
	draft: SettingsGuardrailRow;
	keyIds: string[];
	memberIds: string[];
	untitled: string;
}): WizardAssignRow[] {
	const rows = buildGuardrailAssignmentRows(args);
	const guardrailById = new Map(args.guardrails.map((guardrail) => [guardrail.id, guardrail]));
	const memberById = new Map(args.members.map((member) => [member.id, member]));
	const principalByKeyId = new Map(args.keys.map((key) => [key.id, key.principalUserId ?? null]));
	const keyIds = new Set(args.keyIds);
	const memberIds = new Set(args.memberIds);
	return rows.map((row) => {
		const selected = row.type === "key" ? keyIds.has(row.id) : memberIds.has(row.id);
		const principalId = row.type === "key" ? principalByKeyId.get(row.id) ?? null : null;
		const principal = principalId && memberIds.has(principalId) ? memberById.get(principalId) : undefined;
		const coveredVia = principal ? { id: principal.id, name: principal.name } : null;
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
	return lines;
}
