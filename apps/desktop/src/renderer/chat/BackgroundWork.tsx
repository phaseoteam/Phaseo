import { useCallback, useEffect, useState } from "react";
import { ChevronRight, SquareTerminal } from "lucide-react";
import type { BackgroundCommandView } from "../../shared/workspace";
import { showToast } from "../components/ui/toast";
import { elapsedLabel, useNow } from "../lib/elapsed";
import { cn } from "../lib/utils";

// eslint-disable-next-line no-control-regex
const plain = (output: string) => output.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "");

/** The newest line a command printed, without terminal colour codes, for a one-line status. */
export function latestLine(output: string) {
	const lines = plain(output).split(/\r?\n|\r/).map(line => line.trim()).filter(Boolean);
	return lines.at(-1) ?? "";
}

// Output changes without a start or an end, so the line refreshes on its own while a command runs.
const OUTPUT_REFRESH_MS = 2000;

/**
 * The commands an agent left running in the background (dev servers, watchers): what runs, its newest output line
 * and how long it has run, with Stop. A chat would otherwise look idle while they keep going.
 */
export function BackgroundWork({ taskId }: { taskId: string }) {
	const [commands, setCommands] = useState<(BackgroundCommandView & { seenAt: number })[]>([]);
	const [stopping, setStopping] = useState<string[]>([]);
	const [open, setOpen] = useState<string>();
	const refresh = useCallback(() => {
		const api = window.phaseoDesktop?.workspace; if (!api) return;
		void api.backgroundCommands(taskId).then(values => { const seenAt = Date.now(); setCommands(values.map(value => ({ ...value, seenAt }))); }, () => setCommands([]));
	}, [taskId]);
	useEffect(() => {
		refresh();
		return window.phaseoDesktop?.workspace.onBackgroundChange(id => { if (id === taskId) refresh(); });
	}, [taskId, refresh]);
	const running = commands.length > 0;
	useEffect(() => {
		if (!running) return;
		const timer = setInterval(() => { if (document.visibilityState === "visible") refresh(); }, OUTPUT_REFRESH_MS);
		return () => clearInterval(timer);
	}, [running, refresh]);
	const now = useNow(running);
	if (!running) return null;
	const stop = async (command: BackgroundCommandView) => {
		setStopping(current => [...current, command.id]);
		try { await window.phaseoDesktop!.workspace.stopBackgroundCommand(taskId, command.id); }
		catch (reason) { showToast("error", "Could not stop the command", reason instanceof Error ? reason.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, "") : String(reason)); }
		finally { setStopping(current => current.filter(id => id !== command.id)); refresh(); }
	};
	return <section aria-label="Background commands" className="flex flex-col gap-1">
		{commands.map(command => {
			const line = latestLine(command.output), expanded = open === command.id;
			return <div key={command.id} className="flex flex-col gap-1">
				<div className="flex min-w-0 items-center gap-2 text-[13px]">
					<button type="button" aria-expanded={expanded} onClick={() => setOpen(expanded ? undefined : command.id)} title={expanded ? "Hide output" : "Show output"}
						className="group/background flex min-w-0 flex-1 items-center gap-2 rounded-md text-left focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none">
						<SquareTerminal className="size-4 shrink-0 text-muted-foreground" />
						<span className="shrink-0 text-foreground/85">Running</span>
						<code className="min-w-0 shrink truncate font-mono text-xs text-foreground">{command.command}</code>
						{line && <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{line}</span>}
						<ChevronRight className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-90")} />
					</button>
					<span className="shrink-0 text-xs text-muted-foreground tabular-nums">{elapsedLabel(command.durationMs + now - command.seenAt)}</span>
					<button type="button" disabled={stopping.includes(command.id)} onClick={() => void stop(command)} className="shrink-0 rounded-md px-1.5 py-0.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50">
						{stopping.includes(command.id) ? "Stopping…" : "Stop"}
					</button>
				</div>
				{expanded && <pre className="ml-6 max-h-48 overflow-auto rounded-md bg-muted px-3 py-2 font-mono text-[11.5px] leading-relaxed whitespace-pre-wrap text-foreground/85">{plain(command.output) || "No output yet."}</pre>}
			</div>;
		})}
	</section>;
}
