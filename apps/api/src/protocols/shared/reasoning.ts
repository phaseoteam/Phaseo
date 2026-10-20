// Purpose: Encode and decode provider reasoning state on the OpenAI-style surfaces.
// Why: Responses `reasoning` items and Chat `reasoning_details` are how agent
//      clients round-trip a model's reasoning between tool-loop steps.
// How: Reasoning parts carrying state are written with a sealed value (see
//      core/reasoning-state.ts) and read back into IR reasoning parts or Gemini
//      function-call signatures.

import type { IRContentPart, IRToolCall } from "@core/ir";
import type { GatewayReasoningDetail } from "@core/types";
import {
	ANTHROPIC_REASONING_FORMAT,
	GOOGLE_REASONING_FORMAT,
	OPENAI_REASONING_FORMAT,
	isReasoningFormat,
	openReasoningState,
	reasoningFormatForRoute,
	sealReasoningState,
	type ReasoningFormat,
	type ReasoningState,
	type ReasoningStateKind,
} from "@core/reasoning-state";

export type ReasoningPart = Extract<IRContentPart, { type: "reasoning_text" }>;

/** Where the response came from, used when a part does not name its origin. */
export type ReasoningResponseOrigin = { provider?: string | null; model?: string | null };

export type ToolCallSignature = { signature: string; model?: string };

function partStateKind(part: ReasoningPart): { kind: ReasoningStateKind; value: string } | null {
	if (part.redactedData) return { kind: "redacted", value: part.redactedData };
	if (part.encryptedContent) return { kind: "encrypted", value: part.encryptedContent };
	if (part.thoughtSignature) return { kind: "signature", value: part.thoughtSignature };
	return null;
}

function resolvePartFormat(part: ReasoningPart, origin?: ReasoningResponseOrigin): ReasoningFormat | null {
	if (isReasoningFormat(part.reasoningFormat)) return part.reasoningFormat;
	return reasoningFormatForRoute(origin?.provider ?? null, part.reasoningModel ?? origin?.model ?? null);
}

/** Format a reasoning part belongs to, or null when it is plain text. */
export function reasoningPartFormat(part: ReasoningPart, origin?: ReasoningResponseOrigin): ReasoningFormat | null {
	if (isReasoningFormat(part.reasoningFormat)) return part.reasoningFormat;
	return partStateKind(part) ? resolvePartFormat(part, origin) : null;
}

/** The sealed value a client should send back for this part, if it has state. */
export function sealReasoningPart(part: ReasoningPart, origin?: ReasoningResponseOrigin): string | null {
	const state = partStateKind(part);
	if (!state) return null;
	const format = resolvePartFormat(part, origin);
	if (!format) return null;
	return sealReasoningState({
		format,
		kind: state.kind,
		value: state.value,
		model: part.reasoningModel ?? origin?.model ?? undefined,
		provider: part.reasoningProvider ?? origin?.provider ?? undefined,
	});
}

/** The sealed value for a Gemini function-call signature, if any. */
export function sealToolCallSignature(call: IRToolCall, origin?: ReasoningResponseOrigin): string | null {
	if (!call.thoughtSignature) return null;
	return sealReasoningState({
		format: GOOGLE_REASONING_FORMAT,
		kind: "signature",
		value: call.thoughtSignature,
		model: call.thoughtSignatureModel ?? origin?.model ?? undefined,
		provider: origin?.provider ?? undefined,
		callId: call.id,
	});
}

/** A reasoning part rebuilt from an opened state value. */
export function reasoningPartFromState(
	state: ReasoningState,
	text: string,
	extra?: { summary?: string; reasoningId?: string },
): ReasoningPart {
	return {
		type: "reasoning_text",
		text,
		...(extra?.summary ? { summary: extra.summary } : {}),
		...(state.kind === "signature" ? { thoughtSignature: state.value } : {}),
		...(state.kind === "redacted" ? { redactedData: state.value } : {}),
		...(state.kind === "encrypted" ? { encryptedContent: state.value } : {}),
		reasoningFormat: state.format,
		...(state.model ? { reasoningModel: state.model } : {}),
		...(state.provider ? { reasoningProvider: state.provider } : {}),
		...(extra?.reasoningId ? { reasoningId: extra.reasoningId } : {}),
	};
}

