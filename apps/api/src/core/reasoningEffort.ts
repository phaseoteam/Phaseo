import type { IRReasoning } from "./ir";

export type AnthropicReasoningEffort = "low" | "medium" | "high" | "xhigh" | "max";

export function mapIrEffortToAnthropic(
	effort: IRReasoning["effort"] | string | null | undefined,
	options?: { preferXHigh?: boolean },
): AnthropicReasoningEffort | undefined {
	if (typeof effort !== "string") return undefined;
	const normalized = effort.toLowerCase();
	if (normalized === "xhigh") {
		return options?.preferXHigh ? "xhigh" : "max";
	}
	if (normalized === "max") return "max";
	if (normalized === "high" || normalized === "medium" || normalized === "low") {
		return normalized;
	}
	if (normalized === "minimal") return "low";
	return undefined;
}

export function mapAnthropicEffortToIr(
	effort: string | null | undefined,
): IRReasoning["effort"] | undefined {
	if (typeof effort !== "string") return undefined;
	const normalized = effort.toLowerCase();
	if (normalized === "max") return "max";
	if (normalized === "xhigh") return "xhigh";
	if (
		normalized === "none" ||
		normalized === "minimal" ||
		normalized === "low" ||
		normalized === "medium" ||
		normalized === "high"
	) {
		return normalized as IRReasoning["effort"];
	}
	return undefined;
}

