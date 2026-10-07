export type DecisionModelCapability = "text.generate" | "decisions.make";

export function decisionModelCapability(endpoint: string): DecisionModelCapability | null {
	const value = endpoint.trim().toLowerCase().replace(/^\/v1\//, "").replace(/^\//, "").replace(/\//g, ".");
	if (["text.generate", "responses", "chat.completions", "messages", "text", "chat.generate"].includes(value)) return "text.generate";
	if (["decisions", "decisions.make", "decision.make", "systemone", "system.one", "typed.decisions"].includes(value)) return "decisions.make";
	return null;
}

export function decisionModelCapabilities(endpoints: readonly string[]): DecisionModelCapability[] {
	const capabilities = new Set(endpoints.map(decisionModelCapability));
	return (["text.generate", "decisions.make"] as const).filter(value => capabilities.has(value));
}

export function modelOutputFilterValues(modalities: readonly string[], endpoints: readonly string[]): string[] {
	return [...new Set([...modalities, ...(endpoints.some(endpoint => decisionModelCapability(endpoint) === "decisions.make") ? ["decisions"] : [])])];
}
