import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Account, Task } from "../shared/workspace";
import type * as GrokLaunch from "./grokLaunch";
import { AgentInputRejectedError } from "./agentAdapter";

const native = vi.hoisted(() => ({ resolve: vi.fn(), run: vi.fn(), cancel: vi.fn(), options: vi.fn() }));
vi.mock("./grokLaunch", async importOriginal => ({ ...await importOriginal<typeof GrokLaunch>(), resolveGrokCommand: native.resolve }));
vi.mock("./acpAdapter", () => ({ AcpAdapter: class {
	constructor(...args: unknown[]) { native.options(...args); }
	run(...args: unknown[]) { return native.run(...args); }
	cancel() { return native.cancel(); }
} }));
import { GrokAdapter } from "./grokAdapter";
import { nativeAccountEnvironment } from "./nativeAccountEnvironment";

const task: Task = { id: "task", title: "Task", harness: "grok", model: "default", mode: "code", status: "idle", pinned: false, archived: false, messages: [], queue: [], createdAt: "", updatedAt: "" };
const account: Account = { id: "profile", name: "Profile", harness: "grok", kind: "native", configured: false, configDirectory: "/owned/grok-profile" };
const callbacks = { onDelta: vi.fn(), onSession: vi.fn(), onApproval: async () => "decline" as const };

describe("native Grok launch ownership", () => {
	beforeEach(() => { vi.clearAllMocks(); native.resolve.mockResolvedValue({ executable: "/owned/grok", prefix: [] }); native.run.mockResolvedValue(undefined); });
	afterEach(() => vi.unstubAllEnvs());
	it.each(["code", "plan"] as const)("launches %s with supervised native permissions and an owned process", async mode => {
		await new GrokAdapter().run({ ...task, mode }, "/project", "Instruction", callbacks, account);
		expect(native.options).toHaveBeenCalledWith({ id: "grok", name: "Grok", executable: "/owned/grok", arguments: ["--no-auto-update", "--permission-mode", mode === "plan" ? "plan" : "default", "agent", "--no-leader", "stdio"] }, [], expect.objectContaining({ GROK_HOME: account.configDirectory }));
		expect(native.run).toHaveBeenCalledWith({ ...task, mode }, "/project", "Instruction", callbacks, account, []);
	});
	it("rejects Chat before starting a process until its tool isolation is implemented", async () => {
		await expect(new GrokAdapter().run({ ...task, mode: "chat" }, "/project", "Hello", callbacks)).rejects.toBeInstanceOf(AgentInputRejectedError);
		expect(native.resolve).not.toHaveBeenCalled(); expect(native.options).not.toHaveBeenCalled();
	});
	it.each([{ ...account, harness: "claude" as const }, { ...account, kind: "api" as const }, { ...account, configDirectory: undefined }])("rejects an incompatible account before launch", async invalid => {
		await expect(new GrokAdapter().run(task, "/project", "Hello", callbacks, invalid)).rejects.toThrow("native Grok profile");
		expect(native.resolve).not.toHaveBeenCalled();
	});
	it("retains unsubmitted input when CLI discovery fails", async () => {
		native.resolve.mockRejectedValueOnce(new Error("Unavailable"));
		await expect(new GrokAdapter().run(task, "/project", "Hello", callbacks)).rejects.toBeInstanceOf(AgentInputRejectedError);
		expect(native.run).not.toHaveBeenCalled();
	});
	it("does not start a process after cancellation during CLI discovery", async () => {
		let resolve!: (value: { executable: string; prefix: string[] }) => void;
		native.resolve.mockReturnValueOnce(new Promise(done => { resolve = done; }));
		const adapter = new GrokAdapter(); const run = adapter.run(task, "/project", "Hello", callbacks);
		const rejected = expect(run).rejects.toThrow("stopped"); await adapter.cancel(); resolve({ executable: "/owned/grok", prefix: [] }); await rejected;
		expect(native.options).not.toHaveBeenCalled();
	});
	it("isolates selected profiles from ambient Grok credentials and routing", () => {
		vi.stubEnv("XAI_API_KEY", "fixture-key"); vi.stubEnv("GROK_BASE_URL", "https://fixture.invalid"); vi.stubEnv("GROK_CUSTOM_SETTING", "fixture");
		const environment = nativeAccountEnvironment(account);
		expect(environment).toMatchObject({ GROK_HOME: account.configDirectory, XAI_API_KEY: undefined, GROK_BASE_URL: undefined, GROK_CUSTOM_SETTING: undefined });
		expect(environment).not.toHaveProperty("PATH"); expect(nativeAccountEnvironment()).toBeUndefined();
	});
});
