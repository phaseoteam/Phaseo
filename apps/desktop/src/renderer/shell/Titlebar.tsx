import { useEffect, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Code2, Ellipsis, MessageSquare, Minus, PanelLeft, PanelRight, Search, Square, X, Copy as Restore } from "lucide-react";
import type { DesktopAppAction, DesktopUpdateState, DesktopWindowState } from "../../shared/desktop";
import { useWorkspace, type WorkspaceMode } from "../app/workspace";
import { cn } from "../lib/utils";
import { shortcutLabel } from "../lib/shortcuts";
import { BrandMark } from "./BrandMark";
import { Kbd } from "../components/ui/kbd";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "../components/ui/dropdown-menu";
import type { ThemePreference } from "../types";

export function IconButton({ label, onClick, disabled, active, children, className }: { label: string; onClick?: () => void; disabled?: boolean; active?: boolean; children: ReactNode; className?: string }) {
	return <button type="button" aria-label={label} title={label} disabled={disabled} aria-pressed={active} onClick={onClick}
		className={cn("no-drag grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent [&_svg]:size-4", active && "bg-sidebar-accent text-foreground", className)}>{children}</button>;
}

function ModeSwitch() {
	const { mode, setMode } = useWorkspace();
	const option = (value: WorkspaceMode, label: string, icon: ReactNode) => <button type="button" role="radio" aria-checked={mode === value} onClick={() => setMode(value)}
		className={cn("flex h-6 items-center gap-1.5 rounded-[5px] px-2.5 text-xs font-semibold transition-colors [&_svg]:size-3.5", mode === value ? "bg-background text-foreground shadow-sm dark:bg-sidebar-accent" : "text-muted-foreground hover:text-foreground")}>{icon}{label}</button>;
	return <div role="radiogroup" aria-label="Workspace" className="no-drag flex items-center gap-0.5 rounded-md bg-sidebar-accent/70 p-0.5 dark:bg-black/30">
		{option("chat", "Chat", <MessageSquare />)}{option("code", "Code", <Code2 />)}
	</div>;
}

function AppMenu() {
	const { select, openSettings, theme, setTheme } = useWorkspace();
	const desktop = window.phaseoDesktop;
	const [update, setUpdate] = useState<DesktopUpdateState>({ status: "unavailable" });
	useEffect(() => desktop?.onUpdateStateChange(setUpdate), [desktop]);
	const app = (action: DesktopAppAction) => void desktop?.performAppAction(action);
	return <DropdownMenu>
		<DropdownMenuTrigger render={<button type="button" aria-label="Application menu" title="Menu" className="no-drag grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-foreground [&_svg]:size-4" />}><Ellipsis /></DropdownMenuTrigger>
		<DropdownMenuContent align="end" className="w-60">
			<DropdownMenuItem onClick={() => select(undefined)}>New chat<DropdownMenuShortcut>{shortcutLabel("N")}</DropdownMenuShortcut></DropdownMenuItem>
			<DropdownMenuItem onClick={() => openSettings()}>Settings<DropdownMenuShortcut>{shortcutLabel(",")}</DropdownMenuShortcut></DropdownMenuItem>
			<DropdownMenuSeparator />
			<DropdownMenuSub>
				<DropdownMenuSubTrigger>Theme</DropdownMenuSubTrigger>
				<DropdownMenuSubContent>
					<DropdownMenuRadioGroup value={theme} onValueChange={value => setTheme(value as ThemePreference)}>
						<DropdownMenuRadioItem value="system">System</DropdownMenuRadioItem>
						<DropdownMenuRadioItem value="light">Light</DropdownMenuRadioItem>
						<DropdownMenuRadioItem value="dark">Dark</DropdownMenuRadioItem>
					</DropdownMenuRadioGroup>
				</DropdownMenuSubContent>
			</DropdownMenuSub>
			<DropdownMenuSub>
				<DropdownMenuSubTrigger>View</DropdownMenuSubTrigger>
				<DropdownMenuSubContent className="w-52">
					<DropdownMenuItem onClick={() => app("zoom-in")}>Zoom in<DropdownMenuShortcut>{shortcutLabel("+")}</DropdownMenuShortcut></DropdownMenuItem>
					<DropdownMenuItem onClick={() => app("zoom-out")}>Zoom out<DropdownMenuShortcut>{shortcutLabel("-")}</DropdownMenuShortcut></DropdownMenuItem>
					<DropdownMenuItem onClick={() => app("zoom-reset")}>Actual size<DropdownMenuShortcut>{shortcutLabel("0")}</DropdownMenuShortcut></DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem onClick={() => app("toggle-full-screen")}>Toggle full screen</DropdownMenuItem>
					<DropdownMenuItem onClick={() => app("reload")}>Reload</DropdownMenuItem>
				</DropdownMenuSubContent>
			</DropdownMenuSub>
			<DropdownMenuSeparator />
			{update.status === "ready"
				? <DropdownMenuItem onClick={() => void desktop?.installUpdate()}>Restart to update{update.version ? ` to ${update.version}` : ""}</DropdownMenuItem>
				: <DropdownMenuItem disabled={update.status === "checking"} onClick={() => void desktop?.checkForUpdates().then(setUpdate)}>{update.status === "checking" ? "Checking for updates…" : update.status === "unsupported" ? "Updates arrive with release builds" : "Check for updates"}</DropdownMenuItem>}
			<DropdownMenuItem onClick={() => void desktop?.openExternal("https://docs.phaseo.app")}>Documentation</DropdownMenuItem>
			<DropdownMenuItem onClick={() => void desktop?.openExternal("https://phaseo.app/settings")}>Phaseo dashboard</DropdownMenuItem>
			<DropdownMenuSeparator />
			<DropdownMenuItem onClick={() => app("quit")}>Quit Phaseo</DropdownMenuItem>
		</DropdownMenuContent>
	</DropdownMenu>;
}

