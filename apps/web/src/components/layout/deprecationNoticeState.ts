import type { DeprecationWarning } from "@/lib/fetchers/usage/types";

// A dismissal holds until the model's lifecycle dates change, so the notice is
// never repeated for the same deprecation.
export function deprecationNoticeKey(warning: DeprecationWarning) {
	return `${warning.modelId}:${warning.deprecationDate ?? ""}:${warning.retirementDate ?? ""}`;
}

export function visibleDeprecationWarnings(warnings: DeprecationWarning[], dismissed: ReadonlySet<string>) {
	return warnings.filter((warning) => warning.countAsAlert && !dismissed.has(deprecationNoticeKey(warning)));
}

export function fillNoticeTemplate(template: string, values: Record<string, string>) {
	return template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
}
