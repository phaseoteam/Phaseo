import { formatTime } from "@phaseo/app-kit/format";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronRight, CircleStop, Copy, FolderOpen, Info, RotateCw, TriangleAlert } from "lucide-react";
import { RESOURCE_HISTORY_WINDOWS, type DiagnosticsProcess, type DiagnosticsProcesses, type ProcessCpuBucket, type ResourceBucket, type ResourceHistory, type ResourceProcessSummary, type TraceDiagnostics } from "../../shared/diagnostics";
import { errorText } from "../app/workspace";
import { Button } from "../components/ui/button";
import { ScrollArea } from "../components/ui/scroll-area";
import { showToast } from "../components/ui/toast";
import { ToggleGroup, ToggleGroupItem } from "../components/ui/toggle-group";
import { Tip } from "../components/ui/tooltip";
import { cn } from "../lib/utils";
import { formatAgo, formatBytes, formatCount, formatCpuTime, formatDuration, formatElapsed, processKindLabel, processName, shortTraceId, visibleProcesses } from "./diagnosticsFormat";
import { SettingsPageLayout, SettingsSection } from "./SettingsLayout";

/** Re-renders on an interval, for "Checked 12 s ago". */
function useNow(intervalMs = 5_000) {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => { const timer = setInterval(() => setNow(Date.now()), intervalMs); return () => clearInterval(timer); }, [intervalMs]);
	return now;
}

function StatBlock({ label, value, tip, tone = "default" }: { label: string; value: string; tip?: ReactNode; tone?: "default" | "warning" | "danger" }) {
	return <div className="min-w-0 px-4 py-3 sm:px-5">
		<div className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-muted-foreground">
			<span className="min-w-0 truncate">{label}</span>
			{tip && <Tip label={tip}><button type="button" aria-label={`About ${label.toLowerCase()}`} className="grid size-3.5 shrink-0 place-items-center rounded-sm text-muted-foreground/70 hover:text-foreground"><Info className="size-3" /></button></Tip>}
		</div>
		<div className={cn("mt-1 truncate font-mono text-lg font-semibold tabular-nums", tone === "warning" && "text-warning", tone === "danger" && "text-destructive")}>{value}</div>
	</div>;
}

function StatsGrid({ children }: { children: ReactNode }) {
	return <div className="relative grid grid-cols-2 sm:grid-cols-4">
		<span aria-hidden className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-border/60" />
		<span aria-hidden className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-border/60 sm:hidden" />
		<span aria-hidden className="pointer-events-none absolute inset-y-0 left-1/4 hidden w-px bg-border/60 sm:block" />
		<span aria-hidden className="pointer-events-none absolute inset-y-0 left-3/4 hidden w-px bg-border/60 sm:block" />
		{children}
	</div>;
}

