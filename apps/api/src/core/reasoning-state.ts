// Purpose: Carry provider reasoning state (signatures, encrypted reasoning) through
//          the gateway's OpenAI-style surfaces and back to the provider that issued it.
// Why: Agent tool loops must return each model's reasoning between steps in the
//      provider's own format, and a signature must never reach another provider.
// How: Opaque values are "sealed" with the issuing format, provider and model
//      before they reach a client, and checked against the target route before
//      a request builder replays them.

import { normalizeProviderId } from "@/lib/config/providerAliases";

/**
 * Reasoning formats, named after the `format` values OpenRouter uses on
 * `reasoning_details` so clients that already round-trip that field work as is.
 */
export type ReasoningFormat =
	| "anthropic-claude-v1"
	| "openai-responses-v1"
	| "azure-openai-responses-v1"
	| "xai-responses-v1"
	| "google-gemini-v1"
	| "mistral-v1";

export const ANTHROPIC_REASONING_FORMAT: ReasoningFormat = "anthropic-claude-v1";
export const OPENAI_REASONING_FORMAT: ReasoningFormat = "openai-responses-v1";
export const AZURE_OPENAI_REASONING_FORMAT: ReasoningFormat = "azure-openai-responses-v1";
export const XAI_REASONING_FORMAT: ReasoningFormat = "xai-responses-v1";
export const GOOGLE_REASONING_FORMAT: ReasoningFormat = "google-gemini-v1";
/** Mistral ThinkChunk `signature` (https://docs.mistral.ai/capabilities/reasoning). */
export const MISTRAL_REASONING_FORMAT: ReasoningFormat = "mistral-v1";

const KNOWN_FORMATS = new Set<string>([
	ANTHROPIC_REASONING_FORMAT,
	OPENAI_REASONING_FORMAT,
	AZURE_OPENAI_REASONING_FORMAT,
	XAI_REASONING_FORMAT,
	GOOGLE_REASONING_FORMAT,
	MISTRAL_REASONING_FORMAT,
]);

export function isReasoningFormat(value: unknown): value is ReasoningFormat {
	return typeof value === "string" && KNOWN_FORMATS.has(value);
}

/**
 * What a sealed value holds:
 * - `signature`: an Anthropic thinking signature, a Gemini thought signature or a
 *   Mistral ThinkChunk signature;
 * - `redacted`: the `data` of an Anthropic `redacted_thinking` block;
 * - `encrypted`: OpenAI, Azure or xAI `encrypted_content`.
 */
export type ReasoningStateKind = "signature" | "redacted" | "encrypted";

export type ReasoningState = {
	format: ReasoningFormat;
	kind: ReasoningStateKind;
	value: string;
	/** Model that produced the value, when known. */
	model?: string;
	/** Gateway provider id that produced the value, when known. */
	provider?: string;
	/** Gemini signature that belongs on this function call rather than a thought. */
	callId?: string;
	/** True when the value arrived without a gateway seal. */
	unsealed?: boolean;
};

const SEAL_PREFIX = "phx1.";

function toBase64Url(text: string): string {
	const bytes = new TextEncoder().encode(text);
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): string | null {
	try {
		const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
		const binary = atob(padded);
		const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
		return new TextDecoder().decode(bytes);
	} catch {
		return null;
	}
}

export function isSealedReasoningValue(value: unknown): value is string {
	return typeof value === "string" && value.startsWith(SEAL_PREFIX);
}

/**
 * Seal a provider value as `phx1.<header>.<value>`. The header is a small
 * base64url JSON record; the provider value follows unchanged, so sealing
 * adds a short prefix rather than re-encoding the payload.
 */
export function sealReasoningState(state: Omit<ReasoningState, "unsealed">): string {
	if (isSealedReasoningValue(state.value)) return state.value;
	const header: Record<string, string> = { f: state.format, k: state.kind };
	if (state.model) header.m = state.model;
	if (state.provider) header.p = state.provider;
	if (state.callId) header.c = state.callId;
	return `${SEAL_PREFIX}${toBase64Url(JSON.stringify(header))}.${state.value}`;
}

/**
 * Open a value a client sent back. Unsealed values are accepted only with a
 * fallback that names the format the surface field natively carries (for
 * example raw `encrypted_content` is OpenAI's), and are marked `unsealed`.
 */
export function openReasoningState(
	raw: unknown,
	fallback?: { format?: ReasoningFormat | null; kind: ReasoningStateKind },
): ReasoningState | null {
	if (typeof raw !== "string" || raw.length === 0) return null;
	if (isSealedReasoningValue(raw)) {
		const rest = raw.slice(SEAL_PREFIX.length);
		const dot = rest.indexOf(".");
		if (dot <= 0) return null;
		const headerText = fromBase64Url(rest.slice(0, dot));
		const value = rest.slice(dot + 1);
		if (!headerText || !value) return null;
		let header: any;
		try {
			header = JSON.parse(headerText);
		} catch {
			return null;
		}
		if (!isReasoningFormat(header?.f)) return null;
		const kind = header?.k;
		if (kind !== "signature" && kind !== "redacted" && kind !== "encrypted") return null;
		return {
			format: header.f,
			kind,
			value,
			...(typeof header.m === "string" && header.m ? { model: header.m } : {}),
			...(typeof header.p === "string" && header.p ? { provider: header.p } : {}),
			...(typeof header.c === "string" && header.c ? { callId: header.c } : {}),
		};
	}
	if (!fallback?.format) return null;
	return { format: fallback.format, kind: fallback.kind, value: raw, unsealed: true };
}

