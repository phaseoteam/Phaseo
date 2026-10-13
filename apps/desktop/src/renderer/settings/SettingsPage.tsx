import { useEffect, type ReactNode } from "react";
import { ArrowLeft, Bot, CalendarClock, Monitor, Moon, Palette, Plug, SlidersHorizontal, Sun, UserRound } from "lucide-react";
import { useWorkspace, type SettingsPage as Page } from "../app/workspace";
import { cn } from "../lib/utils";
import { WorkspaceSettings } from "../views/WorkspaceSettings";
import { Accounts } from "../views/Accounts";
import { Agents } from "../views/Agents";
import { McpConnections } from "../views/McpConnections";
import { Missions } from "../views/Missions";
import type { ThemePreference } from "../types";

const pages: { id: Page; label: string; icon: ReactNode }[] = [
	{ id: "general", label: "General", icon: <SlidersHorizontal /> },
	{ id: "accounts", label: "Accounts", icon: <UserRound /> },
	{ id: "appearance", label: "Appearance", icon: <Palette /> },
	{ id: "agents", label: "Agents", icon: <Bot /> },
	{ id: "mcp", label: "MCP servers", icon: <Plug /> },
	{ id: "missions", label: "Missions", icon: <CalendarClock /> },
];

/** Replaces the chat list while settings are open. */
export function SettingsNav() {
	const { settings, openSettings, closeSettings } = useWorkspace();
	return <nav aria-label="Settings sections" className="flex flex-col gap-0.5 p-2.5">
		<button type="button" onClick={closeSettings} className="mb-2 flex h-8 items-center gap-2 rounded-md px-2 text-[13px] font-medium text-muted-foreground hover:bg-sidebar-accent/70 hover:text-foreground [&_svg]:size-4"><ArrowLeft />Back to app</button>
		<p className="px-2.5 pb-1 text-[13px] font-bold">Settings</p>
		{pages.map(page => <button key={page.id} type="button" aria-current={settings === page.id ? "page" : undefined} onClick={() => openSettings(page.id)}
			className={cn("flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium text-sidebar-foreground/80 hover:bg-sidebar-accent/70 [&_svg]:size-4 [&_svg]:text-muted-foreground", settings === page.id && "bg-sidebar-accent text-sidebar-foreground")}>{page.icon}{page.label}</button>)}
	</nav>;
}

function Appearance() {
	const { theme, setTheme } = useWorkspace();
	const options: { value: ThemePreference; label: string; icon: ReactNode }[] = [
		{ value: "system", label: "System", icon: <Monitor /> },
		{ value: "light", label: "Light", icon: <Sun /> },
		{ value: "dark", label: "Dark", icon: <Moon /> },
	];
	return <div className="page">
		<div className="page-heading"><h1>Appearance</h1></div>
		<p className="text-[13px] text-muted-foreground">Phaseo follows your system theme unless you choose one here.</p>
		<div role="radiogroup" aria-label="Theme" className="mt-5 grid max-w-md grid-cols-3 gap-3">
			{options.map(option => <button key={option.value} type="button" role="radio" aria-checked={theme === option.value} onClick={() => setTheme(option.value)}
				className={cn("flex flex-col items-center gap-2 rounded-lg border border-border p-4 text-[13px] font-semibold transition-colors hover:bg-muted [&_svg]:size-5", theme === option.value && "border-primary bg-primary/5")}>
				{option.icon}{option.label}
			</button>)}
		</div>
	</div>;
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
	return <div className="chat-settings-content legacy-panel scrollbar-thin h-full overflow-y-auto">
		{settings === "general" && <WorkspaceSettings />}
		{settings === "accounts" && <Accounts />}
		{settings === "appearance" && <Appearance />}
		{settings === "agents" && <Agents />}
		{settings === "mcp" && <McpConnections />}
		{settings === "missions" && <Missions onOpenTask={id => { select(id); }} onNewTask={() => select(undefined)} />}
	</div>;
}
