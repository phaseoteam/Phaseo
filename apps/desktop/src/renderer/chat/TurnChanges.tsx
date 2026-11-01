import { useEffect, useMemo, useState } from "react";
import { ChevronRight, ChevronsDownUp, ChevronsUpDown, FileDiff, FileText, Folder, FolderOpen } from "lucide-react";
import type { TurnFileChange } from "../../shared/gitDiff";
import type { Message } from "../../shared/workspace";
import { openTurnDiff } from "../panels/events";
import { cn } from "../lib/utils";
import { changedFilesTree, changedFolders, changesSummary, type ChangedNode } from "./changedFiles";

/** Turn summaries by snapshot pair: a turn's files never change, so each is read once per session. */
const cache = new Map<string, Promise<TurnFileChange[]>>();

function Counts({ node }: { node: Pick<ChangedNode, "additions" | "deletions" | "binary"> }) {
	if (node.binary) return <span className="shrink-0 text-[11px]">Binary</span>;
	return <span className="shrink-0 font-mono text-[11px] tabular-nums"><span className="text-emerald-600 dark:text-emerald-300/90">+{node.additions}</span> <span className="text-destructive">−{node.deletions}</span></span>;
}

/**
 * T3's changed files under a Code turn: one quiet row with what changed, the line counts and Open diff, which opens
 * into the files as a tree (folders with their totals, Expand all). A file opens the turn's diff at that file.
 */
export function TurnChanges({ taskId, projectId, message }: { taskId: string; projectId: string; message: Message }) {
	const checkpoint = message.checkpoint;
	const [changes, setChanges] = useState<TurnFileChange[]>();
	const [open, setOpen] = useState(false);
	const [closed, setClosed] = useState<ReadonlySet<string>>(new Set());
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
	const tree = useMemo(() => changedFilesTree(changes ?? []), [changes]);
	const folders = useMemo(() => changedFolders(tree), [tree]);
	if (!changes?.length) return null;
	const summary = changesSummary(changes);
	const anyClosed = folders.some(path => closed.has(path));
	const toggle = (path: string) => setClosed(current => { const next = new Set(current); if (!next.delete(path)) next.add(path); return next; });
	const row = (node: ChangedNode, depth: number) => {
		const indent = { paddingLeft: `${depth * 14 + 4}px` };
		if (node.children) {
			const expanded = !closed.has(node.path);
			return <li key={`d:${node.path}`} role="treeitem" aria-expanded={expanded} aria-selected={false}>
				<button type="button" onClick={() => toggle(node.path)} style={indent} className="flex h-6 w-full min-w-0 items-center gap-1.5 rounded-md pr-1.5 text-left hover:bg-muted hover:text-foreground">
					<ChevronRight aria-hidden className={cn("size-3 shrink-0 transition-transform", expanded && "rotate-90")} />
					{expanded ? <FolderOpen aria-hidden className="size-3.5 shrink-0" /> : <Folder aria-hidden className="size-3.5 shrink-0" />}
					<span className="min-w-0 flex-1 truncate">{node.name}</span>
					<Counts node={node} />
				</button>
				{expanded && <ul role="group">{node.children.map(child => row(child, depth + 1))}</ul>}
			</li>;
		}
		return <li key={`f:${node.path}`} role="treeitem" aria-selected={false}>
			<button type="button" title={`Open ${node.path} in the diff`} onClick={() => openTurnDiff({ taskId, messageId: message.id, path: node.path })} style={{ paddingLeft: `${depth * 14 + 22}px` }}
				className="flex h-6 w-full min-w-0 items-center gap-1.5 rounded-md pr-1.5 text-left text-foreground/85 hover:bg-muted hover:text-foreground">
				<FileText aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
				<span className="min-w-0 flex-1 truncate">{node.name}</span>
				<Counts node={node} />
			</button>
		</li>;
	};
	return <div data-turn-changes className="-mt-1 flex min-w-0 flex-col gap-1 text-[12.5px] text-muted-foreground">
		<div className="flex min-w-0 items-center gap-2">
			<button type="button" aria-expanded={open} onClick={() => setOpen(value => !value)} title={open ? "Hide the files" : "Show the files"} className="flex min-w-0 items-center gap-2 rounded-md hover:text-foreground">
				<FileDiff aria-hidden className="size-3.5 shrink-0" />
				<span className="min-w-0 truncate" title={changes.map(change => change.path).join("\n")}>{summary.label}</span>
				<ChevronRight aria-hidden className={cn("size-3.5 shrink-0 transition-transform", open && "rotate-90")} />
			</button>
			<Counts node={summary} />
			{open && folders.length > 0 && <button type="button" onClick={() => setClosed(anyClosed ? new Set() : new Set(folders))} aria-label={anyClosed ? "Expand all folders" : "Collapse all folders"} title={anyClosed ? "Expand all folders" : "Collapse all folders"}
				className="grid size-6 shrink-0 place-items-center rounded-md hover:bg-muted hover:text-foreground">{anyClosed ? <ChevronsUpDown className="size-3.5" /> : <ChevronsDownUp className="size-3.5" />}</button>}
			<button type="button" onClick={() => openTurnDiff({ taskId, messageId: message.id })} className="shrink-0 rounded-md px-1.5 py-0.5 font-medium text-foreground/85 hover:bg-muted hover:text-foreground">Open diff</button>
		</div>
		{open && <ul role="tree" aria-label={`Files changed in this turn: ${summary.files}`} className="ml-[7px] border-l border-border pl-1">{tree.map(node => row(node, 0))}</ul>}
	</div>;
}
