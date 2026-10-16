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
	it("numbers terminals per chat and project and checks the chat's project", () => {
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-terminal-titles-"));
		const store = new WorkspaceStore(":memory:");
		const pty = { write: vi.fn(), resize: vi.fn(), kill: vi.fn(), onData: () => {}, onExit: () => {} };
		native.spawn.mockReturnValue(pty);
		const service = new TerminalService(store, directory);
		try {
			const project = store.addProject(directory);
			const now = new Date().toISOString();
			store.saveTask({ id: "chat", projectId: project.id, title: "Chat", harness: "codex", model: "default", mode: "code", status: "idle", pinned: false, archived: false, messages: [], queue: [], createdAt: now, updatedAt: now });
			const titles = () => service.get().filter(session => session.taskId === "chat").map(session => session.title).sort();
			service.command({ type: "open", projectId: project.id, taskId: "chat" }); service.command({ type: "open", projectId: project.id, taskId: "chat" });
			expect(titles()).toEqual(["Terminal 1", "Terminal 2"]);
			expect(service.command({ type: "open", projectId: project.id }).find(session => !session.taskId)?.title).toBe("Terminal 1");
			expect(() => service.command({ type: "open", taskId: "chat" })).toThrow("another project");
			expect(() => service.command({ type: "open", projectId: project.id, taskId: "missing" })).toThrow("no longer exists");
		} finally { service.close(); store.close(); rmSync(directory, { recursive: true, force: true }); }
	});
	it("opens project scripts in a terminal named after them", () => {
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-terminal-scripts-"));
		const store = new WorkspaceStore(":memory:");
		const pty = { write: vi.fn(), resize: vi.fn(), kill: vi.fn(), onData: () => {}, onExit: () => {} };
		native.spawn.mockReturnValue(pty);
		const service = new TerminalService(store, directory);
		try {
			const project = store.addProject(directory); project.settings = { scripts: [{ id: "dev", name: "Dev server", command: "pnpm dev", icon: "play", runOnWorktreeCreate: false }] }; store.saveProject(project);
			expect(service.command({ type: "open", projectId: project.id, scriptId: "dev" }).find(session => session.title === "Dev server")).toBeDefined();
			expect(pty.write).toHaveBeenCalledWith("pnpm dev\r");
			expect(() => service.command({ type: "open", projectId: project.id, scriptId: "missing" })).toThrow("no longer exists");
			expect(() => service.command({ type: "open", scriptId: "dev" })).toThrow("Invalid project script");
		} finally { service.close(); store.close(); rmSync(directory, { recursive: true, force: true }); }
	});
	it("closes a settled chat's idle terminals and keeps busy ones, or all when the check fails", async () => {
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-terminal-idle-"));
		const store = new WorkspaceStore(":memory:");
		const ptys: { pid: number; kill: ReturnType<typeof vi.fn>; exit?: (event: { exitCode: number }) => void }[] = [];
		native.spawn.mockImplementation(() => { const pty = { pid: 100 + ptys.length, write: vi.fn(), resize: vi.fn(), kill: vi.fn(() => pty.exit?.({ exitCode: 0 })), onData: () => {}, onExit: (callback: (event: { exitCode: number }) => void) => { pty.exit = callback; } } as { pid: number; write: unknown; resize: unknown; kill: ReturnType<typeof vi.fn>; onData: unknown; onExit: unknown; exit?: (event: { exitCode: number }) => void }; ptys.push(pty); return pty; });
		let table: () => Promise<{ pid: number; ppid: number; name: string }[]> = async () => [{ pid: 100, ppid: 1, name: "bash" }, { pid: 101, ppid: 1, name: "bash" }, { pid: 500, ppid: 101, name: "node" }];
		const service = new TerminalService(store, directory, native.spawn, () => table());
		try {
			const project = store.addProject(directory), now = new Date().toISOString();
			store.saveTask({ id: "chat", projectId: project.id, title: "Chat", harness: "codex", model: "default", mode: "code", status: "idle", pinned: false, archived: false, messages: [], queue: [], createdAt: now, updatedAt: now });
			service.command({ type: "open", projectId: project.id, taskId: "chat" }); service.command({ type: "open", projectId: project.id, taskId: "chat" }); service.command({ type: "open", projectId: project.id });
			table = async () => { throw new Error("ps failed"); };
			expect(await service.closeIdle("chat")).toBe(0);
			table = async () => [{ pid: 100, ppid: 1, name: "bash" }, { pid: 101, ppid: 1, name: "bash" }, { pid: 500, ppid: 101, name: "node" }];
			expect(await service.closeIdle("chat")).toBe(1);
			expect(ptys[0].kill).toHaveBeenCalled(); expect(ptys[1].kill).not.toHaveBeenCalled(); expect(ptys[2].kill).not.toHaveBeenCalled();
			// The idle terminal's transcript goes with it.
			expect(store.getTerminals().filter(session => session.taskId === "chat").map(session => session.status)).toEqual(["running"]);
		} finally { service.close(); store.close(); rmSync(directory, { recursive: true, force: true }); }
	});
});
