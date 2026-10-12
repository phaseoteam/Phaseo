import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
const native = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock("node-pty", () => ({ spawn: native.spawn }));
import { TerminalService } from "./terminalService";
import { WorkspaceStore } from "./workspaceStore";

describe("terminal lifecycle", () => {
	it.each([0, 1, "cancel"] as const)("runs native sign-in without retaining a transcript (%s)", async outcome => {
		const store = new WorkspaceStore(":memory:"); let data!: (value: string) => void; let exit!: (value: { exitCode: number }) => void;
		const pty = { kill: vi.fn(), onData: (callback: typeof data) => { data = callback; }, onExit: (callback: typeof exit) => { exit = callback; }, write: vi.fn(), resize: vi.fn() }; native.spawn.mockReturnValue(pty);
		const service = new TerminalService(store, tmpdir()); const controller = new AbortController();
		try {
			const auth = service.authenticate({ agent: { id: "agent", name: "Agent", executable: "/agent", arguments: ["--native"] }, args: ["--login"], env: { LOGIN_FIXTURE: "private", ELECTRON_RUN_AS_NODE: "0" }, title: "Sign in", cwd: tmpdir(), taskId: "task" }, controller.signal);
			expect(native.spawn).toHaveBeenLastCalledWith("/agent", ["--native", "--login"], expect.objectContaining({ env: expect.objectContaining({ LOGIN_FIXTURE: "private", ELECTRON_RUN_AS_NODE: "1" }) }));
			data("Private sign-in output"); expect(service.get()).toHaveLength(1); expect(store.getTerminals()).toEqual([]);
			if (outcome === "cancel") { controller.abort(); await expect(auth.completed).rejects.toThrow("cancelled"); expect(pty.kill).toHaveBeenCalled(); }
			else { exit({ exitCode: outcome }); if (outcome === 0) await auth.completed; else await expect(auth.completed).rejects.toThrow("without completing"); }
			expect(store.getTerminals()).toEqual([]); expect(service.get()).toEqual([]);
		} finally { service.close(); store.close(); }
	});
	it("validates input, persists output and safely ignores late events after shutdown", () => {
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-terminal-"));
		const store = new WorkspaceStore(":memory:");
		let data: (data: string) => void = () => {}; let exit: (event: { exitCode: number }) => void = () => {};
		const pty = { write: vi.fn(), resize: vi.fn(), kill: vi.fn(), onData: (callback: typeof data) => { data = callback; }, onExit: (callback: typeof exit) => { exit = callback; } };
		native.spawn.mockReturnValue(pty);
		const service = new TerminalService(store, directory);
		try {
			expect(() => service.command({ type: "open", projectId: "missing" })).toThrow("Project");
			const id = service.command({ type: "open" })[0].id;
			expect(() => service.command({ type: "resize", id, columns: 0, rows: 30 })).toThrow("dimensions");
			service.command({ type: "write", id, data: "echo hi\r" }); expect(pty.write).toHaveBeenCalledWith("echo hi\r");
			data("Hello"); data(" world");
			exit({ exitCode: 7 }); expect(store.getTerminals()[0]).toMatchObject({ output: "Hello world", status: "exited", exitCode: 7 });
			expect(() => service.command({ type: "write", id, data: "x" })).toThrow("no longer running");
			service.command({ type: "open" }); data("Before shutdown"); service.close();
			expect(store.getTerminals().find(session => session.status === "interrupted")?.output).toBe("Before shutdown");
			store.close(); data("After shutdown"); exit({ exitCode: 0 });
		} finally { rmSync(directory, { recursive: true, force: true }); }
	});
});
