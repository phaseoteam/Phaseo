import type { Endpoint } from "@core/types";
import { buildGuardrailEnforcementPayload, mergeGuardrailEnforcements } from "./guardrailEnforcement";
import { err } from "./http";
import type {
	GuardrailEnforcementDetection,
	GuardrailEnforcementPayload,
	SensitiveInfoAction,
	SensitiveInfoBuiltinRuleId,
	SensitiveInfoCustomRule,
	SensitiveInfoRule,
	WorkspacePolicy,
} from "./types";

type TextTarget = {
	path: Array<string | number>;
	text: string;
};

type SensitiveInfoDetectorConfig = {
	id: SensitiveInfoBuiltinRuleId;
	category: string;
	placeholder: string;
	regex: RegExp;
	validate?: (value: string) => boolean;
};

type SensitiveInfoMatch = GuardrailEnforcementDetection & {
	start: number;
	end: number;
	text: string;
	ruleId: string;
	action: SensitiveInfoAction;
	placeholder: string;
};

const SENSITIVE_INFO_RULES: Record<
	SensitiveInfoBuiltinRuleId,
	SensitiveInfoDetectorConfig
> = {
	email_address: {
		id: "email_address",
		category: "contact_data",
		placeholder: "[EMAIL]",
		regex: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
	},
	phone_number: {
		id: "phone_number",
		category: "contact_data",
		placeholder: "[PHONE]",
		regex:
			/(?:(?<!\w)(?:\+?\d[\d().\-\s]{6,}\d))(?!\w)/g,
		validate: (value) => {
			const digits = value.replace(/\D/g, "");
			return digits.length >= 7 && digits.length <= 15 && !looksLikeIpv4(value);
		},
	},
	ssn: {
		id: "ssn",
		category: "government_identifier",
		placeholder: "[SSN]",
		regex: /\b(?!000|666|9\d\d)(\d{3})[- ]?(?!00)(\d{2})[- ]?(?!0000)(\d{4})\b/g,
	},
	credit_card_number: {
		id: "credit_card_number",
		category: "payment_card",
		placeholder: "[CREDIT_CARD]",
		regex: /\b(?:\d[ -]*?){13,19}\b/g,
		validate: (value) => {
			const digits = value.replace(/\D/g, "");
			return digits.length >= 13 && digits.length <= 19 && passesLuhn(digits);
		},
	},
	ip_address: {
		id: "ip_address",
		category: "network_address",
		placeholder: "[IP_ADDRESS]",
		regex: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
		validate: (value) =>
			value
				.split(".")
				.every((part) => Number(part) >= 0 && Number(part) <= 255),
	},
	person_name: {
		id: "person_name",
		category: "person_name",
		placeholder: "[PERSON_NAME]",
		regex: /$^/,
	},
	physical_address: {
		id: "physical_address",
		category: "physical_address",
		placeholder: "[ADDRESS]",
		regex: /$^/,
	},
};
const CUSTOM_RULE_FLAGS = new Set(["g", "i", "m", "s", "u"]);

