// Purpose: Modality-aware routing for text generation requests.
// Why: Ensure providers only receive inputs they advertise support for.
// How: Inspect IR content + requested output modalities to filter candidates.

import type { IRChatRequest, IRContentPart, IRMessage } from "@core/ir";
import type { ProviderCandidate } from "../before/types";

export type Modality = "text" | "image" | "audio" | "video";

type ModalityRequirements = {
	input: Set<Modality>;
	output: Set<Modality>;
};

function normalizeModalities(values?: string[] | null): Set<Modality> {
	if (!values || values.length === 0) return new Set();
	const normalized = new Set<Modality>();
	for (const value of values) {
		const lower = String(value).trim().toLowerCase();
		if (lower === "text" || lower === "image" || lower === "audio" || lower === "video") {
			normalized.add(lower);
		}
	}
	return normalized;
}

function collectInputModalities(messages: IRMessage[]): Set<Modality> {
	const required = new Set<Modality>(["text"]);
	for (const message of messages) {
		if (!("content" in message)) continue;
		for (const part of message.content) {
			switch ((part as IRContentPart).type) {
				case "image":
					required.add("image");
					break;
				case "audio":
					required.add("audio");
					break;
				case "video":
					required.add("video");
					break;
				default:
					break;
			}
		}
	}
	return required;
}

function collectOutputModalities(ir: IRChatRequest): Set<Modality> {
	const output = new Set<Modality>();
	const requested = ir.modalities ?? [];
	for (const modality of requested) {
		if (modality === "text" || modality === "image" || modality === "audio" || modality === "video") {
			output.add(modality);
		}
	}
	return output;
}

export function detectModalityRequirements(ir: IRChatRequest): ModalityRequirements {
	return {
		input: collectInputModalities(ir.messages),
		output: collectOutputModalities(ir),
	};
}

function supportsRequiredModalities(
	required: Set<Modality>,
	available: Set<Modality>,
	allowTextOnlyWhenUnknown: boolean,
): boolean {
	if (required.size === 0) return true;
	if (available.size === 0) {
		if (allowTextOnlyWhenUnknown && required.size === 1 && required.has("text")) {
			return true;
		}
		return false;
	}
	for (const modality of required) {
		if (!available.has(modality)) return false;
	}
	return true;
}

export function filterCandidatesByModalities(
	candidates: ProviderCandidate[],
	ir: IRChatRequest,
): ProviderCandidate[] {
	const requirements = detectModalityRequirements(ir);
	const needsNonTextInput = Array.from(requirements.input).some((m) => m !== "text");
	const needsNonTextOutput = Array.from(requirements.output).some((m) => m !== "text");

	return candidates.filter((candidate) => {
		const input = normalizeModalities(candidate.inputModalities ?? undefined);
		const output = normalizeModalities(candidate.outputModalities ?? undefined);

		const inputOk = supportsRequiredModalities(
			requirements.input,
			input,
			!needsNonTextInput,
		);
		if (!inputOk) return false;

		const outputOk = supportsRequiredModalities(
			requirements.output,
			output,
			!needsNonTextOutput,
		);
		return outputOk;
	});
}
