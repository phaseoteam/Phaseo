import type { Endpoint } from "@core/types";
import { err } from "./http";
import type {
	GuardrailEnforcementDetection,
	GuardrailEnforcementPayload,
	PromptInjectionAction,
	WorkspacePolicy,
} from "./types";
import { buildGuardrailEnforcementPayload } from "./guardrailEnforcement";

const PROMPT_INJECTION_PLACEHOLDER = "[PROMPT_INJECTION]";

type PromptInjectionPattern = {
	id: string;
	category: string;
	regex: RegExp;
};

type PromptInjectionMatch = GuardrailEnforcementDetection & {
	start: number;
	end: number;
};

type TextTarget = {
	path: Array<string | number>;
	text: string;
};

const DIRECT_PATTERNS: PromptInjectionPattern[] = [
	{
		id: "ignore_previous_instructions",
		category: "direct_instruction_override",
		regex:
			/ignore\s+(all\s+)?(previous|prior)\s+((?:safety|security|system|operational|internal|core|original|initial|existing|given|stated|provided|defined|specified|established)\s+)?(instructions?|rules?|guidelines?|constraints?|directives?)/i,
	},
	{
		id: "disregard_instructions",
		category: "direct_instruction_override",
		regex:
			/disregard\s+(all\s+)?(previous|prior|above)\s+(instructions?|rules?|guidelines?|constraints?|directives?)/i,
	},
	{
		id: "forget_instructions",
		category: "direct_instruction_override",
		regex:
			/forget\s+(all\s+)?(previous|prior|above)\s+(instructions?|rules?|guidelines?|constraints?|directives?)/i,
	},
	{
		id: "new_instructions",
		category: "direct_instruction_override",
		regex: /new\s+instructions?:/i,
	},
	{
		id: "developer_mode",
		category: "privileged_mode",
		regex: /you\s+are\s+now\s+(in\s+)?developer\s+mode/i,
	},
	{
		id: "activate_special_mode",
		category: "privileged_mode",
		regex: /(?:enter|activate)\s+(developer|admin|debug|maintenance|jailbreak)\s+mode/i,
	},
	{
		id: "system_override",
		category: "system_override",
		regex: /\bsystem\s+override\b/i,
	},
	{
		id: "override_instructions",
		category: "system_override",
		regex:
			/override\s+(your\s+)?(instructions?|rules?|guidelines?|constraints?|directives?)/i,
	},
	{
		id: "reveal_prompt",
		category: "prompt_extraction",
		regex:
			/reveal\s+(your\s+)?((?:(?:full|hidden|complete|internal|secret|original|entire|exact|actual|real)\s+){0,2})(system\s+)?prompt/i,
	},
	{
		id: "show_prompt",
		category: "prompt_extraction",
		regex: /show\s+(me\s+)?(your\s+)(system\s+)?prompt/i,
	},
	{
		id: "what_instructions",
		category: "prompt_extraction",
		regex: /what\s+(are|were)\s+(your\s+)?(exact\s+)?instructions/i,
	},
	{
		id: "remove_restrictions",
		category: "role_manipulation",
		regex: /you\s+are\s+no\s+longer\s+(bound|restricted|limited)/i,
	},
	{
		id: "dan_jailbreak",
		category: "dan_jailbreak",
		regex: /\bDAN\b.*\bdo\s+anything\s+now\b/,
	},
	{
		id: "jailbreak_mode",
		category: "dan_jailbreak",
		regex: /jailbreak(ed)?\s+(mode|prompt)/i,
	},
	{
		id: "bypass_safety",
		category: "safety_bypass",
		regex:
			/bypass\s+(your\s+)?(safety|security|content|ethical)\s+(filters?|measures?|guidelines?|restrictions?)/i,
	},
	{
		id: "disable_safety",
		category: "safety_bypass",
		regex: /disable\s+(your\s+)?(safety|security|content)\s+(filters?|measures?)/i,
	},
	{
		id: "system_tag_injection",
		category: "role_spoofing",
		regex: /<\s*\/?\s*system\s*\/?>/i,
	},
	{
		id: "role_tag_injection",
		category: "role_spoofing",
		regex: /<\s*\/?\s*(assistant|developer|tool|function)\s*\/?>/i,
	},
	{
		id: "role_delimiter_injection",
		category: "role_spoofing",
		regex: /\]\s*\n\s*\[?(system|assistant|user)\]?:/i,
	},
	{
		id: "system_prefix_spoofing",
		category: "role_spoofing",
		regex: /^\s*System:\s+/im,
	},
	{
		id: "control_token_injection",
		category: "control_token_injection",
		regex: /<\|(?:im_start|im_end|eot_id|start_header_id|end_header_id|endoftext)\|>/,
	},
];

