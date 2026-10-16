import { lazy, Suspense, useEffect, useRef, useState, type DragEvent, type ReactNode } from "react";
import { ContextMenu } from "@base-ui/react/context-menu";
import { ChevronLeft, ChevronRight, FileDiff, FileText, Files, GitBranch, GitPullRequestArrow, Globe, Link2, Maximize2, Minimize2, Plus, SquareTerminal, Volume2, VolumeOff, X } from "lucide-react";
import { ScrollArea } from "../components/ui/scroll-area";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuTrigger } from "../components/ui/dropdown-menu";
import { Kbd } from "../components/ui/kbd";
import { Tip } from "../components/ui/tooltip";
import { errorText, useWorkspace, type RightPanelTab } from "../app/workspace";
import { usePersistedState } from "../lib/persistedState";
import { useCommand } from "../lib/keybindings";
import { cn } from "../lib/utils";
import { AgentThreadsPanel } from "../components/AgentThreadsPanel";
import { BrowserSurface } from "../views/BrowserSurface";
import { createBrowserTab, ensureBrowserTab, closeBrowserTab, onBrowserTabOpened, setBrowserTabMuted, useBrowserTab, useBrowserTabs } from "../lib/browserTabs";
import { PullRequestListSurface, PullRequestSurface, pullRequestStatePresentation } from "../views/pullRequests";
import { closeTerminal, createTerminal, terminalTitle, terminalsFor, useTerminalSessions } from "../lib/terminalSessions";
import { OPEN_PROJECT_FILE_EVENT, type OpenProjectFileDetail } from "../panels/events";
import { closePaneTabs, migratePaneState, movePaneTab, openPaneTab, paneKind, paneValue, paneWidths, reopenPaneTab, type PaneKey, type PaneState } from "./paneTabs";

// The diff viewer and editor are large, so they load when first opened.
const DiffSurface = lazy(() => import("../panels/DiffSurface").then(module => ({ default: module.DiffSurface })));
const FileSurface = lazy(() => import("../panels/FileSurface").then(module => ({ default: module.FileSurface })));
const FileBrowserSurface = lazy(() => import("../panels/FileBrowserSurface").then(module => ({ default: module.FileBrowserSurface })));
const TerminalSurface = lazy(() => import("../views/Terminals").then(module => ({ default: module.TerminalSurface })));

/** T3's "+" menu and empty-pane launcher, in its order, with the letter that opens each. */
const launchers: { kind: "browser" | "terminal" | "files" | "diff" | "pulls" | "agents"; label: string; icon: ReactNode; letter: string; needsProject?: boolean }[] = [
	{ kind: "browser", label: "Browser", icon: <Globe />, letter: "B" },
	{ kind: "terminal", label: "Terminal", icon: <SquareTerminal />, letter: "T" },
	{ kind: "files", label: "Files", icon: <Files />, letter: "F", needsProject: true },
	{ kind: "diff", label: "Diff", icon: <FileDiff />, letter: "D", needsProject: true },
	{ kind: "pulls", label: "Pull requests", icon: <Link2 />, letter: "P", needsProject: true },
	{ kind: "agents", label: "Agents", icon: <GitBranch />, letter: "A" },
];
const paneTabType = "application/x-phaseo-pane-tab";
const basename = (path: string) => path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;