// ---------------------------------------------------------------------------
// Responses `reasoning` items
// ---------------------------------------------------------------------------

export type ResponsesReasoningItem = {
	type: "reasoning";
	id: string;
	summary: Array<{ type: "summary_text"; text: string }>;
	content: Array<{ type: "reasoning_text"; text: string }>;
	encrypted_content?: string;
	status?: "completed";
};

export function encodeResponsesReasoningItem(
	part: ReasoningPart,
	fallbackId: string,
	origin?: ReasoningResponseOrigin,
): ResponsesReasoningItem {
	const sealed = sealReasoningPart(part, origin);
	return {
		type: "reasoning",
		id: part.reasoningId ?? fallbackId,
		summary: part.summary ? [{ type: "summary_text", text: part.summary }] : [],
		// Reasoning text is a reasoning_text content part, as OpenAI's Responses API types it.
		content: part.text ? [{ type: "reasoning_text", text: part.text }] : [],
		...(sealed ? { encrypted_content: sealed } : {}),
	};
}

/** A reasoning item that only carries a Gemini function-call signature. */
export function encodeResponsesToolSignatureItem(
	call: IRToolCall,
	origin?: ReasoningResponseOrigin,
): ResponsesReasoningItem | null {
	const sealed = sealToolCallSignature(call, origin);
	if (!sealed) return null;
	return { type: "reasoning", id: `rs_${call.id}`, summary: [], content: [], encrypted_content: sealed };
}

function textsOf(value: unknown): string {
	if (!Array.isArray(value)) return typeof value === "string" ? value : "";
	return value
		.map((entry: any) => (typeof entry === "string" ? entry : typeof entry?.text === "string" ? entry.text : ""))
		.join("");
}

export type DecodedResponsesReasoning =
	| { kind: "part"; part: ReasoningPart }
	| { kind: "tool_signature"; callId: string; signature: ToolCallSignature }
	| null;

/**
 * Decode a Responses `reasoning` item from a request. Raw `encrypted_content`
 * without a gateway seal is treated as OpenAI's, the format that field carries.
 */
export function decodeResponsesReasoningItem(item: any): DecodedResponsesReasoning {
	if (!item || typeof item !== "object") return null;
	const contentText = textsOf(item.content);
	const summaryText = textsOf(item.summary);
	const text = contentText || summaryText;
	const reasoningId = typeof item.id === "string" && item.id ? item.id : undefined;
	const state = openReasoningState(item.encrypted_content, { format: OPENAI_REASONING_FORMAT, kind: "encrypted" });
	if (!state) {
		if (!text) return null;
		return {
			kind: "part",
			part: { type: "reasoning_text", text, ...(summaryText ? { summary: summaryText } : {}) },
		};
	}
	if (state.format === GOOGLE_REASONING_FORMAT && state.callId) {
		return {
			kind: "tool_signature",
			callId: state.callId,
			signature: { signature: state.value, ...(state.model ? { model: state.model } : {}) },
		};
	}
	return {
		kind: "part",
		part: reasoningPartFromState(state, text, { summary: summaryText || undefined, reasoningId }),
	};
}

// ---------------------------------------------------------------------------
// Chat `reasoning_details`
// ---------------------------------------------------------------------------

/**
 * Chat `reasoning_details` in the convention OpenRouter uses:
 * `reasoning.text` (text plus optional `signature`), `reasoning.encrypted`
 * (`data`, with `id` naming the tool call for Gemini) and `reasoning.summary`.
 */
