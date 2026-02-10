import type { IRReasoning } from "./ir";

export type AnthropicReasoningEffort = "low" | "medium" | "high" | "max";

export function mapIrEffortToAnthropic(
	effort: IRReasoning["effort"] | string | null | undefined,
): AnthropicReasoningEffort | undefined {
	if (typeof effort !== "string") return undefined;
	const normalized = effort.toLowerCase();
	if (normalized === "xhigh" || normalized === "max") return "max";
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
	if (normalized === "max" || normalized === "xhigh") return "xhigh";
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
