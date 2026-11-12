import { expect, it } from "vitest";
import type { AgentActivity, Message } from "../../shared/workspace";
import { contextShare, contextUsage, latestTurnUsage } from "./turnUsage";

const usage = (id: string, input: number, contextTokens?: number): AgentActivity => ({ id, type: "usage", title: "Usage", text: JSON.stringify({ input_tokens: input, output_tokens: 10, ...(contextTokens ? { contextTokens } : {}) }) });
const user = (id: string): Message => ({ id, role: "user", text: id, createdAt: "" });

it("reads the window from the latest turn that reported usage", () => {
	const activities = [usage("a:usage:0", 1000, 8000), usage("b:usage:0", 2000, 8000), usage("b:usage:1", 4000, 8000), { id: "b:tool", type: "tool", title: "Read", text: "" } as AgentActivity];
	const reports = latestTurnUsage([user("a"), user("b"), user("c")], activities);
	expect(reports.map(report => report.id)).toEqual(["b:usage:0", "b:usage:1"]);
	expect(contextUsage(reports)).toEqual({ used: 4000, window: 8000 });
	expect(contextShare(reports)).toBe(0.5);
	expect(contextUsage([usage("x:usage:0", 10)])).toBeUndefined();
	expect(latestTurnUsage([user("z")], activities)).toEqual([]);
});
