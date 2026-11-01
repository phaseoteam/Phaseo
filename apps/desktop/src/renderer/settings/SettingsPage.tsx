import { useEffect, useState, type ReactNode } from "react";
import { Activity, ArrowLeft, Bell, Bot, Cable, CircleDot, FlaskConical, FolderGit2, GitMerge, GitPullRequest, Keyboard, Gauge, NotebookPen, Palette, Plug, RefreshCw, Search, SlidersHorizontal, Smartphone, UserRound } from "lucide-react";
import { ProjectIcon } from "../components/ProjectIcon";
import { KeyboardShortcuts } from "./KeyboardShortcuts";
import { ScrollArea } from "../components/ui/scroll-area";
import { useWorkspace, type SettingsPage as Page } from "../app/workspace";
import { cn } from "../lib/utils";
import { ExperimentalSettings, GeneralSettings, NotificationSettings } from "./GeneralSettings";
import { CodeHostSettings } from "./CodeHostSettings";
import { OutsideAgentSettings } from "./OutsideAgentSettings";
import { PhoneSettings } from "./PhoneSettings";
import { UsageSettings } from "./UsageSettings";
import { DiagnosticsSettings } from "./DiagnosticsSettings";
import { AppearanceSettings } from "./AppearanceSettings";
import { Accounts } from "../views/Accounts";
import { Agents } from "../views/Agents";
import { McpConnections } from "../views/McpConnections";
import { ProjectSettingsPage } from "./ProjectSettings";
import { settingsProject } from "../../shared/projectSettings";
import { FactorySettingsPage } from "../factory/settings/FactorySettingsPage";

type Entry = { id: Page; label: string; icon: ReactNode; keywords: string };
const groups: { label: string; pages: Entry[] }[] = [
	{ label: "Personal", pages: [
		{ id: "general", label: "General", icon: <SlidersHorizontal />, keywords: "default model new chats agents running at once instructions agents.md" },
		{ id: "appearance", label: "Appearance", icon: <Palette />, keywords: "theme dark light system colours colors accent font share import export" },
		{ id: "notifications", label: "Notifications", icon: <Bell />, keywords: "alerts desktop titles" },
		{ id: "keyboard", label: "Keyboard shortcuts", icon: <Keyboard />, keywords: "keybindings keys hotkeys shortcuts bind remap keybindings.json" },
	] },
	{ label: "Accounts", pages: [
		{ id: "accounts", label: "Accounts", icon: <UserRound />, keywords: "sign in login api key subscription codex claude cursor grok phaseo" },
		{ id: "usage", label: "Usage sources", icon: <Gauge />, keywords: "usage limits hubs rate limits plan weekly 5-hour reset quota billing credits CLIProxyAPI" },
	] },
	{ label: "Integrations", pages: [
		{ id: "agents", label: "Agents", icon: <Bot />, keywords: "codex claude code opencode pi cursor grok acp install update version" },
		{ id: "mcp", label: "MCP servers", icon: <Plug />, keywords: "tools model context protocol connections" },
		{ id: "phone", label: "Phone", icon: <Smartphone />, keywords: "mobile phone app pair qr code tailscale wi-fi lan remote access phaseo connect relay devices" },
		{ id: "outside-agents", label: "Outside agents", icon: <Cable />, keywords: "mcp server claude code codex terminal token local loopback external agents drive chats" },
		{ id: "code-hosts", label: "Code hosts", icon: <GitMerge />, keywords: "gitlab forgejo gitea codeberg bitbucket azure devops glab tea az token merge requests pull requests self-hosted server" },
	] },
	// Code ▸ Factory's settings. Its agents are the desktop's own accounts and models.
	{ label: "Factory", pages: [
		{ id: "factory-repositories", label: "Repositories", icon: <FolderGit2 />, keywords: "factory repos clone checkout folder add remove import order github" },
		{ id: "factory-issues", label: "Issue playbook", icon: <CircleDot />, keywords: "factory issues proof pull request reporter ask agents rules models stages prompts instructions triage reproduce fix" },
		{ id: "factory-pulls", label: "Pull request playbook", icon: <GitPullRequest />, keywords: "factory pull requests review independent findings agents rules models stages prompts instructions verify" },
		{ id: "factory-notes", label: "Notes", icon: <NotebookPen />, keywords: "factory notes memory remember learnt agents repository tests setup" },
		{ id: "factory-checking", label: "Checking for new work", icon: <RefreshCw />, keywords: "factory github gh cli images poll schedule check new work api requests" },
	] },
	// Listed after the projects, at the bottom.
	{ label: "Advanced", pages: [
		{ id: "diagnostics", label: "Diagnostics", icon: <Activity />, keywords: "processes cpu memory performance slow traces spans logs failures errors debug kill stop" },
		{ id: "experimental", label: "Experimental", icon: <FlaskConical />, keywords: "autopilot beta labs experimental preview yolo" },
	] },
];
const bottomGroups = new Set(["Advanced"]);

