import { describe, expect, it } from "vitest";
import { validateResourceHistoryRequest, validateStopProcessRequest } from "../../shared/diagnostics";
import { ProcessDiagnostics } from "./processDiagnostics";
import { buildProcessTree, parseClock, parsePosixProcesses, parseWindowsProcesses, processKind, type ProcessSample } from "./processTable";
import { ResourceHistoryStore } from "./resourceHistory";

const row = (pid: number, ppid: number, name: string, extra: Partial<ProcessSample> = {}): ProcessSample => ({ pid, ppid, name, command: name, startTimeMs: 1_000 + pid, rssBytes: 1024 * pid, elapsedMs: 10_000, cpuTimeMs: 0, ...extra });

describe("process tables", () => {
	it("reads the Windows CIM query", () => {
		const json = JSON.stringify([
			{ p: 100, pp: 4, n: "Phaseo.exe", c: "\"C:\\Phaseo\\Phaseo.exe\"", s: 1_000, w: 200_000_000, k: 10_000_000, u: 20_000_000 },
			{ p: 101, pp: 100, n: "node.exe", c: null, s: 0, w: 5, k: null, u: 0 },
			{ p: "x", pp: 1 },
		]);
		expect(parseWindowsProcesses(json, 11_000)).toEqual([
			{ pid: 100, ppid: 4, name: "Phaseo.exe", command: "\"C:\\Phaseo\\Phaseo.exe\"", startTimeMs: 1_000, rssBytes: 200_000_000, elapsedMs: 10_000, cpuTimeMs: 3_000 },
			{ pid: 101, ppid: 100, name: "node.exe", command: "node.exe", startTimeMs: 0, rssBytes: 5, elapsedMs: 0, cpuTimeMs: 0 },
		]);
		expect(parseWindowsProcesses(JSON.stringify({ p: 7, pp: 1, n: "a", s: 5 }), 10)).toHaveLength(1);
		expect(parseWindowsProcesses("  ")).toEqual([]);
	});

	it("reads ps output with lstart and arguments containing spaces", () => {
		const text = "  500     1  12.5  2048    01:02:03  0:04.50 Thu Oct 16 10:00:00 2026 /Applications/Phaseo.app/Contents/MacOS/Phaseo --type=main\n  501   500   0.0   100       00:05  0:00.01 Thu Oct 16 10:59:55 2026 git status --porcelain\nbad\n";
		const rows = parsePosixProcesses(text);
		expect(rows).toHaveLength(2);
		expect(rows[0]).toMatchObject({ pid: 500, ppid: 1, name: "Phaseo", command: "/Applications/Phaseo.app/Contents/MacOS/Phaseo --type=main", rssBytes: 2048 * 1024, elapsedMs: 3_723_000, cpuTimeMs: 4_500, cpuPercent: 12.5, startTimeMs: Date.parse("Oct 16 10:00:00 2026") });
		expect(rows[1]).toMatchObject({ name: "git", elapsedMs: 5_000 });
		expect(parseClock("2-03:00:01")).toBe(((2 * 24 + 3) * 3600 + 1) * 1000);
		expect(parseClock("nonsense")).toBeUndefined();
	});

	it("names what it can", () => {
		expect(processKind("node C:\\npm\\node_modules\\@openai\\codex\\bin\\codex.js app-server", "node.exe")).toBe("agent");
		expect(processKind("git --no-pager diff", "git.exe")).toBe("git");
		expect(processKind("npx -y @modelcontextprotocol/server-filesystem", "node")).toBe("mcp");
		expect(processKind("pwsh.exe -NoLogo", "pwsh.exe")).toBe("terminal");
		expect(processKind("python app.py", "python")).toBe("process");
	});

	it("builds the tree below the main process with CPU from the change since the last sample", () => {
		const rows = [row(1, 0, "init"), row(100, 1, "Phaseo.exe", { cpuTimeMs: 5_000 }), row(110, 100, "Phaseo.exe", { cpuTimeMs: 100 }), row(120, 100, "pwsh.exe", { cpuTimeMs: 2_000 }), row(121, 120, "node.exe", { cpuTimeMs: 50 }), row(130, 100, "stale.exe", { startTimeMs: 1 }), row(200, 1, "other.exe")];
		const previous = new Map([["100:1100", { cpuTimeMs: 4_000, at: 9_000 }], ["120:1120", { cpuTimeMs: 2_000, at: 9_000 }]]);
		const tree = buildProcessTree(rows, 100, { previous, now: 10_000, electron: new Map([[110, { kind: "renderer" as const, label: "App window" }]]), owners: new Map([[120, { label: "Terminal 1 · Fix the build", kind: "terminal" as const }]]) });
		expect(tree.map(value => [value.pid, value.depth, value.kind, value.label, value.stoppable])).toEqual([
			[100, 0, "main", "Phaseo main process", false],
			[110, 1, "renderer", "App window", false],
			[120, 1, "terminal", "Terminal 1 · Fix the build", true],
			[121, 2, "process", "Terminal 1 · Fix the build", true],
		]);
		expect(tree[0]).toMatchObject({ cpuPercent: 100, childPids: [110, 120] });
		expect(tree[2].cpuPercent).toBe(0);
		// First sight: the lifetime average.
		expect(tree[3].cpuPercent).toBe(0.5);
		expect(buildProcessTree(rows, 999, { now: 1 })).toEqual([]);
	});
});

