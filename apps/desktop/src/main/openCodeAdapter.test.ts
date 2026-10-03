import { describe, expect, it, vi } from "vitest";
import type { Task } from "../shared/workspace";
const sdk = vi.hoisted(() => ({ discover: vi.fn(), make: vi.fn() }));
vi.mock("@opencode/client", () => ({ OpenCode: { make: sdk.make } }));
vi.mock("@opencode/client/service", () => ({ Service: { discover: sdk.discover, headers: () => ({}) } }));
import { OpenCodeAdapter } from "./openCodeAdapter";

const task: Task = { id: "task", title: "Task", harness: "opencode", model: "default", mode: "code", status: "idle", pinned: false, archived: false, messages: [], queue: [], createdAt: "", updatedAt: "" };
describe("OpenCode 2 integration", () => {
	it("requires a compatible service", async () => {
		sdk.discover.mockResolvedValue(undefined);
		await expect(new OpenCodeAdapter().run(task, ".", "Hello", { onSession: () => {}, onDelta: () => {}, onApproval: async () => "decline" })).rejects.toThrow("Start an OpenCode 2 service");
		expect(sdk.discover.mock.calls.at(-1)?.[0].version("1.18.31")).toBe(false);
	});
	it("subscribes before prompting and handles explicit permissions", async () => {
		sdk.discover.mockResolvedValue({ url: "http://localhost:4096" });
		let prompted = false;
		let promptResolve: () => void = () => {};
		const prompt = new Promise<void>(resolve => { promptResolve = resolve; });
		const reply = vi.fn(); const fork = vi.fn(async () => ({ id: "fork" }));
		sdk.make.mockReturnValue({
			session: { fork, prompt: vi.fn(async () => { prompted = true; promptResolve(); }) },
			permission: { reply },
			event: { subscribe: async function* (options: { onActivity: () => void }) {
				expect(prompted).toBe(false); options.onActivity(); await prompt;
				yield { type: "session.text.delta", data: { sessionID: "other", assistantMessageID: "ignored", delta: "wrong" } };
				yield { type: "permission.asked", data: { sessionID: "fork", id: "permission", action: "write", resources: ["file.ts"] } };
				yield { type: "session.text.delta", data: { sessionID: "fork", assistantMessageID: "message", delta: "Done" } };
				yield { type: "session.execution.succeeded", data: { sessionID: "fork" } };
			} },
		});
		const onDelta = vi.fn(); const onSession = vi.fn();
		await new OpenCodeAdapter().run({ ...task, nativeForkFrom: "source" }, ".", "Hello", { onDelta, onSession, onApproval: async () => "accept" });
		expect(fork).toHaveBeenCalledWith({ sessionID: "source" }, expect.anything());
		expect(onSession).toHaveBeenCalledWith("fork");
		expect(reply).toHaveBeenCalledWith({ sessionID: "fork", requestID: "permission", decision: "once" }, expect.anything());
		expect(onDelta).toHaveBeenCalledExactlyOnceWith("message", "Done");
	});
});