function modelTail(model: string | null | undefined): string {
	const lowered = String(model ?? "").trim().toLowerCase();
	const slash = lowered.lastIndexOf("/");
	return slash >= 0 ? lowered.slice(slash + 1) : lowered;
}

export function isClaudeModelId(model: string | null | undefined): boolean {
	return /(?:^|[/.:])claude-/.test(String(model ?? "").trim().toLowerCase()) || modelTail(model).startsWith("claude-");
}

export function isGeminiModelId(model: string | null | undefined): boolean {
	return modelTail(model).replace(/^models\//, "").startsWith("gemini-");
}

/**
 * The reasoning format a provider route issues and accepts, or null when the
 * route has no replayable reasoning state.
 */
export function reasoningFormatForRoute(
	providerId: string | null | undefined,
	model?: string | null,
): ReasoningFormat | null {
	if (!providerId) return null;
	const id = normalizeProviderId(providerId);
	const claude = isClaudeModelId(model);
	switch (id) {
		case "anthropic":
		case "anthropic-us":
		case "anthropic-aws":
		case "anthropic-aws-us":
			return ANTHROPIC_REASONING_FORMAT;
		case "amazon-bedrock":
			return claude ? ANTHROPIC_REASONING_FORMAT : null;
		case "google-vertex":
		case "google-vertex-eu":
			if (claude) return ANTHROPIC_REASONING_FORMAT;
			return isGeminiModelId(model) ? GOOGLE_REASONING_FORMAT : null;
		case "azure":
			return claude ? ANTHROPIC_REASONING_FORMAT : AZURE_OPENAI_REASONING_FORMAT;
		case "openai":
		case "openai-eu":
			return OPENAI_REASONING_FORMAT;
		case "spacex-ai":
			return XAI_REASONING_FORMAT;
		case "google-ai-studio":
		case "google":
			return GOOGLE_REASONING_FORMAT;
		case "mistral":
		case "mistral-eu":
			return MISTRAL_REASONING_FORMAT;
		default:
			return null;
	}
}

/**
 * Normalised model key for comparing the model that issued reasoning state
 * with the model a request now targets. Strips gateway and platform prefixes,
 * Bedrock `-v1:0` and date suffixes, and Vertex `@date` suffixes.
 */
export function reasoningModelKey(model: string | null | undefined): string {
	let key = modelTail(model).replace(/^models\//, "");
	key = key.replace(/^(?:us|eu|apac|au|jp|global)\./, "").replace(/^anthropic\./, "");
	key = key.replace(/@.*$/, "").replace(/-v\d+(?::\d+)?$/, "");
	key = key.replace(/-\d{8}$/, "").replace(/-\d{4}-\d{2}-\d{2}$/, "");
	return key.replace(/\./g, "-");
}

// Thinking blocks from these Claude models are tied to the account that
// produced them, so they only go back to the same gateway provider.
// https://platform.claude.com/docs/en/build-with-claude/thinking#thinking-encryption
const ACCOUNT_BOUND_CLAUDE = /^claude-(?:sonnet|haiku)-5-5(?:$|-)/;

function anthropicAccount(providerId: string | null | undefined): string {
	const id = normalizeProviderId(String(providerId ?? ""));
	if (id === "anthropic-us") return "anthropic";
	if (id === "anthropic-aws-us") return "anthropic-aws";
	if (id === "google-vertex-eu") return "google-vertex";
	return id;
}

export type ReasoningTarget = { providerId: string | null | undefined; model?: string | null };

export type ReasoningOrigin = { format?: string | null; model?: string | null; provider?: string | null };

/**
 * Whether reasoning state from `origin` may be sent to `target`. The format
 * must be the one the target route issues. Within Claude, signatures are valid
 * across the Claude API, Bedrock and Vertex and across Claude models (the API
 * drops blocks a model cannot read), except for account-bound models. Other
 * formats go back only to the same model.
 */
export function canReplayReasoning(origin: ReasoningOrigin, target: ReasoningTarget): boolean {
	if (!isReasoningFormat(origin.format)) return false;
	const targetFormat = reasoningFormatForRoute(target.providerId, target.model);
	if (!targetFormat || targetFormat !== origin.format) return false;
	if (!origin.model || !target.model) return true;
	const originKey = reasoningModelKey(origin.model);
	const targetKey = reasoningModelKey(target.model);
	if (origin.format === ANTHROPIC_REASONING_FORMAT) {
		if (!originKey.startsWith("claude-") || !targetKey.startsWith("claude-")) return false;
		if (ACCOUNT_BOUND_CLAUDE.test(originKey)) {
			if (originKey !== targetKey) return false;
			if (origin.provider && anthropicAccount(origin.provider) !== anthropicAccount(target.providerId)) return false;
		}
		return true;
	}
	return originKey === targetKey;
}
