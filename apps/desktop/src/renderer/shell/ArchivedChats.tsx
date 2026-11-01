import { formatDate } from "@phaseo/app-kit/format";
import { useMemo, useState, useSyncExternalStore } from "react";
import { ArchiveRestore, Search, Trash2 } from "lucide-react";
import { useWorkspace } from "../app/workspace";
import type { TaskOverview } from "../../shared/workspaceOverview";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { ScrollArea } from "../components/ui/scroll-area";
import { ProjectIcon } from "../components/ProjectIcon";
import { ModelStack } from "../chat/ModelPicker";
import { deleteWithUndo, usePendingDeletes } from "./threadUndo";

let open = false;
const listeners = new Set<() => void>();
/** Opens the archive from anywhere (the palette, the sidebar). */
export function openArchivedChats(value = true) { open = value; for (const listener of listeners) listener(); }
const useOpen = () => useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => open);

/** Archived chats, newest first; agents' chats stay with the chat that started them. */
export function archivedChats(tasks: readonly TaskOverview[], hidden: ReadonlySet<string>, query = "") {
	const needle = query.trim().toLowerCase();
	return tasks.filter(task => task.archived && !task.delegation?.parentTaskId && !hidden.has(task.id) && (!needle || task.title.toLowerCase().includes(needle))).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}


/** Archived chats: restore one, or delete it for good (with a moment to undo). */
export function ArchivedChatsDialog() {
	const isOpen = useOpen();
	const { overview, command, select } = useWorkspace();
	const hidden = usePendingDeletes();
	const [query, setQuery] = useState("");
	const chats = useMemo(() => archivedChats(overview.tasks, hidden, query), [overview.tasks, hidden, query]);
	const project = (id?: string) => overview.projects.find(value => value.id === id);
	const restore = async (task: TaskOverview, then?: () => void) => { if (await command({ type: "update-task", id: task.id, archived: false })) then?.(); };
	return <Dialog open={isOpen} onOpenChange={value => { openArchivedChats(value); if (!value) setQuery(""); }}>
		<DialogContent className="flex max-h-[min(640px,80vh)] flex-col gap-3 sm:max-w-lg">
			<DialogHeader><DialogTitle>Archived chats</DialogTitle><DialogDescription>Restore a chat to put it back in your list.</DialogDescription></DialogHeader>
			<label className="flex h-8 items-center gap-2 rounded-md border border-input px-2.5 text-[13px] focus-within:ring-2 focus-within:ring-ring/40">
				<Search className="size-3.5 text-muted-foreground" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search archived chats" aria-label="Search archived chats" className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground" />
			</label>
			<ScrollArea className="-mx-2 min-h-0 flex-1">
				{chats.length ? <ul className="px-2">{chats.map(task => <li key={task.id} className="group/archived flex h-9 items-center gap-2 rounded-md px-2 text-[13px] hover:bg-muted/70">
					{task.projectId ? <ProjectIcon project={project(task.projectId)} className="size-4" /> : <ModelStack models={[task]} size="sm" ringClassName="ring-transparent" />}
					<button type="button" title="Restore and open" onClick={() => void restore(task, () => { openArchivedChats(false); select(task.id); })} className="min-w-0 flex-1 truncate text-left hover:underline">{task.title}</button>
					<span className="shrink-0 text-[11px] text-muted-foreground group-hover/archived:hidden">{task.projectId ? project(task.projectId)?.name : formatDate(task.updatedAt)}</span>
					<button type="button" aria-label={`Restore ${task.title}`} title="Restore" onClick={() => void restore(task)} className="hidden size-7 place-items-center rounded-md text-muted-foreground group-hover/archived:grid group-focus-within/archived:grid hover:bg-background hover:text-foreground [&_svg]:size-3.5"><ArchiveRestore /></button>
					<button type="button" aria-label={`Delete ${task.title}`} title="Delete" onClick={() => deleteWithUndo(task.id, () => command({ type: "delete-task", id: task.id }))} className="hidden size-7 place-items-center rounded-md text-muted-foreground group-hover/archived:grid group-focus-within/archived:grid hover:bg-background hover:text-destructive [&_svg]:size-3.5"><Trash2 /></button>
				</li>)}</ul>
					: <p className="px-4 py-8 text-center text-xs text-muted-foreground">{query.trim() ? "No archived chats match." : "No archived chats."}</p>}
			</ScrollArea>
		</DialogContent>
	</Dialog>;
}