function Problems({ messages }: { messages: { text?: string; tone?: "error" | "warning" }[] }) {
	const shown = messages.filter(message => message.text);
	if (!shown.length) return null;
	return <div role="alert" className="flex flex-col gap-2 px-4 py-3 text-xs sm:px-5">
		{shown.map((message, index) => <div key={index} className={cn("flex items-start gap-2", message.tone === "warning" ? "text-warning" : "text-destructive")}><TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" /><span className="min-w-0 [overflow-wrap:anywhere]">{message.text}</span></div>)}
	</div>;
}

const Empty = ({ label }: { label: string }) => <p className="px-4 py-4 text-xs text-muted-foreground sm:px-5">{label}</p>;

type Column = { label: string; align?: "right"; width?: string };
/** A flat table that scrolls sideways when the page is narrow. */
function DiagnosticsTable({ columns, children, minWidth = "min-w-[640px]", maxHeight, sticky }: { columns: Column[]; children: ReactNode; minWidth?: string; maxHeight?: string; sticky?: boolean }) {
	return <ScrollArea scrollBarOrientation={maxHeight ? "both" : "horizontal"} className={cn("w-full max-w-full", maxHeight)} viewportClassName={maxHeight}>
		<table className={cn("w-full table-fixed text-left text-xs", minWidth)}>
			<colgroup>{columns.map(column => <col key={column.label} className={column.width} />)}</colgroup>
			<thead className={cn("border-b border-border/60 text-muted-foreground", sticky && "sticky top-0 z-10 bg-card")}>
				<tr>{columns.map(column => <th key={column.label} scope="col" className={cn("px-3 py-2 font-medium whitespace-nowrap first:pl-4 last:pr-4 sm:first:pl-5 sm:last:pr-5", column.align === "right" && "text-right")}>{column.label}</th>)}</tr>
			</thead>
			<tbody className="divide-y divide-border/50">{children}</tbody>
		</table>
	</ScrollArea>;
}
const cell = "px-3 py-2 align-middle first:pl-4 last:pr-4 sm:first:pl-5 sm:last:pr-5";
const topCell = "px-3 py-2.5 align-top first:pl-4 last:pr-4 sm:first:pl-5 sm:last:pr-5";
const numeric = "text-right font-mono tabular-nums";

function Checked({ at, busy }: { at?: string; busy?: boolean }) {
	const now = useNow();
	return <span className="text-xs text-muted-foreground/70">{busy && !at ? "Checking…" : at ? `Checked ${formatAgo(at, now)}` : "Not checked"}</span>;
}

function RefreshButton({ busy, label, onClick }: { busy: boolean; label: string; onClick: () => void }) {
	return <Tip label={label}><Button size="icon-xs" variant="ghost" aria-label={label} disabled={busy} onClick={onClick} className="text-muted-foreground"><RotateCw className={cn("size-3.5", busy && "animate-spin")} /></Button></Tip>;
}

/** Long text clamped to two lines, with a chevron to read the rest. */
function ExpandableText({ text, expandLabel = "Show more" }: { text: string; expandLabel?: string }) {
	const [open, setOpen] = useState(false);
	const long = text.length > 140 || text.includes("\n");
	return <div className="min-w-0">
		<p className={cn("whitespace-pre-wrap [overflow-wrap:anywhere]", long && !open && "line-clamp-2")}>{text}</p>
		{long && <button type="button" aria-expanded={open} onClick={() => setOpen(value => !value)} className="mt-1 inline-flex items-center gap-1 rounded-sm font-medium text-muted-foreground hover:text-foreground">
			<ChevronRight aria-hidden className={cn("size-3 transition-transform", open && "rotate-90")} />{open ? "Show less" : expandLabel}
		</button>}
	</div>;
}

function TraceId({ traceId }: { traceId?: string }) {
	const [copied, setCopied] = useState(false);
	const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
	useEffect(() => () => clearTimeout(timer.current), []);
	if (!traceId) return <span className="text-muted-foreground/60">None</span>;
	const copy = () => void navigator.clipboard.writeText(traceId).then(() => { setCopied(true); clearTimeout(timer.current); timer.current = setTimeout(() => setCopied(false), 1_200); }, () => showToast("error", "Could not copy the trace ID"));
	return <div className="flex min-w-0 items-center gap-1.5">
		<Tip label={<span className="font-mono [overflow-wrap:anywhere]">{traceId}</span>}><span className="min-w-0 flex-1 truncate font-mono text-[11px]">{shortTraceId(traceId)}</span></Tip>
		<Tip label={copied ? "Copied" : "Copy full trace ID"}><Button size="icon-xs" variant="ghost" aria-label={copied ? "Copied trace ID" : "Copy trace ID"} onClick={copy} className="size-5 text-muted-foreground"><Copy className="size-3" /></Button></Tip>
	</div>;
}

const ownProcess = (process: { kind: string }) => process.kind === "main" || process.kind === "renderer" || process.kind === "gpu" || process.kind === "utility";
/** The name to show: what the app calls its own processes, otherwise the program, with its owner beside it. */
function displayName(process: Pick<DiagnosticsProcess, "kind" | "label" | "command" | "name">) {
	if (ownProcess(process) && process.label) return { name: process.label };
	return { name: processName(process.command, process.name), owner: process.label };
}

function ProcessName({ process, expanded, onToggle }: { process: DiagnosticsProcess; expanded: boolean; onToggle: (pid: number) => void }) {
	const { name, owner } = displayName(process);
	return <div className="grid min-w-0 grid-cols-[1.25rem_0.375rem_minmax(0,1fr)] items-center gap-2" style={{ paddingLeft: `${Math.min(process.depth, 6) * 10}px` }}>
		{process.childPids.length ? <Button size="icon-xs" variant="ghost" aria-expanded={expanded} aria-label={`${expanded ? "Collapse" : "Expand"} ${name}`} onClick={() => onToggle(process.pid)} className="size-5 text-muted-foreground"><ChevronRight className={cn("size-3.5 transition-transform", expanded && "rotate-90")} /></Button> : <span aria-hidden className="size-5" />}
		<span aria-hidden className={cn("size-1.5 rounded-full", process.depth === 0 ? "bg-warning/90" : "bg-success/80")} />
		<Tip label={<span className="font-mono [overflow-wrap:anywhere]">{process.command}</span>}>
			<span className="min-w-0 truncate"><span className="font-medium text-foreground">{name}</span>{owner && <span className="text-muted-foreground"> · {owner}</span>}</span>
		</Tip>
	</div>;
}

function ProcessTable({ processes, stopping, onStop, emptyLabel }: { processes: DiagnosticsProcess[]; stopping: number | null; onStop: (process: DiagnosticsProcess) => void; emptyLabel: string }) {
	const [collapsed, setCollapsed] = useState<ReadonlySet<number>>(() => new Set());
	const rows = useMemo(() => visibleProcesses(processes, collapsed), [processes, collapsed]);
	const toggle = useCallback((pid: number) => setCollapsed(current => { const next = new Set(current); if (!next.delete(pid)) next.add(pid); return next; }), []);
	return <DiagnosticsTable sticky maxHeight="max-h-[min(64vh,44rem)]" minWidth="min-w-[960px]" columns={[{ label: "Name", width: "w-[26%]" }, { label: "CPU", align: "right", width: "w-[8%]" }, { label: "Memory", align: "right", width: "w-[10%]" }, { label: "Command", width: "w-[26%]" }, { label: "PID", align: "right", width: "w-[8%]" }, { label: "Running for", align: "right", width: "w-[9%]" }, { label: "Type", width: "w-[9%]" }, { label: "Stop", align: "right", width: "w-[4rem]" }]}>
		{!rows.length && <tr><td colSpan={8} className="px-4 py-4 text-muted-foreground sm:px-5">{emptyLabel}</td></tr>}
		{rows.map(process => <tr key={`${process.pid}:${process.startTimeMs}`} className="hover:bg-muted/20">
			<td className={cell}><ProcessName process={process} expanded={!collapsed.has(process.pid)} onToggle={toggle} /></td>
			<td className={cn(cell, numeric)}>{process.cpuPercent.toFixed(1)}%</td>
			<td className={cn(cell, numeric)}>{formatBytes(process.rssBytes)}</td>
			<td className={cn(cell, "text-muted-foreground")}><Tip label={<span className="font-mono [overflow-wrap:anywhere]">{process.command}</span>}><span className="block truncate">{process.command}</span></Tip></td>
			<td className={cn(cell, numeric, "text-muted-foreground")}>{process.pid}</td>
			<td className={cn(cell, numeric, "text-muted-foreground")}>{formatElapsed(process.elapsedMs)}</td>
			<td className={cn(cell, "truncate text-muted-foreground")}>{processKindLabel(process.kind)}</td>
			<td className={cn(cell, "text-right")}>{process.stoppable && <Tip label="Stop process"><Button size="icon-xs" variant="ghost" aria-label={`Stop ${displayName(process).name} (process ${process.pid})`} disabled={stopping !== null} onClick={() => onStop(process)} className="text-muted-foreground hover:text-destructive"><CircleStop className="size-3.5" /></Button></Tip>}</td>
		</tr>)}
	</DiagnosticsTable>;
}

const bucketTime = (bucket: ResourceBucket) => formatTime(bucket.startedAt);
function HistoryChart({ buckets }: { buckets: ResourceBucket[] }) {
	const max = Math.max(1, ...buckets.map(bucket => bucket.maxCpuPercent));
	return <div className="px-4 py-3 sm:px-5">
		<div className="flex h-28 items-end gap-1 overflow-hidden rounded-sm bg-muted/30 p-2" role="img" aria-label="Total CPU for each part of the period, average and peak">
			{buckets.map(bucket => <Tip key={bucket.startedAt} label={`${bucketTime(bucket)}: average ${bucket.avgCpuPercent.toFixed(1)}%, peak ${bucket.maxCpuPercent.toFixed(1)}%${bucket.maxProcessCount ? `, up to ${bucket.maxProcessCount} processes` : ", not sampled"}`}>
				<div className="relative h-full min-w-1 flex-1">
					<div className="absolute inset-x-0 bottom-0 rounded-t-sm bg-foreground/15" style={{ height: `${Math.max(2, bucket.maxCpuPercent / max * 100)}%` }} />
					<div className="absolute inset-x-0 bottom-0 rounded-t-sm bg-foreground/60" style={{ height: `${Math.max(2, bucket.avgCpuPercent / max * 100)}%` }} />
				</div>
			</Tip>)}
		</div>
	</div>;
}

/** One process's average and peak CPU for each part of the period, scaled to its own busiest moment. */
function ProcessBars({ buckets }: { buckets: ProcessCpuBucket[] }) {
	const max = Math.max(1, ...buckets.map(bucket => bucket?.maxCpuPercent ?? 0));
	const sampled = buckets.filter((bucket): bucket is NonNullable<ProcessCpuBucket> => Boolean(bucket));
	return <div className="flex h-5 items-end gap-px" role="img" aria-label={sampled.length ? `Peak CPU ${Math.max(...sampled.map(bucket => bucket.maxCpuPercent)).toFixed(1)}% in this period` : "Not sampled in this period"}>
		{buckets.map((bucket, index) => <div key={index} className="relative h-full min-w-0.5 flex-1">
			{bucket && <><div className="absolute inset-x-0 bottom-0 rounded-t-[1px] bg-foreground/15" style={{ height: `${Math.max(8, bucket.maxCpuPercent / max * 100)}%` }} /><div className="absolute inset-x-0 bottom-0 rounded-t-[1px] bg-foreground/60" style={{ height: `${Math.max(8, bucket.avgCpuPercent / max * 100)}%` }} /></>}
		</div>)}
	</div>;
}

function HistoryTable({ processes, emptyLabel }: { processes: ResourceProcessSummary[]; emptyLabel: string }) {
	const shallowest = processes.reduce<number | null>((depth, process) => process.isRoot ? depth : depth === null ? process.depth : Math.min(depth, process.depth), null);
	return <DiagnosticsTable sticky maxHeight="max-h-[min(64vh,44rem)]" minWidth="min-w-[1000px]" columns={[{ label: "Process", width: "w-[22%]" }, { label: "History", width: "w-[13%]" }, { label: "CPU time", align: "right", width: "w-[9%]" }, { label: "Current", align: "right", width: "w-[8%]" }, { label: "Average", align: "right", width: "w-[8%]" }, { label: "Peak", align: "right", width: "w-[8%]" }, { label: "Peak memory", align: "right", width: "w-[10%]" }, { label: "Command", width: "w-[15%]" }, { label: "PID", align: "right", width: "w-[7%]" }]}>
		{!processes.length && <tr><td colSpan={9} className="px-4 py-4 text-muted-foreground sm:px-5">{emptyLabel}</td></tr>}
		{processes.map(process => {
			const { name, owner } = displayName({ ...process, kind: process.isRoot ? "main" : "process" });
			const depth = process.isRoot || shallowest === null ? 0 : Math.max(1, process.depth - shallowest + 1);
			return <tr key={process.key} className="hover:bg-muted/20">
				<td className={cell}><div className="flex min-w-0 items-center gap-2" style={{ paddingLeft: `${Math.min(depth, 6) * 10}px` }}>
					<span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", process.isRoot ? "bg-warning/90" : "bg-success/80")} />
					<Tip label={<span className="font-mono [overflow-wrap:anywhere]">{process.command}</span>}><span className="min-w-0 truncate"><span className="font-medium text-foreground">{process.isRoot ? "Phaseo main process" : name}</span>{!process.isRoot && owner && <span className="text-muted-foreground"> · {owner}</span>}</span></Tip>
				</div></td>
				<td className={cell}><ProcessBars buckets={process.buckets} /></td>
				<td className={cn(cell, numeric)}>{formatCpuTime(process.cpuSeconds)}</td>
				<td className={cn(cell, numeric)}>{process.currentCpuPercent.toFixed(1)}%</td>
				<td className={cn(cell, numeric)}>{process.avgCpuPercent.toFixed(1)}%</td>
				<td className={cn(cell, numeric)}>{process.maxCpuPercent.toFixed(1)}%</td>
				<td className={cn(cell, numeric)}>{formatBytes(process.maxRssBytes)}</td>
				<td className={cn(cell, "text-muted-foreground")}><Tip label={<span className="font-mono [overflow-wrap:anywhere]">{process.command}</span>}><span className="block truncate">{process.command}</span></Tip></td>
				<td className={cn(cell, numeric, "text-muted-foreground")}>{process.pid}</td>
			</tr>;
		})}
	</DiagnosticsTable>;
}

const segment = "h-6 min-w-8 rounded-[5px] px-2 text-xs text-muted-foreground data-[pressed]:bg-background data-[pressed]:text-foreground data-[pressed]:shadow-sm";
function PeriodSelector({ value, onChange }: { value: number; onChange: (windowMs: number) => void }) {
	return <ToggleGroup aria-label="Resource history period" value={String(value)} onValueChange={(next: string) => { const option = RESOURCE_HISTORY_WINDOWS.find(item => String(item.windowMs) === next); if (option) onChange(option.windowMs); }} spacing={0.5} className="rounded-md bg-muted/70 p-0.5">
		{RESOURCE_HISTORY_WINDOWS.map(option => <ToggleGroupItem key={option.windowMs} value={String(option.windowMs)} aria-label={`Last ${option.label.replace("m", " minutes").replace("1h", "hour")}`} className={segment}>{option.label}</ToggleGroupItem>)}
	</ToggleGroup>;
}

const ago = (iso: string, now: number) => <span className="whitespace-nowrap">{formatAgo(iso, now)}</span>;

/**
 * Settings → Diagnostics, after T3 Code's page: the app's live process tree, its resource use while the page is open,
 * and what the main process's trace file says about recent work. Processes are sampled only while this page is open.
 */
export function DiagnosticsSettings() {
	const api = window.phaseoDesktop?.diagnostics;
	const now = useNow(10_000);
	const mounted = useRef(true);
	useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

	const [processes, setProcesses] = useState<DiagnosticsProcesses | null>(null);
	const [processError, setProcessError] = useState<string>();
	const [processBusy, setProcessBusy] = useState(false);
	const loadProcesses = useCallback(async () => {
		if (!api) return;
		setProcessBusy(true);
		try { const result = await api.processes(); if (mounted.current) { setProcesses(result); setProcessError(undefined); } }
		catch (reason) { if (mounted.current) setProcessError(errorText(reason)); }
		finally { if (mounted.current) setProcessBusy(false); }
	}, [api]);

	const [windowMs, setWindowMs] = useState<number>(RESOURCE_HISTORY_WINDOWS[1].windowMs);
	const windowRef = useRef(windowMs);
	const [resources, setResources] = useState<ResourceHistory | null>(null);
	const [resourceError, setResourceError] = useState<string>();
	const [resourceBusy, setResourceBusy] = useState(false);
	const resourceRequest = useRef(0);
	const loadResources = useCallback(async (quiet = false) => {
		if (!api) return;
		const option = RESOURCE_HISTORY_WINDOWS.find(item => item.windowMs === windowRef.current) ?? RESOURCE_HISTORY_WINDOWS[1];
		const request = ++resourceRequest.current;
		if (!quiet) setResourceBusy(true);
		try { const result = await api.resources({ windowMs: option.windowMs, bucketMs: option.bucketMs }); if (mounted.current && request === resourceRequest.current) { setResources(result); setResourceError(undefined); } }
		catch (reason) { if (mounted.current && request === resourceRequest.current) setResourceError(errorText(reason)); }
		finally { if (mounted.current && request === resourceRequest.current) setResourceBusy(false); }
	}, [api]);

	const [traces, setTraces] = useState<TraceDiagnostics | null>(null);
	const [traceError, setTraceError] = useState<string>();
	const [traceBusy, setTraceBusy] = useState(false);
	const loadTraces = useCallback(async () => {
		if (!api) return;
		setTraceBusy(true);
		try { const result = await api.traces(); if (mounted.current) { setTraces(result); setTraceError(undefined); } }
		catch (reason) { if (mounted.current) setTraceError(errorText(reason)); }
		finally { if (mounted.current) setTraceBusy(false); }
	}, [api]);

	// Sampling runs in the main process only while this page is open; each timed sample arrives here.
	useEffect(() => {
		if (!api) return;
		const stop = api.onSample(result => { if (!mounted.current) return; setProcesses(result); void loadResources(true); });
		void api.subscribe().catch(reason => setProcessError(errorText(reason)));
		void loadProcesses(); void loadTraces();
		return () => { stop(); void api.unsubscribe().catch(() => undefined); };
	}, [api, loadProcesses, loadResources, loadTraces]);
	useEffect(() => { windowRef.current = windowMs; void loadResources(); }, [windowMs, loadResources]);

	const [openingLogs, setOpeningLogs] = useState(false);
	const [logsError, setLogsError] = useState<string>();
	const openLogs = () => {
		if (!api || openingLogs) return;
		setOpeningLogs(true); setLogsError(undefined);
		void api.openLogs().catch(reason => { if (mounted.current) setLogsError(errorText(reason)); }).finally(() => { if (mounted.current) setOpeningLogs(false); });
	};

	const [stopping, setStopping] = useState<number | null>(null);
	const processesRef = useRef(processes);
	useEffect(() => { processesRef.current = processes; }, [processes]);
	const stopProcess = async (process: DiagnosticsProcess) => {
		if (!api || stopping !== null) return;
		const { name } = displayName(process);
		if (!window.confirm(`Stop ${name} (process ${process.pid})? It ends straight away, without a chance to save its work.`)) return;
		// The list may have refreshed while the question was open: only the same process (PID and start time) is stopped.
		if (!processesRef.current?.processes.some(value => value.pid === process.pid && value.startTimeMs === process.startTimeMs)) { showToast("info", "Process already exited", `${name} is no longer running under Phaseo.`); return; }
		setStopping(process.pid);
		try {
			const result = await api.stopProcess({ pid: process.pid, startTimeMs: process.startTimeMs });
			if (result.stopped) showToast("success", `Stopped ${name}`);
			else if (result.stale) showToast("info", "Process already exited", `${name} is not a process Phaseo started any more. It might already have exited.`);
			else showToast("error", "Could not stop the process", result.message);
		} catch (reason) { showToast("error", "Could not stop the process", errorText(reason)); }
		finally { if (mounted.current) setStopping(null); void loadProcesses(); }
	};

	if (!api) return <SettingsPageLayout title="Diagnostics" wide><p className="text-sm text-muted-foreground">Diagnostics are available in the desktop app.</p></SettingsPageLayout>;

	const processLoading = !processes && (processBusy || !processError);
	const resourceLoading = !resources && (resourceBusy || !resourceError);
	const traceLoading = !traces && (traceBusy || !traceError);
	const interval = resources ? resources.sampleIntervalMs ? `Every ${formatDuration(resources.sampleIntervalMs)}` : "On demand" : "…";

	return <SettingsPageLayout title="Diagnostics" description="What Phaseo is running on this computer and how its recent work went. Nothing here leaves your computer." wide className="max-w-[1120px] gap-10">
		<SettingsSection title="Live processes" action={<div className="flex items-center gap-1.5"><Checked at={processes?.readAt} busy={processBusy} /><RefreshButton busy={processBusy} label="Refresh live processes" onClick={() => void loadProcesses()} /></div>}>
			<StatsGrid>
				<StatBlock label="Child processes" value={processes ? formatCount(processes.processCount) : "…"} tip="Processes below Phaseo's main process: windows, browser tabs and helpers, agents, terminals, Git and MCP servers." />
				<StatBlock label="CPU" value={processes ? `${processes.totalCpuPercent.toFixed(1)}%` : "…"} tip="Total CPU across the main process and everything below it, since the previous sample. 100% is one full core." />
				<StatBlock label="Memory" value={processes ? formatBytes(processes.totalRssBytes) : "…"} tip="Total resident memory across the main process and everything below it. Shared memory is counted once per process." />
				<StatBlock label="Main process ID" value={processes ? String(processes.rootPid) : "…"} />
			</StatsGrid>
			<Problems messages={[{ text: processes?.error }, { text: processError }]} />
			<ProcessTable processes={processes?.processes ?? []} stopping={stopping} onStop={process => void stopProcess(process)} emptyLabel={processLoading ? "Loading live processes…" : "No live processes found."} />
		</SettingsSection>

		<SettingsSection title="Resource history" action={<div className="flex items-center gap-1.5"><PeriodSelector value={windowMs} onChange={setWindowMs} /><Checked at={resources?.readAt} busy={resourceBusy} /><RefreshButton busy={resourceBusy} label="Refresh resource history" onClick={() => void loadResources()} /></div>}>
			<StatsGrid>
				<StatBlock label="CPU time" value={resources ? formatCpuTime(resources.totalCpuSeconds) : "…"} tip="Approximate CPU time used by Phaseo and the processes it started during the period, while samples were being taken." />
				<StatBlock label="Samples" value={resources ? formatCount(resources.retainedSampleCount) : "…"} tip="Process samples kept in memory. Phaseo samples only while this page is open, keeps at most an hour, and forgets them when it quits." />
				<StatBlock label="Interval" value={interval} />
				<StatBlock label="Processes" value={resources ? formatCount(resources.processes.length) : "…"} />
			</StatsGrid>
			<Problems messages={[{ text: resources?.error }, { text: resourceError }]} />
			<HistoryChart buckets={resources?.buckets ?? []} />
			<HistoryTable processes={resources?.processes ?? []} emptyLabel={resourceLoading ? "Collecting process samples…" : "No process samples for this period."} />
		</SettingsSection>

		<SettingsSection title="Trace diagnostics" description={traces ? <>Spans from <span className="font-mono [overflow-wrap:anywhere]">{traces.traceFilePath}</span> and its rotated copies.</> : undefined} action={<div className="flex items-center gap-1.5"><Checked at={traces?.readAt} busy={traceBusy} />
			<Tip label="Open logs folder"><Button size="icon-xs" variant="ghost" aria-label="Open logs folder" disabled={openingLogs} onClick={openLogs} className="text-muted-foreground"><FolderOpen className="size-3.5" /></Button></Tip>
			<RefreshButton busy={traceBusy} label="Refresh trace diagnostics" onClick={() => void loadTraces()} /></div>}>
			<StatsGrid>
				<StatBlock label="Spans" value={traces ? formatCount(traces.recordCount) : "…"} />
				<StatBlock label="Failures" value={traces ? formatCount(traces.failureCount) : "…"} tone={traces?.failureCount ? "danger" : "default"} />
				<StatBlock label="Slow spans" value={traces ? formatCount(traces.slowSpanCount) : "…"} tip={`Spans that took ${formatDuration(traces?.slowSpanThresholdMs ?? 1_000)} or longer.`} tone={traces?.slowSpanCount ? "warning" : "default"} />
				<StatBlock label="Unreadable lines" value={traces ? formatCount(traces.parseErrorCount) : "…"} tip="Lines in the trace files that could not be read, for example from a write cut short." tone={traces?.parseErrorCount ? "warning" : "default"} />
			</StatsGrid>
			<Problems messages={[{ text: logsError }, { text: traces?.error && (traces.partialFailure ? `Some trace files could not be read, so these figures may be incomplete. ${traces.error}` : traces.error), tone: traces?.partialFailure || traces?.recordCount === 0 ? "warning" : "error" }, { text: traceError }]} />
		</SettingsSection>

		<SettingsSection title="Latest failures">
			{traces?.latestFailures.length ? <DiagnosticsTable columns={[{ label: "Span", width: "w-[28%]" }, { label: "Cause", width: "w-[46%]" }, { label: "Duration", align: "right", width: "w-[12%]" }, { label: "Ended", width: "w-[14%]" }]}>
				{traces.latestFailures.map(failure => <tr key={`${failure.traceId}:${failure.spanId}`}>
					<td className={cn(topCell, "font-medium [overflow-wrap:anywhere]")}>{failure.name}</td>
					<td className={cn(topCell, "text-muted-foreground")}><ExpandableText text={failure.cause} /></td>
					<td className={cn(topCell, numeric)}>{formatDuration(failure.durationMs)}</td>
					<td className={cn(topCell, "text-muted-foreground")}>{ago(failure.endedAt, now)}</td>
				</tr>)}
			</DiagnosticsTable> : <Empty label={traceLoading ? "Loading failures…" : "No failed spans found."} />}
		</SettingsSection>

		<SettingsSection title="Most common failures">
			{traces?.commonFailures.length ? <DiagnosticsTable minWidth="min-w-[720px]" columns={[{ label: "Span", width: "w-[28%]" }, { label: "Count", align: "right", width: "w-[10%]" }, { label: "Cause", width: "w-[46%]" }, { label: "Last seen", width: "w-[16%]" }]}>
				{traces.commonFailures.map(failure => <tr key={`${failure.name}\0${failure.cause}`}>
					<td className={cn(topCell, "font-medium [overflow-wrap:anywhere]")}>{failure.name}</td>
					<td className={cn(topCell, numeric)}>{formatCount(failure.count)}</td>
					<td className={cn(topCell, "text-muted-foreground")}><ExpandableText text={failure.cause} /></td>
					<td className={cn(topCell, "text-muted-foreground")}>{ago(failure.lastSeenAt, now)}</td>
				</tr>)}
			</DiagnosticsTable> : <Empty label={traceLoading ? "Loading failure groups…" : "No repeated failures found."} />}
		</SettingsSection>

		<SettingsSection title="Slowest spans">
			{traces?.slowestSpans.length ? <DiagnosticsTable minWidth="min-w-[720px]" columns={[{ label: "Span", width: "w-[44%]" }, { label: "Duration", align: "right", width: "w-[14%]" }, { label: "Ended", width: "w-[14%]" }, { label: "Trace", width: "w-[28%]" }]}>
				{traces.slowestSpans.map(span => <tr key={`${span.traceId}:${span.spanId}`}>
					<td className={cn(topCell, "font-medium [overflow-wrap:anywhere]")}>{span.name}</td>
					<td className={cn(topCell, numeric)}>{formatDuration(span.durationMs)}</td>
					<td className={cn(topCell, "text-muted-foreground")}>{ago(span.endedAt, now)}</td>
					<td className={cn(topCell, "text-muted-foreground")}><TraceId traceId={span.traceId} /></td>
				</tr>)}
			</DiagnosticsTable> : <Empty label={traceLoading ? "Loading slow spans…" : "No spans found."} />}
		</SettingsSection>

		<SettingsSection title="Span logs" description="The most recent warnings and errors, from spans and from the main process's console.">
			{traces?.latestWarningAndErrorLogs.length ? <DiagnosticsTable minWidth="min-w-[860px]" columns={[{ label: "Time", width: "w-[12%]" }, { label: "Level", width: "w-[10%]" }, { label: "Span", width: "w-[20%]" }, { label: "Message", width: "w-[36%]" }, { label: "Trace", width: "w-[22%]" }]}>
				{traces.latestWarningAndErrorLogs.map((event, index) => <tr key={`${event.seenAt}:${index}`} className="hover:bg-muted/15">
					<td className={cn(topCell, "text-muted-foreground")}>{ago(event.seenAt, now)}</td>
					<td className={topCell}><span className={cn("inline-flex rounded px-1.5 py-0.5 text-[11px] font-medium", /^(error|fatal)$/i.test(event.level) ? "bg-destructive/10 text-destructive" : "bg-warning/15 text-foreground/80")}>{event.level.charAt(0).toUpperCase() + event.level.slice(1).toLowerCase()}</span></td>
					<td className={topCell}><div className="truncate font-medium">{event.spanName}</div></td>
					<td className={cn(topCell, "text-muted-foreground")}><ExpandableText text={event.message} expandLabel="Show full message" /></td>
					<td className={cn(topCell, "text-muted-foreground")}><TraceId traceId={event.traceId} /></td>
				</tr>)}
			</DiagnosticsTable> : <Empty label={traceLoading ? "Loading recent logs…" : "No warnings or errors found."} />}
		</SettingsSection>

		<SettingsSection title="Top span names">
			{traces?.topSpansByCount.length ? <DiagnosticsTable minWidth="min-w-[720px]" columns={[{ label: "Span", width: "w-[40%]" }, { label: "Count", align: "right", width: "w-[12%]" }, { label: "Failures", align: "right", width: "w-[12%]" }, { label: "Total", align: "right", width: "w-[12%]" }, { label: "Average", align: "right", width: "w-[12%]" }, { label: "Maximum", align: "right", width: "w-[12%]" }]}>
				{traces.topSpansByCount.map(span => <tr key={span.name}>
					<td className={cn(topCell, "font-medium [overflow-wrap:anywhere]")}>{span.name}</td>
					<td className={cn(topCell, numeric)}>{formatCount(span.count)}</td>
					<td className={cn(topCell, numeric, span.failureCount > 0 && "text-destructive")}>{formatCount(span.failureCount)}</td>
					<td className={cn(topCell, numeric)}>{formatDuration(span.totalDurationMs)}</td>
					<td className={cn(topCell, numeric)}>{formatDuration(span.averageDurationMs)}</td>
					<td className={cn(topCell, numeric)}>{formatDuration(span.maxDurationMs)}</td>
				</tr>)}
			</DiagnosticsTable> : <Empty label={traceLoading ? "Loading span names…" : "No spans found."} />}
		</SettingsSection>
	</SettingsPageLayout>;
}
