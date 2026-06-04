import type {
	SensitiveInfoAction,
	SensitiveInfoRuleId,
	SensitiveInfoCustomRulePayload,
	SensitiveInfoRulePayload,
} from "@/app/(dashboard)/settings/guardrails/actions";

export type SensitiveInfoRuleDefinition = {
	id: SensitiveInfoRuleId;
	label: string;
	description: string;
	placeholder: string;
	addsLatency: boolean;
	defaultEnabled: boolean;
};

type SensitiveInfoMatch = {
	ruleId: string;
	label: string;
	action: SensitiveInfoAction;
	start: number;
	end: number;
	match: string;
	placeholder: string;
};

type SensitiveInfoDetectorConfig = SensitiveInfoRuleDefinition & {
	regex: RegExp;
	validate?: (value: string) => boolean;
};

const RULES: SensitiveInfoDetectorConfig[] = [
	{
		id: "email_address",
		label: "Email address",
		description: "Detect standard email addresses.",
		placeholder: "[EMAIL]",
		addsLatency: false,
		defaultEnabled: true,
		regex: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
	},
	{
		id: "phone_number",
		label: "Phone number",
		description: "Detect common international phone-number formats.",
		placeholder: "[PHONE]",
		addsLatency: false,
		defaultEnabled: true,
		regex: /(?:(?<!\w)(?:\+?\d[\d().\-\s]{6,}\d))(?!\w)/g,
		validate: (value) => {
			const digits = value.replace(/\D/g, "");
			return digits.length >= 7 && digits.length <= 15 && !looksLikeIpv4(value);
		},
	},
	{
		id: "ssn",
		label: "Social Security number",
		description: "Detect US Social Security numbers.",
		placeholder: "[SSN]",
		addsLatency: false,
		defaultEnabled: true,
		regex: /\b(?!000|666|9\d\d)(\d{3})[- ]?(?!00)(\d{2})[- ]?(?!0000)(\d{4})\b/g,
	},
	{
		id: "credit_card_number",
		label: "Credit card number",
		description: "Detect payment-card numbers with Luhn validation.",
		placeholder: "[CREDIT_CARD]",
		addsLatency: false,
		defaultEnabled: true,
		regex: /\b(?:\d[ -]*?){13,19}\b/g,
		validate: (value) => {
			const digits = value.replace(/\D/g, "");
			return digits.length >= 13 && digits.length <= 19 && passesLuhn(digits);
		},
	},
	{
		id: "ip_address",
		label: "IP address",
		description: "Detect IPv4 addresses.",
		placeholder: "[IP_ADDRESS]",
		addsLatency: false,
		defaultEnabled: true,
		regex: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
		validate: (value) =>
			value
				.split(".")
				.every((part) => Number(part) >= 0 && Number(part) <= 255),
	},
	{
		id: "person_name",
		label: "Person name",
		description: "Detect contextual person names.",
		placeholder: "[PERSON_NAME]",
		addsLatency: true,
		defaultEnabled: false,
		regex: /$^/g,
	},
	{
		id: "physical_address",
		label: "Physical address",
		description: "Detect contextual postal addresses.",
		placeholder: "[ADDRESS]",
		addsLatency: true,
		defaultEnabled: false,
		regex: /$^/g,
	},
];

const RULE_BY_ID = new Map(RULES.map((rule) => [rule.id, rule] as const));
const CUSTOM_RULE_FLAGS = new Set(["g", "i", "m", "s", "u"]);

export function getSensitiveInfoRuleDefinitions(): SensitiveInfoRuleDefinition[] {
	return RULES.map(({ regex: _regex, validate: _validate, ...rule }) => rule);
}

export function getDefaultSensitiveInfoRules(
	defaultAction: SensitiveInfoAction = "redact",
): SensitiveInfoRulePayload[] {
	return RULES.map((rule) => ({
		id: rule.id,
		kind: "builtin",
		enabled: rule.defaultEnabled,
		action: defaultAction,
	}));
}

