import { Activity, CalendarClock, ChartLine, Gauge, Inbox, Code2, GitPullRequestArrow, Link2, Keyboard, Columns3, FolderPlus, Globe, MessageSquare, Moon, PanelLeft, Plus, Settings, SquareTerminal, Sun, UserRound, Files, Archive, FileSearch, TextSearch, Search, Copy, GitBranchPlus, Bug, SquarePen, Pin, PinOff, CircleCheck, Undo2, Mail, Pencil, Monitor, History, ArchiveRestore } from "lucide-react";
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
import { useEffect, useState } from "react";
import { MessageSearchResults, useMessageSearch } from "./MessageSearch";
import { requestFind } from "../chat/ChatFind";
import { CloneProjectDialog, openCloneProject, OpenProjectItems } from "./PaletteExtras";
import { ImportSessionsDialog, openImportSessions } from "./ImportSessions";
import { showToast } from "../components/ui/toast";
import { startTriage } from "./Triage";
import { useThreadActions } from "./threadActions";
import { isSettled, settleBlocker } from "../../shared/threadLifecycle";
import { renameChatEvent } from "../chat/composerActions";
import type { ThemePreference } from "../types";

export function CommandPalette() {
	const { commandsOpen, setCommandsOpen, overview, compareGroups, openCompare, taskById, select, setMode, openSettings, openScheduled, openPullRequests, openInbox, openUsage, selectedId, setRightPanel, setSidebarOpen, theme, setTheme, api, setOverview, setError, setNewChatProjectId, openProjectSettings, command } = useWorkspace();
	const threadActions = useThreadActions();
	const run = (action: () => void) => { setCommandsOpen(false); action(); };
	const [search, setSearch] = useState("");
	// "New chat in…" lists projects on a page of its own; Backspace in the empty field goes back.
	const [page, setPage] = useState<"new-chat-in">();
	const messageSearch = useMessageSearch(page ? "" : search, commandsOpen);
	// The palette opens empty each time, as it did when its input kept its own value.
	useEffect(() => { if (!commandsOpen) { setSearch(""); setPage(undefined); } }, [commandsOpen]);
	const grouped = new Set(compareGroups.flatMap(group => group.taskIds));
	const hidden = usePendingDeletes();
	const tasks = overview.tasks.filter(task => !task.delegation?.parentTaskId && !grouped.has(task.id) && !hidden.has(task.id)).slice(0, 200);
	const projectName = (id?: string) => overview.projects.find(project => project.id === id)?.name;
	const current = selectedId ? taskById(selectedId) : undefined, linked = current?.pullRequests ?? [];
	const projects = overview.projects.filter(project => !project.worktree), activeProjects = projects.filter(project => !project.archived), currentProject = overview.projects.find(project => project.id === current?.projectId);
	// Pin and archive act on the project itself, so a worktree chat reaches its source project.
	const shelfProject = currentProject?.worktree ? projects.find(project => project.id === currentProject.worktree!.sourceProjectId) : currentProject;
	const organizeProject = (id: string, change: { pinned?: boolean; archived?: boolean }) => run(() => void command({ type: "organize-project", id, ...change }));
	const searching = search.trim() !== "";
	const startIn = (projectId: string) => run(() => { setMode("code"); setNewChatProjectId(projectId); select(undefined); });
	const projectItem = (project: typeof projects[number]) => <CommandItem key={project.id} value={`${project.name} ${project.directory} ${project.id}`} onSelect={() => startIn(project.id)}>
		<ProjectIcon project={project} /><span className="min-w-0 truncate">{project.name}</span><span className="min-w-0 flex-1 truncate text-right text-xs text-muted-foreground">{project.directory}</span>
	</CommandItem>;
	const themes: { value: ThemePreference; label: string; icon: typeof Sun }[] = [{ value: "light", label: "Use light theme", icon: Sun }, { value: "dark", label: "Use dark theme", icon: Moon }, { value: "system", label: "Use the system theme", icon: Monitor }];
	const copyId = (id: string) => void navigator.clipboard.writeText(id).then(() => showToast("success", "Chat ID copied"), () => showToast("error", "Could not copy the chat ID"));
	return <><ProjectSearchDialog /><CloneProjectDialog /><ImportSessionsDialog /><CommandDialog open={commandsOpen} onOpenChange={setCommandsOpen} title="Search" description="Search chats and run commands" className="max-w-xl rounded-2xl! sm:max-w-xl">
		<CommandInput autoFocus value={search} onValueChange={setSearch} placeholder={page ? "New chat in…" : "Search chats, messages and commands…"} wrapperClassName="p-2"
			onKeyDown={event => { if (page && event.key === "Backspace" && !search) { event.preventDefault(); setPage(undefined); } }} />
		<ScrollArea className="max-h-[420px]" viewportClassName="max-h-[420px]"><CommandList className="max-h-none overflow-visible p-1">
			{page ? <><CommandEmpty>No project matches.</CommandEmpty><CommandGroup heading="New chat in">{activeProjects.map(projectItem)}</CommandGroup></> : <>
			{!messageSearch.hits.length && !messageSearch.searching && <CommandEmpty>Nothing matches.</CommandEmpty>}
			<CommandGroup heading="Actions">
				<CommandItem onSelect={() => run(() => select(undefined))}><Plus />New chat<CommandShortcut>{shortcut("chat.new")}</CommandShortcut></CommandItem>
				{activeProjects.length > 0 && <CommandItem value="New chat in project folder start" onSelect={() => { setSearch(""); setPage("new-chat-in"); }}><SquarePen />New chat in…</CommandItem>}
				<CommandItem onSelect={() => run(() => setMode("chat"))}><MessageSquare />Switch to Chat<CommandShortcut>{shortcut("mode.chat")}</CommandShortcut></CommandItem>
				<CommandItem onSelect={() => run(() => setMode("code"))}><Code2 />Switch to Code<CommandShortcut>{shortcut("mode.code")}</CommandShortcut></CommandItem>
				<CommandItem onSelect={() => run(() => { if (api) void api.chooseProject().then(state => { setOverview(state); const added = state.projects.find(value => !overview.projects.some(existing => existing.id === value.id)); if (added) { setMode("code"); setNewChatProjectId(added.id); select(undefined); } }, reason => setError(errorText(reason))); })}><FolderPlus />Open project folder…</CommandItem>
				<CommandItem value="Clone a repository git url github add project" onSelect={() => run(() => openCloneProject())}><GitBranchPlus />Clone a repository…</CommandItem>
				<CommandItem value="Import past conversations claude code codex history sessions transcripts continue" onSelect={() => run(() => openImportSessions())}><History />Import past conversations…</CommandItem>
				{api && <CommandItem value="Triage a Phaseo bug triage debug problem broken crash report issue fix this app" onSelect={() => run(() => { setMode("code"); select(undefined); startTriage(api); })}>
					<Bug /><span className="flex min-w-0 flex-col"><span>Triage a Phaseo bug</span><span className="truncate text-xs text-muted-foreground">An agent debugs this app from its own source and helps you file an issue</span></span>
				</CommandItem>}
				<CommandItem value="Inbox needs you waiting attention autopilot log decisions" onSelect={() => run(openInbox)}><Inbox />Inbox</CommandItem>
				<CommandItem value="Usage cost tokens spend today pace forecast pull requests settled" onSelect={() => run(() => openUsage())}><ChartLine />Usage</CommandItem>
				<CommandItem value="Usage limits subscriptions rings Claude Codex" onSelect={() => run(() => openUsage("limits"))}><Gauge />Usage limits</CommandItem>
				<CommandItem onSelect={() => run(openScheduled)}><CalendarClock />Scheduled tasks</CommandItem>
			<CommandItem value="Archived chats restore unarchive deleted" onSelect={() => run(() => openArchivedChats())}><Archive />Archived chats</CommandItem>
				<CommandItem value="Open pull requests prs pr github review merge branch" onSelect={() => run(openPullRequests)}><GitPullRequestArrow />Open pull requests</CommandItem>
				{current?.projectId && <CommandItem value="Show linked pull requests prs linked stack" disabled={!linked.length} onSelect={() => run(() => setRightPanel("pulls"))}><Link2 />Show linked pull requests</CommandItem>}
				<CommandItem onSelect={() => run(() => setSidebarOpen(open => !open))}><PanelLeft />Toggle sidebar<CommandShortcut>{shortcut("sidebar.toggle")}</CommandShortcut></CommandItem>
				<CommandItem onSelect={() => run(() => setRightPanel("changes"))}><Files />Show files and changes</CommandItem>
			{current?.projectId && <CommandItem value="Go to file open quick" onSelect={() => run(() => runCommand("filePicker.toggle"))}><FileSearch />Go to file…<CommandShortcut>{shortcut("filePicker.toggle")}</CommandShortcut></CommandItem>}
			{current?.projectId && <CommandItem value="Search in files contents grep project text" onSelect={() => run(() => runCommand("projectSearch.toggle"))}><TextSearch />Search in files…<CommandShortcut>{shortcut("projectSearch.toggle")}</CommandShortcut></CommandItem>}
			{current && <CommandItem value="Find in chat search this conversation" onSelect={() => run(() => runCommand("chat.find"))}><Search />Find in chat<CommandShortcut>{shortcut("chat.find")}</CommandShortcut></CommandItem>}
				<CommandItem onSelect={() => run(() => setRightPanel("terminal"))}><SquareTerminal />Open terminal<CommandShortcut>{shortcut("terminal.toggle")}</CommandShortcut></CommandItem>
				<CommandItem onSelect={() => run(() => setRightPanel("browser"))}><Globe />Open browser</CommandItem>
				{themes.filter(option => option.value !== theme).map(option => <CommandItem key={option.value} value={`${option.label} appearance colour mode`} onSelect={() => run(() => setTheme(option.value))}><option.icon />{option.label}</CommandItem>)}
				<CommandItem onSelect={() => run(() => openSettings())}><Settings />Settings<CommandShortcut>{shortcut("settings.open")}</CommandShortcut></CommandItem>
				<CommandItem onSelect={() => run(() => openSettings("accounts"))}><UserRound />Accounts and sign-in</CommandItem>
				<CommandItem onSelect={() => run(() => openSettings("keyboard"))}><Keyboard />Keyboard shortcuts</CommandItem>
				<CommandItem value="Diagnostics processes cpu memory traces logs slow failures" onSelect={() => run(() => openSettings("diagnostics"))}><Activity />Diagnostics</CommandItem>
			</CommandGroup>
			{current && <CommandGroup heading="This chat">
				{currentProject && <CommandItem value={`New chat in ${currentProject.name} this project`} onSelect={() => startIn(currentProject.id)}><SquarePen />{currentProject.worktree ? `New chat on ${currentProject.worktree.branch}` : `New chat in ${currentProject.name}`}</CommandItem>}
				<CommandItem value="Rename chat title" onSelect={() => run(() => window.dispatchEvent(new Event(renameChatEvent)))}><Pencil />Rename chat</CommandItem>
				<CommandItem value={current.pinned ? "Unpin chat" : "Pin chat"} onSelect={() => run(() => void threadActions.pin(current))}>{current.pinned ? <PinOff /> : <Pin />}{current.pinned ? "Unpin chat" : "Pin chat"}</CommandItem>
				{current.projectId && (isSettled(current)
					? <CommandItem value="Un-settle chat unsettle" onSelect={() => run(() => runCommand("thread.settle"))}><Undo2 />Un-settle chat<CommandShortcut>{shortcut("thread.settle")}</CommandShortcut></CommandItem>
					: <CommandItem value="Settle chat done" disabled={Boolean(settleBlocker(current))} onSelect={() => run(() => runCommand("thread.settle"))}><CircleCheck />Settle chat<CommandShortcut>{shortcut("thread.settle")}</CommandShortcut></CommandItem>)}
				<CommandItem value="Mark chat unread" disabled={!current.lastCompletedAt} onSelect={() => run(() => void threadActions.markUnread(current))}><Mail />Mark unread</CommandItem>
				{currentProject && <CommandItem value={`Project settings ${currentProject.name}`} onSelect={() => run(() => openProjectSettings(currentProject.id))}><Settings />Project settings</CommandItem>}
				{shelfProject && !shelfProject.archived && <CommandItem value={`${shelfProject.pinned ? "Unpin" : "Pin"} project ${shelfProject.name}`} onSelect={() => organizeProject(shelfProject.id, { pinned: !shelfProject.pinned })}>{shelfProject.pinned ? <PinOff /> : <Pin />}{shelfProject.pinned ? "Unpin project" : "Pin project"}</CommandItem>}
				{shelfProject && !shelfProject.archived && <CommandItem value={`Archive project ${shelfProject.name} hide`} onSelect={() => organizeProject(shelfProject.id, { archived: true })}><Archive />Archive project</CommandItem>}
				<CommandItem value="Copy chat ID identifier reference" onSelect={() => run(() => copyId(current.id))}><Copy />Copy chat ID</CommandItem>
				<CommandItem value="Archive chat" disabled={["running", "waiting"].includes(current.status)} onSelect={() => run(() => void threadActions.archive(current))}><Archive />Archive chat</CommandItem>
			</CommandGroup>}
			{current?.projectId && <OpenProjectItems projectId={current.projectId} open={commandsOpen} run={run} />}
			{/* Projects come up as you search, so the open palette is not a list of every folder; an archived one offers only Unarchive. */}
			{searching && projects.length > 0 && <CommandGroup heading="Projects">
				{activeProjects.map(projectItem)}
				{activeProjects.map(project => <CommandItem key={`settings:${project.id}`} value={`${project.name} project settings scripts icon`} onSelect={() => run(() => openProjectSettings(project.id))}><Settings /><span className="min-w-0 truncate">{project.name} settings</span></CommandItem>)}
				{projects.filter(project => project.archived).map(project => <CommandItem key={`unarchive:${project.id}`} value={`Unarchive project ${project.name} restore archived`} onSelect={() => organizeProject(project.id, { archived: false })}><ArchiveRestore /><ProjectIcon project={project} /><span className="min-w-0 truncate">Unarchive project {project.name}</span></CommandItem>)}
			</CommandGroup>}
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
			</>}
		</CommandList></ScrollArea>
	</CommandDialog></>;
}