function WindowControls() {
	const desktop = window.phaseoDesktop;
	const [state, setState] = useState<DesktopWindowState>({ isFocused: true, isFullScreen: false, isMaximized: false });
	useEffect(() => {
		if (!desktop) return;
		void desktop.getWindowState().then(setState);
		return desktop.onWindowStateChange(setState);
	}, [desktop]);
	const control = "no-drag grid h-full w-11 place-items-center text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground [&_svg]:size-4";
	return <div className="-mr-2 ml-1 flex h-full">
		<button type="button" aria-label="Minimise" className={control} onClick={() => void desktop?.performWindowAction("minimize")}><Minus /></button>
		<button type="button" aria-label={state.isMaximized ? "Restore" : "Maximise"} className={control} onClick={() => void desktop?.performWindowAction("toggle-maximize")}>{state.isMaximized ? <Restore className="size-3.5!" /> : <Square className="size-3.5!" />}</button>
		<button type="button" aria-label="Close" className={cn(control, "hover:bg-red-600 hover:text-white")} onClick={() => void desktop?.performWindowAction("close")}><X /></button>
	</div>;
}

export function Titlebar() {
	const { mode, sidebarOpen, setSidebarOpen, history, setCommandsOpen, rightPanel, setRightPanel } = useWorkspace();
	const mac = window.phaseoDesktop?.platform === "darwin";
	return <header className="drag-region flex h-11 shrink-0 items-center gap-1 border-b border-sidebar-border bg-sidebar px-2"
		onDoubleClick={event => { if (!mac && event.target === event.currentTarget) void window.phaseoDesktop?.performWindowAction("toggle-maximize"); }}>
		<div className={cn("flex items-center gap-2.5", mac ? "pl-[72px]" : "pl-1")}>
			{!mac && <BrandMark />}
			<ModeSwitch />
		</div>
		<div className="ml-2 flex items-center">
			<IconButton label={sidebarOpen ? "Hide sidebar" : "Show sidebar"} onClick={() => setSidebarOpen(open => !open)}><PanelLeft /></IconButton>
			<IconButton label="Back" disabled={!history.canBack} onClick={history.back}><ArrowLeft /></IconButton>
			<IconButton label="Forward" disabled={!history.canForward} onClick={history.forward}><ArrowRight /></IconButton>
		</div>
		<div className="flex flex-1 justify-center px-3">
			<button type="button" onClick={() => setCommandsOpen(true)} className="no-drag flex h-7 w-full max-w-md items-center gap-2 rounded-md border border-border bg-background/60 px-2.5 text-xs text-muted-foreground transition-colors hover:bg-background hover:text-foreground">
				<Search className="size-3.5" /><span>Search chats and commands</span><Kbd className="ml-auto">{shortcutLabel("K")}</Kbd>
			</button>
		</div>
		<div className="flex items-center">
			{(mode === "code" || rightPanel) && <IconButton label={rightPanel ? "Hide panel" : "Show panel"} active={!!rightPanel} onClick={() => setRightPanel(rightPanel ? undefined : "changes")}><PanelRight /></IconButton>}
			<AppMenu />
		</div>
		{!mac && <WindowControls />}
	</header>;
}
