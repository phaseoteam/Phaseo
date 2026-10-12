import { Code2, FolderOpen, FolderPlus, Globe, MessageSquare, Moon, PanelLeft, Plus, Settings, SquareTerminal, Sun, UserRound, Files } from "lucide-react";
import { errorText, useWorkspace } from "../app/workspace";
import { shortcutLabel } from "../lib/shortcuts";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut } from "../components/ui/command";
import { StatusDot } from "./Sidebar";

export function CommandPalette() {
	const { commandsOpen, setCommandsOpen, overview, select, setMode, openSettings, setRightPanel, setSidebarOpen, resolvedTheme, setTheme, api, setOverview, setError, setNewChatProjectId } = useWorkspace();
	const run = (action: () => void) => { setCommandsOpen(false); action(); };
	const tasks = overview.tasks.filter(task => !task.parentId).slice(0, 200);
	const projectName = (id?: string) => overview.projects.find(project => project.id === id)?.name;
	return <CommandDialog open={commandsOpen} onOpenChange={setCommandsOpen} title="Search" description="Search chats and run commands" className="max-w-xl rounded-2xl! sm:max-w-xl">
		<CommandInput placeholder="Search chats and commands…" wrapperClassName="p-2" />
		<CommandList className="max-h-[420px] p-1">
			<CommandEmpty>Nothing matches.</CommandEmpty>
			<CommandGroup heading="Actions">
				<CommandItem onSelect={() => run(() => select(undefined))}><Plus />New chat<CommandShortcut>{shortcutLabel("N")}</CommandShortcut></CommandItem>
				<CommandItem onSelect={() => run(() => setMode("chat"))}><MessageSquare />Switch to Chat<CommandShortcut>{shortcutLabel("1")}</CommandShortcut></CommandItem>
				<CommandItem onSelect={() => run(() => setMode("code"))}><Code2 />Switch to Code<CommandShortcut>{shortcutLabel("2")}</CommandShortcut></CommandItem>
				<CommandItem onSelect={() => run(() => { if (api) void api.chooseProject().then(state => { setOverview(state); const added = state.projects.find(value => !overview.projects.some(existing => existing.id === value.id)); if (added) { setMode("code"); setNewChatProjectId(added.id); select(undefined); } }, reason => setError(errorText(reason))); })}><FolderPlus />Open project folder…</CommandItem>
				<CommandItem onSelect={() => run(() => setSidebarOpen(open => !open))}><PanelLeft />Toggle sidebar<CommandShortcut>{shortcutLabel("B")}</CommandShortcut></CommandItem>
				<CommandItem onSelect={() => run(() => setRightPanel("changes"))}><Files />Show files and changes</CommandItem>
				<CommandItem onSelect={() => run(() => setRightPanel("terminal"))}><SquareTerminal />Open terminal<CommandShortcut>{shortcutLabel("J")}</CommandShortcut></CommandItem>
				<CommandItem onSelect={() => run(() => setRightPanel("browser"))}><Globe />Open browser</CommandItem>
				<CommandItem onSelect={() => run(() => setTheme(resolvedTheme === "dark" ? "light" : "dark"))}>{resolvedTheme === "dark" ? <Sun /> : <Moon />}Use {resolvedTheme === "dark" ? "light" : "dark"} theme</CommandItem>
				<CommandItem onSelect={() => run(() => openSettings())}><Settings />Settings<CommandShortcut>{shortcutLabel(",")}</CommandShortcut></CommandItem>
				<CommandItem onSelect={() => run(() => openSettings("accounts"))}><UserRound />Accounts and sign-in</CommandItem>
			</CommandGroup>
			{tasks.length > 0 && <CommandGroup heading="Chats">
				{tasks.map(task => <CommandItem key={task.id} value={`${task.title} ${projectName(task.projectId) ?? ""} ${task.id}`} onSelect={() => run(() => select(task.id))}>
					{task.projectId ? <FolderOpen /> : <MessageSquare />}
					<span className="min-w-0 flex-1 truncate">{task.title}</span>
					{task.projectId && <span className="text-xs text-muted-foreground">{projectName(task.projectId)}</span>}
					<StatusDot task={task} />
				</CommandItem>)}
			</CommandGroup>}
		</CommandList>
	</CommandDialog>;
}
