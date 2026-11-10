import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { phoneLimits, type DesktopFrame, type PhoneCapability, type PhoneResponse } from "@phaseo/phone-protocol";
import { fakePhoneHost } from "./fakePhoneHost";
import { PhoneHub } from "./phoneSession";
import { latestOutput, terminalReplay } from "./phoneTerminals";

const folders: string[] = [];
const connected = async (capabilities: PhoneCapability[] = ["code", "terminal"]) => {
	const app = fakePhoneHost(), hub = new PhoneHub(app.host), frames: DesktopFrame[] = [];
	const directory = mkdtempSync(path.join(tmpdir(), "phaseo-phone-terminal-")); folders.push(directory);
	app.projects.push({ id: "pt", name: "phaseo", directory, createdAt: "2026-11-01T00:00:00.000Z" });
	app.addTask({ id: "c1", projectId: "pt", mode: "code" });
	let allowed = capabilities;
	hub.capabilitiesOf = () => allowed;
	const session = hub.open({ id: "dev", name: "Daniel's Pixel" }, frame => frames.push(frame));
	let next = 0;
	const ask = async (request: object) => { const id = `r${next++}`; await session.receive(JSON.stringify({ id, ...request })); return frames.find(frame => "id" in frame && frame.id === id) as PhoneResponse; };
	await ask({ type: "hello", deviceId: "dev", appVersion: "1.0.0", protocol: 7 });
	const events = (type: string) => frames.filter(frame => frame.type === type && !("ok" in frame));
	/** The terminal the phone opened, by its id in the answer. */
	const open = async (scriptId?: string) => {
		const answer = await ask({ type: "open_terminal", chatId: "c1", ...scriptId ? { scriptId } : {} });
		if (!answer.ok) throw new Error(answer.error.message);
		return (answer.result as { terminal: { id: string } }).terminal.id;
	};
	// The service flushes a shell's output every 100 ms, the session batches every 250 ms.
	const batch = () => vi.advanceTimersByTime(400);
	return { app, hub, ask, session, frames, events, open, batch, allow: (value: PhoneCapability[]) => { allowed = value; hub.accessChanged("dev"); } };
};

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true }); });