export function normalizeSensitiveInfoAction(value: unknown): SensitiveInfoAction {
	const normalized = String(value ?? "redact").trim().toLowerCase();
	if (normalized === "flag" || normalized === "redact" || normalized === "block") {
		return normalized;
	}
	return "redact";
}

function normalizeCustomRuleFlags(value: unknown): string {
	const raw = String(value ?? "")
		.trim()
		.toLowerCase();
	if (!raw) return "";

	let normalized = "";
	for (const flag of raw) {
		if (!CUSTOM_RULE_FLAGS.has(flag)) {
			throw new Error("Custom regex flags can only use g, i, m, s, or u.");
		}
		if (flag !== "g" && !normalized.includes(flag)) {
			normalized += flag;
		}
	}
	return normalized;
}

function buildCustomRulePlaceholder(name: string): string {
	const token = name
		.trim()
		.toUpperCase()
		.replace(/[^A-Z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "")
		.slice(0, 24);
	return `[${token || "CUSTOM_PATTERN"}]`;
}

export function validateSensitiveInfoRulePayload(
	rule: SensitiveInfoRulePayload,
): string | null {
	if (rule.kind !== "custom") return null;

	const name = String(rule.name ?? "").trim();
	if (!name) return "Custom patterns must include a name.";
	const pattern = String(rule.pattern ?? "").trim();
	if (!pattern) return `Custom pattern "${name}" must include a regex pattern.`;

	try {
		const flags = normalizeCustomRuleFlags(rule.flags);
		new RegExp(pattern, flags.includes("g") ? flags : `${flags}g`);
		return null;
	} catch (error) {
		if (error instanceof Error && error.message) return error.message;
		return `Custom pattern "${name}" has an invalid regex.`;
	}
}

function buildCustomRuleRegex(
	rule: SensitiveInfoCustomRulePayload,
): RegExp | null {
	const issue = validateSensitiveInfoRulePayload(rule);
	if (issue) return null;
	try {
		const flags = normalizeCustomRuleFlags(rule.flags);
		return new RegExp(rule.pattern, flags.includes("g") ? flags : `${flags}g`);
	} catch {
		return null;
	}
}

function passesLuhn(digits: string): boolean {
	let sum = 0;
	let doubleDigit = false;
	for (let index = digits.length - 1; index >= 0; index -= 1) {
		let digit = Number(digits[index]);
		if (!Number.isFinite(digit)) return false;
		if (doubleDigit) {
			digit *= 2;
			if (digit > 9) digit -= 9;
		}
		sum += digit;
		doubleDigit = !doubleDigit;
	}
	return sum > 0 && sum % 10 === 0;
}

function looksLikeIpv4(value: string): boolean {
	const parts = value.trim().split(".");
	return (
		parts.length === 4 &&
		parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) >= 0 && Number(part) <= 255)
	);
}

