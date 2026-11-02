import { Bot, Pause, Play, Activity, CalendarClock, ChartLine, Gauge, Inbox, Code2, GitPullRequestArrow, Link2, Keyboard, Columns3, FolderPlus, Globe, MessageSquare, Moon, PanelLeft, Plus, Settings, SquareTerminal, Sun, UserRound, Files, Archive, FileSearch, TextSearch, Search, Copy, GitBranchPlus, Bug } from "lucide-react";
import { ProjectIcon } from "../components/ProjectIcon";
import { errorText, useWorkspace } from "../app/workspace";
import { ScrollArea } from "../components/ui/scroll-area";
import { runCommand, shortcut } from "../lib/keybindings";
import { ProjectSearchDialog } from "./ProjectSearch";
import { openArchivedChats } from "./ArchivedChats";
import { usePendingDeletes } from "./threadUndo";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut } from "../components/ui/command";
import { StatusDot } from "./Sidebar";
import { pullRequestSearchTerms } from "../../shared/pullRequestView";
import { issueSearchTerms } from "../../shared/issueView";
import { ModelStack, modelName } from "../chat/ModelPicker";
import { useEffect, useState, type ComponentType } from "react";
import { paletteEntries, type PaletteEntry } from "../../shared/appCommands";
import { runAppCommand } from "../lib/appCommands";
import { MessageSearchResults, useMessageSearch } from "./MessageSearch";
import { requestFind } from "../chat/ChatFind";
import { CloneProjectDialog, openCloneProject, OpenProjectItems } from "./PaletteExtras";
import { showToast } from "../components/ui/toast";
import { startTriage } from "./Triage";

const entryIcons: Record<string, ComponentType> = { "New chat": Plus, "Operator": Bot, "Switch to Chat": MessageSquare, "Switch to Code": Code2, "Inbox": Inbox, "Usage": ChartLine, "Usage limits": Gauge, "Scheduled tasks": CalendarClock, "Open pull requests": GitPullRequestArrow, "Toggle sidebar": PanelLeft, "Show files and changes": Files, "Open terminal": SquareTerminal, "Open browser": Globe, "Settings": Settings, "Accounts and sign-in": UserRound, "Keyboard shortcuts": Keyboard, "Diagnostics": Activity };
/** The keyboard shortcut that does what a palette entry does, when there is one. */
function entryShortcut(entry: PaletteEntry) {
	if (entry.command === "chat.new") return shortcut("chat.new");
	if (entry.command === "mode.set") return shortcut(entry.args?.mode === "code" ? "mode.code" : "mode.chat");
	if (entry.command === "sidebar.set") return shortcut("sidebar.toggle");
	if (entry.command === "pane.open" && entry.args?.surface === "terminal") return shortcut("terminal.toggle");
	if (entry.command === "settings.open" && !entry.args) return shortcut("settings.open");
	return "";
}

