import { useEffect, useState } from "react";
import { FileDiff } from "lucide-react";
import type { TurnFileChange } from "../../shared/gitDiff";
import type { Message } from "../../shared/workspace";
import { openTurnDiff } from "../panels/events";
import { changesSummary } from "./changedFiles";

/** Turn summaries by snapshot pair: a turn's files never change, so each is read once per session. */
const cache = new Map<string, Promise<TurnFileChange[]>>();

/** T3's changed-files summary under a Code turn, as one quiet row: what changed, the line counts, and Open diff. */
export function TurnChanges({ taskId, projectId, message }: { taskId: string; projectId: string; message: Message }) {
	const checkpoint = message.checkpoint;
	const [changes, setChanges] = useState<TurnFileChange[]>();
	useEffect(() => {
		const api = window.phaseoDesktop?.workspace;
		if (!api || !checkpoint?.after || checkpoint.after === checkpoint.before) return;
		const key = `${checkpoint.before}:${checkpoint.after}`;
		let request = cache.get(key);
		if (!request) { request = api.turnChanges(projectId, checkpoint.before, checkpoint.after); cache.set(key, request); request.catch(() => cache.delete(key)); }
		let active = true;
		request.then(value => { if (active) setChanges(value); }, () => undefined);
		return () => { active = false; };
	}, [projectId, checkpoint?.before, checkpoint?.after]);
	if (!changes?.length) return null;
	const summary = changesSummary(changes);
	return <div data-turn-changes className="-mt-1 flex min-w-0 items-center gap-2 text-[12.5px] text-muted-foreground">
		<FileDiff aria-hidden className="size-3.5 shrink-0" />
		<span className="min-w-0 truncate" title={changes.map(change => change.path).join("\n")}>{summary.label}</span>
		<span className="shrink-0 font-mono text-[11px] tabular-nums"><span className="text-emerald-600 dark:text-emerald-300/90">+{summary.additions}</span> <span className="text-destructive">−{summary.deletions}</span></span>
		<button type="button" onClick={() => openTurnDiff({ taskId, messageId: message.id })} className="shrink-0 rounded-md px-1.5 py-0.5 font-medium text-foreground/85 hover:bg-muted hover:text-foreground">Open diff</button>
	</div>;
}