function cloneJson<T>(value: T): T {
	if (typeof structuredClone === "function") {
		return structuredClone(value);
	}
	return JSON.parse(JSON.stringify(value));
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

function normalizeCustomRuleFlags(value: unknown): string | null {
	const raw = String(value ?? "")
		.trim()
		.toLowerCase();
	if (!raw) return "";

	let normalized = "";
	for (const flag of raw) {
		if (!CUSTOM_RULE_FLAGS.has(flag)) return null;
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

function buildCustomRuleRegex(rule: SensitiveInfoCustomRule): RegExp | null {
	const name = String(rule.name ?? "").trim();
	const pattern = String(rule.pattern ?? "").trim();
	const flags = normalizeCustomRuleFlags(rule.flags);
	if (!name || !pattern || flags == null) return null;
	try {
		return new RegExp(pattern, flags.includes("g") ? flags : `${flags}g`);
	} catch {
		return null;
	}
}

function collectEntityLikeMatches(
	text: string,
	ruleId: SensitiveInfoBuiltinRuleId,
): Array<{ start: number; end: number; text: string }> {
	if (ruleId === "person_name") {
		const patterns = [
			/\b(?:my name is|i am|i'm|this is|contact|attn\.?|attention:)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\b/gi,
			/\b(?:Mr|Mrs|Ms|Miss|Dr)\.?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\b/g,
		];
		const matches: Array<{ start: number; end: number; text: string }> = [];
		for (const regex of patterns) {
			for (const candidate of text.matchAll(regex)) {
				const full = candidate[0];
				const value = candidate[1];
				if (!full || !value || typeof candidate.index !== "number") continue;
				const offset = full.indexOf(value);
				if (offset < 0) continue;
				matches.push({
					start: candidate.index + offset,
					end: candidate.index + offset + value.length,
					text: value,
				});
			}
		}
		return matches;
	}

	if (ruleId === "physical_address") {
		const patterns = [
			/\b\d{1,5}\s+[A-Za-z0-9.'-]+(?:\s+[A-Za-z0-9.'-]+){0,5}\s+(?:Street|St|Avenue|Ave|Road|Rd|Lane|Ln|Drive|Dr|Boulevard|Blvd|Court|Ct|Way|Place|Pl|Terrace|Ter)\b(?:,?\s+[A-Za-z .'-]+,\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?)?/g,
			/\bP\.?\s*O\.?\s+Box\s+\d+\b(?:,?\s+[A-Za-z .'-]+,\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?)?/gi,
		];
		const matches: Array<{ start: number; end: number; text: string }> = [];
		for (const regex of patterns) {
			for (const candidate of text.matchAll(regex)) {
				const value = candidate[0];
				if (!value || typeof candidate.index !== "number") continue;
				matches.push({
					start: candidate.index,
					end: candidate.index + value.length,
					text: value,
				});
			}
		}
		return matches;
	}

	return [];
}

function collectChatTargets(body: any): TextTarget[] {
	const targets: TextTarget[] = [];
	const messages = Array.isArray(body?.messages) ? body.messages : [];
	for (let index = 0; index < messages.length; index += 1) {
		const message = messages[index];
		const role = String(message?.role ?? "").toLowerCase();
		if (role !== "user" && role !== "tool") continue;
		const content = message?.content;
		if (typeof content === "string" && content.trim()) {
			targets.push({ path: ["messages", index, "content"], text: content });
			continue;
		}
		if (!Array.isArray(content)) continue;
		for (let partIndex = 0; partIndex < content.length; partIndex += 1) {
			const part = content[partIndex];
			if (part?.type === "text" && typeof part?.text === "string" && part.text.trim()) {
				targets.push({
					path: ["messages", index, "content", partIndex, "text"],
					text: part.text,
				});
			}
		}
	}
	return targets;
}

function collectAnthropicTargets(body: any): TextTarget[] {
	const targets: TextTarget[] = [];
	const messages = Array.isArray(body?.messages) ? body.messages : [];
	for (let index = 0; index < messages.length; index += 1) {
		const message = messages[index];
		if (String(message?.role ?? "").toLowerCase() !== "user") continue;
		const content = message?.content;
		if (typeof content === "string" && content.trim()) {
			targets.push({ path: ["messages", index, "content"], text: content });
			continue;
		}
		if (!Array.isArray(content)) continue;
		for (let partIndex = 0; partIndex < content.length; partIndex += 1) {
			const part = content[partIndex];
			if (part?.type === "text" && typeof part?.text === "string" && part.text.trim()) {
				targets.push({
					path: ["messages", index, "content", partIndex, "text"],
					text: part.text,
				});
			}
			if (
				part?.type === "tool_result" &&
				typeof part?.content === "string" &&
				part.content.trim()
			) {
				targets.push({
					path: ["messages", index, "content", partIndex, "content"],
					text: part.content,
				});
			}
		}
	}
	return targets;
}

function collectResponsesTargetsFromValue(
	value: unknown,
	path: Array<string | number>,
	targets: TextTarget[],
): void {
	if (typeof value === "string" && value.trim()) {
		targets.push({ path, text: value });
		return;
	}
	if (Array.isArray(value)) {
		value.forEach((entry, index) =>
			collectResponsesTargetsFromValue(entry, [...path, index], targets),
		);
		return;
	}
	if (!value || typeof value !== "object") return;

	const record = value as Record<string, unknown>;
	const role = typeof record.role === "string" ? record.role.toLowerCase() : null;
	if (role === "assistant" || role === "system" || role === "developer") return;
	if (typeof record.text === "string" && record.text.trim()) {
		targets.push({ path: [...path, "text"], text: record.text });
	}
	if (typeof record.content === "string" && record.content.trim()) {
		targets.push({ path: [...path, "content"], text: record.content });
	}
	if (Array.isArray(record.content)) {
		collectResponsesTargetsFromValue(record.content, [...path, "content"], targets);
	}
	if (Array.isArray(record.input)) {
		collectResponsesTargetsFromValue(record.input, [...path, "input"], targets);
	}
}

function collectResponsesTargets(body: any): TextTarget[] {
	const targets: TextTarget[] = [];
	collectResponsesTargetsFromValue(body?.input, ["input"], targets);
	return targets;
}

function collectGenericPromptTargets(body: any): TextTarget[] {
	const targets: TextTarget[] = [];
	for (const key of ["prompt", "input", "query"]) {
		const value = body?.[key];
		if (typeof value === "string" && value.trim()) {
			targets.push({ path: [key], text: value });
		}
	}
	return targets;
}

function collectSensitiveInfoTargets(endpoint: Endpoint, body: any): TextTarget[] {
	if (endpoint === "chat.completions") return collectChatTargets(body);
	if (endpoint === "messages") return collectAnthropicTargets(body);
	if (endpoint === "responses") return collectResponsesTargets(body);
	return collectGenericPromptTargets(body);
}

function setPathValue(
	root: Record<string, unknown>,
	path: Array<string | number>,
	value: string,
): void {
	let current: any = root;
	for (let index = 0; index < path.length - 1; index += 1) {
		const key = path[index];
		if (current == null) return;
		current = current[key as keyof typeof current];
	}
	const leaf = path[path.length - 1];
	if (current != null) {
		current[leaf as keyof typeof current] = value;
	}
}

function analyzeSensitiveInfoText(
	text: string,
	rules: SensitiveInfoRule[],
): SensitiveInfoMatch[] {
	const matches: SensitiveInfoMatch[] = [];
	for (const rule of rules) {
		let regex: RegExp | null = null;
		let detectorId = "";
		let category = "";
		let placeholder = "";
		let variant: GuardrailEnforcementDetection["variant"] = "regex";
		let validator: ((value: string) => boolean) | undefined;
		let entityRuleId: SensitiveInfoBuiltinRuleId | null = null;

		if (rule.kind === "custom") {
			regex = buildCustomRuleRegex(rule);
			detectorId = `custom:${rule.id}`;
			category = "custom_pattern";
			placeholder = buildCustomRulePlaceholder(rule.name);
		} else {
			const config = SENSITIVE_INFO_RULES[rule.id];
			if (!config) continue;
			detectorId = config.id;
			category = config.category;
			placeholder = config.placeholder;
			validator = config.validate;
			if (rule.id === "person_name" || rule.id === "physical_address") {
				entityRuleId = rule.id;
				variant = "entity_heuristic";
			} else {
				regex = new RegExp(
					config.regex.source,
					config.regex.flags.includes("g")
						? config.regex.flags
						: `${config.regex.flags}g`,
				);
			}
		}

		if (entityRuleId) {
			for (const match of collectEntityLikeMatches(text, entityRuleId)) {
				matches.push({
					detectorId,
					category,
					variant,
					start: match.start,
					end: match.end,
					text: match.text,
					ruleId: rule.id,
					action: rule.action,
					placeholder,
				});
			}
			continue;
		}

		if (!regex) continue;
		for (const match of text.matchAll(regex)) {
			if (typeof match.index !== "number") continue;
			const raw = match[0];
			if (!raw) continue;
			if (validator && !validator(raw)) continue;
			matches.push({
				detectorId,
				category,
				variant,
				start: match.index,
				end: match.index + raw.length,
				text: raw,
				ruleId: rule.id,
				action: rule.action,
				placeholder,
			});
		}
	}
	const seen = new Set<string>();
	return matches
		.slice()
		.sort((a, b) => a.start - b.start || a.end - b.end)
		.filter((match) => {
			const key = `${match.ruleId}:${match.start}:${match.end}:${match.text}`;
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		});
}

function redactText(text: string, matches: SensitiveInfoMatch[]): string {
	if (matches.length === 0) return text;
	const sorted = matches.slice().sort((a, b) => a.start - b.start || a.end - b.end);
	let cursor = 0;
	let output = "";
	for (const match of sorted) {
		if (match.start < cursor) continue;
		output += text.slice(cursor, match.start);
		output += match.placeholder;
		cursor = match.end;
	}
	output += text.slice(cursor);
	return output;
}

function resolveActions(matches: SensitiveInfoMatch[]): SensitiveInfoAction[] {
	return Array.from(new Set(matches.map((match) => match.action)));
}

function mostRestrictiveAction(matches: SensitiveInfoMatch[]): SensitiveInfoAction {
	const actions = resolveActions(matches);
	if (actions.includes("block")) return "block";
	if (actions.includes("redact")) return "redact";
	return "flag";
}

function buildEnforcement(args: {
	source?: GuardrailEnforcementPayload["source"];
	action: SensitiveInfoAction;
	detections: SensitiveInfoMatch[];
	guardrailIds: string[];
	redactionCount: number;
}): GuardrailEnforcementPayload {
	return buildGuardrailEnforcementPayload({
		source: args.source ?? "sensitive_info",
		action: args.action,
		actions: resolveActions(args.detections),
		detections: args.detections.map((detection) => ({
			detectorId: detection.detectorId,
			category: detection.category,
			variant: detection.variant,
		})),
		guardrailIds: args.guardrailIds,
		redactionCount: args.redactionCount,
	});
}

export function inspectSensitiveInfo(
	text: string,
	rules: SensitiveInfoRule[],
): SensitiveInfoMatch[] {
	return analyzeSensitiveInfoText(text, rules);
}

export function applySensitiveInfoGuardrails(args: {
	body: any;
	rawBody: any;
	endpoint: Endpoint;
	workspacePolicy: WorkspacePolicy | null;
	requestId: string;
	workspaceId: string;
	existingEnforcement?: GuardrailEnforcementPayload | null;
}):
	| {
			ok: true;
			body: any;
			rawBody: any;
			enforcement: GuardrailEnforcementPayload | null;
	  }
	| {
			ok: false;
			response: Response;
	  } {
	const rules = args.workspacePolicy?.sensitiveInfoRules ?? [];
	const guardrailIds = args.workspacePolicy?.sensitiveInfoGuardrailIds ?? [];
	if (rules.length === 0 || guardrailIds.length === 0) {
		return {
			ok: true,
			body: args.body,
			rawBody: args.rawBody,
			enforcement: args.existingEnforcement ?? null,
		};
	}

	const targets = collectSensitiveInfoTargets(args.endpoint, args.body);
	if (targets.length === 0) {
		return {
			ok: true,
			body: args.body,
			rawBody: args.rawBody,
			enforcement: args.existingEnforcement ?? null,
		};
	}

	const detections = targets.flatMap((target) =>
		analyzeSensitiveInfoText(target.text, rules),
	);
	if (detections.length === 0) {
		return {
			ok: true,
			body: args.body,
			rawBody: args.rawBody,
			enforcement: args.existingEnforcement ?? null,
		};
	}

	const action = mostRestrictiveAction(detections);
	const enforcement = buildEnforcement({
		action,
		detections,
		guardrailIds,
		redactionCount: 0,
	});
	const combinedEnforcement = mergeGuardrailEnforcements(
		args.existingEnforcement ?? null,
		enforcement,
	);

	if (action === "block") {
		return {
			ok: false,
			response: err("guardrail_blocked", {
				reason: "sensitive_info_detected",
				description:
					"Request blocked by sensitive info guardrail before it reached the model.",
				guardrail_enforcement: combinedEnforcement,
				details: [
					{
						message: "Sensitive information was detected in user-supplied content.",
						path: ["guardrail_enforcement"],
						keyword: "sensitive_info_detected",
						params: {
							action,
							guardrail_ids: guardrailIds,
						},
					},
				],
				request_id: args.requestId,
				workspace_id: args.workspaceId,
			}),
		};
	}

	if (action === "flag") {
		return {
			ok: true,
			body: args.body,
			rawBody: args.rawBody,
			enforcement: combinedEnforcement,
		};
	}

	const nextBody = cloneJson(args.body);
	const nextRawBody = cloneJson(args.rawBody);
	let redactionCount = 0;
	for (const target of targets) {
		const targetMatches = analyzeSensitiveInfoText(target.text, rules).filter(
			(match) => match.action === "redact",
		);
		if (targetMatches.length === 0) continue;
		const redactedText = redactText(target.text, targetMatches);
		if (redactedText === target.text) continue;
		redactionCount += targetMatches.length;
		setPathValue(nextBody, target.path, redactedText);
		setPathValue(nextRawBody, target.path, redactedText);
	}

	return {
		ok: true,
		body: nextBody,
		rawBody: nextRawBody,
		enforcement: mergeGuardrailEnforcements(
			args.existingEnforcement ?? null,
			buildEnforcement({
				action,
				detections,
				guardrailIds,
				redactionCount,
			}),
		),
	};
}
