// Purpose: Request sanitization for OpenAI-compatible adapters.
// Why: Keep gateway payloads stable; do not proactively strip provider params.
// How: Preserve request shape and defer compatibility adaptation to retry-policy.

type OpenAICompatRoute = "responses" | "chat" | "legacy_completions";

export function sanitizeOpenAICompatRequest(args: {
	providerId: string;
	route: OpenAICompatRoute;
	model?: string | null;
	request: Record<string, any>;
}): { request: Record<string, any>; dropped: string[] } {
	void args.providerId;
	void args.route;
	void args.model;
	return { request: { ...args.request }, dropped: [] };
}