/** A tab's icon and title: page title and favicon for the browser, #number in the state colour for a pull request. */
function TabFace({ paneKey, context, dirty }: { paneKey: PaneKey; context: string; dirty: boolean }) {
	const kind = paneKind(paneKey), value = paneValue(paneKey);
	if (kind === "browser") return <BrowserFace context={context} id={value} />;
	if (kind === "terminal") return <SquareTerminal />;
	if (kind === "pull") return <PullFace number={Number(value)} />;
	if (kind === "file") return <><FileText />{dirty && <span aria-hidden className="absolute -right-0.5 -bottom-0.5 size-1.5 rounded-full bg-current" />}<span className="hidden">{basename(value)}</span></>;
	const launcher = launchers.find(item => item.kind === kind);
	return <>{launcher?.icon ?? <Files />}</>;
}
function BrowserFace({ context, id }: { context: string; id: string }) {
	const tab = useBrowserTab(context, id);
	return tab?.favicon ? <img src={tab.favicon} alt="" className="size-3 rounded-[2px]" /> : <Globe />;
}
function PullFace({ number }: { number: number }) {
	const { overview, selectedId } = useWorkspace();
	const snapshot = overview.tasks.find(task => task.id === selectedId)?.pullRequests?.find(link => link.number === number)?.snapshot;
	if (!snapshot) return <GitPullRequestArrow className="text-muted-foreground" />;
	const { Icon, toneClassName } = pullRequestStatePresentation(snapshot.state, snapshot.draft);
	return <Icon className={toneClassName} />;
}

/** The tab's text, which for browser and terminal tabs follows the page or session. */
function useTabTitle(paneKey: PaneKey, context: string) {
	const browserTabs = useBrowserTabs(context);
	const sessions = useTerminalSessions();
	const kind = paneKind(paneKey), value = paneValue(paneKey);
	if (kind === "browser") return browserTabs.find(tab => tab.id === value)?.label ?? "Browser";
	if (kind === "terminal") return terminalTitle(sessions.find(session => session.id === value));
	if (kind === "pull") return `#${value}`;
	if (kind === "file") return basename(value);
	return launchers.find(item => item.kind === kind)?.label ?? kind;
}

