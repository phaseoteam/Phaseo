// Purpose: Shared OpenAI-compatible text adapter and transformations.
// Why: Consolidates OpenAI-style quirks across many providers.
// How: Maps IR to OpenAI formats and normalizes streaming events.

import type { IRChatRequest } from "@core/ir";

export type ChatRequestQuirkContext = {
	ir: IRChatRequest;
	providerId?: string;
	model?: string | null;
	request: any;
};

export type ChatResponseQuirkContext = {
	providerId: string;
	choice: any;
	rawContent: string;
};

export type ChatResponseQuirkResult = {
	main?: string;
	reasoning?: string[];
};

export type ChatQuirk = {
	id: string;
	matches: (providerId?: string) => boolean;
	onRequest?: (ctx: ChatRequestQuirkContext) => void;
	onResponse?: (ctx: ChatResponseQuirkContext) => ChatResponseQuirkResult | null;
};

