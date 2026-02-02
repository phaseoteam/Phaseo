// Purpose: Provider adapter module.
// Why: Encapsulates provider-specific configuration and endpoint mapping.
// How: Exposes provider-specific helpers for routing and execution.

const THINK_OPEN = "<think>";
const THINK_CLOSE = "</think>";

export type AionThinkStreamState = {
	inThink: boolean;
	carry: string;
	reasoningChunks: string[];
};

export function isAionProvider(provider?: string | null): boolean {
	return provider === "aionlabs" || provider === "aion-labs";
}

export function extractAionThinkBlocks(text: string): { main: string; reasoning: string[] } {
	if (!text || typeof text !== "string") {
		return { main: text ?? "", reasoning: [] };
	}
	if (!text.includes(THINK_OPEN)) {
		return { main: text, reasoning: [] };
	}

	const reasoning: string[] = [];
	let main = "";
	let lastIndex = 0;
	const regex = /<think>([\s\S]*?)<\/think>/gi;
	let match: RegExpExecArray | null;

	while ((match = regex.exec(text)) !== null) {
		const before = text.slice(lastIndex, match.index);
		main += before;
		const reasoningText = match[1];
		if (reasoningText && reasoningText.trim().length > 0) {
			reasoning.push(reasoningText);
		}
		lastIndex = match.index + match[0].length;
	}

	main += text.slice(lastIndex);
	if (main.includes(THINK_OPEN) || main.includes(THINK_CLOSE)) {
		main = main.replace(/<\/?think>/gi, "");
	}

	return { main, reasoning };
}

export function createAionThinkStreamState(): AionThinkStreamState {
	return { inThink: false, carry: "", reasoningChunks: [] };
}

export function processAionThinkStreamDelta(
	state: AionThinkStreamState,
	text: string,
): { mainDelta: string; reasoningDelta: string } {
	const input = `${state.carry}${text ?? ""}`;
	state.carry = "";

	let mainDelta = "";
	let reasoningDelta = "";
	let remaining = input;

	while (remaining.length > 0) {
		if (state.inThink) {
			const closeIdx = remaining.indexOf(THINK_CLOSE);
			if (closeIdx === -1) {
				const { body, carry } = splitForTagPrefix(remaining, THINK_CLOSE);
				reasoningDelta += body;
				state.carry = carry;
				remaining = "";
			} else {
				reasoningDelta += remaining.slice(0, closeIdx);
				remaining = remaining.slice(closeIdx + THINK_CLOSE.length);
				state.inThink = false;
			}
		} else {
			const openIdx = remaining.indexOf(THINK_OPEN);
			if (openIdx === -1) {
				const { body, carry } = splitForTagPrefix(remaining, THINK_OPEN);
				mainDelta += body;
				state.carry = carry;
				remaining = "";
			} else {
				mainDelta += remaining.slice(0, openIdx);
				remaining = remaining.slice(openIdx + THINK_OPEN.length);
				state.inThink = true;
			}
		}
	}

	if (reasoningDelta.length > 0) {
		state.reasoningChunks.push(reasoningDelta);
	}

	return { mainDelta, reasoningDelta };
}

function splitForTagPrefix(input: string, tag: string): { body: string; carry: string } {
	const maxLen = Math.min(tag.length - 1, input.length);
	for (let len = maxLen; len >= 1; len -= 1) {
		const suffix = input.slice(-len);
		if (tag.startsWith(suffix)) {
			return { body: input.slice(0, -len), carry: suffix };
		}
	}
	return { body: input, carry: "" };
}

