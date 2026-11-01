import { SquareMenu } from "lucide-react";
import { useWorkspace } from "../app/workspace";
import { Popover, PopoverContent, PopoverTrigger } from "../components/ui/popover";
import { TooltipProvider } from "../components/ui/tooltip";
import { GitActions } from "../panels/GitActions";
import { visiblePullRequestLinks } from "../../shared/pullRequestStacks";
import { ChatPullRequestRows } from "../views/pullRequests/ChatPullRequestRows";
import { ThreadServers } from "./ThreadServers";

/** T3's details card in the title bar: the project's branch and Git actions, the chat's pull requests and its servers. */
export function ChatDetails() {
	const { overview, selectedId, newChatProjectId, setNewChatProjectId, setRightPanel, settings, select } = useWorkspace();
	const task = overview.tasks.find(value => value.id === selectedId);
	const projectId = task?.projectId ?? (selectedId ? undefined : newChatProjectId || undefined);
	if (!projectId || settings) return null;
	const linked = visiblePullRequestLinks(task?.pullRequests);
	return <Popover>
		<PopoverTrigger render={<button type="button" aria-label="Chat details" title="Branch, commits and pull requests" className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground [-webkit-app-region:no-drag]" />}><SquareMenu className="size-4" /></PopoverTrigger>
		<PopoverContent align="end" className="w-[22rem] gap-0 rounded-2xl p-0">
			<TooltipProvider delay={150}>
				<div className="px-2 pt-2 pb-2.5"><GitActions projectId={projectId} taskId={task?.id} onProjectCreated={id => { setNewChatProjectId(id); if (selectedId) select(undefined); }} /></div>
				{task && <div className="border-t border-border/65 px-1.5 pt-2 pb-1.5 text-xs">
					<div className="flex items-center justify-between px-1.5 pb-1"><span className="font-medium">Pull requests</span><button type="button" onClick={() => setRightPanel("pulls")} className="text-muted-foreground hover:text-foreground">{linked.length ? `${linked.length} linked` : "Link one"}</button></div>
					<ChatPullRequestRows projectId={projectId} taskId={task.id} />
				</div>}
				{task && <ThreadServers taskId={task.id} />}
			</TooltipProvider>
		</PopoverContent>
	</Popover>;
}
