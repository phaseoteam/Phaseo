import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import type { Task } from "../shared/workspace";

const native = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock("./nativeProcess", () => ({ spawnNative: native.spawn }));
import { CodexAdapter } from "./codexAdapter";

function fixture(onRequest: (packet: { id: number; method: string; params: Record<string, unknown> }, send: (value: unknown) => void) => void) {
	const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn() });
	let buffer = "";
	child.stdin.on("data", chunk => {
		buffer += chunk.toString();
		let index: number;
		while ((index = buffer.indexOf("\n")) >= 0) {
			const line = buffer.slice(0, index); buffer = buffer.slice(index + 1);
			const packet = JSON.parse(line);
			onRequest(packet, value => child.stdout.write(`${JSON.stringify(value)}\n`));
		}
	});
	native.spawn.mockResolvedValue(child); return child;
}
const task: Task = { id: "task", title: "Task", harness: "codex", model: "default", mode: "code", status: "idle", pinned: false, archived: false, messages: [], queue: [], createdAt: "", updatedAt: "" };

describe("Codex native integration", () => {
	it("initializes, streams native output, and waits for the completed turn", async () => {
		const methods: string[] = [];
		const child = fixture((packet, send) => {
			methods.push(packet.method);
			if (packet.method === "initialize") send({ id: packet.id, result: {} });
			if (packet.method === "thread/start") send({ id: packet.id, result: { thread: { id: "native" } } });
			if (packet.method === "turn/start") {
				expect(packet.params.input).toEqual([{ type: "text", text: "Hello", text_elements: [] }, { type: "localImage", path: "/image.png" }]);
				send({ id: packet.id, result: { turn: { id: "turn" } } });
				send({ method: "item/agentMessage/delta", params: { threadId: "other", itemId: "a", delta: "Ignored" } });
				send({ method: "item/agentMessage/delta", params: { threadId: "native", itemId: "a", delta: "Hello" } });
				send({ method: "item/completed", params: { threadId: "native", item: { id: "command", type: "commandExecution", command: "git status", aggregatedOutput: "clean", status: "completed" } } });
				send({ method: "item/reasoning/summaryTextDelta", params: { threadId: "native", itemId: "reasoning", delta: "Checking" } });
				send({ method: "turn/completed", params: { threadId: "native", turn: { id: "turn", status: "completed" } } });
			}
		});
		const onDelta = vi.fn(); const onSession = vi.fn(); const onActivity = vi.fn();
		await new CodexAdapter().run(task, ".", "Hello", { onDelta, onSession, onActivity, onApproval: async () => "decline" }, undefined, [{ id: "image", taskId: "task", name: "image.png", kind: "image", mimeType: "image/png", size: 3, filePath: "/image.png", dataUrl: "data:image/png;base64,YWJj" }]);
		expect(methods).toEqual(["initialize", "initialized", "thread/start", "turn/start"]);
		expect(onDelta).toHaveBeenCalledExactlyOnceWith("a", "Hello");
		expect(onSession).toHaveBeenCalledWith("native"); expect(child.kill).toHaveBeenCalled();
		expect(onActivity).toHaveBeenCalledWith(expect.objectContaining({ title: "git status", text: "clean", status: "completed" }));
		expect(onActivity).toHaveBeenCalledWith(expect.objectContaining({ type: "reasoning", text: "Checking", append: true }));
	});
	it("uses native forks rather than presenting visible history as a resumed session", async () => {
		const methods: string[] = [];
		fixture((packet, send) => {
			methods.push(packet.method);
			if (packet.method === "initialize") send({ id: packet.id, result: {} });
			if (packet.method === "thread/fork") { expect(packet.params.threadId).toBe("source"); send({ id: packet.id, result: { thread: { id: "fork" } } }); }
			if (packet.method === "turn/start") { send({ id: packet.id, result: { turn: { id: "turn" } } }); send({ method: "turn/completed", params: { threadId: "fork", turn: { id: "turn", status: "completed" } } }); }
		});
		await new CodexAdapter().run({ ...task, nativeForkFrom: "source" }, ".", "Continue", { onDelta: () => {}, onSession: () => {}, onApproval: async () => "decline" });
		expect(methods).toContain("thread/fork");
	});
});
