import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { useCommand } from "../lib/keybindings";
import { ContextMenu } from "@base-ui/react/context-menu";
import { Files, GitBranch, GitPullRequestArrow, Globe, Maximize2, Minimize2, Plus, SquareTerminal, X } from "lucide-react";
import { ScrollArea } from "../components/ui/scroll-area";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuTrigger } from "../components/ui/dropdown-menu";
import { Kbd } from "../components/ui/kbd";
import { useWorkspace, type RightPanelSurface } from "../app/workspace";
import { usePersistedState } from "../lib/persistedState";
import { cn } from "../lib/utils";
import { FilesPanel } from "./FilesPanel";
import { Proposals } from "../views/Proposals";
import { BrowserPanel } from "../views/BrowserPanel";
import { AgentThreadsPanel } from "../components/AgentThreadsPanel";

const Terminals = lazy(() => import("../views/Terminals").then(module => ({ default: module.Terminals })));

/** The pane's surfaces, in T3's launcher order, with the letter that opens each. */
const surfaces: { id: RightPanelSurface; label: string; icon: ReactNode; key: string }[] = [
	{ id: "browser", label: "Browser", icon: <Globe />, key: "B" },
	{ id: "terminal", label: "Terminal", icon: <SquareTerminal />, key: "T" },
	{ id: "changes", label: "Files", icon: <Files />, key: "F" },
	{ id: "pulls", label: "Pull requests", icon: <GitPullRequestArrow />, key: "P" },
	{ id: "agents", label: "Agents", icon: <GitBranch />, key: "A" },
];
const info = (id: RightPanelSurface) => surfaces.find(value => value.id === id)!;

/** T3's widths: 540 by default, never under 360, never over 70% of the window or so wide the chat drops under 360. */
const widths = { default: 540, minimum: 360 };
type PaneState = { tabs: RightPanelSurface[]; active?: RightPanelSurface; maximized?: boolean };

function SurfaceTab({ id, active, onSelect, onClose, onCloseOthers, onCloseRight, onCloseAll }: { id: RightPanelSurface; active: boolean; onSelect: () => void; onClose: () => void; onCloseOthers: () => void; onCloseRight: () => void; onCloseAll: () => void }) {
	const { label, icon } = info(id);
	return <ContextMenu.Root>
		<ContextMenu.Trigger render={<div role="tab" tabIndex={0} aria-selected={active} title={label} onClick={onSelect} onKeyDown={event => { if (event.key === "Enter") onSelect(); }} onAuxClick={event => { if (event.button === 1) { event.preventDefault(); onClose(); } }} />}
			className={cn("group/tab flex h-6 max-w-36 shrink-0 cursor-pointer items-center gap-0.5 rounded-md pr-2 pl-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/40", active ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground")}>
			{/* The icon is the close button: it turns into an X on hover. */}
			<button type="button" aria-label={`Close ${label}`} onClick={event => { event.stopPropagation(); onClose(); }} className="group/close relative flex size-4 shrink-0 items-center justify-center rounded-sm hover:bg-muted">
				<span className="relative flex size-3 items-center justify-center group-hover/tab:hidden group-focus-visible/close:hidden [&_svg]:size-3">{icon}</span>
				<X className="hidden size-3 group-hover/tab:block group-focus-visible/close:block" />
			</button>
			<span className="truncate">{label}</span>
		</ContextMenu.Trigger>
		<DropdownMenuContent className="w-44">
			<DropdownMenuItem onClick={onClose}>Close</DropdownMenuItem>
			<DropdownMenuItem onClick={onCloseOthers}>Close others</DropdownMenuItem>
			<DropdownMenuItem onClick={onCloseRight}>Close to the right</DropdownMenuItem>
			<DropdownMenuSeparator />
			<DropdownMenuItem onClick={onCloseAll}>Close all</DropdownMenuItem>
		</DropdownMenuContent>
	</ContextMenu.Root>;
}

/** T3's empty pane: the surfaces as rows, each opened by its letter. */
function Launcher({ onOpen }: { onOpen: (id: RightPanelSurface) => void }) {
	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented) return;
			const target = event.target as HTMLElement | null;
			if (target?.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "") || document.querySelector("[role=menu],[role=dialog]")) return;
			const surface = surfaces.find(value => value.key.toLowerCase() === event.key.toLowerCase());
			if (surface) { event.preventDefault(); onOpen(surface.id); }
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [onOpen]);
	return <div className="flex min-h-0 flex-1 items-center justify-center px-6 pb-10">
		<div className="w-full max-w-xs py-6">
			<h3 className="mb-3 text-center text-sm font-medium text-foreground">Open a surface</h3>
			<div className="flex flex-col gap-0.5">{surfaces.map(surface => <button key={surface.id} type="button" onClick={() => onOpen(surface.id)}
				className="flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-sm transition-colors hover:bg-accent/60 [&>svg]:size-4">
				{surface.icon}<span className="min-w-0 flex-1 truncate">{surface.label}</span><Kbd>{surface.key}</Kbd>
			</button>)}</div>
		</div>
	</div>;
}

