// Purpose: Read the audience of a promotional price rule.
// Why: A promotional price can be limited to one calling app with a `client_id`
// condition (the gateway sets `client_id` from the detected app, for example
// `claude-code`). That condition says who the price is for, not what is billed, so
// pricing displays must still pair the rule with the list price it discounts.

type RuleCondition = { path?: unknown; value?: unknown };

/** Condition paths that name who a price is for rather than what is billed. */
const AUDIENCE_PATHS = new Set(["client_id"]);

const CLIENT_NAMES: Record<string, string> = {
	"claude-code": "Claude Code",
	codex: "Codex",
};

export function isAudienceCondition(condition: unknown): boolean {
	const path = (condition as RuleCondition | null)?.path;
	return typeof path === "string" && AUDIENCE_PATHS.has(path);
}

/** The rule's conditions without its audience conditions. */
export function withoutAudienceConditions<T>(conditions: readonly T[] | null | undefined): T[] {
	return (conditions ?? []).filter((condition) => !isAudienceCondition(condition));
}

/** "Claude Code" for a rule limited to `client_id = claude-code`; undefined when it has no audience. */
export function audienceLabel(conditions: readonly unknown[] | null | undefined): string | undefined {
	const names = (conditions ?? [])
		.filter(isAudienceCondition)
		.flatMap((condition) => {
			const value = (condition as RuleCondition).value;
			return Array.isArray(value) ? value : [value];
		})
		.filter((value): value is string => typeof value === "string" && value.length > 0)
		.map((id) => CLIENT_NAMES[id] ?? id);
	return names.length ? names.join(" or ") : undefined;
}
