import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Account, Task } from "../shared/workspace";
const sdk = vi.hoisted(() => ({ create: vi.fn(), resume: vi.fn(), store: vi.fn() }));
vi.mock("@cursor/sdk", () => ({ Agent: { create: sdk.create, resume: sdk.resume }, JsonlLocalAgentStore: class { constructor(directory: string) { sdk.store(directory); } } }));
import { CursorAdapter, cursorOptions } from "./cursorAdapter";
import { AgentInputRejectedError } from "./agentAdapter";
const task: Task = { id: "task", title: "Task", harness: "cursor", model: "default", mode: "chat", status: "idle", pinned: false, archived: false, messages: [], queue: [], createdAt: "", updatedAt: "" };
const account: Account = { id: "account", name: "Cursor", harness: "cursor", kind: "api", configured: true };
function fixture() {
	const run = { status: "running", stream: vi.fn(async function* () { yield { type: "thinking", run_id: "run", text: "Considering" }; yield { type: "tool_call", call_id: "tool", name: "read", args: {}, status: "completed" }; }), wait: vi.fn(async () => ({ status: "finished", result: "Answer" })), cancel: vi.fn(async () => {}), steer: vi.fn(async () => "complete_delivered") };
	const agent = { agentId: "session", send: vi.fn(async () => run), close: vi.fn(), [Symbol.asyncDispose]: vi.fn(async () => {}) }; sdk.create.mockResolvedValue(agent); sdk.resume.mockResolvedValue(agent);
	return { run, agent, callbacks: { onDelta: vi.fn(), onSession: vi.fn(), onActivity: vi.fn(), onApproval: vi.fn(async (): Promise<"accept" | "decline"> => "accept") } };
}
beforeEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); });
describe("Cursor SDK harness", () => {
	it("publishes only successful complete foreground todo snapshots, preserving cancellation and clearing", async () => {
		const { run, callbacks } = fixture();
		const result = { status: "success", value: { todos: [{ content: "Inspect 世界", status: "completed" }, { content: "Implement", status: "inProgress" }, { content: "Skipped", status: "cancelled" }], totalCount: 3 } };
		const event = { type: "tool_call", agent_id: "session", run_id: "run", call_id: "todo", name: "updateTodos", status: "completed", args: { todos: [{ content: "Unconfirmed", status: "pending" }] }, result };
		Object.assign(run, { id: "run", agentId: "session" });
		run.stream.mockImplementation(async function* () {
			for (const patch of [{ status: "running" }, { status: "error" }, { agent_id: "child" }, { run_id: "old-run" }, { truncated: { result: true } }, { result: { status: "error", error: "Failed" } }, { result: undefined }, { result: { status: "success", value: { todos: [{ content: "Bad", status: "unknown" }] } } }, {}]) yield { ...event, ...patch } as never;
			yield { ...event, call_id: "clear", result: { status: "success", value: { todos: [], totalCount: 0 } } } as never;
		});
		await new CursorAdapter("/data", () => "key").run(task, "/project", "Hello", callbacks, account);
		const plans = callbacks.onActivity.mock.calls.map(([activity]) => activity).filter(activity => activity.type === "plan");
		expect(plans).toHaveLength(2);
		expect(plans[0]).toMatchObject({ id: "run:todos", text: JSON.stringify(result, null, 2), steps: [{ text: "Inspect 世界", status: "completed" }, { text: "Implement", status: "in_progress" }, { text: "Skipped", status: "cancelled" }] });
		expect(plans[1]).toMatchObject({ id: "run:todos", steps: [] });
	});
	it("disables native tools and inherited settings for Chat and limits Plan tools", () => {
		const options = cursorOptions(task, "/project", "secret", {} as never, []); expect(options.tools).toEqual([]); expect(options.local?.settingSources).toEqual([]); expect(options.mcpServers).toEqual({});
		const plan = cursorOptions({ ...task, mode: "plan" }, "/project", "secret", {} as never, []); expect(plan.tools).toContain("read"); expect(plan.tools).not.toContain("shell"); expect(plan.tools).not.toContain("task"); expect(plan.local?.settingSources).toEqual([]);
	});
	it("does not submit a native tool turn after declined approval", async () => {
		const { callbacks } = fixture(); callbacks.onApproval.mockResolvedValue("decline");
		await expect(new CursorAdapter("/data", () => "key").run({ ...task, mode: "code" }, "/project", "Hello", callbacks, account)).rejects.toBeInstanceOf(AgentInputRejectedError); expect(sdk.create).not.toHaveBeenCalled();
	});
	it("resumes the selected account session and forwards activity and final text", async () => {
		const { agent, callbacks } = fixture(); const credential = vi.fn(() => "key");
		await new CursorAdapter("/data", credential).run({ ...task, nativeSessionId: "prior" }, "/project", "Hello", callbacks, account);
		expect(credential).toHaveBeenCalledExactlyOnceWith("account"); expect(sdk.resume).toHaveBeenCalledWith("prior", expect.objectContaining({ apiKey: "key", tools: [] })); expect(sdk.store.mock.calls[0][0]).toMatch(/native[\\/]cursor[\\/]account$/); expect(callbacks.onSession).toHaveBeenCalledWith("session"); expect(callbacks.onDelta).toHaveBeenCalledExactlyOnceWith("cursor-response", "Answer"); expect(callbacks.onActivity).toHaveBeenCalledTimes(2); expect(agent[Symbol.asyncDispose]).toHaveBeenCalledOnce();
	});
	it("refuses an inherited custom backend before reading an account key", async () => {
		const { callbacks } = fixture(); vi.stubEnv("CURSOR_BACKEND_URL", "https://example.org"); const credential = vi.fn();
		await expect(new CursorAdapter("/data", credential).run(task, "/project", "Hello", callbacks, account)).rejects.toBeInstanceOf(AgentInputRejectedError); expect(credential).not.toHaveBeenCalled(); expect(sdk.create).not.toHaveBeenCalled();
	});
	it("cancels an SDK send that is still admitting its native run", async () => {
		const { run, agent, callbacks } = fixture(); let deliver!: (value: typeof run) => void; agent.send.mockImplementation(() => new Promise(resolve => { deliver = resolve; }));
		const adapter = new CursorAdapter("/data", () => "key"); const completion = adapter.run(task, "/project", "Hello", callbacks, account); await vi.waitFor(() => expect(agent.send).toHaveBeenCalled()); await adapter.cancel(); expect(agent.close).toHaveBeenCalledOnce(); deliver(run); await completion; expect(run.cancel).toHaveBeenCalledOnce();
	});
	it("retains native steering rejection and uncertain transport outcomes separately", async () => {
		const { run, callbacks } = fixture(); let finish!: () => void;
		run.stream.mockImplementation(async function* () { await new Promise<void>(resolve => { finish = resolve; }); yield { type: "thinking", run_id: "run", text: "Done" }; });
		const adapter = new CursorAdapter("/data", () => "key"); const completion = adapter.run(task, "/project", "Hello", callbacks, account);
		await vi.waitFor(() => expect(finish).toBeDefined());
		await adapter.steer({ id: "accepted", text: "Continue", createdAt: "" }, []); expect(run.steer).toHaveBeenCalledWith("Continue");
		run.steer.mockResolvedValueOnce("revert_to_followup"); await expect(adapter.steer({ id: "rejected", text: "Later", createdAt: "" }, [])).rejects.toBeInstanceOf(AgentInputRejectedError);
		run.steer.mockRejectedValueOnce(new Error("Disconnected")); await expect(adapter.steer({ id: "uncertain", text: "Maybe", createdAt: "" }, [])).rejects.not.toBeInstanceOf(AgentInputRejectedError);
		finish(); await completion; await expect(adapter.steer({ id: "late", text: "After", createdAt: "" }, [])).rejects.toBeInstanceOf(AgentInputRejectedError);
	});
	it("waits for pending native steering acknowledgement before finishing", async () => {
		const { run, callbacks } = fixture(); let finish!: () => void; let admit!: (value: string) => void;
		run.stream.mockImplementation(async function* () { await new Promise<void>(resolve => { finish = resolve; }); yield { type: "thinking", run_id: "run", text: "Done" }; });
		run.steer.mockImplementation(() => new Promise(resolve => { admit = resolve; }));
		const adapter = new CursorAdapter("/data", () => "key"); let settled = false;
		const completion = adapter.run(task, "/project", "Hello", callbacks, account).then(() => { settled = true; }); await vi.waitFor(() => expect(finish).toBeDefined());
		const steering = adapter.steer({ id: "pending", text: "Before finishing", createdAt: "" }, []); finish(); await Promise.resolve(); expect(settled).toBe(false); expect(run.wait).not.toHaveBeenCalled(); admit("complete_delivered"); await steering; await completion; expect(settled).toBe(true);
	});
});