function SurfaceTab({ paneKey, context, active, dirty, onSelect, onClose, onCloseOthers, onCloseRight, onCloseAll, onDropBefore }: { paneKey: PaneKey; context: string; active: boolean; dirty: boolean; onSelect: () => void; onClose: () => void; onCloseOthers: () => void; onCloseRight: () => void; onCloseAll: () => void; onDropBefore: (key: PaneKey) => void }) {
	const title = useTabTitle(paneKey, context);
	const kind = paneKind(paneKey), value = paneValue(paneKey);
	const browser = useBrowserTab(context, kind === "browser" ? value : "");
	const [over, setOver] = useState(false);
	return <ContextMenu.Root>
		<ContextMenu.Trigger render={<div role="tab" tabIndex={0} aria-selected={active} aria-label={title} draggable data-pane-tab={paneKey} {...(kind === "browser" ? { "data-browser-tab-id": value } : {})}
			onClick={onSelect} onKeyDown={event => { if (event.key === "Enter") onSelect(); }} onAuxClick={event => { if (event.button === 1) { event.preventDefault(); onClose(); } }}
			onDragStart={event => { event.dataTransfer.setData(paneTabType, paneKey); event.dataTransfer.effectAllowed = "move"; }}
			onDragOver={(event: DragEvent) => { if (!event.dataTransfer.types.includes(paneTabType)) return; event.preventDefault(); setOver(true); }}
			onDragLeave={() => setOver(false)}
			onDrop={(event: DragEvent) => { setOver(false); const moved = event.dataTransfer.getData(paneTabType); if (moved) { event.preventDefault(); onDropBefore(moved); } }} />}
			className={cn("group/tab relative flex h-6 max-w-36 shrink-0 cursor-pointer items-center gap-0.5 rounded-md pr-2 pl-1.5 text-xs outline-none [-webkit-app-region:no-drag] focus-visible:ring-2 focus-visible:ring-ring/40", active ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground", over && "ring-1 ring-primary/50")}>
			{/* The icon is the close button: it turns into an X on hover (T3). */}
			<button type="button" aria-label={`Close ${title}`} onClick={event => { event.stopPropagation(); onClose(); }} className="group/close relative flex size-4 shrink-0 items-center justify-center rounded-sm hover:bg-muted">
				<span className="relative flex size-3 items-center justify-center group-hover/tab:hidden group-focus-visible/close:hidden [&_svg]:size-3"><TabFace paneKey={paneKey} context={context} dirty={dirty} /></span>
				<X className="hidden size-3 group-hover/tab:block group-focus-visible/close:block" />
			</button>
			{browser && (browser.audible || browser.muted) && <button type="button" aria-label={browser.muted ? "Unmute tab" : "Mute tab"} onClick={event => { event.stopPropagation(); void setBrowserTabMuted(browser.id, !browser.muted); }} className="grid size-4 shrink-0 place-items-center rounded-sm hover:bg-muted">{browser.muted ? <VolumeOff className="size-3" /> : <Volume2 className="size-3" />}</button>}
			<Tip label={title} side="bottom" delay={600}><span className="truncate">{title}</span></Tip>
		</ContextMenu.Trigger>
		<DropdownMenuContent className="w-48">
			{browser && <DropdownMenuItem onClick={() => void setBrowserTabMuted(browser.id, !browser.muted)}>{browser.muted ? "Unmute tab" : "Mute tab"}</DropdownMenuItem>}
			{kind === "file" && <DropdownMenuItem onClick={() => void navigator.clipboard.writeText(value)}>Copy path</DropdownMenuItem>}
			{(browser || kind === "file") && <DropdownMenuSeparator />}
			<DropdownMenuItem onClick={onClose}>Close</DropdownMenuItem>
			<DropdownMenuItem onClick={onCloseOthers}>Close others</DropdownMenuItem>
			<DropdownMenuItem onClick={onCloseRight}>Close to the right</DropdownMenuItem>
			<DropdownMenuSeparator />
			<DropdownMenuItem onClick={onCloseAll}>Close all</DropdownMenuItem>
		</DropdownMenuContent>
	</ContextMenu.Root>;
}

/** T3's empty pane: the surfaces as rows, each opened by its letter. */
function Launcher({ onOpen, hasProject }: { onOpen: (kind: typeof launchers[number]["kind"]) => void; hasProject: boolean }) {
	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented) return;
			const target = event.target as HTMLElement | null;
			if (target?.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "") || document.querySelector("[role=menu],[role=dialog]")) return;
			const launcher = launchers.find(item => item.letter.toLowerCase() === event.key.toLowerCase() && (hasProject || !item.needsProject));
			if (launcher) { event.preventDefault(); onOpen(launcher.kind); }
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [onOpen, hasProject]);
	return <div className="flex min-h-0 flex-1 items-center justify-center px-6 pb-10">
		<div className="w-full max-w-xs py-6">
			<h3 className="mb-3 text-center text-sm font-medium text-foreground">Open a surface</h3>
			<div className="flex flex-col gap-0.5">{launchers.map(item => {
				const unavailable = item.needsProject && !hasProject;
				const button = <button key={item.kind} type="button" disabled={unavailable} onClick={() => onOpen(item.kind)}
					className="flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-sm transition-colors hover:bg-accent/60 disabled:opacity-50 [&>svg]:size-4">
					{item.icon}<span className="min-w-0 flex-1 truncate">{item.label}</span><Kbd>{item.letter}</Kbd>
				</button>;
				// A disabled button gets no pointer events, so its reason sits on a wrapper.
				return unavailable ? <Tip key={item.kind} label="Only for chats in a project."><div>{button}</div></Tip> : button;
			})}</div>
		</div>
	</div>;
}

