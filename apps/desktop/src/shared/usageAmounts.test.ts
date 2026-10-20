import { describe, expect, it } from "vitest";
import { addUsage, formatCost, isPhaseoUsageId, usageAmounts, usageTotalsOf } from "./usageAmounts";
import { chatSpend } from "../renderer/lib/chatSpend";
import { turnUsage } from "../renderer/lib/turnUsage";
import type { TaskOverview } from "./workspaceOverview";
import type { AgentActivity, UsageTotals } from "./workspace";

describe("usage amounts", () => {
	it("reads the Agent SDK's step summary, with its cost in dollars", () => {
		expect(usageAmounts(JSON.stringify({ inputTokens: 1200, outputTokens: 300, cachedTokens: 800, totalTokens: 1500, cost: 0.00425, contextTokens: 200000 }))).toEqual({ input: 1200, output: 300, total: 1500, costNanos: 4_250_000 });
	});

	it("prefers the gateway's exact price in nanodollars", () => {
		expect(usageAmounts(JSON.stringify({ prompt_tokens: 10, completion_tokens: 5, pricing: { total_nanos: 1_234_567, currency: "USD" } }))).toEqual({ input: 10, output: 5, total: 15, costNanos: 1_234_567 });
		expect(usageAmounts(JSON.stringify({ input_tokens: 10, output_tokens: 5, total_tokens: 15, pricing_breakdown: { total_nanos: 99 }, cost: 1 })).costNanos).toBe(99);
	});

	it("leaves out what a report does not give, and ignores text that is not usage", () => {
		expect(usageAmounts(JSON.stringify({ last: { input_tokens: 4 }, total: { input_tokens: 400 } }))).toEqual({ input: 4 });
		expect(usageAmounts("Used 1,200 tokens")).toEqual({});
		expect(usageAmounts("null")).toEqual({});
		expect(usageAmounts(JSON.stringify({ inputTokens: -1, cost: Number.NaN }))).toEqual({});
	});

	it("adds reports to a chat's totals, counting a replaced report once", () => {
		const totals: UsageTotals = { tokens: 0, costNanos: 0 };
		const first = JSON.stringify({ totalTokens: 100, cost: 0.001 }), revised = JSON.stringify({ totalTokens: 150, cost: 0.0015 });
		addUsage(totals, first);
		addUsage(totals, revised, first);
		addUsage(totals, JSON.stringify({ prompt_tokens: 20, completion_tokens: 5, pricing: { total_nanos: 250_000 } }));
		expect(totals).toEqual({ tokens: 175, costNanos: 1_750_000 });
		expect(usageTotalsOf([first, "not usage"])).toEqual({ tokens: 100, costNanos: 1_000_000 });
	});

	it("tells Phaseo step and compaction reports from other harnesses' cumulative ones", () => {
		for (const id of ["usage:0", "turn-1:usage:12", "compaction:1760000000000:usage", "turn-1:compaction:1760000000000:usage"]) expect(isPhaseoUsageId(id)).toBe(true);
		for (const id of ["usage", "turn-1:usage", "turn-1:run-9:usage", "turn-1:usage:x", "turn-1:compaction:1:usage:extra"]) expect(isPhaseoUsageId(id)).toBe(false);
	});

	it("formats dollars in US format, with finer amounts below a dollar", () => {
		expect(formatCost(12_500_000_000)).toBe("$12.50");
		expect(formatCost(1_234_567_890)).toBe("$1.23");
		expect(formatCost(4_250_000)).toBe("$0.0043");
		expect(formatCost(420_000_000)).toBe("$0.42");
		expect(formatCost(0)).toBe("$0.00");
		expect(formatCost(20_000)).toBe("<$0.0001");
	});
});

describe("turn usage", () => {
	const activity = (text: string): AgentActivity => ({ id: `turn:usage:${text.length}`, type: "usage", title: "Usage", text });
	it("sums a turn's steps and their cost, compaction included", () => {
		expect(turnUsage([activity(JSON.stringify({ inputTokens: 100, outputTokens: 20, totalTokens: 120, cost: 0.002 })), activity(JSON.stringify({ prompt_tokens: 50, completion_tokens: 10, pricing: { total_nanos: 500_000 } }))])).toEqual({ Input: 150, Output: 30, Total: 180, Cost: 2_500_000 });
	});
});

describe("chat spend", () => {
	const chat = (id: string, patch: Partial<TaskOverview> = {}) => ({ id, title: id, harness: "phaseo", model: "m", mode: "code", status: "completed", attentionKey: "", createdAt: "", updatedAt: "", ...patch }) as TaskOverview;
	const totals = (tokens: number, costNanos: number): UsageTotals => ({ tokens, costNanos });
	it("adds the chat's agents at any depth, but not chats it launched on their own", () => {
		const tasks = [
			chat("root", { usageTotals: totals(1000, 300_000_000) }),
			chat("child", { delegation: { parentTaskId: "root", requestId: "a" }, usageTotals: totals(200, 100_000_000) }),
			chat("grandchild", { delegation: { parentTaskId: "child", requestId: "b" }, usageTotals: totals(50, 20_000_000) }),
			chat("codex-child", { harness: "codex", delegation: { parentTaskId: "root", requestId: "c" }, usageTotals: totals(0, 0) }),
			chat("launched", { launch: { byTaskId: "root", requestId: "d" }, usageTotals: totals(9999, 9_000_000_000) }),
		];
		expect(chatSpend(tasks, "root")).toEqual({ own: totals(1000, 300_000_000), agents: { tokens: 250, costNanos: 120_000_000, count: 2 } });
		expect(chatSpend(tasks, "child").agents).toEqual({ tokens: 50, costNanos: 20_000_000, count: 1 });
		expect(chatSpend([chat("solo")], "solo")).toEqual({ own: undefined, agents: { tokens: 0, costNanos: 0, count: 0 } });
	});
});
