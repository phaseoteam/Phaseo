import { useState } from "react";
import { Settings2, SquareMenu } from "lucide-react";
import { shortcut, useCommand } from "../lib/keybindings";
import { usePersistedState } from "../lib/persistedState";
import { useWorkspace } from "../app/workspace";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from "../components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "../components/ui/popover";
import { TooltipProvider } from "../components/ui/tooltip";
import { GitActions } from "../panels/GitActions";
import { visiblePullRequestLinks } from "../../shared/pullRequestStacks";
import { ChatPullRequestRows } from "../views/pullRequests/ChatPullRequestRows";
import { ThreadServers } from "./ThreadServers";

const sections = [{ id: "git", label: "Branch and Git actions" }, { id: "pullRequests", label: "Pull requests" }, { id: "servers", label: "Servers" }] as const;
type Section = typeof sections[number]["id"];

/** The details card in the title bar: the project's branch and Git actions, the chat's pull requests and its servers. */
export function ChatDetails() {
	const { overview, selectedId, newChatProjectId, setNewChatProjectId, setRightPanel, settings, select } = useWorkspace();
	const task = overview.tasks.find(value => value.id === selectedId);
	const projectId = task?.projectId ?? (selectedId ? undefined : newChatProjectId || undefined);
	const [open, setOpen] = useState(false);
	// What the card shows; hiding one also stops it from reading Git or the chat's servers.
	const [hidden, setHidden] = usePersistedState<Section[]>("phaseo.desktop.chatDetailsHidden", []);
	const shows = (section: Section) => !hidden.includes(section);
	// Mod+Shift+B opens and closes the card.
	useCommand("threadPanel.toggle", () => { if (!projectId || settings) return false; setOpen(value => !value); });
	if (!projectId || settings) return null;
	const linked = visiblePullRequestLinks(task?.pullRequests);
	const keys = shortcut("threadPanel.toggle");
	const nothing = sections.every(section => !shows(section.id) || (!task && section.id !== "git"));
	return <Popover open={open} onOpenChange={setOpen}>
		<PopoverTrigger render={<button type="button" aria-label="Chat details" title={`Branch, commits and pull requests${keys ? ` (${keys})` : ""}`} className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground [-webkit-app-region:no-drag]" />}><SquareMenu className="size-4" /></PopoverTrigger>
		<PopoverContent align="end" className="w-[22rem] gap-0 rounded-2xl p-0">
			<TooltipProvider delay={150}>
				{shows("git") && <div className="px-2 pt-2 pb-2.5"><GitActions projectId={projectId} taskId={task?.id} onProjectCreated={id => { setNewChatProjectId(id); if (selectedId) select(undefined); }} /></div>}
				{task && shows("pullRequests") && <div className="border-t border-border/65 px-1.5 pt-2 pb-1.5 text-xs first:border-t-0">
					<div className="flex items-center justify-between px-1.5 pb-1"><span className="font-medium">Pull requests</span><button type="button" onClick={() => setRightPanel("pulls")} className="text-muted-foreground hover:text-foreground">{linked.length ? `${linked.length} linked` : "Link one"}</button></div>
					<ChatPullRequestRows projectId={projectId} taskId={task.id} />
				</div>}
				{task && shows("servers") && <ThreadServers taskId={task.id} />}
				{nothing && <p className="px-3.5 pt-3 pb-1 text-xs text-muted-foreground">Everything this card can show is hidden.</p>}
				<div className="flex justify-end border-t border-border/65 px-1.5 py-1 first:border-t-0">
					<DropdownMenu>
						<DropdownMenuTrigger render={<button type="button" aria-label="Choose what this card shows" className="flex h-6 items-center gap-1 rounded-md px-1.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground [&_svg]:size-3.5" />}><Settings2 />Show</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="w-52">
							{sections.map(section => <DropdownMenuCheckboxItem key={section.id} checked={shows(section.id)} closeOnClick={false}
								onCheckedChange={checked => setHidden(current => checked ? current.filter(value => value !== section.id) : [...current.filter(value => value !== section.id), section.id])} className="text-xs">{section.label}</DropdownMenuCheckboxItem>)}
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</TooltipProvider>
		</PopoverContent>
	</Popover>;
}
