import { app, BrowserWindow, shell, webContents, type IpcMain, type IpcMainInvokeEvent } from "electron";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { validateResourceHistoryRequest, validateStopProcessRequest, type DiagnosticsProcessKind } from "../../shared/diagnostics";
import { ProcessDiagnostics } from "./processDiagnostics";
import type { ProcessOwner } from "./processTable";
import { readTraceDiagnostics, SLOW_SPAN_THRESHOLD_MS } from "./traceDiagnostics";
import { captureConsole, setTraceSink, span, TraceFileWriter } from "./tracer";

let writer: TraceFileWriter | undefined;

/** Starts writing spans to `<userData>/logs/traces.ndjson` and copies console warnings and errors there. */
export function startTracing(logsDirectory = path.join(app.getPath("userData"), "logs")) {
	if (writer) return writer;
	writer = new TraceFileWriter(logsDirectory, { maxBytes: 10 * 1024 * 1024, maxFiles: 3 });
	const current = writer;
	setTraceSink(record => current.write(record));
	captureConsole();
	return writer;
}
/** At quit, after the last spans: writes what is still buffered. */
export function stopTracing() { setTraceSink(undefined); writer?.closeSync(); }

/** Channels whose work has its own span, or that are diagnostics reading themselves. */
const untracedChannels = /^(workspace:command$|diagnostics:)/;
/**
 * Every IPC handler, wrapped once here rather than one by one: a call becomes an `ipc` span, written only when it fails
 * or takes 50 ms or more, so the frequent fast reads cost a timestamp and nothing on disk.
 */
export function traceIpcHandlers(ipcMain: IpcMain) {
	const handle = ipcMain.handle.bind(ipcMain);
	ipcMain.handle = (channel, listener) => handle(channel, untracedChannels.test(channel) ? listener : (event, ...args) => span(`ipc.${channel}`, { channel }, () => listener(event, ...args), { minDurationMs: 50 }));
}

function electronProcesses() {
	const result = new Map<number, { kind: DiagnosticsProcessKind; label: string }>();
	const contents = webContents.getAllWebContents();
	for (const metric of app.getAppMetrics()) {
		if (metric.type === "Browser") { result.set(metric.pid, { kind: "main", label: "Phaseo main process" }); continue; }
		if (metric.type === "GPU") { result.set(metric.pid, { kind: "gpu", label: "GPU process" }); continue; }
		if (metric.type === "Tab") {
			const pages = contents.filter(value => !value.isDestroyed() && value.getOSProcessId() === metric.pid);
			const window = pages.find(value => BrowserWindow.fromWebContents(value)?.webContents === value);
			const page = pages[0], title = page ? page.getTitle() || (() => { try { return new URL(page.getURL()).host; } catch { return ""; } })() : "";
			result.set(metric.pid, { kind: "renderer", label: window ? "App window" : title ? `Browser tab · ${title.slice(0, 80)}` : "Renderer" });
			continue;
		}
		result.set(metric.pid, { kind: "utility", label: metric.name || metric.serviceName || (metric.type === "Utility" ? "Utility process" : `${metric.type} process`) });
	}
	return result;
}

export function registerDiagnosticsIpc(ipcMain: IpcMain, options: {
	senderWindow: (event: IpcMainInvokeEvent) => BrowserWindow | null;
	/** Terminal shells by PID, with the names the app shows for them. */
	owners?: () => Map<number, ProcessOwner>;
	logsDirectory?: string;
}) {
	const logsDirectory = options.logsDirectory ?? path.join(app.getPath("userData"), "logs");
	const traces = startTracing(logsDirectory);
	/** Windows with the page open, each with how it stops watching. */
	const watching = new Map<number, () => void>();
	const diagnostics = new ProcessDiagnostics({ electron: electronProcesses, owners: options.owners, onSample: result => { for (const id of watching.keys()) { const target = webContents.fromId(id); if (target && !target.isDestroyed()) target.send("diagnostics:sample", result); } } });
	const trusted = (event: IpcMainInvokeEvent) => { if (!options.senderWindow(event)) throw new Error("Untrusted diagnostics request."); };
	ipcMain.handle("diagnostics:processes", event => { trusted(event); return diagnostics.processes(); });
	ipcMain.handle("diagnostics:resources", (event, request: unknown) => { trusted(event); return diagnostics.resources(validateResourceHistoryRequest(request)); });
	ipcMain.handle("diagnostics:traces", async event => {
		trusted(event);
		await traces.flush();
		return readTraceDiagnostics({ traceFilePath: traces.file, logsDirectory, maxFiles: traces.maxFiles, slowSpanThresholdMs: SLOW_SPAN_THRESHOLD_MS });
	});
	ipcMain.handle("diagnostics:stop-process", (event, request: unknown) => { trusted(event); return diagnostics.stop(validateStopProcessRequest(request)); });
	ipcMain.handle("diagnostics:open-logs", async event => {
		trusted(event);
		await mkdir(logsDirectory, { recursive: true });
		const problem = await shell.openPath(logsDirectory);
		if (problem) throw new Error(problem);
	});
	ipcMain.handle("diagnostics:subscribe", event => {
		trusted(event);
		const id = event.sender.id;
		// A window closed or reloaded with the page open stops its share of the sampling.
		if (!watching.has(id)) {
			const sender = event.sender, stop = () => { watching.delete(id); diagnostics.unsubscribe(id); sender.removeListener("destroyed", stop); sender.removeListener("did-navigate", stop); };
			watching.set(id, stop);
			sender.once("destroyed", stop); sender.once("did-navigate", stop);
		}
		return diagnostics.subscribe(id);
	});
	ipcMain.handle("diagnostics:unsubscribe", event => { trusted(event); watching.get(event.sender.id)?.(); });
	return { close: () => { for (const stop of [...watching.values()]) stop(); diagnostics.close(); } };
}
