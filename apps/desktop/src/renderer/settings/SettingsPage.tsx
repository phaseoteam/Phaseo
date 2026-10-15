import { useEffect, useState, type ReactNode } from "react";
import { ArrowLeft, Bell, Bot, CalendarClock, Gauge, Palette, Plug, Search, SlidersHorizontal, UserRound } from "lucide-react";
import { useWorkspace, type SettingsPage as Page } from "../app/workspace";
import { cn } from "../lib/utils";
import { GeneralSettings, NotificationSettings } from "./GeneralSettings";
import { UsageSettings } from "./UsageSettings";
import { AppearanceSettings } from "./AppearanceSettings";
import { Accounts } from "../views/Accounts";
import { Agents } from "../views/Agents";
import { McpConnections } from "../views/McpConnections";
import { Missions } from "../views/Missions";
import { SettingsPageLayout } from "./SettingsLayout";

type Entry = { id: Page; label: string; icon: ReactNode; keywords: string };
const groups: { label: string; pages: Entry[] }[] = [
	{ label: "Personal", pages: [
		{ id: "general", label: "General", icon: <SlidersHorizontal />, keywords: "default model new chats agents running at once instructions agents.md" },
		{ id: "appearance", label: "Appearance", icon: <Palette />, keywords: "theme dark light system colours colors accent font share import export" },
		{ id: "notifications", label: "Notifications", icon: <Bell />, keywords: "alerts desktop titles" },
	] },
	{ label: "Accounts", pages: [
		{ id: "accounts", label: "Accounts", icon: <UserRound />, keywords: "sign in login api key subscription codex claude cursor grok phaseo" },
		{ id: "usage", label: "Usage & limits", icon: <Gauge />, keywords: "rate limits plan weekly 5-hour reset quota billing credits" },
	] },
	{ label: "Integrations", pages: [
		{ id: "agents", label: "Agents", icon: <Bot />, keywords: "codex claude code opencode pi cursor grok acp install update version" },
		{ id: "mcp", label: "MCP servers", icon: <Plug />, keywords: "tools model context protocol connections" },
	] },
	{ label: "Automation", pages: [
		{ id: "missions", label: "Missions", icon: <CalendarClock />, keywords: "schedule recurring scheduled tasks" },
	] },
];

/** Replaces the chat list while settings are open: a search box and the pages, grouped. */
export function SettingsNav() {
	const { settings, openSettings, closeSettings } = useWorkspace();
	const [query, setQuery] = useState("");
	const needle = query.trim().toLowerCase();
	const shown = groups.map(group => ({ ...group, pages: group.pages.filter(page => !needle || `${page.label} ${page.keywords}`.toLowerCase().includes(needle)) })).filter(group => group.pages.length);
	return <nav aria-label="Settings sections" className="flex flex-col gap-0.5 p-2.5">
		<button type="button" onClick={closeSettings} className="mb-1 flex h-8 items-center gap-2 rounded-md px-2 text-[13px] font-medium text-muted-foreground hover:bg-sidebar-accent/70 hover:text-foreground [&_svg]:size-4"><ArrowLeft />Back to app</button>
		<p className="px-2 pt-1 pb-2 text-[15px] font-bold">Settings</p>
		<label className="mb-2 flex h-8 items-center gap-2 rounded-lg bg-sidebar-accent/60 px-2.5 text-muted-foreground focus-within:ring-2 focus-within:ring-ring/30">
			<Search className="size-3.5 shrink-0" />
			<input aria-label="Search settings" placeholder="Search" value={query} onChange={event => setQuery(event.target.value)}
				onKeyDown={event => { if (event.key === "Enter" && shown[0]) openSettings(shown[0].pages[0].id); if (event.key === "Escape" && query) { event.stopPropagation(); setQuery(""); } }}
				className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground" />
		</label>
		{shown.map(group => <div key={group.label} className="flex flex-col gap-0.5 pb-2">
			<p className="px-2.5 pt-1.5 pb-1 text-xs font-semibold text-muted-foreground">{group.label}</p>
			{group.pages.map(page => <button key={page.id} type="button" aria-current={settings === page.id ? "page" : undefined} onClick={() => openSettings(page.id)}
				className={cn("flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium text-sidebar-foreground/80 hover:bg-sidebar-accent/70 [&_svg]:size-4 [&_svg]:text-muted-foreground", settings === page.id && "bg-sidebar-accent text-sidebar-foreground")}>{page.icon}{page.label}</button>)}
		</div>)}
		{!shown.length && <p className="px-2.5 py-2 text-xs text-muted-foreground">No settings match.</p>}
	</nav>;
}

export function SettingsPage() {
	const { settings, closeSettings, select } = useWorkspace();
	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key !== "Escape" || event.defaultPrevented) return;
			if (document.querySelector("[data-slot=dialog-content], [data-slot=popover-content], [data-slot=dropdown-menu-content]")) return;
			closeSettings();
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [closeSettings]);
	return <div className="chat-settings-content scrollbar-thin h-full overflow-y-auto">
		{settings === "general" && <GeneralSettings />}
		{settings === "notifications" && <NotificationSettings />}
		{settings === "usage" && <UsageSettings />}
		{settings === "accounts" && <Accounts />}
		{settings === "appearance" && <AppearanceSettings />}
		{settings === "agents" && <Agents />}
		{/* MCP servers and Missions keep their own forms inside the shared page layout. */}
		{settings === "mcp" && <div className="legacy-panel"><SettingsPageLayout title="MCP servers" description="Tools your chats can use, from Model Context Protocol servers."><McpConnections /></SettingsPageLayout></div>}
		{settings === "missions" && <div className="legacy-panel"><SettingsPageLayout title="Missions" description="Chats that run on a schedule." wide><Missions onOpenTask={id => { select(id); }} onNewTask={() => select(undefined)} /></SettingsPageLayout></div>}
	</div>;
}
