import { reportTokens } from "../shared/usageAmounts";
import { noTokens, tokenTotal, type HarnessUsage, type UsageTokens } from "../shared/usageLedger";

const record = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;

/**
 * One Claude API response's tokens from its `usage`, keyed by the response's id. Claude counts cache reads and writes
 * apart from the input. Nothing when the usage has no counts.
 */
export function claudeUsage(id: string, model: string | undefined, usage: unknown): HarnessUsage | undefined {
	const value = record(usage);
	const tokens = value && reportTokens({ ...value, cache_read_input_tokens: value.cache_read_input_tokens ?? 0 });
	if (!tokens || !tokenTotal(tokens)) return;
	return { key: `claude:${id}`, ...model ? { model } : {}, ...tokens };
}

/**
 * Codex reports its thread's running total after each response. A turn's usage is that total less where the thread
 * stood when the turn began: the first report of a turn says what its first response used (`last`), which gives the
 * starting point even when the thread was resumed with history this app never saw.
 */
export class CodexTurnUsage {
	private turn?: { key: string; start: UsageTokens };
	update(threadId: string | undefined, turnId: string | undefined, report: unknown): HarnessUsage | undefined {
		const value = record(report), total = record(value?.total) && reportTokens(record(value?.total)!), last = record(value?.last) && reportTokens(record(value?.last)!);
		if (!threadId || !turnId || !total) return;
		const key = `codex:${threadId}:${turnId}`, fields = Object.keys(total) as (keyof UsageTokens)[];
		if (this.turn?.key !== key) this.turn = { key, start: Object.fromEntries(fields.map(field => [field, Math.max(0, total[field] - (last ?? noTokens())[field])])) as UsageTokens };
		const used = Object.fromEntries(fields.map(field => [field, Math.max(0, total[field] - this.turn!.start[field])])) as UsageTokens;
		return tokenTotal(used) ? { key, ...used } : undefined;
	}
}
