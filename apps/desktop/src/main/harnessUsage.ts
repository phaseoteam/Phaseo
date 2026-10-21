import { reportTokens } from "../shared/usageAmounts";
import { tokenTotal, type HarnessUsage } from "../shared/usageLedger";

const record = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;

/**
 * One Claude API response's tokens from its `usage`, keyed by the response's id, the same live and in Claude Code's
 * transcripts. Claude counts cache reads and writes apart from the input. Nothing when the usage has no counts.
 */
export function claudeUsage(id: string, model: string | undefined, usage: unknown): HarnessUsage | undefined {
	const value = record(usage);
	const tokens = value && reportTokens({ ...value, cache_read_input_tokens: value.cache_read_input_tokens ?? 0 });
	if (!tokens || !tokenTotal(tokens)) return;
	return { key: `claude:${id}`, ...model ? { model } : {}, ...tokens };
}

/**
 * One Codex response's tokens. Codex reports its thread's running total after each response with what that response
 * used (`last`); the running total names the response within its thread, so a line written twice counts once.
 */
export function codexResponseUsage(threadId: string, total: unknown, last: unknown): HarnessUsage | undefined {
	const running = record(total), used = record(last) && reportTokens(record(last)!);
	const count = Number(running?.totalTokens ?? running?.total_tokens);
	if (!used || !Number.isSafeInteger(count) || !tokenTotal(used)) return;
	return { key: `codex:${threadId}:${count}`, ...used };
}
