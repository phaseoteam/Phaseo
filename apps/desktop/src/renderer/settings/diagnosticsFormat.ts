import { formatDuration, formatRelativeTime } from "@phaseo/app-kit/format";
import type { DiagnosticsProcess, DiagnosticsProcessKind } from "../../shared/diagnostics";

const numbers = new Intl.NumberFormat("en-GB");
export const formatCount = (value: number) => numbers.format(value);

/** How long something took, as the website's chat shows it: "850 ms", "1.5 s", "2.08 min". */
export { formatDuration };

export function formatBytes(value: number) {
	if (value < 1024) return `${Math.round(value)} B`;
	const units = ["KB", "MB", "GB", "TB"];
	let next = value, unit = -1;
	do { next /= 1024; unit++; } while (next >= 1024 && unit < units.length - 1);
	return `${next.toFixed(next >= 10 ? 1 : 2)} ${units[unit]}`;
}

export const formatCpuTime = (seconds: number) => formatDuration(seconds * 1000);

/** Elapsed run time as `m:ss`, or `h:mm:ss` from an hour, or days and hours from a day. */
export function formatElapsed(ms: number) {
	const total = Math.max(0, Math.floor(ms / 1000)), days = Math.floor(total / 86_400), hours = Math.floor(total % 86_400 / 3_600), minutes = Math.floor(total % 3_600 / 60), seconds = total % 60;
	if (days) return `${days}d ${hours}h`;
	return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}` : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** "30 seconds ago", "5 minutes ago", "yesterday": how long since something happened, as the website words it. */
export function formatAgo(iso: string | undefined, now = Date.now()) {
	const at = iso ? Date.parse(iso) : Number.NaN;
	return Number.isFinite(at) ? formatRelativeTime(Math.min(at, now), now) : "Never";
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
