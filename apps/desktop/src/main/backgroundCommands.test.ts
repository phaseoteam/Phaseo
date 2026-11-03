import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { BACKGROUND_LIMIT_PER_TASK, BackgroundCommands, OutputRing } from "./backgroundCommands";
import type { CommandShell } from "./runProjectCommand";

/** Runs each "command" as a Node script, which is quick to start and the same on every platform. */
const nodeShell: CommandShell = { name: "sh", file: process.execPath, args: command => ["-e", command] };
const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };
async function until(check: () => boolean, ms = 5000) { const end = Date.now() + ms; while (!check() && Date.now() < end) await new Promise(resolve => setTimeout(resolve, 50)); return check(); }
const ticker = "console.log('ready'); let n = 0; setInterval(() => console.log('tick ' + n++), 50)";

let root: string, commands: BackgroundCommands;
beforeAll(() => { root = mkdtempSync(path.join(tmpdir(), "phaseo-background-")); });
afterAll(() => rmSync(root, { recursive: true, force: true }));
afterEach(async () => { await commands?.closeAll(); });

describe("BackgroundCommands", () => {
	it("starts, reads incrementally, lists and stops a command", async () => {
		commands = new BackgroundCommands({ shell: nodeShell });
		const { id, pid } = await commands.start("task", root, ticker);
		expect(id).toMatch(/^[0-9a-f]{6}$/);
		await until(() => commands.list("task")[0].outputBytes > 40);
		const first = commands.read("task", id);
		expect(first.output.startsWith("ready")).toBe(true); expect(first.running).toBe(true); expect(first.startOffset).toBe(0);
		await until(() => commands.list("task")[0].outputBytes > first.nextOffset);
		const next = commands.read("task", id);
		expect(next.startOffset).toBe(first.nextOffset); expect(next.output).not.toContain("ready"); expect(next.output).toMatch(/tick \d+/);
		expect(commands.read("task", id, { since: 0, maxBytes: 5 }).output).toBe("ready");
		expect(commands.read("task", id, { tail: 1 }).output).toMatch(/^tick \d+\r?\n$/);
		expect(commands.list("task")).toEqual([expect.objectContaining({ id, pid, running: true, command: ticker, directory: "." })]);
		const stopped = await commands.stop("task", id);
		expect(stopped).toMatchObject({ running: false, stopped: true });
		expect(await until(() => !alive(pid))).toBe(true);
		expect(commands.read("task", id).running).toBe(false);
	});

	it("keeps each task's commands to itself", async () => {
		commands = new BackgroundCommands({ shell: nodeShell });
		const { id } = await commands.start("mine", root, ticker);
		expect(() => commands.read("other", id)).toThrow("no background command");
		await expect(commands.stop("other", id)).rejects.toThrow("no background command");
		expect(commands.list("other")).toEqual([]);
		expect(commands.list("mine")).toHaveLength(1);
	});

	it("reports a command that exits by itself", async () => {
		commands = new BackgroundCommands({ shell: nodeShell });
		const { id } = await commands.start("task", root, "console.log('done'); process.exit(4)");
		await commands.wait("task", id, 5000);
		expect(commands.read("task", id)).toMatchObject({ running: false, exitCode: 4, output: expect.stringContaining("done") });
	});

	it("tells the chat when a command starts and ends, and shows its output without moving the agent's read position", async () => {
		const changes: string[] = [];
		commands = new BackgroundCommands({ shell: nodeShell }); commands.onChange = taskId => changes.push(taskId);
		const { id } = await commands.start("task", root, "console.log('first'); console.log('second'); process.exit(0)");
		expect(changes).toEqual(["task"]);
		await commands.wait("task", id, 5000);
		expect(changes).toEqual(["task", "task"]);
		expect(commands.peek("task", id)).toMatch(/^first\r?\nsecond\r?\n$/);
		expect(commands.read("task", id).output).toMatch(/^first/);
		expect(() => commands.peek("other", id)).toThrow("no background command");
	});

	it("enforces the per-task limit and stops a task's commands", async () => {
		commands = new BackgroundCommands({ shell: nodeShell });
		const started = await Promise.all(Array.from({ length: BACKGROUND_LIMIT_PER_TASK }, () => commands.start("busy", root, "setInterval(() => {}, 1000)")));
		await expect(commands.start("busy", root, "setInterval(() => {}, 1000)")).rejects.toThrow(`already has ${BACKGROUND_LIMIT_PER_TASK}`);
		const other = await commands.start("quiet", root, "setInterval(() => {}, 1000)");
		await commands.stopTask("busy");
		expect(commands.list("busy")).toEqual([]);
		for (const { pid } of started) expect(await until(() => !alive(pid))).toBe(true);
		expect(commands.list("quiet")[0]).toMatchObject({ id: other.id, running: true });
	});

	it("refuses new commands once closed", async () => {
		commands = new BackgroundCommands({ shell: nodeShell });
		const { pid } = await commands.start("task", root, ticker);
		await commands.closeAll();
		expect(await until(() => !alive(pid))).toBe(true);
		await expect(commands.start("task", root, ticker)).rejects.toThrow("quitting");
	});

	it("runs in the real shell and stops what it started", async () => {
		commands = new BackgroundCommands();
		const quoted = `${process.platform === "win32" ? "& " : ""}"${process.execPath}" -e "const c=require('child_process').spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'inherit'}); console.log('child', c.pid); setInterval(()=>{},1000)"`;
		const { id } = await commands.start("task", root, quoted);
		expect(await until(() => /child \d+/.test(commands.read("task", id, { since: 0 }).output))).toBe(true);
		const child = Number(/child (\d+)/.exec(commands.read("task", id, { since: 0 }).output)![1]);
		await commands.stop("task", id);
		expect(await until(() => !alive(child))).toBe(true);
	});
});

describe("OutputRing", () => {
	it("drops old output but keeps absolute offsets", () => {
		const ring = new OutputRing(10);
		for (const part of ["aaaa", "bbbb", "cccc", "dddd"]) ring.push(Buffer.from(part));
		expect(ring.end).toBe(16); expect(ring.start).toBe(4);
		expect(ring.slice(0, 16).toString()).toBe("bbbbccccdddd");
		expect(ring.slice(10, 14).toString()).toBe("ccdd");
	});

	it("reports output dropped before a read", async () => {
		commands = new BackgroundCommands({ shell: nodeShell });
		const { id } = await commands.start("task", root, "process.stdout.write('x'.repeat(3 * 1024 * 1024)); setInterval(() => {}, 1000)");
		expect(await until(() => commands.list("task")[0].outputBytes >= 3 * 1024 * 1024)).toBe(true);
		const read = commands.read("task", id, { since: 0, maxBytes: 100 });
		expect(read.omitted).toBeGreaterThan(1024 * 1024); expect(read.output).toHaveLength(100);
		const latest = commands.read("task", id, { maxBytes: 100 });
		expect(latest.nextOffset).toBe(3 * 1024 * 1024); expect(latest.omitted).toBeGreaterThan(0);
	});
});
