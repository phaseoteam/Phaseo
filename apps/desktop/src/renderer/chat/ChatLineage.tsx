import { useMemo, useState } from "react";
import { GitFork } from "lucide-react";
import { formatAgoShort } from "@phaseo/app-kit/format";
import { useWorkspace } from "../app/workspace";
import { Popover, PopoverContent, PopoverTrigger } from "../components/ui/popover";
import { chatLineage, lineageSize, type LineageNode } from "../lib/chatLineage";
import { cn } from "../lib/utils";
import { StatusDot } from "../shell/Sidebar";

function Branch({ node, depth, current, onOpen }: { node: LineageNode; depth: number; current: string; onOpen: (id: string) => void }) {
	const here = node.task.id === current;
	return <>
		<button type="button" aria-current={here ? "page" : undefined} onClick={() => onOpen(node.task.id)} style={{ paddingLeft: 8 + depth * 14 }}
			className={cn("flex h-7 w-full min-w-0 items-center gap-2 rounded-md pr-2 text-left text-[13px] hover:bg-muted", here && "bg-muted font-medium")}>
			<StatusDot task={node.task} />
			<span className="min-w-0 flex-1 truncate">{node.task.title}</span>
			<span className="shrink-0 text-[11px] text-muted-foreground">{node.task.archived ? "Archived" : formatAgoShort(node.task.createdAt)}</span>
		</button>
		{node.children.map(child => <Branch key={child.task.id} node={child} depth={depth + 1} current={current} onOpen={onOpen} />)}
	</>;
}

/** The chats this one was forked, branched or handed off from, and the ones made from it, as a tree; click to open one. */
export function ChatLineage({ taskId }: { taskId: string }) {
	const { overview, select } = useWorkspace();
	const [open, setOpen] = useState(false);
	const tree = useMemo(() => chatLineage(overview.tasks, taskId), [overview.tasks, taskId]);
	if (!tree) return null;
	const size = lineageSize(tree);
	return <Popover open={open} onOpenChange={setOpen}>
		<PopoverTrigger render={<button type="button" aria-label={`Lineage: ${size} chats`} title="Forks and branches of this chat" className="flex h-8 shrink-0 items-center gap-1 rounded-md px-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground [-webkit-app-region:no-drag]" />}>
			<GitFork className="size-4" />{size}
		</PopoverTrigger>
		<PopoverContent align="end" className="w-80 gap-0 rounded-md p-1">
			<p className="px-2 pt-1.5 pb-1 text-xs font-medium text-muted-foreground">Lineage</p>
			<div role="tree" aria-label="Lineage" className="max-h-80 overflow-y-auto"><Branch node={tree} depth={0} current={taskId} onOpen={id => { setOpen(false); select(id); }} /></div>
		</PopoverContent>
	</Popover>;
}