export function RightPanel() {
	const { rightPanel, setRightPanel, selectedId, overview, newChatProjectId, select, commandsOpen, settings, sidebarOpen, api, setError, mode } = useWorkspace();
	// Tabs, the active one, width and maximise are remembered per chat, as in T3.
	const [states, setStates] = usePersistedState<Record<string, PaneState>>("phaseo.desktop.rightPanelState", {});
	const [lastWidth, setLastWidth] = usePersistedState("phaseo.desktop.rightPanelWidth", paneWidths.default);
	const [autoOpen] = usePersistedState("phaseo.desktop.panes.autoOpen", true);
	const [viewport, setViewport] = useState(window.innerWidth);
	useEffect(() => { const resize = () => setViewport(window.innerWidth); window.addEventListener("resize", resize); return () => window.removeEventListener("resize", resize); }, []);
	const [dragging, setDragging] = useState(false);
	const [menuOpen, setMenuOpen] = useState(false);
	const [dirty, setDirty] = useState<Record<string, boolean>>({});
	const drag = useRef<{ x: number; width: number } | undefined>(undefined);
	const strip = useRef<HTMLDivElement>(null);
	const [overflow, setOverflow] = useState({ left: false, right: false });
	const touched = useRef(0);
	const context = selectedId ?? "draft";
	const task = overview.tasks.find(value => value.id === selectedId);
	const projectId = task?.projectId ?? (selectedId ? undefined : newChatProjectId || undefined) ?? "";
	const sessions = useTerminalSessions();
	const browserTabs = useBrowserTabs(context);
	const saved = states[context];
	const state: PaneState = saved ? migratePaneState(saved) : { tabs: [] };
	const exists = (key: PaneKey) => {
		const kind = paneKind(key), value = paneValue(key);
		if (kind === "browser") return browserTabs.some(tab => tab.id === value);
		if (kind === "terminal") return value === "" || sessions.some(session => session.id === value && session.status === "running");
		if (["files", "diff", "pulls", "file", "pull"].includes(kind)) return Boolean(projectId);
		return true;
	};
	const tabs = state.tabs.filter(exists);
	const active = state.active && tabs.includes(state.active) ? state.active : tabs[0];
	const update = (next: PaneState, key = context) => setStates(current => Object.fromEntries(Object.entries({ ...current, [key]: next }).slice(-200)));
	// Keep the workspace's idea of the open surface in step, so Ctrl+J and friends toggle the right thing.
	const requested = useRef(rightPanel);
	const announce = (key: PaneKey | undefined) => {
		const kind = key ? paneKind(key) : undefined;
		const surface: RightPanelTab | undefined = !key ? undefined : kind === "file" ? "files" : kind === "pull" ? "pulls" : kind as RightPanelTab;
		requested.current = surface; if (rightPanel !== surface) setRightPanel(surface);
	};
	const show = (key: PaneKey, background = false) => { touched.current = Date.now(); const next = openPaneTab({ ...state, tabs }, key, background); update(next); announce(next.active); };
	const close = (keys: PaneKey[]) => {
		touched.current = Date.now();
		for (const key of keys) {
			if (paneKind(key) === "browser") void closeBrowserTab(context, paneValue(key));
			if (paneKind(key) === "terminal" && paneValue(key)) void closeTerminal(paneValue(key));
		}
		const next = closePaneTabs({ ...state, tabs }, keys); update(next);
		if (!next.tabs.filter(exists).length) { requested.current = undefined; setRightPanel(undefined); } else announce(next.active);
	};
	const openKind = async (kind: typeof launchers[number]["kind"]) => {
		try {
			if (kind === "browser") show(`browser:${createBrowserTab(context)}`);
			else if (kind === "terminal") show(`terminal:${(await createTerminal({ projectId: projectId || undefined, taskId: selectedId })).id}`);
			else show(kind);
		} catch (reason) { setError(errorText(reason)); }
	};

	// Asking for a surface (a shortcut, the palette, a link) opens it in this chat's tabs; switching chats shows that chat's tabs.
	useEffect(() => {
		if (requested.current === rightPanel) return;
		requested.current = rightPanel;
		if (!rightPanel || rightPanel === "restore") return;
		if (rightPanel === "browser") { show(`browser:${ensureBrowserTab(context)}`); return; }
		if (rightPanel === "terminal") {
			const existing = tabs.find(key => paneKind(key) === "terminal") ?? terminalsFor(sessions, { projectId: projectId || undefined, taskId: selectedId }).map(session => `terminal:${session.id}`)[0];
			if (existing) show(existing); else void openKind("terminal");
			return;
		}
		show(rightPanel === "changes" || rightPanel === "files" ? "files" : rightPanel);
	}, [rightPanel]);
	// Pages that open a new tab, links from messages, and files opened anywhere join this chat's pane.
	useEffect(() => onBrowserTabOpened(opened => { if (opened.context === context) { show(`browser:${opened.id}`, opened.background); } }));
	useEffect(() => {
		const openLink = (event: Event) => { const url = (event as CustomEvent<unknown>).detail; if (typeof url === "string" && /^https?:\/\//i.test(url)) show(`browser:${createBrowserTab(context, { url })}`); };
		const openFile = (event: Event) => { const detail = (event as CustomEvent<OpenProjectFileDetail>).detail; if (detail?.path && (!projectId || detail.projectId === projectId)) show(`file:${detail.path}`); };
		window.addEventListener("phaseo:open-context-link", openLink);
		window.addEventListener(OPEN_PROJECT_FILE_EVENT, openFile);
		return () => { window.removeEventListener("phaseo:open-context-link", openLink); window.removeEventListener(OPEN_PROJECT_FILE_EVENT, openFile); };
	});
	// T3 opens panes by itself: the Diff when a turn finishes with changes, a pull request when one is linked. It holds back if you used the pane during the turn.
	const status = task?.status, linked = task?.pullRequests?.length ?? 0;
	const previous = useRef({ id: selectedId, status, linked, started: 0 });
	useEffect(() => {
		const before = previous.current;
		previous.current = { id: selectedId, status, linked, started: status === "running" && before.status !== "running" ? Date.now() : before.started };
		if (!autoOpen || !task || before.id !== selectedId) return;
		if (linked > before.linked && touched.current < Date.now() - 1000) { const newest = task.pullRequests!.at(-1)!; show(linked > 1 ? "pulls" : `pull:${newest.number}`); return; }
		if (before.status === "running" && status === "completed" && task.projectId && mode === "code" && touched.current < before.started && api) {
			void api.task(task.id).then(full => { const checkpoint = full.messages.findLast(message => message.role === "user")?.checkpoint; if (checkpoint?.after && checkpoint.after !== checkpoint.before) show("diff"); }, () => undefined);
		}
	});
	// Overflow arrows on the tab strip.
	useEffect(() => {
		const element = strip.current;
		if (!element) return;
		const measure = () => setOverflow({ left: element.scrollLeft > 1, right: element.scrollLeft + element.clientWidth < element.scrollWidth - 1 });
		measure(); element.addEventListener("scroll", measure, { passive: true });
		const observer = new ResizeObserver(measure); observer.observe(element); if (element.firstElementChild) observer.observe(element.firstElementChild);
		return () => { element.removeEventListener("scroll", measure); observer.disconnect(); };
	}, [rightPanel, tabs.length]);
	useEffect(() => { strip.current?.querySelector("[aria-selected=true]")?.scrollIntoView({ block: "nearest", inline: "nearest" }); }, [active]);

	useCommand("rightPanel.closeTab", () => { if (!rightPanel || settings || !active) return false; close([active]); });
	useCommand("rightPanel.new", () => { if (!rightPanel || settings) return false; setMenuOpen(true); });
	useCommand("rightPanel.reopenClosed", () => { const next = reopenPaneTab({ ...state, tabs }, exists); if (!next) return false; update(next); announce(next.active); });
	useCommand("diff.toggle", () => { if (!projectId) return false; if (rightPanel && active === "diff") close(["diff"]); else show("diff"); });
	useCommand("preview.toggle", () => { const browser = tabs.find(key => paneKind(key) === "browser"); if (rightPanel && active && paneKind(active) === "browser") { requested.current = undefined; setRightPanel(undefined); } else if (browser) show(browser); else void openKind("browser"); });

	if (!rightPanel || settings) return null;
	const sidebar = sidebarOpen ? Number(localStorage.getItem("phaseo.desktop.sidebarWidth") ?? 256) || 256 : 0;
	const sheet = viewport <= 980;
	const widest = Math.max(paneWidths.minimum, Math.min(Math.floor(viewport * 0.7), viewport - sidebar - paneWidths.minimum));
	const width = Math.max(paneWidths.minimum, Math.min(widest, state.width ?? (Number.isFinite(lastWidth) ? lastWidth : paneWidths.default)));
	const setWidth = (value: number) => { const next = Math.max(paneWidths.minimum, Math.min(widest, value)); update({ ...state, width: next }); setLastWidth(next); };
	const kind = active ? paneKind(active) : undefined, value = active ? paneValue(active) : "";
	const fallback = <p className="p-4 text-xs text-muted-foreground">Loading…</p>;
	const content = !active ? null
		: kind === "browser" ? <BrowserSurface key={value} context={context} tabId={value} covered={commandsOpen || !!settings || menuOpen} />
		: kind === "terminal" ? <Suspense fallback={fallback}><TerminalSurface key={value} projectId={projectId} terminalId={value} /></Suspense>
		: kind === "files" ? <Suspense fallback={fallback}><FileBrowserSurface projectId={projectId} onOpenFile={path => show(`file:${path}`)} /></Suspense>
		: kind === "file" ? <Suspense fallback={fallback}><FileSurface key={value} projectId={projectId} path={value} onDirtyChange={isDirty => setDirty(current => current[active] === isDirty ? current : { ...current, [active]: isDirty })} onOpenFile={path => show(`file:${path}`)} /></Suspense>
		: kind === "diff" ? <Suspense fallback={fallback}><DiffSurface projectId={projectId} taskId={selectedId} onOpenFile={path => show(`file:${path}`)} /></Suspense>
		: kind === "pulls" ? <PullRequestListSurface projectId={projectId} taskId={selectedId} onOpen={pull => show(`pull:${pull.number}`)} />
		: kind === "pull" ? <PullRequestSurface key={value} projectId={projectId} number={Number(value)} onBack={() => show("pulls")} />
		: <AgentThreadsPanel id={selectedId} onOpen={select} />;
	const finishDrag = () => { drag.current = undefined; setDragging(false); };
	const pane = <aside aria-label="Tools" data-maximized={state.maximized || undefined}
		style={sheet || state.maximized ? undefined : { ["--pane-width" as string]: `${width}px` }}
		className={cn("relative flex min-w-0 flex-col border-l border-border bg-background",
			sheet ? "fixed top-11 right-0 bottom-0 z-40 w-[min(42vw,28rem)] max-w-[28rem] min-w-80 shadow-2xl max-[760px]:w-[min(88vw,24rem)]"
				: state.maximized ? "flex-[1_0_0]" : cn("w-(--pane-width) shrink-0 overflow-clip", !dragging && "transition-[width] duration-150 ease-out starting:w-0 motion-reduce:transition-none"))}>
		{!sheet && !state.maximized && <div role="separator" aria-orientation="vertical" aria-label="Resize panel" tabIndex={0}
			onPointerDown={event => { drag.current = { x: event.clientX, width }; setDragging(true); event.currentTarget.setPointerCapture(event.pointerId); }}
			onPointerMove={event => { if (drag.current) setWidth(drag.current.width + drag.current.x - event.clientX); }}
			onPointerUp={finishDrag} onPointerCancel={finishDrag} onDoubleClick={() => setWidth(paneWidths.default)}
			onKeyDown={event => { if (event.key === "ArrowLeft") setWidth(width + 24); if (event.key === "ArrowRight") setWidth(width - 24); }}
			className="group absolute inset-y-0 -left-1 z-20 w-2 cursor-col-resize outline-none select-none">
			<span aria-hidden className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-transparent transition-colors duration-150 group-hover:bg-border group-focus-visible:bg-ring group-active:bg-primary/60" />
		</div>}
		{/* The inner column keeps its width while the pane slides, so nothing reflows mid-animation (T3). */}
		<div className={cn("flex min-h-0 flex-1 flex-col", !sheet && !state.maximized && "w-[calc(var(--pane-width)-1px)]")}>
			<div className="flex h-10 shrink-0 items-center gap-1 border-b border-border/60 pr-2 pl-1" data-right-panel-tabbar>
				{overflow.left && <button type="button" aria-label="Scroll tabs left" onClick={() => strip.current?.scrollBy({ left: -160, behavior: "smooth" })} className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"><ChevronLeft className="size-3.5" /></button>}
				<ScrollArea className="min-w-0 flex-1" scrollBarOrientation="horizontal" scrollBarClassName="hidden" viewportRef={strip} viewportProps={{ onWheel: event => { if (strip.current && Math.abs(event.deltaY) > Math.abs(event.deltaX)) strip.current.scrollLeft += event.deltaY; } }}>
					<div role="tablist" aria-label="Tool tabs" className="flex h-10 w-max min-w-full items-center gap-1 pl-1">
						{tabs.map((key, index) => <SurfaceTab key={key} paneKey={key} context={context} active={key === active} dirty={Boolean(dirty[key])} onSelect={() => show(key)} onClose={() => close([key])}
							onCloseOthers={() => close(tabs.filter(value => value !== key))} onCloseRight={() => close(tabs.slice(index + 1))} onCloseAll={() => close(tabs)}
							onDropBefore={moved => { touched.current = Date.now(); update(movePaneTab({ ...state, tabs }, moved, key)); }} />)}
						<DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
							<Tip label="Open a surface" side="bottom"><DropdownMenuTrigger render={<button type="button" aria-label="Open a surface" className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground" />}><Plus className="size-3.5" /></DropdownMenuTrigger></Tip>
							<DropdownMenuContent align="start" className="w-52">{launchers.map(item => <DropdownMenuItem key={item.kind} disabled={item.needsProject && !projectId} onClick={() => void openKind(item.kind)}>{item.icon}{item.label}<DropdownMenuShortcut>{item.letter}</DropdownMenuShortcut></DropdownMenuItem>)}</DropdownMenuContent>
						</DropdownMenu>
					</div>
				</ScrollArea>
				{overflow.right && <button type="button" aria-label="Scroll tabs right" onClick={() => strip.current?.scrollBy({ left: 160, behavior: "smooth" })} className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"><ChevronRight className="size-3.5" /></button>}
				{tabs.length > 0 && !sheet && <Tip label={state.maximized ? "Restore panel" : "Maximize panel"} side="bottom"><button type="button" aria-label={state.maximized ? "Restore panel" : "Maximize panel"} aria-pressed={!!state.maximized} onClick={() => update({ ...state, maximized: !state.maximized })}
					className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground">{state.maximized ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}</button></Tip>}
				<Tip label="Close panel" side="bottom"><button type="button" aria-label="Close panel" onClick={() => { requested.current = undefined; setRightPanel(undefined); }} className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"><X className="size-4" /></button></Tip>
			</div>
			{!active ? <Launcher onOpen={kindToOpen => void openKind(kindToOpen)} hasProject={Boolean(projectId)} />
				: kind === "browser" || kind === "terminal" || kind === "diff" || kind === "file" || kind === "files" || kind === "pull" || kind === "pulls" ? <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{content}</div>
				: <ScrollArea className="chat-tools-content legacy-panel min-h-0 flex-1">{content}</ScrollArea>}
		</div>
	</aside>;
	// Below 980 px the pane slides over the chat as a sheet (T3).
	return sheet ? <>{<button type="button" aria-label="Close panel" tabIndex={-1} onClick={() => { requested.current = undefined; setRightPanel(undefined); }} className="fixed inset-0 top-11 z-30 bg-black/20" />}{pane}</> : pane;
}

