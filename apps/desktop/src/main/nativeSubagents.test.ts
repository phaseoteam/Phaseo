import { describe, expect, it } from "vitest";
import { codexSubagents, claudeSubagent } from "./nativeSubagents";

describe("native subagent observations", () => {
	it("maps Codex collaboration lifecycle without exposing other item shapes", () => {
		expect(codexSubagents({ type: "commandExecution" })).toEqual([]);
		const activity = codexSubagents({ type: "collabAgentToolCall", receiverThreadIds: ["child"], model: "test", agentsStates: { child: { status: "completed", message: "Findings" } } });
		expect(activity).toMatchObject([{ id: "native-agent:child", text: "Findings", nativeAgent: { id: "child", status: "completed", model: "test" } }]);
		expect(codexSubagents({ type: "collabAgentToolCall", agentsStates: { child: { status: "errored" } } })[0].nativeAgent?.status).toBe("failed");
	});
	it("tracks Codex V2 activity with a stable provider child identity", () => {
		expect(codexSubagents({ type: "subAgentActivity", agentThreadId: "child", agentPath: "Review", kind: "started" })[0]).toMatchObject({ id: "native-agent:child", nativeAgent: { status: "running" } });
		expect(codexSubagents({ type: "subAgentActivity", agentThreadId: "child", kind: "completed" })[0].nativeAgent?.status).toBe("completed");
		expect(codexSubagents({ type: "subAgentActivity", kind: "completed" })).toEqual([]);
	});
	it("maps Claude agent events and excludes ambient and bash task starts", () => {
		expect(claudeSubagent({ type: "system", subtype: "task_started", task_id: "bash", task_type: "local_bash" })).toBeUndefined();
		expect(claudeSubagent({ type: "system", subtype: "task_started", task_id: "agent", task_type: "local_agent", description: "Inspect" })).toMatchObject({ title: "Inspect", nativeAgent: { id: "agent", status: "running" } });
		expect(claudeSubagent({ type: "system", subtype: "task_notification", task_id: "agent", status: "completed", summary: "Found", output_file: "private/path" })).toMatchObject({ text: "Found", nativeAgent: { status: "completed" } });
		expect(claudeSubagent({ type: "system", subtype: "task_progress", task_id: "ambient", ambient: true })).toBeUndefined();
	});
});
