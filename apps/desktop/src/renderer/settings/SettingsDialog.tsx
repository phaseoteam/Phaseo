import type { ReactNode } from "react";
import { Bot, CalendarClock, Monitor, Moon, Palette, Plug, SlidersHorizontal, Sun, UserRound } from "lucide-react";
import { useWorkspace, type SettingsPage } from "../app/workspace";
import { cn } from "../lib/utils";
import { Dialog, DialogContent, DialogTitle } from "../components/ui/dialog";
import { WorkspaceSettings } from "../views/WorkspaceSettings";
import { Accounts } from "../views/Accounts";
import { Agents } from "../views/Agents";
import { McpConnections } from "../views/McpConnections";
import { Missions } from "../views/Missions";
import type { ThemePreference } from "../types";

const pages: { id: SettingsPage; label: string; icon: ReactNode }[] = [
	{ id: "general", label: "General", icon: <SlidersHorizontal /> },
	{ id: "accounts", label: "Accounts", icon: <UserRound /> },
	{ id: "appearance", label: "Appearance", icon: <Palette /> },
	{ id: "agents", label: "Agents", icon: <Bot /> },
	{ id: "mcp", label: "MCP servers", icon: <Plug /> },
	{ id: "missions", label: "Missions", icon: <CalendarClock /> },
];

function Appearance() {
	const { theme, setTheme } = useWorkspace();
	const options: { value: ThemePreference; label: string; icon: ReactNode }[] = [
		{ value: "system", label: "System", icon: <Monitor /> },
		{ value: "light", label: "Light", icon: <Sun /> },
		{ value: "dark", label: "Dark", icon: <Moon /> },
	];
	return <div className="p-6">
		<h2 className="text-base font-bold">Appearance</h2>
		<p className="mt-1 text-[13px] text-muted-foreground">Phaseo follows your system theme unless you choose one here.</p>
		<div role="radiogroup" aria-label="Theme" className="mt-5 grid max-w-md grid-cols-3 gap-3">
			{options.map(option => <button key={option.value} type="button" role="radio" aria-checked={theme === option.value} onClick={() => setTheme(option.value)}
				className={cn("flex flex-col items-center gap-2 rounded-xl border border-border p-4 text-[13px] font-semibold transition-colors hover:bg-muted [&_svg]:size-5", theme === option.value && "border-primary bg-primary/5 ring-2 ring-primary/20")}>
				{option.icon}{option.label}
			</button>)}
		</div>
	</div>;
}

export function SettingsDialog() {
	const { settings, openSettings, closeSettings, select } = useWorkspace();
	return <Dialog open={!!settings} onOpenChange={open => { if (!open) closeSettings(); }}>
		<DialogContent className="flex h-[min(680px,calc(100vh-6rem))] w-[min(960px,calc(100vw-6rem))] max-w-none! gap-0 overflow-hidden p-0 sm:max-w-none">
			<DialogTitle className="sr-only">Settings</DialogTitle>
			<nav aria-label="Settings sections" className="flex w-52 shrink-0 flex-col gap-0.5 border-r border-border bg-sidebar p-2.5">
				<p className="px-2.5 pt-1 pb-2 text-sm font-bold">Settings</p>
				{pages.map(page => <button key={page.id} type="button" aria-current={settings === page.id ? "page" : undefined} onClick={() => openSettings(page.id)}
					className={cn("flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium text-sidebar-foreground/80 hover:bg-sidebar-accent/70 [&_svg]:size-4 [&_svg]:text-muted-foreground", settings === page.id && "bg-sidebar-accent text-sidebar-foreground")}>{page.icon}{page.label}</button>)}
			</nav>
			<div className="chat-settings-content legacy-panel min-w-0 flex-1 overflow-y-auto">
				{settings === "general" && <WorkspaceSettings />}
				{settings === "accounts" && <Accounts />}
				{settings === "appearance" && <Appearance />}
				{settings === "agents" && <Agents />}
				{settings === "mcp" && <McpConnections />}
				{settings === "missions" && <Missions onOpenTask={id => { select(id); }} onNewTask={() => select(undefined)} />}
			</div>
		</DialogContent>
	</Dialog>;
}
