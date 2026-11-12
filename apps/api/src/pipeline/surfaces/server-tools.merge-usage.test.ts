import { describe, expect, it } from "vitest";
import { irUsageToAnthropicStyle } from "@core/cache-usage";
import { mergeIRUsageTotals } from "./server-tools";

describe("mergeIRUsageTotals cache semantics", () => {
	// Anthropic reports input without cache reads; a later server-tool turn may report no cache at all.
	const cachedTurn = { inputTokens: 100, outputTokens: 10, totalTokens: 510, cachedInputTokens: 400, cachedReadTokensAreSubsetOfInput: false };
	const uncachedTurn = { inputTokens: 50, outputTokens: 5, totalTokens: 55 };

	it("keeps the additive read flag when only one turn reports cache usage", () => {
		const merged = mergeIRUsageTotals(cachedTurn, uncachedTurn)!;
		expect(merged.cachedReadTokensAreSubsetOfInput).toBe(false);
		expect(mergeIRUsageTotals(uncachedTurn, cachedTurn)!.cachedReadTokensAreSubsetOfInput).toBe(false);
		// Input stays the full uncached 150, not 150 minus the 400 cache reads.
		expect(irUsageToAnthropicStyle(merged)).toMatchObject({ inputTokens: 150, readTokens: 400 });
	});

	it("leaves the flag unknown when the turns disagree", () => {
		const merged = mergeIRUsageTotals(cachedTurn, { ...uncachedTurn, cachedInputTokens: 10, cachedReadTokensAreSubsetOfInput: true })!;
		expect(merged.cachedReadTokensAreSubsetOfInput).toBeUndefined();
	});

	it("carries a write flag set on one turn", () => {
		const merged = mergeIRUsageTotals({ ...cachedTurn, cachedWriteTokensAreSubsetOfInput: false }, uncachedTurn)!;
		expect(merged.cachedWriteTokensAreSubsetOfInput).toBe(false);
	});
});

describe("mergeIRUsageTotals OpenAI write lifetimes", () => {
	it("sums the 30-minute and 12-hour writes across server-tool turns", () => {
		const turn = (write30m: number, write12h: number) => ({
			inputTokens: 1_000,
			outputTokens: 10,
			totalTokens: 1_010,
			cachedWriteTokensAreSubsetOfInput: true,
			_ext: { cachedWriteTokens: write30m + write12h, cachedWriteTokens30m: write30m, cachedWriteTokens12h: write12h },
		});
		const merged = mergeIRUsageTotals(turn(100, 400), turn(50, 0))!;
		expect(merged._ext).toMatchObject({ cachedWriteTokens: 550, cachedWriteTokens30m: 150, cachedWriteTokens12h: 400 });
	});
});
