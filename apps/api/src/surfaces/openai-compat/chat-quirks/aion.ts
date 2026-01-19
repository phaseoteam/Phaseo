import { extractAionThinkBlocks, isAionProvider } from "@/providers/aion/think";
import type { ChatQuirk } from "./types";

export const aionChatQuirk: ChatQuirk = {
	id: "aion",
	matches: (providerId) => isAionProvider(providerId ?? ""),
	onResponse: ({ rawContent }) => {
		const parsed = extractAionThinkBlocks(rawContent);
		return {
			main: parsed.main ?? "",
			reasoning: parsed.reasoning ?? [],
		};
	},
};
