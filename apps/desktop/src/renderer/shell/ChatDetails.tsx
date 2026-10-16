import { SquareMenu } from "lucide-react";
import { useWorkspace } from "../app/workspace";
import { Popover, PopoverContent, PopoverTrigger } from "../components/ui/popover";
import { GitActions } from "../panels/GitActions";

/** T3's details card in the title bar: the project's branch and Git actions, and the chat's linked pull requests. */
export function ChatDetails() {
	const { overview, selectedId, newChatProjectId, setNewChatProjectId, setRightPanel, settings, select } = useWorkspace();
	const task = overview.tasks.find(value => value.id === selectedId);
	const projectId = task?.projectId ?? (selectedId ? undefined : newChatProjectId || undefined);
	if (!projectId || settings) return null;
	const linked = task?.pullRequests ?? [];
	return <Popover>
		<PopoverTrigger render={<button type="button" aria-label="Chat details" title="Branch, commits and pull requests" className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground [-webkit-app-region:no-drag]" />}><SquareMenu className="size-4" /></PopoverTrigger>
		<PopoverContent align="end" className="w-[22rem] gap-0 rounded-2xl p-0">
			<div className="px-2 pt-2 pb-2.5"><GitActions projectId={projectId} taskId={task?.id} onProjectCreated={id => { setNewChatProjectId(id); if (selectedId) select(undefined); }} /></div>
			{task && <div className="border-t border-border/65 px-3 pt-2 pb-2.5 text-xs">
				<div className="flex items-center justify-between"><span className="font-medium">Pull requests</span><button type="button" onClick={() => setRightPanel("pulls")} className="text-muted-foreground hover:text-foreground">{linked.length ? `${linked.length} linked` : "Link one"}</button></div>
				{linked.slice(0, 5).map(link => <div key={link.url} className="mt-1 flex items-center gap-1.5 text-muted-foreground"><span className="font-mono">#{link.number}</span><span className="min-w-0 truncate">{link.snapshot?.title ?? link.repository}</span></div>)}
			</div>}
		</PopoverContent>
	</Popover>;
}