const TYPOGLYCEMIA_TARGETS = [
	"ignore",
	"bypass",
	"override",
	"reveal",
	"delete",
	"system",
	"prompt",
	"instructions",
];
const TYPO_ACTION_WORDS = new Set(["ignore", "bypass", "override", "reveal", "delete"]);
const TYPO_CONTEXT_WORDS = new Set(["system", "prompt", "instructions"]);
const ENCODED_ACTION_KEYWORDS = ["ignore", "bypass", "override", "reveal"];
const ENCODED_CONTEXT_KEYWORDS = ["system", "prompt", "instructions"];

function ensureGlobalRegex(regex: RegExp): RegExp {
	const flags = regex.flags.includes("g") ? regex.flags : `${regex.flags}g`;
	return new RegExp(regex.source, flags);
}

function cloneJson<T>(value: T): T {
	if (typeof structuredClone === "function") {
		return structuredClone(value);
	}
	return JSON.parse(JSON.stringify(value));
}

function normalizeWord(value: string): string {
	return value.toLowerCase().replace(/[^a-z]/g, "");
}

function isTypoglycemiaVariant(word: string, target: string): boolean {
	if (word === target) return false;
	if (word.length !== target.length) return false;
	if (word.length < 4) return false;
	if (word[0] !== target[0] || word[word.length - 1] !== target[target.length - 1]) {
		return false;
	}
	const wordMiddle = word.slice(1, -1).split("").sort().join("");
	const targetMiddle = target.slice(1, -1).split("").sort().join("");
	return wordMiddle === targetMiddle;
}

function hasEncodedPromptInjectionSignal(value: string): boolean {
	const normalized = value.toLowerCase();
	const hasAction = ENCODED_ACTION_KEYWORDS.some((keyword) =>
		normalized.includes(keyword),
	);
	const hasContext = ENCODED_CONTEXT_KEYWORDS.some((keyword) =>
		normalized.includes(keyword),
	);
	return (
		(hasAction && hasContext) ||
		normalized.includes("developer mode") ||
		normalized.includes("system override") ||
		(normalized.includes("dan") && normalized.includes("do anything now"))
	);
}

function decodeBase64Candidate(value: string): string | null {
	try {
		const binary = atob(value);
		const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
		const decoded = new TextDecoder().decode(bytes);
		if (!decoded.trim()) return null;
		const printableChars = decoded.replace(/[^\x20-\x7E\n\r\t]/g, "");
		if (printableChars.length / decoded.length < 0.7) return null;
		return decoded;
	} catch {
		return null;
	}
}

function decodeHexCandidate(value: string): string | null {
	const normalized = value.replace(/\s+/g, "");
	if (!normalized || normalized.length % 2 !== 0) return null;
	try {
		const bytes = new Uint8Array(normalized.length / 2);
		for (let index = 0; index < normalized.length; index += 2) {
			bytes[index / 2] = Number.parseInt(normalized.slice(index, index + 2), 16);
		}
		const decoded = new TextDecoder().decode(bytes);
		if (!decoded.trim()) return null;
		const printableChars = decoded.replace(/[^\x20-\x7E\n\r\t]/g, "");
		if (printableChars.length / decoded.length < 0.7) return null;
		return decoded;
	} catch {
		return null;
	}
}

function collectDirectMatches(text: string): PromptInjectionMatch[] {
	const matches: PromptInjectionMatch[] = [];
	for (const pattern of DIRECT_PATTERNS) {
		const regex = ensureGlobalRegex(pattern.regex);
		for (const match of text.matchAll(regex)) {
			if (typeof match.index !== "number") continue;
			const raw = match[0];
			if (!raw) continue;
			matches.push({
				detectorId: pattern.id,
				category: pattern.category,
				variant: "regex",
				start: match.index,
				end: match.index + raw.length,
			});
		}
	}
	return matches;
}