export function CommandPalette() {
	const { commandsOpen, setCommandsOpen, overview, compareGroups, openCompare, taskById, select, setMode, selectedId, setRightPanel, resolvedTheme, setTheme, api, setOverview, setError, setNewChatProjectId } = useWorkspace();
	const operatorChat = overview.tasks.find(task => task.operator && !task.archived);
	const run = (action: () => void) => { setCommandsOpen(false); action(); };
	const [search, setSearch] = useState("");
	const messageSearch = useMessageSearch(search, commandsOpen);
	// The palette opens empty each time, as it did when its input kept its own value.
	useEffect(() => { if (!commandsOpen) setSearch(""); }, [commandsOpen]);
	const grouped = new Set(compareGroups.flatMap(group => group.taskIds));
	const hidden = usePendingDeletes();
	const tasks = overview.tasks.filter(task => !task.delegation?.parentTaskId && !grouped.has(task.id) && !hidden.has(task.id)).slice(0, 200);
	const projectName = (id?: string) => overview.projects.find(project => project.id === id)?.name;
	const current = selectedId ? taskById(selectedId) : undefined, linked = current?.pullRequests ?? [];
	const copyId = (id: string) => void navigator.clipboard.writeText(id).then(() => showToast("success", "Chat ID copied"), () => showToast("error", "Could not copy the chat ID"));
	return <><ProjectSearchDialog /><CloneProjectDialog /><CommandDialog open={commandsOpen} onOpenChange={setCommandsOpen} title="Search" description="Search chats and run commands" className="max-w-xl rounded-2xl! sm:max-w-xl">
		<CommandInput autoFocus value={search} onValueChange={setSearch} placeholder="Search chats, messages and commands…" wrapperClassName="p-2" />
		<ScrollArea className="max-h-[420px]" viewportClassName="max-h-[420px]"><CommandList className="max-h-none overflow-visible p-1">
			{!messageSearch.hits.length && !messageSearch.searching && <CommandEmpty>Nothing matches.</CommandEmpty>}
			<CommandGroup heading="Actions">
				{paletteEntries.map(entry => { const Icon = entryIcons[entry.title] ?? Bot, keys = entryShortcut(entry); return <CommandItem key={entry.title} value={`${entry.title} ${entry.keywords ?? ""}`} onSelect={() => run(() => void runAppCommand(entry.command, entry.args).catch(reason => showToast("error", `Could not run ${entry.title}`, errorText(reason))))}><Icon />{entry.title}{keys && <CommandShortcut>{keys}</CommandShortcut>}</CommandItem>; })}
				{operatorChat && <CommandItem value={operatorChat.operator?.paused ? "Resume the operator" : "Pause the operator stop"} onSelect={() => run(() => void runAppCommand(operatorChat.operator?.paused ? "operator.resume" : "operator.pause").catch(reason => showToast("error", "Could not change the operator", errorText(reason))))}>{operatorChat.operator?.paused ? <Play /> : <Pause />}{operatorChat.operator?.paused ? "Resume the operator" : "Pause the operator"}</CommandItem>}
				<CommandItem onSelect={() => run(() => { if (api) void api.chooseProject().then(state => { setOverview(state); const added = state.projects.find(value => !overview.projects.some(existing => existing.id === value.id)); if (added) { setMode("code"); setNewChatProjectId(added.id); select(undefined); } }, reason => setError(errorText(reason))); })}><FolderPlus />Open project folder…</CommandItem>
				<CommandItem value="Clone a repository git url github add project" onSelect={() => run(() => openCloneProject())}><GitBranchPlus />Clone a repository…</CommandItem>
				{api && <CommandItem value="Triage a Phaseo bug triage debug problem broken crash report issue fix this app" onSelect={() => run(() => { setMode("code"); select(undefined); startTriage(api); })}>
					<Bug /><span className="flex min-w-0 flex-col"><span>Triage a Phaseo bug</span><span className="truncate text-xs text-muted-foreground">An agent debugs this app from its own source and helps you file an issue</span></span>
				</CommandItem>}
				{current && <CommandItem value="Copy chat ID identifier reference" onSelect={() => run(() => copyId(current.id))}><Copy />Copy chat ID</CommandItem>}
			<CommandItem value="Archived chats restore unarchive deleted" onSelect={() => run(() => openArchivedChats())}><Archive />Archived chats</CommandItem>
				{current?.projectId && <CommandItem value="Show linked pull requests prs linked stack" disabled={!linked.length} onSelect={() => run(() => setRightPanel("pulls"))}><Link2 />Show linked pull requests</CommandItem>}
			{current?.projectId && <CommandItem value="Go to file open quick" onSelect={() => run(() => runCommand("filePicker.toggle"))}><FileSearch />Go to file…<CommandShortcut>{shortcut("filePicker.toggle")}</CommandShortcut></CommandItem>}
			{current?.projectId && <CommandItem value="Search in files contents grep project text" onSelect={() => run(() => runCommand("projectSearch.toggle"))}><TextSearch />Search in files…<CommandShortcut>{shortcut("projectSearch.toggle")}</CommandShortcut></CommandItem>}
			{current && <CommandItem value="Find in chat search this conversation" onSelect={() => run(() => runCommand("chat.find"))}><Search />Find in chat<CommandShortcut>{shortcut("chat.find")}</CommandShortcut></CommandItem>}
				<CommandItem onSelect={() => run(() => setTheme(resolvedTheme === "dark" ? "light" : "dark"))}>{resolvedTheme === "dark" ? <Sun /> : <Moon />}Use {resolvedTheme === "dark" ? "light" : "dark"} theme</CommandItem>
			</CommandGroup>
			{current?.projectId && <OpenProjectItems projectId={current.projectId} open={commandsOpen} run={run} />}
			{compareGroups.length > 0 && <CommandGroup heading="Comparisons">
				{compareGroups.map(group => {
					const members = group.taskIds.map(taskById).filter((task): task is NonNullable<typeof task> => !!task);
					return <CommandItem key={group.id} value={`${group.title} ${members.map(task => modelName(task)).join(" ")} ${group.id}`} onSelect={() => run(() => openCompare(group.id))}>
						<Columns3 />
						<span className="min-w-0 flex-1 truncate">{group.title}</span>
						<ModelStack models={members} size="sm" ringClassName="bg-popover ring-popover" />
					</CommandItem>;
				})}
			</CommandGroup>}
			{tasks.length > 0 && <CommandGroup heading="Chats">
				{tasks.map(task => <CommandItem key={task.id} value={`${task.title} ${projectName(task.projectId) ?? modelName(task)} ${task.id} ${pullRequestSearchTerms(task.pullRequests)} ${issueSearchTerms(task.issues)}`} onSelect={() => run(() => select(task.id))}>
					{task.projectId ? <ProjectIcon project={overview.projects.find(project => project.id === task.projectId)} /> : <ModelStack models={[task]} size="sm" ringClassName="ring-transparent" />}
					<span className="min-w-0 flex-1 truncate">{task.title}</span>
					<span className="text-xs text-muted-foreground">{task.projectId ? projectName(task.projectId) : modelName(task)}</span>
					<StatusDot task={task} />
				</CommandItem>)}
			</CommandGroup>}
			<MessageSearchResults query={search} {...messageSearch} onOpen={hit => run(() => { select(hit.taskId); requestFind({ taskId: hit.taskId, query: search.trim(), messageId: hit.messageId }); })} />
		</CommandList></ScrollArea>
	</CommandDialog></>;
}