describe("resource history", () => {
	const processes = (cpu: number, extra = 0) => [{ pid: 100, ppid: 1, startTimeMs: 1, name: "Phaseo", command: "Phaseo", kind: "main" as const, cpuPercent: cpu, rssBytes: 1_000, elapsedMs: 1, depth: 0, childPids: [], stoppable: false }, ...Array.from({ length: extra }, (_, index) => ({ pid: 200 + index, ppid: 100, startTimeMs: 2, name: "node", command: `node ${"x".repeat(200)}`, kind: "process" as const, cpuPercent: 50, rssBytes: 500, elapsedMs: 1, depth: 1, childPids: [], stoppable: true }))];

	it("summarises buckets and per-process figures over a window", () => {
		const store = new ResourceHistoryStore();
		const start = 1_000_000;
		store.add(start + 1_000, processes(10, 1));
		store.add(start + 4_000, processes(30, 1));
		store.add(start + 40_000, processes(20));
		const result = store.summarise({ windowMs: 60_000, bucketMs: 30_000, now: start + 60_000, sampleIntervalMs: 3_000, rootPid: 100 });
		expect(result.buckets).toHaveLength(2);
		expect(result.buckets[0]).toMatchObject({ avgCpuPercent: 70, maxCpuPercent: 80, maxProcessCount: 2, maxRssBytes: 1_500 });
		expect(result.buckets[1]).toMatchObject({ avgCpuPercent: 20, maxCpuPercent: 20, maxProcessCount: 1 });
		const [root, child] = result.processes;
		expect(root).toMatchObject({ pid: 100, isRoot: true, currentCpuPercent: 20, maxCpuPercent: 30, avgCpuPercent: 20, sampleCount: 3 });
		expect(root.buckets).toEqual([{ avgCpuPercent: 20, maxCpuPercent: 30 }, { avgCpuPercent: 20, maxCpuPercent: 20 }]);
		expect(child).toMatchObject({ pid: 200, currentCpuPercent: 0, sampleCount: 2 });
		// 10% for one 3 s interval, 30% for 3 s, 20% for the 30 s bucket cap.
		expect(root.cpuSeconds).toBeCloseTo(0.3 + 0.9 + 6, 5);
		expect(result.retainedSampleCount).toBe(3);
	});

	it("keeps within its age, count and size bounds", () => {
		const aged = new ResourceHistoryStore({ maxAgeMs: 10_000, maxSamples: 100, maxBytes: 1e9 });
		for (let index = 0; index < 20; index++) aged.add(index * 1_000, processes(1));
		expect(aged.sampleCount).toBe(11);
		const counted = new ResourceHistoryStore({ maxAgeMs: 1e9, maxSamples: 5, maxBytes: 1e9 });
		for (let index = 0; index < 20; index++) counted.add(index, processes(1));
		expect(counted.sampleCount).toBe(5);
		const sized = new ResourceHistoryStore({ maxAgeMs: 1e9, maxSamples: 1e9, maxBytes: 20_000 });
		for (let index = 0; index < 50; index++) sized.add(index, processes(1, 10));
		expect(sized.retainedBytes).toBeLessThanOrEqual(20_000);
		expect(sized.sampleCount).toBeGreaterThan(0);
		expect(sized.sampleCount).toBeLessThan(50);
	});
});

