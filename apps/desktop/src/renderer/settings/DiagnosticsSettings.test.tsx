import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import type { DiagnosticsProcess } from "../../shared/diagnostics";
import { DiagnosticsSettings } from "./DiagnosticsSettings";
import { formatAgo, formatBytes, formatCpuTime, formatDuration, formatElapsed, processName, shortTraceId, visibleProcesses } from "./diagnosticsFormat";

const process = (pid: number, depth: number): DiagnosticsProcess => ({ pid, ppid: 0, startTimeMs: 0, name: "node", command: "node", kind: "process", cpuPercent: 0, rssBytes: 0, elapsedMs: 0, depth, childPids: [], stoppable: true });

describe("diagnostics formatting", () => {
	it("formats durations, sizes, CPU time and run time", () => {
		expect([formatDuration(12.4), formatDuration(1_234), formatDuration(12_345)]).toEqual(["12 ms", "1.23 s", "12.3 s"]);
		expect([formatBytes(512), formatBytes(2048), formatBytes(150 * 1024 * 1024), formatBytes(3 * 1024 ** 3)]).toEqual(["512 B", "2.00 KB", "150.0 MB", "3.00 GB"]);
		expect([formatCpuTime(1.5), formatCpuTime(90), formatCpuTime(7_200)]).toEqual(["1.5 s", "1.5 min", "120 min"]);
		expect([formatElapsed(65_000), formatElapsed(3_725_000), formatElapsed(90_000_000)]).toEqual(["1:05", "1:02:05", "1d 1h"]);
	});

	it("says how long ago, as the website words it", () => {
		const now = Date.parse("2026-10-16T12:00:00.000Z");
		expect(["2026-10-16T11:59:58.000Z", "2026-10-16T11:59:30.000Z", "2026-10-16T11:55:00.000Z", "2026-10-16T09:00:00.000Z", "2026-10-15T11:00:00.000Z", undefined].map(value => formatAgo(value, now))).toEqual(["2 seconds ago", "30 seconds ago", "5 minutes ago", "3 hours ago", "yesterday", "Never"]);
	});

	it("names programs from command lines and shortens trace IDs", () => {
		expect(processName("\"C:\\Program Files\\Git\\cmd\\git.exe\" status")).toBe("git.exe");
		expect(processName("/usr/local/bin/node /opt/codex.js app-server")).toBe("node");
		expect(processName("", "fallback")).toBe("fallback");
		expect(shortTraceId("0123456789abcdef0123456789abcdef")).toBe("0123456789…abcdef");
		expect(shortTraceId("short")).toBe("short");
	});

	it("hides the processes below a collapsed one", () => {
		const rows = [process(1, 0), process(2, 1), process(3, 2), process(4, 1), process(5, 2)];
		expect(visibleProcesses(rows, new Set()).map(row => row.pid)).toEqual([1, 2, 3, 4, 5]);
		expect(visibleProcesses(rows, new Set([2])).map(row => row.pid)).toEqual([1, 2, 4, 5]);
		expect(visibleProcesses(rows, new Set([1])).map(row => row.pid)).toEqual([1]);
	});
});

describe("diagnostics page", () => {
	const global = globalThis as { window?: unknown };
	afterEach(() => { delete global.window; });

	it("shows T3's sections in order with their loading states and no capitals-only labels", () => {
		const pending = () => new Promise<never>(() => {});
		global.window = { phaseoDesktop: { diagnostics: { processes: pending, resources: pending, traces: pending, stopProcess: pending, openLogs: pending, subscribe: pending, unsubscribe: pending, onSample: () => () => {} } } };
		const markup = renderToStaticMarkup(<DiagnosticsSettings />);
		const titles = [...markup.matchAll(/<h2[^>]*>([^<]+)<\/h2>/g)].map(match => match[1]);
		expect(titles).toEqual(["Live processes", "Resource history", "Trace diagnostics", "Latest failures", "Most common failures", "Slowest spans", "Span logs", "Top span names"]);
		for (const label of ["Loading live processes…", "Collecting process samples…", "Loading failures…", "Loading failure groups…", "Loading slow spans…", "Loading recent logs…", "Loading span names…", "Child processes", "Slow spans", "Open logs folder"]) expect(markup).toContain(label);
		expect(markup).not.toMatch(/\buppercase\b/);
	});

	it("explains itself outside the desktop app", () => {
		global.window = {};
		expect(renderToStaticMarkup(<DiagnosticsSettings />)).toContain("Diagnostics are available in the desktop app.");
	});
});