export function RightPanel() {
	const { rightPanel, setRightPanel, selectedId, overview, newChatProjectId, select, commandsOpen, settings, sidebarOpen } = useWorkspace();
	// Which surfaces are open, the active one and maximise are remembered per chat, as in T3.
	const [states, setStates] = usePersistedState<Record<string, PaneState>>("phaseo.desktop.rightPanelState", {});
	const [savedWidth, setSavedWidth] = usePersistedState("phaseo.desktop.rightPanelWidth", widths.default);
	const [viewport, setViewport] = useState(window.innerWidth);
	useEffect(() => { const resize = () => setViewport(window.innerWidth); window.addEventListener("resize", resize); return () => window.removeEventListener("resize", resize); }, []);
	const [link, setLink] = useState<{ url: string; request: number }>();
	const dragging = useRef<{ x: number; width: number } | undefined>(undefined);
	const key = selectedId ?? "draft";
	const state = states[key] ?? { tabs: [] };
	const update = (next: PaneState) => setStates(current => {
		const entries = Object.entries({ ...current, [key]: next });
		// Keep the most recent 200 chats' layouts.
		return Object.fromEntries(entries.slice(-200));
	});
	const open = (id: RightPanelSurface) => {
		update({ ...state, tabs: state.tabs.includes(id) ? state.tabs : [...state.tabs, id], active: id });
		if (rightPanel !== id) setRightPanel(id);
	};
	const close = (ids: RightPanelSurface[]) => {
		const tabs = state.tabs.filter(id => !ids.includes(id));
		// Closing the active tab activates its neighbour; closing the last one closes the pane.
		const index = state.active ? state.tabs.indexOf(state.active) : -1;
		const active = state.active && tabs.includes(state.active) ? state.active : tabs[Math.min(Math.max(index, 0), tabs.length - 1)];
		update({ ...state, tabs, active });
		if (!tabs.length) setRightPanel(undefined); else if (active) setRightPanel(active);
	};

	// Asking for a surface (a shortcut, the palette, a link) adds it to this chat's tabs; switching chats shows that chat's own tabs.
	const requested = useRef(rightPanel);
	useEffect(() => {
		if (requested.current === rightPanel) return;
		requested.current = rightPanel;
		if (!rightPanel || rightPanel === "restore") return;
		const id: RightPanelSurface = rightPanel === "files" ? "changes" : rightPanel;
		if (state.active !== id || !state.tabs.includes(id)) update({ ...state, tabs: state.tabs.includes(id) ? state.tabs : [...state.tabs, id], active: id });
	}, [rightPanel]);
	useEffect(() => {
		const openLink = (event: Event) => {
			const url = (event as CustomEvent<unknown>).detail;
			if (typeof url !== "string" || !/^https?:\/\//i.test(url)) return;
			setLink({ url, request: Date.now() }); setRightPanel("browser");
		};
		window.addEventListener("phaseo:open-context-link", openLink);
		return () => window.removeEventListener("phaseo:open-context-link", openLink);
	}, [setRightPanel]);
	// Ctrl+W (by default) closes the active surface while the pane is open.
	useCommand("rightPanel.closeTab", () => { if (!rightPanel || settings || !state.active) return false; close([state.active]); });

	if (!rightPanel || settings) return null;
	const task = overview.tasks.find(value => value.id === selectedId);
	const projectId = task?.projectId ?? (selectedId ? undefined : newChatProjectId || undefined) ?? "";
	const sidebar = sidebarOpen ? Number(localStorage.getItem("phaseo.desktop.sidebarWidth") ?? 256) || 256 : 0;
	const widest = Math.max(widths.minimum, Math.min(Math.floor(viewport * 0.7), viewport - sidebar - widths.minimum));
	const width = Math.max(widths.minimum, Math.min(widest, Number.isFinite(savedWidth) ? savedWidth : widths.default));
	const active = state.active && state.tabs.includes(state.active) ? state.active : undefined;
	const content = active === "changes" ? <FilesPanel key={projectId || "personal"} initialProjectId={projectId} />
		: active === "pulls" ? <Proposals key={projectId || "personal"} initialProjectId={projectId} />
		: active === "terminal" ? <Suspense fallback={<p className="p-4 text-xs text-muted-foreground">Opening terminal…</p>}><Terminals key={projectId || "personal"} initialProjectId={projectId} /></Suspense>
		: active === "browser" ? <BrowserPanel context={key} covered={commandsOpen || !!settings} requestedLink={link} />
		: active === "agents" ? <AgentThreadsPanel id={selectedId} onOpen={select} /> : null;
	const finishDrag = () => { dragging.current = undefined; };
	return <aside aria-label="Tools" style={state.maximized ? undefined : { width }} className={cn("relative flex min-w-0 flex-col border-l border-border bg-background", state.maximized ? "flex-[1_0_0] max-w-[calc(100vw-1px)]" : "shrink-0")} data-maximized={state.maximized || undefined}>
		{!state.maximized && <div role="separator" aria-orientation="vertical" aria-label="Resize panel" tabIndex={0}
			onPointerDown={event => { dragging.current = { x: event.clientX, width }; event.currentTarget.setPointerCapture(event.pointerId); }}
			onPointerMove={event => { if (dragging.current) setSavedWidth(Math.max(widths.minimum, Math.min(widest, dragging.current.width + dragging.current.x - event.clientX))); }}
			onPointerUp={finishDrag} onPointerCancel={finishDrag} onDoubleClick={() => setSavedWidth(widths.default)}
			onKeyDown={event => { if (event.key === "ArrowLeft") setSavedWidth(width + 24); if (event.key === "ArrowRight") setSavedWidth(width - 24); }}
			className="group absolute inset-y-0 -left-1 z-20 w-2 cursor-col-resize outline-none select-none">
			<span aria-hidden className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-transparent transition-colors duration-150 group-hover:bg-border group-focus-visible:bg-ring group-active:bg-primary/60" />
		</div>}
		<div className="flex h-10 shrink-0 items-center gap-1 border-b border-border/60 pr-2 pl-2" data-right-panel-tabbar>
			<ScrollArea className="min-w-0 flex-1" scrollBarOrientation="horizontal" scrollBarClassName="hidden">
				<div role="tablist" aria-label="Tool tabs" className="flex h-10 w-max min-w-full items-center gap-1">
					{state.tabs.map((id, index) => <SurfaceTab key={id} id={id} active={id === active} onSelect={() => open(id)} onClose={() => close([id])}
						onCloseOthers={() => close(state.tabs.filter(value => value !== id))} onCloseRight={() => close(state.tabs.slice(index + 1))} onCloseAll={() => close(state.tabs)} />)}
					<DropdownMenu>
						<DropdownMenuTrigger render={<button type="button" aria-label="Open a surface" title="Open a surface" className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground" />}><Plus className="size-3.5" /></DropdownMenuTrigger>
						<DropdownMenuContent align="start" className="w-52">{surfaces.map(surface => <DropdownMenuItem key={surface.id} onClick={() => open(surface.id)}>{surface.icon}{surface.label}<DropdownMenuShortcut>{surface.key}</DropdownMenuShortcut></DropdownMenuItem>)}</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</ScrollArea>
			{state.tabs.length > 0 && <button type="button" aria-label={state.maximized ? "Restore panel" : "Maximize panel"} title={state.maximized ? "Restore panel" : "Maximize panel"} aria-pressed={!!state.maximized} onClick={() => update({ ...state, maximized: !state.maximized })}
				className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground">{state.maximized ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}</button>}
			<button type="button" aria-label="Close panel" title="Close panel" onClick={() => setRightPanel(undefined)} className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"><X className="size-4" /></button>
		</div>
		{!active ? <Launcher onOpen={open} />
			/* The browser and terminal fill the pane and scroll themselves; lists scroll in a ScrollArea. */
			: active === "changes" ? <div className="flex min-h-0 flex-1 flex-col">{content}</div>
			: active === "browser" || active === "terminal" ? <div className="chat-tools-content legacy-panel min-h-0 flex-1 overflow-hidden">{content}</div>
			: <ScrollArea className="chat-tools-content legacy-panel min-h-0 flex-1">{content}</ScrollArea>}
	</aside>;
}