function collectTypoglycemiaMatches(text: string): PromptInjectionMatch[] {
	const tokens = Array.from(text.matchAll(/[A-Za-z]{4,}/g)).map((match) => ({
		word: normalizeWord(match[0]),
		start: match.index ?? 0,
		end: (match.index ?? 0) + match[0].length,
	}));
	const suspicious = tokens
		.map((token) => {
			const target = TYPOGLYCEMIA_TARGETS.find((candidate) =>
				isTypoglycemiaVariant(token.word, candidate),
			);
			return target ? { ...token, target } : null;
		})
		.filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
	const hasActionWord = suspicious.some((entry) => TYPO_ACTION_WORDS.has(entry.target));
	const hasContextWord = suspicious.some((entry) => TYPO_CONTEXT_WORDS.has(entry.target));
	if (!hasActionWord || !hasContextWord) return [];

	return suspicious.map((entry) => ({
		detectorId: `typoglycemia_${entry.target}`,
		category: "evasion_detection",
		variant: "typoglycemia",
		start: entry.start,
		end: entry.end,
	}));
}

function collectBase64Matches(text: string): PromptInjectionMatch[] {
	const matches: PromptInjectionMatch[] = [];
	for (const candidate of text.matchAll(/\b[A-Za-z0-9+/]{16,}={0,2}\b/g)) {
		if (typeof candidate.index !== "number") continue;
		const raw = candidate[0];
		const decoded = decodeBase64Candidate(raw);
		if (!decoded || !hasEncodedPromptInjectionSignal(decoded)) continue;
		matches.push({
			detectorId: "base64_encoded_injection",
			category: "encoding_evasion",
			variant: "base64",
			start: candidate.index,
			end: candidate.index + raw.length,
		});
	}
	return matches;
}

function collectHexMatches(text: string): PromptInjectionMatch[] {
	const matches: PromptInjectionMatch[] = [];
	const regex = /\b(?:[0-9a-fA-F]{2}(?:\s+[0-9a-fA-F]{2}){3,}|[0-9a-fA-F]{12,})\b/g;
	for (const candidate of text.matchAll(regex)) {
		if (typeof candidate.index !== "number") continue;
		const raw = candidate[0];
		const decoded = decodeHexCandidate(raw);
		if (!decoded || !hasEncodedPromptInjectionSignal(decoded)) continue;
		matches.push({
			detectorId: "hex_encoded_injection",
			category: "encoding_evasion",
			variant: "hex",
			start: candidate.index,
			end: candidate.index + raw.length,
		});
	}
	return matches;
}

function collectSpacedMatches(text: string): PromptInjectionMatch[] {
	const matches: PromptInjectionMatch[] = [];
	for (const candidate of text.matchAll(/\b(?:[A-Za-z]\s+){3,}[A-Za-z]\b/g)) {
		if (typeof candidate.index !== "number") continue;
		const raw = candidate[0];
		const collapsed = raw.replace(/\s+/g, "");
		if (!hasEncodedPromptInjectionSignal(collapsed)) continue;
		matches.push({
			detectorId: "character_spaced_injection",
			category: "spacing_evasion",
			variant: "spaced",
			start: candidate.index,
			end: candidate.index + raw.length,
		});
	}
	return matches;
}

function dedupeMatches(matches: PromptInjectionMatch[]): PromptInjectionMatch[] {
	const seen = new Set<string>();
	return matches
		.slice()
		.sort((a, b) => a.start - b.start || a.end - b.end)
		.filter((match) => {
			const key = [
				match.detectorId,
				match.category,
				match.variant,
				match.start,
				match.end,
			].join(":");
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		});
}

