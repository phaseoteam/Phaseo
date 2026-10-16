import { useEffect, useState, type ReactNode } from "react";
import { ArrowLeft, Bell, Bot, Keyboard, Gauge, Palette, Plug, Search, SlidersHorizontal, UserRound } from "lucide-react";
import { ProjectIcon } from "../components/ProjectIcon";
import { KeyboardShortcuts } from "./KeyboardShortcuts";
import { ScrollArea } from "../components/ui/scroll-area";
import { useWorkspace, type SettingsPage as Page } from "../app/workspace";
import { cn } from "../lib/utils";
import { GeneralSettings, NotificationSettings } from "./GeneralSettings";
import { UsageSettings } from "./UsageSettings";
import { AppearanceSettings } from "./AppearanceSettings";
import { Accounts } from "../views/Accounts";
import { Agents } from "../views/Agents";
import { McpConnections } from "../views/McpConnections";
import { SettingsPageLayout } from "./SettingsLayout";
import { ProjectSettingsPage } from "./ProjectSettings";
import { settingsProject } from "../../shared/projectSettings";

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
		{ id: "usage", label: "Usage & limits", icon: <Gauge />, keywords: "rate limits plan weekly 5-hour reset quota billing credits" },
	] },
	{ label: "Integrations", pages: [
		{ id: "agents", label: "Agents", icon: <Bot />, keywords: "codex claude code opencode pi cursor grok acp install update version" },
		{ id: "mcp", label: "MCP servers", icon: <Plug />, keywords: "tools model context protocol connections" },
	] },
];

/** Replaces the chat list while settings are open: a search box and the pages, grouped. */
export function SettingsNav() {
	const { settings, openSettings, closeSettings, overview, settingsProjectId, openProjectSettings } = useWorkspace();
	const [query, setQuery] = useState("");
	const needle = query.trim().toLowerCase();
	const shown = groups.map(group => ({ ...group, pages: group.pages.filter(page => !needle || `${page.label} ${page.keywords}`.toLowerCase().includes(needle)) })).filter(group => group.pages.length);
	// T3 lists each project's settings with the other pages; worktrees share their project's.
	const current = settings === "project" ? settingsProject(overview.projects, settingsProjectId)?.id : undefined;
	const projects = overview.projects.filter(project => !project.worktree && (!needle || `${project.name} project settings actions scripts auto-settle`.toLowerCase().includes(needle)));
	return <nav aria-label="Settings sections" className="flex flex-col gap-0.5 p-2.5">
		<button type="button" onClick={closeSettings} className="mb-1 flex h-8 items-center gap-2 rounded-md px-2 text-[13px] font-medium text-muted-foreground hover:bg-sidebar-accent/70 hover:text-foreground [&_svg]:size-4"><ArrowLeft />Back to app</button>
		<p className="px-2 pt-1 pb-2 text-[15px] font-bold">Settings</p>
		<label className="mb-2 flex h-8 items-center gap-2 rounded-lg bg-sidebar-accent/60 px-2.5 text-muted-foreground focus-within:ring-2 focus-within:ring-ring/30">
			<Search className="size-3.5 shrink-0" />
			<input aria-label="Search settings" placeholder="Search" value={query} onChange={event => setQuery(event.target.value)}
				onKeyDown={event => { if (event.key === "Enter" && shown[0]) openSettings(shown[0].pages[0].id); else if (event.key === "Enter" && projects[0]) openProjectSettings(projects[0].id); if (event.key === "Escape" && query) { event.stopPropagation(); setQuery(""); } }}
				className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground" />
		</label>
		{shown.map(group => <div key={group.label} className="flex flex-col gap-0.5 pb-2">
			<p className="px-2.5 pt-1.5 pb-1 text-xs font-semibold text-muted-foreground">{group.label}</p>
			{group.pages.map(page => <button key={page.id} type="button" aria-current={settings === page.id ? "page" : undefined} onClick={() => openSettings(page.id)}
				className={cn("flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium text-sidebar-foreground/80 hover:bg-sidebar-accent/70 [&_svg]:size-4 [&_svg]:text-muted-foreground", settings === page.id && "bg-sidebar-accent text-sidebar-foreground")}>{page.icon}{page.label}</button>)}
		</div>)}
		{projects.length > 0 && <div className="flex flex-col gap-0.5 pb-2">
			<p className="px-2.5 pt-1.5 pb-1 text-xs font-semibold text-muted-foreground">Projects</p>
			{projects.map(project => <button key={project.id} type="button" aria-current={current === project.id ? "page" : undefined} onClick={() => openProjectSettings(project.id)}
				className={cn("flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium text-sidebar-foreground/80 hover:bg-sidebar-accent/70 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground", current === project.id && "bg-sidebar-accent text-sidebar-foreground")}><ProjectIcon project={project} /><span className="truncate">{project.name}</span></button>)}
		</div>}
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
		{/* MCP servers keep their own form inside the shared page layout. */}
		{settings === "mcp" && <div className="legacy-panel"><SettingsPageLayout title="MCP servers" description="Tools your chats can use, from Model Context Protocol servers."><McpConnections /></SettingsPageLayout></div>}
	</ScrollArea>;
}
