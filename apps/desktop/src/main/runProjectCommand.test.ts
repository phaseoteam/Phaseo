import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ProcessSample } from "./diagnostics/processTable";
import { CommandOutput, commandDescendants, commandShell, runProjectCommand, wholeEnd, wholeStart } from "./runProjectCommand";

const windows = process.platform === "win32";
/** Node by absolute path in either shell; scripts avoid `$` and backticks so both quote them alike. */
const node = (script: string) => `${windows ? "& " : ""}"${process.execPath}" -e "${script}"`;
const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const pids = (output: string, label: string) => [...output.matchAll(new RegExp(`${label} (\\d+)`, "g"))].map(match => Number(match[1]));
/** Polls briefly: a killed process can take a moment to leave the table. */
async function gone(pid: number) { for (let attempt = 0; attempt < 20 && alive(pid); attempt++) await new Promise(resolve => setTimeout(resolve, 100)); return !alive(pid); }

let root: string;
beforeAll(() => { root = mkdtempSync(path.join(tmpdir(), "phaseo-command-")); mkdirSync(path.join(root, "sub")); });
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("runProjectCommand", () => {
	it("returns output, exit code, duration and shell", async () => {
		const result = await runProjectCommand(root, node("console.log('hello'); console.error('warn')"), "sub");
		expect(result).toMatchObject({ exitCode: 0, shell: commandShell().name });
		expect(result.output).toContain("hello"); expect(result.output).toContain("warn");
		expect(result.durationMs).toBeGreaterThanOrEqual(0); expect(result.stopped).toBeUndefined(); expect(result.truncated).toBeUndefined();
	});

	it("reports a native program's non-zero exit code", async () => {
		expect((await runProjectCommand(root, node("process.exit(3)"), ".")).exitCode).toBe(3);
	});

	it("rejects bad timeouts, empty commands and folders outside the project", async () => {
		await expect(runProjectCommand(root, "echo hi", ".", { timeoutMs: 601_000 })).rejects.toThrow("between 1 and 600 seconds");
		await expect(runProjectCommand(root, "echo hi", ".", { timeoutMs: 0 })).rejects.toThrow("between 1 and 600 seconds");
		await expect(runProjectCommand(root, "  ", ".")).rejects.toThrow("empty");
		await expect(runProjectCommand(root, "echo hi", "..")).rejects.toThrow("outside");
	});

	it("kills the whole tree on timeout", async () => {
		const started = Date.now();
		const result = await runProjectCommand(root, node("const c=require('child_process').spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'inherit'}); console.log('parent', process.pid); console.log('child', c.pid); setInterval(()=>{},1000)"), ".", { timeoutMs: 1500 });
		expect(result.stopped).toContain("2 s timeout");
		expect(Date.now() - started).toBeLessThan(12_000);
		for (const pid of [...pids(result.output, "parent"), ...pids(result.output, "child")]) expect(await gone(pid)).toBe(true);
		expect(pids(result.output, "child")).toHaveLength(1);
	});

	it("kills the tree without a job object too, through the process table", async () => {
		const result = await runProjectCommand(root, node("const c=require('child_process').spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'inherit'}); console.log('child', c.pid); setInterval(()=>{},1000)"), ".", { timeoutMs: 1500, jobObject: false });
		expect(result.stopped).toContain("timeout");
		for (const pid of pids(result.output, "child")) expect(await gone(pid)).toBe(true);
	});

	it("stops when cancelled", async () => {
		const controller = new AbortController(), started = Date.now();
		setTimeout(() => controller.abort(), 800);
		const result = await runProjectCommand(root, node("console.log('parent', process.pid); setInterval(()=>{},1000)"), ".", { signal: controller.signal });
		expect(result.stopped).toBe("Command cancelled.");
		expect(Date.now() - started).toBeLessThan(12_000);
		for (const pid of pids(result.output, "parent")) expect(await gone(pid)).toBe(true);
		const aborted = new AbortController(); aborted.abort();
		await expect(runProjectCommand(root, "echo hi", ".", { signal: aborted.signal })).rejects.toThrow("cancelled");
	});

	it("isn't held open by a daemon grandchild, and kills it", async () => {
		const started = Date.now();
		const result = await runProjectCommand(root, node("const c=require('child_process').spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'inherit',detached:true}); console.log('daemon', c.pid); c.unref()"), ".", { timeoutMs: 60_000 });
		expect(Date.now() - started).toBeLessThan(12_000);
		expect(result.exitCode).toBe(0);
		const [daemon] = pids(result.output, "daemon");
		expect(daemon).toBeGreaterThan(0);
		// macOS has neither job objects nor /proc, and a setsid daemon leaves the process group: it is only released.
		if (process.platform !== "darwin") expect(await gone(daemon)).toBe(true);
		else process.kill(daemon, "SIGKILL");
	});

	it.runIf(windows)("returns PowerShell and native output as UTF-8", async () => {
		expect((await runProjectCommand(root, "Write-Output 'café ✓ Привет'", ".")).output.trim()).toBe("café ✓ Привет");
		expect((await runProjectCommand(root, "cmd /c \"echo café\"", ".")).output.trim()).toBe("café");
	});
	it.skipIf(windows)("returns UTF-8 output", async () => {
		expect((await runProjectCommand(root, "printf 'café ✓ Привет\\n'", ".")).output.trim()).toBe("café ✓ Привет");
	});

	it("passes a scrubbed environment with non-interactive Git", async () => {
		process.env.PHASEO_TEST_API_KEY = "never-shown"; process.env.PHASEO_TEST_HARMLESS = "x"; process.env.HARMLESS_TEST_VALUE = "kept";
		try {
			const result = await runProjectCommand(root, node("console.log(JSON.stringify([process.env.PHASEO_TEST_API_KEY, process.env.PHASEO_TEST_HARMLESS, process.env.HARMLESS_TEST_VALUE, process.env.GIT_TERMINAL_PROMPT, Boolean(process.env.PATH || process.env.Path)]))"), ".");
			expect(JSON.parse(result.output.trim())).toEqual([null, null, "kept", "0", true]);
		} finally { delete process.env.PHASEO_TEST_API_KEY; delete process.env.PHASEO_TEST_HARMLESS; delete process.env.HARMLESS_TEST_VALUE; }
	});

	it("keeps the start and end of long output and reports what it dropped", async () => {
		const result = await runProjectCommand(root, node("process.stdout.write('START'+'x'.repeat(200000)+'END')"), ".", { outputLimit: 16 * 1024 });
		expect(result.output.startsWith("START")).toBe(true); expect(result.output.endsWith("END")).toBe(true);
		expect(result.truncated).toBeGreaterThan(180_000);
		expect(result.output).toMatch(/\[… \d+ KB omitted …\]/);
		expect(Buffer.byteLength(result.output)).toBeLessThan(17 * 1024);
	});
});

