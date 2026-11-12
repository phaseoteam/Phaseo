import type { DiagnosticsProcesses, DiagnosticsProcessKind, ResourceHistory, ResourceHistoryRequest, StopProcessRequest, StopProcessResult } from "../../shared/diagnostics";
import { buildProcessTree, processKey, queryProcesses, type ProcessOwner, type ProcessSample } from "./processTable";
import { ResourceHistoryStore } from "./resourceHistory";

export type ProcessDiagnosticsOptions = {
	rootPid?: number;
	query?: () => Promise<ProcessSample[]>;
	/** Electron's own processes (renderers, GPU, utilities) by PID: labelled, and never stopped from here. */
	electron?: () => Map<number, { kind: DiagnosticsProcessKind; label: string }>;
	/** Processes the app started and can name (a terminal's shell). */
	owners?: () => Map<number, ProcessOwner>;
	kill?: (pid: number) => void;
	now?: () => number;
	/** How often to sample while the page is open. The CIM query is costlier than `ps`, so Windows samples less often. */
	intervalMs?: number;
	history?: ResourceHistoryStore;
	/** Each sample taken on the timer, for the windows watching. */
	onSample?: (result: DiagnosticsProcesses) => void;
};

/** A reading this recent answers a refresh without walking the process table again. */
const REUSE_MS = 1_000;

/**
 * The app's process tree for Settings → Diagnostics. The process table is read only while the page is open (on a timer)
 * or when the page asks; with the page closed nothing polls.
 */
export class ProcessDiagnostics {
	readonly rootPid: number;
	readonly intervalMs: number;
	private readonly query: () => Promise<ProcessSample[]>;
	private readonly now: () => number;
	private readonly history: ResourceHistoryStore;
	private readonly subscribers = new Set<number>();
	private timer: ReturnType<typeof setInterval> | undefined;
	private inFlight: Promise<DiagnosticsProcesses> | undefined;
	private latest: { at: number; result: DiagnosticsProcesses } | undefined;
	private previous = new Map<string, { cpuTimeMs: number; at: number }>();
	private closed = false;
	constructor(private readonly options: ProcessDiagnosticsOptions = {}) {
		this.rootPid = options.rootPid ?? process.pid;
		this.query = options.query ?? (() => queryProcesses());
		this.now = options.now ?? Date.now;
		this.intervalMs = options.intervalMs ?? (process.platform === "win32" ? 5_000 : 3_000);
		this.history = options.history ?? new ResourceHistoryStore();
	}
	get sampling() { return Boolean(this.timer); }

	/** Reads the process table once (shared by callers asking at the same time) and records the sample. */
	sample(): Promise<DiagnosticsProcesses> {
		if (this.inFlight) return this.inFlight;
		const run = (async (): Promise<DiagnosticsProcesses> => {
			let rows: ProcessSample[];
			try { rows = await this.query(); }
			catch (error) { return this.result(this.now(), [], error instanceof Error ? `Could not read the process table: ${error.message}` : "Could not read the process table."); }
			const now = this.now();
			let electron: Map<number, { kind: DiagnosticsProcessKind; label: string }> | undefined, owners: Map<number, ProcessOwner> | undefined;
			try { electron = this.options.electron?.(); } catch { /* Labels are optional. */ }
			try { owners = this.options.owners?.(); } catch { /* Labels are optional. */ }
			const processes = buildProcessTree(rows, this.rootPid, { previous: this.previous, now, electron, owners });
			// Only the app's own processes are remembered for the next CPU reading, so the map stays small.
			const next = new Map<string, { cpuTimeMs: number; at: number }>(), byPid = new Map(rows.map(row => [row.pid, row]));
			for (const process of processes) { const cpuTimeMs = byPid.get(process.pid)?.cpuTimeMs; if (cpuTimeMs !== undefined) next.set(processKey(process.pid, process.startTimeMs), { cpuTimeMs, at: now }); }
			this.previous = next;
			if (!processes.length) return this.result(now, [], "The app's process was not found in the process table.");
			this.history.add(now, processes);
			const result = this.result(now, processes);
			this.latest = { at: now, result };
			return result;
		})().finally(() => { this.inFlight = undefined; });
		this.inFlight = run;
		return run;
	}
	private result(now: number, processes: DiagnosticsProcesses["processes"], error?: string): DiagnosticsProcesses {
		return { rootPid: this.rootPid, readAt: new Date(now).toISOString(), processCount: Math.max(0, processes.length - 1), totalCpuPercent: Math.round(processes.reduce((total, process) => total + process.cpuPercent, 0) * 10) / 10, totalRssBytes: processes.reduce((total, process) => total + process.rssBytes, 0), processes, ...(error ? { error } : {}) };
	}

	/** The current tree: the last reading when it is fresh, otherwise a new one. */
	async processes(): Promise<DiagnosticsProcesses> {
		if (this.latest && this.now() - this.latest.at < REUSE_MS) return this.latest.result;
		return this.sample();
	}

	async resources(request: ResourceHistoryRequest): Promise<ResourceHistory> {
		let error: string | undefined;
		// With the page closed there may be no samples yet: take one now rather than show an empty window.
		if (!this.history.sampleCount || (!this.timer && (!this.latest || this.now() - this.latest.at >= REUSE_MS))) error = (await this.sample()).error;
		return { ...this.history.summarise({ ...request, now: this.now(), sampleIntervalMs: this.timer ? this.intervalMs : 0, rootPid: this.rootPid }), ...(error ? { error } : {}) };
	}

	subscribe(id: number) {
		if (this.closed) return this.intervalMs;
		this.subscribers.add(id);
		if (!this.timer) {
			const tick = () => { void this.sample().then(result => { if (this.timer) this.options.onSample?.(result); }); };
			this.timer = setInterval(tick, this.intervalMs); this.timer.unref?.();
			tick();
		}
		return this.intervalMs;
	}
	unsubscribe(id: number) {
		this.subscribers.delete(id);
		if (!this.subscribers.size && this.timer) { clearInterval(this.timer); this.timer = undefined; }
	}

	/**
	 * Stops one of the app's processes after checking, with a fresh reading, that the PID still belongs to the same
	 * process (its start time matches) and that it is a descendant the app started. Never the main process or Electron's own.
	 */
	async stop(request: StopProcessRequest): Promise<StopProcessResult> {
		if (request.pid === this.rootPid) return { stopped: false, message: "The app's main process cannot be stopped here." };
		this.latest = undefined;
		const current = await this.sample();
		if (current.error) return { stopped: false, message: `Could not check process ${request.pid} again, so it was left running. ${current.error}` };
		const selected = current.processes.find(process => process.pid === request.pid);
		if (!selected || selected.startTimeMs !== request.startTimeMs) return { stopped: false, stale: true, message: `Process ${request.pid} is not a live descendant of the app any more. It might already have exited.` };
		if (!selected.stoppable) return { stopped: false, message: `Process ${request.pid} is one of the app's own processes and cannot be stopped here.` };
		try { (this.options.kill ?? (pid => process.kill(pid)))(request.pid); }
		catch (error) {
			if ((error as NodeJS.ErrnoException)?.code === "ESRCH") return { stopped: false, stale: true, message: `Process ${request.pid} is not a live descendant of the app any more. It might already have exited.` };
			return { stopped: false, message: error instanceof Error ? error.message : `Could not stop process ${request.pid}.` };
		}
		this.latest = undefined;
		return { stopped: true };
	}

	close() { this.closed = true; this.subscribers.clear(); if (this.timer) clearInterval(this.timer); this.timer = undefined; this.history.clear(); }
}