function collectEntityLikeMatches(
	text: string,
	ruleId: SensitiveInfoRuleId,
): Array<{ start: number; end: number; match: string }> {
	if (ruleId === "person_name") {
		const patterns = [
			/\b(?:my name is|i am|i'm|this is|contact|attn\.?|attention:)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\b/gi,
			/\b(?:Mr|Mrs|Ms|Miss|Dr)\.?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\b/g,
		];
		const matches: Array<{ start: number; end: number; match: string }> = [];
		for (const regex of patterns) {
			for (const candidate of text.matchAll(regex)) {
				const full = candidate[0];
				const name = candidate[1];
				if (!full || !name || typeof candidate.index !== "number") continue;
				const offset = full.indexOf(name);
				if (offset < 0) continue;
				matches.push({
					start: candidate.index + offset,
					end: candidate.index + offset + name.length,
					match: name,
				});
			}
		}
		return matches;
	}

	const patterns = [
		/\b\d{1,5}\s+[A-Za-z0-9.'-]+(?:\s+[A-Za-z0-9.'-]+){0,5}\s+(?:Street|St|Avenue|Ave|Road|Rd|Lane|Ln|Drive|Dr|Boulevard|Blvd|Court|Ct|Way|Place|Pl|Terrace|Ter)\b(?:,?\s+[A-Za-z .'-]+,\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?)?/g,
		/\bP\.?\s*O\.?\s+Box\s+\d+\b(?:,?\s+[A-Za-z .'-]+,\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?)?/gi,
	];
	const matches: Array<{ start: number; end: number; match: string }> = [];
	for (const regex of patterns) {
		for (const candidate of text.matchAll(regex)) {
			const match = candidate[0];
			if (!match || typeof candidate.index !== "number") continue;
			matches.push({
				start: candidate.index,
				end: candidate.index + match.length,
				match,
			});
		}
	}
	return matches;
}

function analyzeSensitiveInfo(
	text: string,
	rules: SensitiveInfoRulePayload[],
): SensitiveInfoMatch[] {
	const matches: SensitiveInfoMatch[] = [];
	for (const rule of rules) {
		if (!rule.enabled) continue;
		let regex: RegExp | null = null;
		let label = "";
		let placeholder = "";
		let validator: ((value: string) => boolean) | undefined;
		let entityRuleId: SensitiveInfoRuleId | null = null;

		if (rule.kind === "custom") {
			regex = buildCustomRuleRegex(rule);
			label = rule.name.trim();
			placeholder = buildCustomRulePlaceholder(rule.name);
		} else {
			const config = RULE_BY_ID.get(rule.id);
			if (!config) continue;
			if (rule.id === "person_name" || rule.id === "physical_address") {
				entityRuleId = rule.id;
			} else {
				regex = new RegExp(
					config.regex.source,
					config.regex.flags.includes("g")
						? config.regex.flags
						: `${config.regex.flags}g`,
				);
			}
			label = config.label;
			placeholder = config.placeholder;
			validator = config.validate;
		}
		if (!regex && !entityRuleId) continue;
		if (entityRuleId) {
			for (const candidate of collectEntityLikeMatches(text, entityRuleId)) {
				matches.push({
					ruleId: rule.id,
					label,
					action: normalizeSensitiveInfoAction(rule.action),
					start: candidate.start,
					end: candidate.end,
					match: candidate.match,
					placeholder,
				});
			}
			continue;
		}
		if (!regex) continue;
		for (const candidate of text.matchAll(regex)) {
			if (typeof candidate.index !== "number") continue;
			const match = candidate[0];
			if (!match) continue;
			if (validator && !validator(match)) continue;
			matches.push({
				ruleId: rule.id,
				label,
				action: normalizeSensitiveInfoAction(rule.action),
				start: candidate.index,
				end: candidate.index + match.length,
				match,
				placeholder,
			});
		}
	}
	const seen = new Set<string>();
	return matches
		.slice()
		.sort((a, b) => a.start - b.start || a.end - b.end)
		.filter((match) => {
			const key = `${match.ruleId}:${match.start}:${match.end}:${match.match}`;
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		});
}

function redactText(text: string, matches: SensitiveInfoMatch[]): string {
	let cursor = 0;
	let output = "";
	for (const match of matches) {
		if (match.start < cursor) continue;
		output += text.slice(cursor, match.start);
		output += match.placeholder;
		cursor = match.end;
	}
	output += text.slice(cursor);
	return output;
}

export function buildSensitiveInfoPreview(args: {
	text: string;
	rules: SensitiveInfoRulePayload[];
}) {
	const matches = analyzeSensitiveInfo(args.text, args.rules);
	const actions = Array.from(new Set(matches.map((match) => match.action)));
	const action: SensitiveInfoAction | null = actions.includes("block")
		? "block"
		: actions.includes("redact")
			? "redact"
			: actions.includes("flag")
				? "flag"
				: null;
	const redactMatches = matches.filter((match) => match.action === "redact");

	return {
		action,
		matches,
		redactedText:
			action === "redact" && redactMatches.length > 0
				? redactText(args.text, redactMatches)
				: args.text,
	};
}