describe("command output", () => {
	it("cuts at whole UTF-8 characters", () => {
		const bytes = Buffer.from("aé✓");
		expect(wholeEnd(bytes.subarray(0, 2)).toString()).toBe("a");
		expect(wholeEnd(bytes.subarray(0, 5)).toString()).toBe("aé");
		expect(wholeStart(bytes.subarray(2)).toString()).toBe("✓");
		expect(wholeStart(bytes.subarray(4)).length).toBe(0);
	});

	it("keeps a head and a bounded tail", () => {
		const output = new CommandOutput(40);
		for (let index = 0; index < 50; index++) output.push(Buffer.from(`${index % 10}`.repeat(4)));
		const { text, omitted } = output.text();
		expect(text.startsWith("0000111122\n[… 160 bytes omitted …]\n")).toBe(true); expect(text.endsWith("9999")).toBe(true);
		expect(omitted).toBe(200 - 40);
		const small = new CommandOutput(40); small.push(Buffer.from("short"));
		expect(small.text()).toEqual({ text: "short", omitted: 0 });
	});
});

describe("commandDescendants", () => {
	const row = (pid: number, ppid: number, startTimeMs: number): ProcessSample => ({ pid, ppid, name: "node", command: "node", startTimeMs, rssBytes: 0, elapsedMs: 0 });
	it("finds orphans by parent PID and ignores processes that reused a PID", () => {
		const started = 1_000_000;
		const rows = [
			row(10, 1, started), // the shell
			row(11, 10, started + 100), row(12, 11, started + 200), // its tree
			row(13, 10, started + 300), // orphan: still lists the shell as parent
			row(20, 10, started - 60_000), // an older process whose parent PID was reused by the shell
			row(30, 1, started + 400), row(31, 30, started + 500), // unrelated
		];
		expect(commandDescendants(rows, 10, started).map(value => value.pid).sort()).toEqual([11, 12, 13]);
		// The shell is gone and a later process took its PID: only children older than that process are ours.
		const reused = [row(10, 1, started + 60_000), row(11, 10, started + 100), row(14, 10, started + 61_000)];
		expect(commandDescendants(reused, 10, started).map(value => value.pid)).toEqual([11]);
	});
});
