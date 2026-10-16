import type { DiagnosticsProcess, DiagnosticsProcessKind } from "../../shared/diagnostics";

const numbers = new Intl.NumberFormat("en-GB");
export const formatCount = (value: number) => numbers.format(value);

export function formatDuration(ms: number) {
	if (ms < 1_000) return `${Math.round(ms)} ms`;
	return `${(ms / 1_000).toFixed(ms >= 10_000 ? 1 : 2)} s`;
}

export function formatBytes(value: number) {
	if (value < 1024) return `${Math.round(value)} B`;
	const units = ["KB", "MB", "GB", "TB"];
	let next = value, unit = -1;
	do { next /= 1024; unit++; } while (next >= 1024 && unit < units.length - 1);
	return `${next.toFixed(next >= 10 ? 1 : 2)} ${units[unit]}`;
}

export function formatCpuTime(seconds: number) {
	if (seconds < 60) return `${seconds.toFixed(seconds >= 10 ? 1 : 2)} s`;
	const minutes = seconds / 60;
	if (minutes < 60) return `${minutes.toFixed(minutes >= 10 ? 1 : 2)} min`;
	return `${(minutes / 60).toFixed(2)} h`;
}

/** Elapsed run time as `m:ss`, or `h:mm:ss` from an hour, or days and hours from a day. */
export function formatElapsed(ms: number) {
	const total = Math.max(0, Math.floor(ms / 1000)), days = Math.floor(total / 86_400), hours = Math.floor(total % 86_400 / 3_600), minutes = Math.floor(total % 3_600 / 60), seconds = total % 60;
	if (days) return `${days}d ${hours}h`;
	return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}` : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** "Just now", "12 s ago", "4 min ago": how long since something happened. */
export function formatAgo(iso: string | undefined, now = Date.now()) {
	const at = iso ? Date.parse(iso) : Number.NaN;
	if (!Number.isFinite(at)) return "Never";
	const seconds = Math.max(0, Math.round((now - at) / 1000));
	if (seconds < 5) return "Just now";
	if (seconds < 60) return `${seconds} s ago`;
	const minutes = Math.round(seconds / 60);
	if (minutes < 60) return `${minutes} min ago`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return `${hours} h ago`;
	const days = Math.round(hours / 24);
	return days === 1 ? "Yesterday" : `${days} days ago`;
}

/** The program's file name from a command line, without its folder or quotes. */
export function processName(command: string, fallback = "") {
	const first = command.trim().match(/^"([^"]+)"|^'([^']+)'|^(\S+)/);
	const token = first?.[1] ?? first?.[2] ?? first?.[3];
	if (!token) return fallback || command;
	return token.split(/[\\/]/).filter(Boolean).at(-1) ?? token;
}

export const shortTraceId = (traceId: string) => traceId.length <= 20 ? traceId : `${traceId.slice(0, 10)}…${traceId.slice(-6)}`;

const kinds: Record<DiagnosticsProcessKind, string> = { main: "Main process", renderer: "Renderer", gpu: "GPU", utility: "Electron helper", agent: "Agent", terminal: "Terminal", git: "Git", mcp: "MCP server", process: "Subprocess" };
export const processKindLabel = (kind: DiagnosticsProcessKind) => kinds[kind];

/** The rows to show: every process except those below a collapsed one. */
export function visibleProcesses(processes: DiagnosticsProcess[], collapsed: ReadonlySet<number>) {
	const visible: DiagnosticsProcess[] = [];
	let hiddenBelow: number | null = null;
	for (const process of processes) {
		if (hiddenBelow !== null) { if (process.depth > hiddenBelow) continue; hiddenBelow = null; }
		visible.push(process);
		if (collapsed.has(process.pid)) hiddenBelow = process.depth;
	}
	return visible;
}