/** Replaces the chat list while settings are open: a search box and the pages, grouped. */
export function SettingsNav() {
	const { settings, openSettings, closeSettings, overview, settingsProjectId, openProjectSettings } = useWorkspace();
	const [query, setQuery] = useState("");
	const needle = query.trim().toLowerCase();
	const shown = groups.map(group => ({ ...group, pages: group.pages.filter(page => !needle || `${page.label} ${page.keywords}`.toLowerCase().includes(needle)) })).filter(group => group.pages.length);
	// Each project's settings are listed with the other pages; worktrees share their project's.
	const current = settings === "project" ? settingsProject(overview.projects, settingsProjectId)?.id : undefined;
	const projects = overview.projects.filter(project => !project.worktree && (!needle || `${project.name} project settings actions scripts auto-settle`.toLowerCase().includes(needle)));
	const renderGroup = (group: (typeof groups)[number]) => <div key={group.label} className="flex flex-col gap-0.5 pb-2">
		<p className="px-2.5 pt-1.5 pb-1 text-xs font-semibold text-muted-foreground">{group.label}</p>
		{group.pages.map(page => <button key={page.id} type="button" aria-current={settings === page.id ? "page" : undefined} onClick={() => openSettings(page.id)}
			className={cn("flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium text-sidebar-foreground/80 hover:bg-sidebar-accent/70 [&_svg]:size-4 [&_svg]:text-muted-foreground", settings === page.id && "bg-sidebar-accent text-sidebar-foreground")}>{page.icon}{page.label}</button>)}
	</div>;
	return <nav aria-label="Settings sections" className="flex flex-col gap-0.5 p-2.5">
		<button type="button" onClick={closeSettings} className="mb-1 flex h-8 items-center gap-2 rounded-md px-2 text-[13px] font-medium text-muted-foreground hover:bg-sidebar-accent/70 hover:text-foreground [&_svg]:size-4"><ArrowLeft />Back to app</button>
		<p className="px-2 pt-1 pb-2 text-[15px] font-bold">Settings</p>
		<label className="mb-2 flex h-8 items-center gap-2 rounded-lg bg-sidebar-accent/60 px-2.5 text-muted-foreground focus-within:ring-2 focus-within:ring-ring/30">
			<Search className="size-3.5 shrink-0" />
			<input aria-label="Search settings" placeholder="Search" value={query} onChange={event => setQuery(event.target.value)}
				onKeyDown={event => { if (event.key === "Enter" && shown[0]) openSettings(shown[0].pages[0].id); else if (event.key === "Enter" && projects[0]) openProjectSettings(projects[0].id); if (event.key === "Escape" && query) { event.stopPropagation(); setQuery(""); } }}
				className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground" />
		</label>
		{shown.filter(group => !bottomGroups.has(group.label)).map(renderGroup)}
		{projects.length > 0 && <div className="flex flex-col gap-0.5 pb-2">
			<p className="px-2.5 pt-1.5 pb-1 text-xs font-semibold text-muted-foreground">Projects</p>
			{projects.map(project => <button key={project.id} type="button" aria-current={current === project.id ? "page" : undefined} onClick={() => openProjectSettings(project.id)}
				className={cn("flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium text-sidebar-foreground/80 hover:bg-sidebar-accent/70 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground", current === project.id && "bg-sidebar-accent text-sidebar-foreground")}><ProjectIcon project={project} /><span className="truncate">{project.name}</span></button>)}
		</div>}
		{shown.filter(group => bottomGroups.has(group.label)).map(renderGroup)}
		{!shown.length && !projects.length && <p className="px-2.5 py-2 text-xs text-muted-foreground">No settings match.</p>}
	</nav>;
}

export function SettingsPage() {
	const { settings, closeSettings } = useWorkspace();
	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key !== "Escape" || event.defaultPrevented) return;
			if (document.querySelector("[data-slot=dialog-content], [data-slot=popover-content], [data-slot=dropdown-menu-content]")) return;
			closeSettings();
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [closeSettings]);
	return <ScrollArea className="chat-settings-content h-full">
		{settings === "general" && <GeneralSettings />}
		{settings === "notifications" && <NotificationSettings />}
		{settings === "keyboard" && <KeyboardShortcuts />}
		{settings === "usage" && <UsageSettings />}
		{settings === "accounts" && <Accounts />}
		{settings === "appearance" && <AppearanceSettings />}
		{settings === "agents" && <Agents />}
		{settings === "project" && <ProjectSettingsPage />}
		{settings === "mcp" && <McpConnections />}
		{settings === "code-hosts" && <CodeHostSettings />}
		{settings === "outside-agents" && <OutsideAgentSettings />}
		{settings === "phone" && <PhoneSettings />}
		{settings === "diagnostics" && <DiagnosticsSettings />}
		{settings === "experimental" && <ExperimentalSettings />}
		{settings?.startsWith("factory-") && <FactorySettingsPage key={settings} page={settings as Parameters<typeof FactorySettingsPage>[0]["page"]} />}
	</ScrollArea>;
}