describe("phone terminals", () => {
	it("refuses every terminal frame without Use terminals, and without Read code, before a shell starts", async () => {
		const { app, ask, allow } = await connected(["code"]);
		const id = app.terminals.service.command({ type: "open", projectId: "pt", taskId: "c1" })[0]!.id;
		const requests = [
			{ type: "list_terminals", chatId: "c1" }, { type: "open_terminal", chatId: "c1" }, { type: "attach_terminal", terminalId: id },
			{ type: "terminal_input", terminalId: id, data: "ls\r" }, { type: "close_terminal", terminalId: id },
			{ type: "list_servers", chatId: "c1" }, { type: "stop_server", chatId: "c1", port: 5173 },
		];
		for (const request of requests) expect(await ask(request)).toMatchObject({ ok: false, error: { code: "forbidden", message: "Allow this on the computer: Settings → Phone." } });
		allow(["terminal"]);
		for (const request of requests) expect(await ask(request)).toMatchObject({ ok: false, error: { code: "forbidden" } });
		expect(app.terminals.ptys).toHaveLength(1);
		expect(app.terminals.ptys[0]!.writes).toEqual([]);
		expect(app.terminals.ptys[0]!.killed).toBe(false);
	});

	it("opens a terminal in the thread's folder as the window does, lists it with the project's scripts, and tells the window", async () => {
		const { app, ask, open } = await connected();
		app.terminals.setScripts("pt", [{ id: "dev", name: "Dev server", command: "pnpm dev", icon: "play", runOnWorktreeCreate: false }]);
		const plain = await open();
		expect(app.terminals.service.get().find(session => session.id === plain)).toMatchObject({ title: "Terminal 1", taskId: "c1", projectId: "pt", cwd: app.projects.find(project => project.id === "pt")!.directory });
		expect(app.git.notes).toEqual([{ device: "Daniel's Pixel", summary: "Opened Terminal 1", projectId: "pt" }]);
		expect(await ask({ type: "list_terminals", chatId: "c1" })).toMatchObject({ ok: true, result: { terminals: [{ id: plain, title: "Terminal 1", status: "running", chatId: "c1" }], scripts: [{ id: "dev", name: "Dev server", command: "pnpm dev" }] } });
		// A project's own terminal and another chat's aren't the thread's.
		app.addTask({ id: "c2", projectId: "pt" });
		const projectOnly = app.terminals.service.command({ type: "open", projectId: "pt" }).find(session => !session.taskId)!.id;
		app.terminals.service.command({ type: "open", projectId: "pt", taskId: "c2" });
		expect(((await ask({ type: "list_terminals", chatId: "c1" })) as { result: { terminals: unknown[] } }).result.terminals).toHaveLength(1);
		expect(await ask({ type: "attach_terminal", terminalId: projectOnly })).toMatchObject({ ok: false, error: { code: "not_found" } });
		// Running a script types its command, as the window's Run menu does.
		await open("dev");
		expect(app.terminals.ptys.at(-1)!.writes).toEqual(["pnpm dev\r"]);
		expect(await ask({ type: "open_terminal", chatId: "c1", scriptId: "gone" })).toMatchObject({ ok: false, error: { code: "not_found" } });
	});

	it("replays recent output, then batches what the shell writes into one frame per 250 ms, and names the phone in the window meanwhile", async () => {
		const { app, ask, open, events, batch } = await connected();
		const id = await open(), pty = app.terminals.ptys.at(-1)!;
		pty.data("PS> "); vi.advanceTimersByTime(150);
		expect(await ask({ type: "attach_terminal", terminalId: id })).toMatchObject({ ok: true, result: { output: "PS> ", truncated: false, terminal: { id, status: "running" } } });
		expect(app.terminals.service.get().find(session => session.id === id)!.phones).toEqual(["Daniel's Pixel"]);
		await ask({ type: "terminal_input", terminalId: id, data: "git status\r" });
		expect(pty.writes).toEqual(["git status\r"]);
		// Twenty writes over two seconds, each flushed by the service: the first goes at once, the rest in one frame per 250 ms.
		const lines = Array.from({ length: 20 }, (_, index) => `line ${index}\r\n`);
		for (const line of lines) { pty.data(line); vi.advanceTimersByTime(100); }
		batch();
		const sent = events("terminal_output") as { terminalId: string; data: string }[];
		expect(sent.length).toBeLessThanOrEqual(1 + Math.ceil(2000 / phoneLimits.entriesBatchMs));
		expect(sent.length).toBeGreaterThan(1);
		expect(sent.map(frame => frame.data).join("")).toBe(lines.join(""));
		expect(sent.every(frame => frame.terminalId === id)).toBe(true);
		await ask({ type: "detach_terminal", terminalId: id });
		expect(app.terminals.service.get().find(session => session.id === id)!.phones).toBeUndefined();
		pty.data("later"); batch();
		expect(events("terminal_output")).toHaveLength(sent.length);
	});

	it("keeps every output frame under 256 KB, escape codes and all, and says when older output was skipped", async () => {
		const { app, ask, open, events, batch } = await connected();
		const id = await open(), pty = app.terminals.ptys.at(-1)!;
		await ask({ type: "attach_terminal", terminalId: id });
		// 3 MB of coloured output in one batch: each Esc is six bytes once JSON-encoded.
		const line = "\u001b[32m+ added line\u001b[0m 🎉\r\n";
		for (let written = 0; written < 3 * 1024 * 1024; written += 64 * 1024) pty.data(line.repeat(Math.ceil(64 * 1024 / line.length)));
		batch();
		const [frame] = events("terminal_output") as { data: string; skipped?: true }[];
		expect(Buffer.byteLength(JSON.stringify(frame))).toBeLessThanOrEqual(phoneLimits.terminalFrameBytes);
		expect(frame!.skipped).toBe(true);
		expect(frame!.data.endsWith(line)).toBe(true);
		// Never half an emoji at the cut.
		expect(/^[\uDC00-\uDFFF]/.test(frame!.data)).toBe(false);
	});

	it("sends a terminal's exit, then stops watching it; input for a finished terminal is refused", async () => {
		const { app, ask, open, events, batch } = await connected();
		const id = await open(), pty = app.terminals.ptys.at(-1)!;
		await ask({ type: "attach_terminal", terminalId: id });
		pty.data("bye\r\n"); pty.exit(3); batch();
		expect(events("terminal_output")).toEqual([{ type: "terminal_output", terminalId: id, data: "bye\r\n" }]);
		expect(events("terminal_updated")).toEqual([{ type: "terminal_updated", terminal: expect.objectContaining({ id, status: "exited", exitCode: 3 }) }]);
		expect(await ask({ type: "terminal_input", terminalId: id, data: "ls\r" })).toMatchObject({ ok: false, error: { code: "rejected" } });
		// The transcript can still be read.
		expect(await ask({ type: "attach_terminal", terminalId: id })).toMatchObject({ ok: true, result: { output: "bye\r\n", terminal: { status: "exited" } } });
		// Close runs the window's close, which stops the process.
		const second = await open();
		expect(await ask({ type: "close_terminal", terminalId: second })).toMatchObject({ ok: true });
		expect(app.terminals.ptys.at(-1)!.killed).toBe(true);
		expect(app.git.notes.at(-1)).toEqual({ device: "Daniel's Pixel", summary: "Closed Terminal 2", projectId: "pt" });
	});

	it("detaches when the connection closes, so the window stops naming the phone and nothing more is sent", async () => {
		const { app, ask, open, session, frames, events, batch } = await connected();
		const id = await open(), pty = app.terminals.ptys.at(-1)!;
		await ask({ type: "attach_terminal", terminalId: id });
		session.close();
		expect(app.terminals.service.get().find(value => value.id === id)!.phones).toBeUndefined();
		const before = frames.length;
		pty.data("after close"); batch();
		expect(frames).toHaveLength(before);
		expect(events("terminal_output")).toEqual([]);
		// The shell keeps running for the window.
		expect(pty.killed).toBe(false);
	});

	it("stops streaming the moment Use terminals is switched off", async () => {
		const { app, ask, open, events, batch, allow } = await connected();
		const id = await open(), pty = app.terminals.ptys.at(-1)!;
		await ask({ type: "attach_terminal", terminalId: id });
		// Written, but not yet flushed by the service when the switch goes off.
		pty.data("before");
		allow(["code"]);
		expect(app.terminals.service.get().find(value => value.id === id)!.phones).toBeUndefined();
		pty.data("after"); batch();
		expect(events("terminal_output")).toEqual([]);
		expect(await ask({ type: "terminal_input", terminalId: id, data: "x" })).toMatchObject({ ok: false, error: { code: "forbidden" } });
	});

	it("lists the thread's servers and stops one, noting it in the window even if access goes while it stops", async () => {
		const { app, ask, allow } = await connected();
		app.terminals.servers.set("c1", [{ port: 5173, url: "http://localhost:5173/", pid: 4242, process: "node.exe", startedBy: "Terminal 1" }, { port: 3000, url: "http://localhost:3000/", pid: 4343, startedBy: "pnpm dev" }]);
		expect(await ask({ type: "list_servers", chatId: "c1" })).toMatchObject({ ok: true, result: { servers: [{ port: 5173, url: "http://localhost:5173/", process: "node.exe", startedBy: "Terminal 1" }, { port: 3000 }] } });
		expect(((await ask({ type: "list_servers", chatId: "c1" })) as { result: { servers: object[] } }).result.servers[0]).not.toHaveProperty("pid");
		expect(await ask({ type: "stop_server", chatId: "c1", port: 5173 })).toMatchObject({ ok: true, result: { servers: [{ port: 3000 }] } });
		expect(app.git.notes.at(-1)).toEqual({ device: "Daniel's Pixel", summary: "Stopped node.exe on port 5173", projectId: "pt" });
		expect(await ask({ type: "stop_server", chatId: "c1", port: 5173 })).toMatchObject({ ok: false, error: { code: "rejected", message: "That server is no longer running from this chat." } });
		// Switched off after the kill: it happened, so the window hears; the phone gets no list.
		const stop = app.host.stopServer;
		app.host.stopServer = async (chatId, port, allowed) => { const server = await stop(chatId, port, allowed); allow(["code"]); return server; };
		expect(await ask({ type: "stop_server", chatId: "c1", port: 3000 })).toMatchObject({ ok: false, error: { code: "forbidden" } });
		expect(app.git.notes.at(-1)).toMatchObject({ summary: "Stopped the server on port 3000" });
	});

	it("kills nothing when Use terminals goes off, or the phone is removed, while Stop looks the server up", async () => {
		for (const revoke of ["switched off", "removed"] as const) {
			const { app, hub, ask, allow } = await connected();
			const server = { port: 5173, url: "http://localhost:5173/", pid: 4242, startedBy: "Terminal 1" };
			app.terminals.servers.set("c1", [server]);
			let release = () => {};
			app.terminals.lookup = () => new Promise<void>(resolve => { release = resolve; });
			const answer = ask({ type: "stop_server", chatId: "c1", port: 5173 });
			await Promise.resolve();
			if (revoke === "switched off") allow(["code"]); else hub.closeDevice("dev");
			release();
			const response = await answer;
			if (revoke === "switched off") expect(response).toMatchObject({ ok: false, error: { code: "forbidden" } });
			expect(app.terminals.servers.get("c1")).toEqual([server]);
			expect(app.git.notes.some(note => note.summary.startsWith("Stopped"))).toBe(false);
		}
	});
});

describe("terminal output sizes", () => {
	it("cuts to the latest output that fits, measured as JSON", () => {
		expect(latestOutput("hello", 100)).toEqual({ data: "hello", cut: false });
		const { data, cut } = latestOutput("\u001b".repeat(100) + "end", 60);
		expect(cut).toBe(true);
		expect(Buffer.byteLength(JSON.stringify(data)) - 2).toBeLessThanOrEqual(60);
		expect(data.endsWith("end")).toBe(true);
	});
	it("replays from the start of a line when the cut lands mid-line", () => {
		// The latest 64 KB start 99 characters before a line break.
		const tail = "b".repeat(phoneLimits.terminalReplayBytes - 100);
		expect(terminalReplay("a".repeat(10_000) + "\n" + tail)).toEqual({ output: tail, truncated: true });
		// With no line break near the cut, the cut stands.
		expect(terminalReplay("c".repeat(phoneLimits.terminalReplayBytes * 2)).output).toHaveLength(phoneLimits.terminalReplayBytes);
		expect(terminalReplay("short")).toEqual({ output: "short", truncated: false });
	});
});
