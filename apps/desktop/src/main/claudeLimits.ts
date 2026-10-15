import type { AccountStatus, UsageWindow } from "../shared/workspace";

type ClaudeWindow = { utilization?: number | null; resets_at?: string | null } | null | undefined;
type ClaudeLimitsInput = {
	five_hour?: ClaudeWindow; seven_day?: ClaudeWindow; seven_day_opus?: ClaudeWindow; seven_day_sonnet?: ClaudeWindow;
	/** The Agent SDK's per-model weekly windows. */
	model_scoped?: { display_name: string; utilization: number | null; resets_at: string | null }[];
	/** The OAuth usage endpoint's per-model weekly windows. */
	limits?: unknown;
	extra_usage?: { is_enabled?: boolean; monthly_limit?: number | null; used_credits?: number | null; currency?: string | null } | null;
};

/** Claude reports utilisation as 0–100 and reset times as ISO strings. */
export function claudeWindow(value: ClaudeWindow, minutes: number): UsageWindow | null {
	if (!value || typeof value.utilization !== "number" || !Number.isFinite(value.utilization)) return null;
	const resets = typeof value.resets_at === "string" ? Date.parse(value.resets_at) : Number.NaN;
	return { usedPercent: Math.min(100, Math.max(0, value.utilization)), windowDurationMins: minutes, resetsAt: Number.isFinite(resets) ? Math.floor(resets / 1000) : null };
}

/** Plan limits from the Agent SDK's usage call or the OAuth usage endpoint: 5-hour and weekly, per-model weekly, extra usage. */
export function claudeLimits(input: ClaudeLimitsInput): Pick<AccountStatus, "usage" | "extraUsage"> {
	const usage: NonNullable<AccountStatus["usage"]> = [{ id: "claude", name: "Claude", primary: claudeWindow(input.five_hour, 300), secondary: claudeWindow(input.seven_day, 10080), spendControlReached: null }];
	const scoped = Array.isArray(input.limits) ? input.limits.flatMap(entry => {
		const limit = entry as { kind?: unknown; percent?: unknown; resets_at?: unknown; scope?: { model?: { display_name?: unknown } } };
		const name = limit.scope?.model?.display_name;
		return limit.kind === "weekly_scoped" && typeof name === "string" && typeof limit.percent === "number" ? [[name, { utilization: limit.percent, resets_at: typeof limit.resets_at === "string" ? limit.resets_at : null }] as const] : [];
	}) : [];
	const models = input.model_scoped?.length ? input.model_scoped.map(model => [model.display_name, model] as const)
		: scoped.length ? scoped
		: ([["Opus", input.seven_day_opus], ["Sonnet", input.seven_day_sonnet]] as const).filter(([, value]) => value);
	for (const [name, value] of models) { const window = claudeWindow(value, 10080); if (window) usage.push({ id: `claude:${name}`, name: `${name} weekly`, primary: window, secondary: null, spendControlReached: null }); }
	const extra = input.extra_usage;
	return { usage, ...extra && typeof extra.is_enabled === "boolean" ? { extraUsage: { enabled: extra.is_enabled, used: typeof extra.used_credits === "number" ? extra.used_credits : null, limit: typeof extra.monthly_limit === "number" ? extra.monthly_limit : null, ...extra.currency ? { currency: extra.currency } : {} } } : {} };
}