export function encodeChatReasoningDetails(
	parts: IRContentPart[],
	toolCalls: IRToolCall[] | undefined,
	idPrefix: string,
	origin?: ReasoningResponseOrigin,
): GatewayReasoningDetail[] {
	const details: GatewayReasoningDetail[] = [];
	const push = (detail: Omit<GatewayReasoningDetail, "index">) => {
		details.push({ ...detail, index: details.length } as GatewayReasoningDetail);
	};
	for (const part of Array.isArray(parts) ? parts : []) {
		if (part.type === "provider_block" && part.block?.type === "thinking" && typeof part.block.thinking === "string" && part.block.thinking) {
			push({ id: `${idPrefix}-${details.length + 1}`, type: "reasoning.text", text: part.block.thinking, format: "unknown" });
			continue;
		}
		if (part.type !== "reasoning_text") continue;
		const format = reasoningPartFormat(part, origin);
		const sealed = sealReasoningPart(part, origin);
		const id = part.reasoningId ?? `${idPrefix}-${details.length + 1}`;
		if (part.redactedData && sealed) {
			push({ id, type: "reasoning.encrypted", data: sealed, format: format ?? "unknown" });
			continue;
		}
		if (part.encryptedContent && sealed) {
			if (part.text) push({ id, type: part.summary ? "reasoning.summary" : "reasoning.text", ...(part.summary ? { summary: part.text } : { text: part.text }), format: format ?? "unknown" });
			push({ id, type: "reasoning.encrypted", data: sealed, format: format ?? "unknown" });
			continue;
		}
		if (!part.text && !sealed) continue;
		push({
			id,
			type: "reasoning.text",
			text: part.text,
			...(sealed ? { signature: sealed } : {}),
			format: format ?? "unknown",
		});
	}
	for (const call of toolCalls ?? []) {
		const sealed = sealToolCallSignature(call, origin);
		if (sealed) push({ id: call.id, type: "reasoning.encrypted", data: sealed, format: GOOGLE_REASONING_FORMAT });
	}
	return details;
}

function detailKind(type: unknown): "text" | "summary" | "encrypted" | null {
	const value = String(type ?? "").toLowerCase();
	if (value === "reasoning.text" || value === "text" || value === "reasoning") return "text";
	if (value === "reasoning.summary" || value === "summary") return "summary";
	if (value === "reasoning.encrypted" || value === "encrypted") return "encrypted";
	return null;
}

function defaultKindForFormat(format: ReasoningFormat | null): ReasoningStateKind {
	if (format === ANTHROPIC_REASONING_FORMAT) return "redacted";
	if (format === GOOGLE_REASONING_FORMAT) return "signature";
	return "encrypted";
}

/**
 * Decode Chat `reasoning_details` from an assistant message. Raw signatures
 * are trusted only when the entry names a known `format`, or, for a
 * `reasoning.text` signature, as Anthropic's (the only provider that puts one
 * there). Gemini signatures whose `id` matches a tool call go to that call.
 */
export function decodeChatReasoningDetails(
	details: unknown,
	toolCallIds: ReadonlySet<string>,
): { parts: ReasoningPart[]; toolSignatures: Map<string, ToolCallSignature> } {
	const parts: ReasoningPart[] = [];
	const toolSignatures = new Map<string, ToolCallSignature>();
	if (!Array.isArray(details)) return { parts, toolSignatures };
	for (const entry of details) {
		if (!entry || typeof entry !== "object") continue;
		const kind = detailKind((entry as any).type);
		if (!kind) continue;
		const format = isReasoningFormat((entry as any).format) ? (entry as any).format as ReasoningFormat : null;
		const id = typeof (entry as any).id === "string" && (entry as any).id ? (entry as any).id : undefined;
		if (kind === "text" || kind === "summary") {
			const text = typeof (entry as any).text === "string"
				? (entry as any).text
				: typeof (entry as any).summary === "string" ? (entry as any).summary : "";
			const state = openReasoningState((entry as any).signature, { format: format ?? ANTHROPIC_REASONING_FORMAT, kind: "signature" });
			if (state && state.kind === "signature") {
				parts.push(reasoningPartFromState(state, text));
				continue;
			}
			if (!text) continue;
			parts.push({
				type: "reasoning_text",
				text,
				...(kind === "summary" ? { summary: text } : {}),
				...(format ? { reasoningFormat: format } : {}),
				...(id && format && format !== ANTHROPIC_REASONING_FORMAT && format !== GOOGLE_REASONING_FORMAT ? { reasoningId: id } : {}),
			});
			continue;
		}
		const state = openReasoningState((entry as any).data, format ? { format, kind: defaultKindForFormat(format) } : undefined);
		if (!state) continue;
		if (state.format === GOOGLE_REASONING_FORMAT) {
			const callId = state.callId ?? (id && toolCallIds.has(id) ? id : undefined);
			if (callId) {
				toolSignatures.set(callId, { signature: state.value, ...(state.model ? { model: state.model } : {}) });
				continue;
			}
		}
		if (state.kind === "encrypted") {
			// OpenAI-style state follows its summary text entry; merge them back.
			const previous = parts[parts.length - 1];
			if (previous && previous.reasoningFormat === state.format && !previous.encryptedContent
				&& !previous.thoughtSignature && !previous.redactedData) {
				Object.assign(previous, reasoningPartFromState(state, previous.text, {
					summary: previous.summary,
					reasoningId: id ?? previous.reasoningId,
				}));
				continue;
			}
		}
		parts.push(reasoningPartFromState(state, "", { reasoningId: id }));
	}
	return { parts, toolSignatures };
}

