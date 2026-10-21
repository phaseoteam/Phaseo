import { describe, expect, it } from "vitest";
import { claudeUsage, CodexTurnUsage } from "./harnessUsage";
import { usageTokens } from "../shared/usageAmounts";
import { estimateNanos, modelMatchKey } from "../shared/usageLedger";

describe("harness usage", () => {
	it("reads a Claude response's usage, cache reads and writes apart from the input", () => {
		expect(claudeUsage("msg_1", "claude-opus-5-5", { input_tokens: 12, cache_read_input_tokens: 9000, cache_creation_input_tokens: 400, output_tokens: 300 }))
			.toEqual({ key: "claude:msg_1", model: "claude-opus-5-5", input: 12, cached: 9000, cacheWrite: 400, output: 300, reasoning: 0 });
		// The end of a streamed message carries only its output.
		expect(claudeUsage("msg_1", undefined, { output_tokens: 320 })).toEqual({ key: "claude:msg_1", input: 0, cached: 0, cacheWrite: 0, output: 320, reasoning: 0 });
		expect(claudeUsage("msg_2", undefined, { input_tokens: 0, output_tokens: 0 })).toBeUndefined();
		expect(claudeUsage("msg_3", undefined, null)).toBeUndefined();
	});

	it("turns Codex's running thread totals into each turn's usage, even for a thread resumed with earlier history", () => {
		const usage = new CodexTurnUsage(), breakdown = (input: number, cached: number, output: number) => ({ inputTokens: input, cachedInputTokens: cached, outputTokens: output, reasoningOutputTokens: 0, totalTokens: input + output });
		// The thread already held 50,000 input tokens before this turn's first response, which read 40,000 more (30,000 cached).
		expect(usage.update("thread", "turn-1", { total: breakdown(90_000, 30_000, 500), last: breakdown(40_000, 30_000, 200) })).toEqual({ key: "codex:thread:turn-1", input: 10_000, cached: 30_000, cacheWrite: 0, output: 200, reasoning: 0 });
		expect(usage.update("thread", "turn-1", { total: breakdown(140_000, 70_000, 800), last: breakdown(50_000, 40_000, 300) })).toMatchObject({ input: 20_000, cached: 70_000, output: 500 });
		expect(usage.update("thread", "turn-2", { total: breakdown(150_000, 75_000, 900), last: breakdown(10_000, 5_000, 100) })).toMatchObject({ key: "codex:thread:turn-2", input: 5_000, cached: 5_000, output: 100 });
		expect(usage.update(undefined, "turn-3", { total: breakdown(1, 0, 1) })).toBeUndefined();
	});

	it("reads Phaseo reports' cached input either way providers count it", () => {
		expect(usageTokens(JSON.stringify({ prompt_tokens: 1000, completion_tokens: 50, prompt_tokens_details: { cached_tokens: 800 }, completion_tokens_details: { reasoning_tokens: 20 } })))
			.toEqual({ input: 200, cached: 800, cacheWrite: 0, output: 50, reasoning: 20 });
		expect(usageTokens(JSON.stringify({ input_tokens: 10, cache_read_input_tokens: 800, cache_creation_input_tokens: 100, output_tokens: 50 }))).toEqual({ input: 10, cached: 800, cacheWrite: 100, output: 50, reasoning: 0 });
		expect(usageTokens("Used 3k tokens")).toBeUndefined();
	});

	it("prices tokens with cache rates falling back to the input price, and matches harness model ids to the catalogue", () => {
		expect(estimateNanos({ input: 1_000_000, cached: 1_000_000, cacheWrite: 1_000_000, output: 1_000_000, reasoning: 500_000 }, { input: 5, output: 25, cacheRead: 0.5 })).toBe(35.5e9);
		expect(modelMatchKey("claude-opus-5-5-20261001")).toBe(modelMatchKey("anthropic/claude-opus-5.5"));
		expect(modelMatchKey("gpt-6.1")).toBe(modelMatchKey("openai/gpt-6.1"));
		expect(modelMatchKey("claude-fable-5-1[1m]")).toBe(modelMatchKey("anthropic/claude-fable-5.1"));
	});
});