describe("process diagnostics", () => {
	const table = (child: Partial<ProcessSample> = {}) => [row(100, 1, "Phaseo.exe", { cpuTimeMs: 1_000 }), row(110, 100, "Phaseo.exe"), row(120, 100, "codex.exe", child)];

	it("samples on a timer only while subscribed, and on request otherwise", async () => {
		let queries = 0, now = 10_000;
		const diagnostics = new ProcessDiagnostics({ rootPid: 100, now: () => now, intervalMs: 60_000, query: async () => { queries++; return table(); } });
		const first = await diagnostics.processes();
		expect(first).toMatchObject({ rootPid: 100, processCount: 2 });
		await diagnostics.processes();
		expect(queries).toBe(1);
		now += 2_000;
		const history = await diagnostics.resources({ windowMs: 300_000, bucketMs: 30_000 });
		expect(queries).toBe(2);
		expect(history.sampleIntervalMs).toBe(0);
		expect(diagnostics.sampling).toBe(false);
		diagnostics.subscribe(1); diagnostics.subscribe(2);
		expect(diagnostics.sampling).toBe(true);
		diagnostics.unsubscribe(1);
		expect(diagnostics.sampling).toBe(true);
		expect((await diagnostics.resources({ windowMs: 300_000, bucketMs: 30_000 })).sampleIntervalMs).toBe(60_000);
		diagnostics.unsubscribe(2);
		expect(diagnostics.sampling).toBe(false);
		diagnostics.close();
	});

	it("stops only a live descendant whose identity still matches", async () => {
		const killed: number[] = [];
		let child: Partial<ProcessSample> = {};
		const diagnostics = new ProcessDiagnostics({ rootPid: 100, electron: () => new Map([[110, { kind: "renderer" as const, label: "App window" }]]), query: async () => table(child), kill: pid => { killed.push(pid); } });
		expect(await diagnostics.stop({ pid: 100, startTimeMs: 1_100 })).toMatchObject({ stopped: false });
		expect(await diagnostics.stop({ pid: 110, startTimeMs: 1_110 })).toMatchObject({ stopped: false, message: expect.stringContaining("own processes") });
		child = { startTimeMs: 9_999 };
		expect(await diagnostics.stop({ pid: 120, startTimeMs: 1_120 })).toMatchObject({ stopped: false, stale: true });
		child = {};
		expect(await diagnostics.stop({ pid: 120, startTimeMs: 1_120 })).toEqual({ stopped: true });
		expect(killed).toEqual([120]);
		diagnostics.close();
	});

	it("reports a process table it cannot read", async () => {
		const diagnostics = new ProcessDiagnostics({ rootPid: 100, query: async () => { throw new Error("powershell missing"); } });
		expect(await diagnostics.processes()).toMatchObject({ processes: [], error: expect.stringContaining("powershell missing") });
		expect(await diagnostics.stop({ pid: 120, startTimeMs: 1 })).toMatchObject({ stopped: false, message: expect.stringContaining("left running") });
		diagnostics.close();
	});
});

describe("diagnostics requests", () => {
	it("accepts only the offered history periods and well-formed stop requests", () => {
		expect(validateResourceHistoryRequest({ windowMs: 900_000, bucketMs: 60_000 })).toEqual({ windowMs: 900_000, bucketMs: 60_000 });
		expect(() => validateResourceHistoryRequest({ windowMs: 900_000, bucketMs: 1 })).toThrow();
		expect(() => validateResourceHistoryRequest(null)).toThrow();
		expect(validateStopProcessRequest({ pid: 12, startTimeMs: 1.5 })).toEqual({ pid: 12, startTimeMs: 1.5 });
		for (const bad of [{ pid: 0, startTimeMs: 1 }, { pid: 1.5, startTimeMs: 1 }, { pid: 2, startTimeMs: -1 }, { pid: 2, startTimeMs: Number.NaN }, [], "12"]) expect(() => validateStopProcessRequest(bad)).toThrow();
	});
});
