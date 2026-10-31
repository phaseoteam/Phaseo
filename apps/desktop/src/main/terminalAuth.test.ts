import { describe, expect, it } from "vitest";
import { validateTerminalAuth, type TerminalAuthRequest } from "./terminalAuth";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { WorkspaceStore } from "./workspaceStore";
const request: TerminalAuthRequest = { agent: { id: "agent", name: "Agent", executable: "/fixture", arguments: [] }, args: ["--login"], env: {}, title: "Sign in", taskId: "task", cwd: "/workspace" };
describe("native terminal authentication validation", () => {
	it("recovers the original input after a crash during sign-in", () => {
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-auth-recovery-")); const filename = path.join(directory, "workspace.sqlite");
		try {
			const store = new WorkspaceStore(filename); const task = store.apply({ type: "create-task", harness: "codex", model: "default", mode: "code" });
			task.messages = [{ id: "original", role: "user", text: "Original instruction", createdAt: "now" }]; task.queue = [{ id: "later", text: "Later instruction", createdAt: "later" }]; task.status = "waiting"; task.authTerminalId = "auth"; task.authInputId = "original"; store.saveTask(task); store.close();
			const restored = new WorkspaceStore(filename); try { const current = restored.getTask(task.id); expect(current.status).toBe("interrupted"); expect(current.messages).toEqual([]); expect(current.queue.map(value => value.id)).toEqual(["original", "later"]); expect(current.authTerminalId).toBeUndefined(); expect(current.authInputId).toBeUndefined(); } finally { restored.close(); }
		} finally { rmSync(directory, { recursive: true, force: true }); }
	});
	it("bounds native arguments and environment without changing native values", () => {
		expect(() => validateTerminalAuth(request)).not.toThrow();
		for (const args of [["bad\0value"], Array(101).fill("value"), ["x".repeat(10001)]]) expect(() => validateTerminalAuth({ ...request, args })).toThrow("arguments");
		const environments: Record<string, string>[] = [{ "BAD=KEY": "value" }, { KEY: "bad\0value" }, { KEY: "x".repeat(10001) }];
		for (const env of environments) expect(() => validateTerminalAuth({ ...request, env })).toThrow("environment");
	});
});