/** Apply decoded Gemini function-call signatures to tool calls in place. */
export function applyToolCallSignatures(
	toolCalls: IRToolCall[] | undefined,
	signatures: ReadonlyMap<string, ToolCallSignature>,
): void {
	if (!toolCalls || signatures.size === 0) return;
	for (const call of toolCalls) {
		const signature = signatures.get(call.id);
		if (!signature) continue;
		call.thoughtSignature = signature.signature;
		if (signature.model) call.thoughtSignatureModel = signature.model;
	}
}

// ---------------------------------------------------------------------------
// Anthropic Messages `thinking` / `redacted_thinking` blocks
// ---------------------------------------------------------------------------

/**
 * Decode a `thinking` or `redacted_thinking` block from a Messages request.
 * A raw signature is Anthropic's; a sealed one keeps the origin the gateway
 * recorded when it returned another provider's reasoning on this surface.
 */
export function decodeAnthropicThinkingBlock(block: any): DecodedResponsesReasoning {
	if (!block || typeof block !== "object") return null;
	if (block.type === "redacted_thinking") {
		const state = openReasoningState(block.data, { format: ANTHROPIC_REASONING_FORMAT, kind: "redacted" });
		return state ? { kind: "part", part: reasoningPartFromState(state, "") } : null;
	}
	if (block.type !== "thinking") return null;
	const text = typeof block.thinking === "string" ? block.thinking : "";
	const state = openReasoningState(block.signature, { format: ANTHROPIC_REASONING_FORMAT, kind: "signature" });
	if (!state) return text ? { kind: "part", part: { type: "reasoning_text", text } } : null;
	if (state.format === GOOGLE_REASONING_FORMAT && state.callId) {
		return {
			kind: "tool_signature",
			callId: state.callId,
			signature: { signature: state.value, ...(state.model ? { model: state.model } : {}) },
		};
	}
	return { kind: "part", part: reasoningPartFromState(state, text) };
}

/**
 * Encode a reasoning part as a Messages block. Anthropic's own state goes out
 * raw, exactly as Claude returned it; other providers' state is sealed.
 */
export function encodeAnthropicThinkingBlock(
	part: ReasoningPart,
	origin?: ReasoningResponseOrigin,
): Record<string, any> | null {
	const format = reasoningPartFormat(part, origin);
	if (format === ANTHROPIC_REASONING_FORMAT) {
		if (part.redactedData) return { type: "redacted_thinking", data: part.redactedData };
		if (part.thoughtSignature) return { type: "thinking", thinking: part.text, signature: part.thoughtSignature };
	}
	const sealed = sealReasoningPart(part, origin);
	if (!part.text && !sealed) return null;
	return { type: "thinking", thinking: part.text, signature: sealed ?? "" };
}
