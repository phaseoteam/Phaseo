import { useState } from "react";
import { ChevronRight, FileText, Folder, FolderOpen } from "lucide-react";
import { ScrollArea } from "../components/ui/scroll-area";
import { changeTone, type DiffTreeNode } from "../lib/diffSurface";
import { cn } from "../lib/utils";

/** The changed files as a tree beside the diff; choosing one scrolls the diff to it. */
export function DiffFileTree({ label, nodes, selectedPath, onSelect }: { label: string; nodes: DiffTreeNode[]; selectedPath?: string; onSelect: (path: string) => void }) {
	const [closed, setClosed] = useState<ReadonlySet<string>>(new Set());
	const toggle = (path: string) => setClosed(current => { const next = new Set(current); if (!next.delete(path)) next.add(path); return next; });
	const row = (node: DiffTreeNode, depth: number) => {
		const indent = { paddingLeft: `${depth * 12 + 6}px` };
		if (!node.file) {
			const open = !closed.has(node.path);
			return <li key={`d:${node.path}`} role="treeitem" aria-expanded={open} aria-selected={false}>
				<button type="button" onClick={() => toggle(node.path)} style={indent} className="flex h-6 w-full items-center gap-1 rounded-md pr-2 text-left text-xs text-muted-foreground hover:bg-accent/60 hover:text-foreground">
					<ChevronRight className={cn("size-3 shrink-0 transition-transform", open && "rotate-90")} />
					{open ? <FolderOpen className="size-3.5 shrink-0" /> : <Folder className="size-3.5 shrink-0" />}
					<span className="min-w-0 flex-1 truncate">{node.name}</span>
				</button>
				{open && <ul role="group">{node.children.map(child => row(child, depth + 1))}</ul>}
			</li>;
		}
		const selected = node.path === selectedPath;
		return <li key={`f:${node.path}`} role="treeitem" aria-selected={selected}>
			<button type="button" title={node.path} onClick={() => onSelect(node.path)} style={{ paddingLeft: `${depth * 12 + 22}px` }}
				className={cn("flex h-6 w-full items-center gap-1.5 rounded-md pr-2 text-left text-xs", selected ? "bg-accent text-foreground" : "text-foreground/90 hover:bg-accent/60")}>
				<FileText className={cn("size-3.5 shrink-0", changeTone(node.file.type))} />
				<span className={cn("min-w-0 flex-1 truncate", node.file.type === "deleted" && "line-through decoration-muted-foreground/60")}>{node.name}</span>
				<span className="shrink-0 font-mono text-[10px] tabular-nums">
					{node.file.additions > 0 && <span className="text-success">+{node.file.additions}</span>}
					{node.file.deletions > 0 && <span className="ml-1 text-destructive">−{node.file.deletions}</span>}
				</span>
			</button>
		</li>;
	};
	return <ScrollArea className="min-h-0 w-full" viewportClassName="py-1">
		<ul role="tree" aria-label={label} className="px-1">{nodes.map(node => row(node, 0))}</ul>
	</ScrollArea>;
}