function redactText(text: string, matches: PromptInjectionMatch[]): string {
	if (matches.length === 0) return text;
	const ranges: Array<{ start: number; end: number }> = [];
	for (const match of matches.slice().sort((a, b) => a.start - b.start || a.end - b.end)) {
		const last = ranges[ranges.length - 1];
		if (!last || match.start > last.end) {
			ranges.push({ start: match.start, end: match.end });
			continue;
		}
		last.end = Math.max(last.end, match.end);
	}

	let cursor = 0;
	let out = "";
	for (const range of ranges) {
		out += text.slice(cursor, range.start);
		out += PROMPT_INJECTION_PLACEHOLDER;
		cursor = range.end;
	}
	out += text.slice(cursor);
	return out;
}

function analyzePromptInjectionText(text: string): PromptInjectionMatch[] {
	return dedupeMatches([
		...collectDirectMatches(text),
		...collectTypoglycemiaMatches(text),
		...collectBase64Matches(text),
		...collectHexMatches(text),
		...collectSpacedMatches(text),
	]);
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

function collectPromptInjectionTargets(endpoint: Endpoint, body: any): TextTarget[] {
	if (endpoint === "chat.completions") return collectChatTargets(body);
	if (endpoint === "messages") return collectAnthropicTargets(body);
	if (endpoint === "responses" || endpoint === "interactions") return collectResponsesTargets(body);
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

function buildGuardrailEnforcement(args: {
	action: PromptInjectionAction;
	detections: PromptInjectionMatch[];
	guardrailIds: string[];
	redactionCount: number;
}): GuardrailEnforcementPayload {
	const detections = args.detections.map((detection) => ({
		detectorId: detection.detectorId,
		category: detection.category,
		variant: detection.variant,
	}));
	return buildGuardrailEnforcementPayload({
		source: "prompt_injection",
		detections,
		action: args.action,
		guardrailIds: args.guardrailIds,
		redactionCount: args.redactionCount,
	});
}

export function inspectPromptInjection(
	text: string,
): Array<GuardrailEnforcementDetection & { start: number; end: number }> {
	return analyzePromptInjectionText(text);
}

export function applyPromptInjectionGuardrails(args: {
	body: any;
	rawBody: any;
	endpoint: Endpoint;
	workspacePolicy: WorkspacePolicy | null;
	requestId: string;
	workspaceId: string;
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
	const action = args.workspacePolicy?.promptInjectionAction ?? null;
	const guardrailIds = args.workspacePolicy?.promptInjectionGuardrailIds ?? [];
	if (!action || guardrailIds.length === 0) {
		return {
			ok: true,
			body: args.body,
			rawBody: args.rawBody,
			enforcement: null,
		};
	}

	const targets = collectPromptInjectionTargets(args.endpoint, args.body);
	if (targets.length === 0) {
		return {
			ok: true,
			body: args.body,
			rawBody: args.rawBody,
			enforcement: null,
		};
	}

	const detections = targets.flatMap((target) => analyzePromptInjectionText(target.text));
	if (detections.length === 0) {
		return {
			ok: true,
			body: args.body,
			rawBody: args.rawBody,
			enforcement: null,
		};
	}

	if (action === "block") {
		const enforcement = buildGuardrailEnforcement({
			action,
			detections,
			guardrailIds,
			redactionCount: 0,
		});
		return {
			ok: false,
			response: err("guardrail_blocked", {
				reason: "prompt_injection_detected",
				description:
					"Request blocked by prompt injection guardrail before it reached the model.",
				guardrail_enforcement: enforcement,
				details: [
					{
						message: "Prompt injection patterns were detected in user-supplied content.",
						path: ["guardrail_enforcement"],
						keyword: "prompt_injection_detected",
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

	const enforcement = buildGuardrailEnforcement({
		action,
		detections,
		guardrailIds,
		redactionCount: 0,
	});
	if (action === "flag") {
		return {
			ok: true,
			body: args.body,
			rawBody: args.rawBody,
			enforcement,
		};
	}

	const nextBody = cloneJson(args.body);
	const nextRawBody = cloneJson(args.rawBody);
	let redactionCount = 0;
	for (const target of targets) {
		const targetMatches = analyzePromptInjectionText(target.text);
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
		enforcement: buildGuardrailEnforcement({
			action,
			detections,
			guardrailIds,
			redactionCount,
		}),
	};
}
