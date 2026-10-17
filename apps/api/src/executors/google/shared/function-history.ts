// Purpose: Replay tool-call history to Gemini generateContent.
// Why: Model turns must carry the assistant's functionCall parts before the
//      matching functionResponse parts, or tool loops are malformed, and Gemini 3+
//      rejects function calls in the current turn that lack a thought signature.
// How: Builds functionCall parts for an assistant message and groups consecutive
//      tool results into one user turn of functionResponse parts.

import type { IRToolCall } from "@core/ir";

/**
 * Google's documented placeholder for function calls that have no signature,
 * for example history produced by another model or provider. Gemini 3 and
 * later return 400 for an unsigned functionCall in the current turn otherwise.
 * https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/thinking/thought-signatures
 */
export const GEMINI_SKIP_THOUGHT_SIGNATURE = "skip_thought_signature_validator";

function geminiMajorVersion(model: string | null | undefined): number | null {
	const match = /gemini-(\d+)/i.exec(String(model ?? ""));
	return match ? Number(match[1]) : null;
}

export function requiresGeminiFunctionCallSignature(model: string | null | undefined): boolean {
	const major = geminiMajorVersion(model);
	return major !== null && major >= 3;
}

function parseFunctionArgs(raw: string | undefined): Record<string, any> {
	if (typeof raw !== "string" || raw.trim().length === 0) return {};
	try {
		const parsed = JSON.parse(raw);
		return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : { value: parsed };
	} catch {
		return {};
	}
}

/**
 * functionCall parts for one assistant message, in call order. Only the first
 * call of a step carries the signature (parallel calls share it). A real
 * signature from the IR is used when present; otherwise Gemini 3+ models get
 * Google's skip placeholder.
 */
export function irToolCallsToGeminiParts(
	toolCalls: IRToolCall[] | undefined,
	model: string | null | undefined,
): any[] {
	if (!Array.isArray(toolCalls) || toolCalls.length === 0) return [];
	const needsSignature = requiresGeminiFunctionCallSignature(model);
	return toolCalls
		.filter((call) => call && typeof call.name === "string" && call.name.length > 0)
		.map((call, index) => {
			const signature = call.thoughtSignature
				?? (index === 0 && needsSignature ? GEMINI_SKIP_THOUGHT_SIGNATURE : undefined);
			return {
				functionCall: { name: call.name, args: parseFunctionArgs(call.arguments) },
				...(signature ? { thoughtSignature: signature } : {}),
			};
		});
}

/**
 * Chat clients send `content: null` or "" alongside tool calls, which decodes
 * to an empty text part. Gemini needs every part to carry data, so drop empty,
 * unsigned text parts from model turns.
 */
export function withoutEmptyGeminiTextParts(parts: any[]): any[] {
	return parts.filter((part) => !(
		part && typeof part === "object" && part.text === "" && !part.thought
		&& !part.thought_signature && !part.thoughtSignature && Object.keys(part).length <= 2
	));
}

/**
 * Append a functionResponse part. Consecutive tool results join the same user
 * turn, so parallel calls are answered together and in order, as Gemini expects.
 */
export function appendGeminiFunctionResponse(contents: any[], part: { functionResponse: any }): void {
	const last = contents[contents.length - 1];
	const lastIsResponses = last?.role === "user"
		&& Array.isArray(last.parts)
		&& last.parts.length > 0
		&& last.parts.every((entry: any) => entry && typeof entry === "object" && "functionResponse" in entry);
	if (lastIsResponses) {
		last.parts.push(part);
		return;
	}
	contents.push({ role: "user", parts: [part] });
}
