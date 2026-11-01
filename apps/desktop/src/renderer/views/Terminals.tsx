import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { ArrowDown, ClipboardPaste, Copy, Eraser, Globe, MessageSquarePlus, Plus, Square, SquareSplitHorizontal, SquareSplitVertical, SquareTerminal, TextSelect, Trash2, X } from "lucide-react";
import { ContextMenu } from "@base-ui/react/context-menu";
import { DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "../components/ui/dropdown-menu";
import { useOptionalWorkspace } from "../app/workspace";
import { attachToComposer } from "./BrowserSurface";
import { openProjectFile } from "../panels/events";
import { showToast } from "../components/ui/toast";
import { extractTerminalLinks, projectPath, splitPosition, terminalContext } from "../lib/terminalLinks";
import { localUrlsIn } from "../../shared/browser";
import { openInChatBrowser } from "../lib/actionPreview";
import { Tip } from "../components/ui/tooltip";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import type { TerminalSession, WorkspaceApi } from "../../shared/workspace";
import { usePersistedState } from "../lib/persistedState";
import { cn } from "../lib/utils";
import { isCommandKey, shortcut, useCommand } from "../lib/keybindings";
import { activeGroup, addGroup, canSplit, emptyLayout, groupLabel, layoutTerminalIds, MAX_TERMINALS_PER_GROUP, reconcile, removeTerminal, split, type SplitDirection, type TerminalLayout } from "../lib/terminalGroups";
import { closeTerminal, createTerminal, deleteTranscript, onTerminalExit, terminalOutput, terminalsFor, terminalTitle, useTerminalSessions } from "../lib/terminalSessions";
import { Popover, PopoverContent, PopoverTrigger } from "../components/ui/popover";

export { createTerminal, closeTerminal, terminalsFor, terminalTitle, useTerminalSessions } from "../lib/terminalSessions";

export const TERMINAL_DRAWER_HEIGHT = { default: 280, minimum: 180, maximumRatio: 0.75 };
const maxDrawerHeight = () => Math.max(TERMINAL_DRAWER_HEIGHT.minimum, Math.floor(window.innerHeight * TERMINAL_DRAWER_HEIGHT.maximumRatio));
export const clampDrawerHeight = (height: number, maximum = maxDrawerHeight()) => Math.min(Math.max(Math.round(Number.isFinite(height) ? height : TERMINAL_DRAWER_HEIGHT.default), TERMINAL_DRAWER_HEIGHT.minimum), maximum);
const terminalKeys = ["terminal.split", "terminal.splitVertical", "terminal.new", "terminal.close", "terminal.toggle", "workspace.focusNext", "workspace.focusPrevious"] as const;

function readColours() {
	const style = getComputedStyle(document.documentElement);
	const dark = document.documentElement.dataset.theme === "dark";
	return { background: style.getPropertyValue("--background").trim() || (dark ? "#0e1218" : "#ffffff"), foreground: style.getPropertyValue("--foreground").trim() || (dark ? "#edf1f7" : "#1c2129"), cursor: dark ? "rgb(180, 203, 255)" : "rgb(38, 56, 78)", selectionBackground: dark ? "rgba(180, 203, 255, 0.25)" : "rgba(37, 63, 99, 0.2)" };
}

/** One xterm bound to a session: 12 px type, 4 px padding, sized to its box. */
function TerminalView({ session, api, focus, onFocus, onError }: { session: TerminalSession; api: WorkspaceApi; focus?: number; onFocus?: () => void; onError: (error: string) => void }) {
	const host = useRef<HTMLDivElement>(null);
	const terminalRef = useRef<Terminal | undefined>(undefined);
	const current = useRef(session); current.current = session;
	const report = useRef(onError); report.current = onError;
	const projects = useOptionalWorkspace()?.overview.projects;
	const projectDirectory = useRef<string | undefined>(undefined);
	projectDirectory.current = projects?.find(project => project.id === session.projectId)?.directory;
	const [selection, setSelection] = useState("");
	const [scrolledUp, setScrolledUp] = useState(false);
	/** A file path in the output opens in the Files pane at its line; paths outside the project are not links. */
	const fileLink = (text: string) => {
		const directory = projectDirectory.current, projectId = current.current.projectId;
		if (!directory || !projectId) return undefined;
		const { path, line } = splitPosition(text), relative = projectPath(path, current.current.cwd, directory, window.phaseoDesktop?.platform === "win32");
		return relative ? () => openProjectFile({ projectId, path: relative, ...line ? { line } : {} }) : undefined;
	};
	const openLink = (url: string, external: boolean) => {
		const taskId = current.current.taskId;
		if (!taskId || external) { void window.phaseoDesktop?.openExternal(url).catch(reason => report.current(String(reason))); return; }
		try { openInChatBrowser(taskId, url); } catch (reason) { report.current(reason instanceof Error ? reason.message : String(reason)); }
	};
	// An action's terminal offers the local address its server prints, for previewing a dev server.
	const offers = Boolean(session.scriptId && session.taskId);
	const [localUrl, setLocalUrl] = useState(() => offers ? localUrlsIn(terminalOutput(session.id)).at(-1) : undefined);
	const [dismissed, setDismissed] = useState<string>();
	const carry = useRef("");
	const scan = useRef((data: string) => { void data; });
	scan.current = data => {
		if (!offers) return;
		const text = carry.current + data;
		carry.current = text.slice(-300);
		const found = localUrlsIn(text).at(-1);
		if (found && found !== localUrl) setLocalUrl(found);
	};
	useEffect(() => {
		if (!host.current) return;
		const terminal = new Terminal({ fontSize: 12, lineHeight: 1.2, fontFamily: getComputedStyle(document.documentElement).getPropertyValue("--font-mono").trim() || "Cascadia Code, Consolas, monospace", cursorBlink: true, scrollback: 10000, theme: readColours(), allowProposedApi: false });
		terminalRef.current = terminal;
		const fit = new FitAddon(); terminal.loadAddon(fit); terminal.open(host.current); terminal.write(terminalOutput(session.id));
		// The app's terminal shortcuts reach the app, not the shell.
		terminal.attachCustomKeyEventHandler(event => !(event.type === "keydown" && isCommandKey(event, terminalKeys)));
		const input = terminal.onData(data => { if (current.current.status === "running") void api.terminal({ type: "write", id: current.current.id, data }).catch(reason => report.current(String(reason))); });
		// Terminal links: a web address opens in the chat's browser (Ctrl or Cmd-click: the system browser); a
		// project file path, with its line, opens in the Files pane.
		const links = terminal.registerLinkProvider({ provideLinks(line, callback) {
			const text = terminal.buffer.active.getLine(line - 1)?.translateToString(true) ?? "";
			const found = extractTerminalLinks(text).flatMap(link => {
				const range = { start: { x: link.start + 1, y: line }, end: { x: link.end, y: line } };
				if (link.kind === "url") return [{ text: link.text, range, activate: (event: MouseEvent, target: string) => openLink(target, event.ctrlKey || event.metaKey) }];
				const open = fileLink(link.text);
				return open ? [{ text: link.text, range, activate: () => open() }] : [];
			});
			callback(found.length ? found : undefined);
		} });
		const selected = terminal.onSelectionChange(() => setSelection(terminal.getSelection()));
		// Jump to latest: offered while the reader has scrolled up from the newest output.
		const position = () => { const buffer = terminal.buffer.active; setScrolledUp(buffer.viewportY < buffer.baseY); };
		const scrolled = terminal.onScroll(position), written = terminal.onWriteParsed(position);
		const unsubscribe = api.onTerminalEvent(event => { if (event.sessionId === current.current.id && event.data) { terminal.write(event.data); scan.current(event.data); } });
		let frame = 0;
		const resize = new ResizeObserver(() => {
			cancelAnimationFrame(frame);
			frame = requestAnimationFrame(() => {
				if (!host.current?.clientWidth) return;
				try { fit.fit(); } catch { return; }
				if (current.current.status === "running") void api.terminal({ type: "resize", id: current.current.id, columns: Math.min(terminal.cols, 500), rows: Math.min(terminal.rows, 500) }).catch(() => undefined);
			});
		});
		resize.observe(host.current);
		const theme = new MutationObserver(() => { terminal.options.theme = readColours(); }); theme.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
		return () => { cancelAnimationFrame(frame); input.dispose(); links.dispose(); selected.dispose(); scrolled.dispose(); written.dispose(); unsubscribe(); resize.disconnect(); theme.disconnect(); terminal.dispose(); terminalRef.current = undefined; };
		// One xterm for the life of the session.
	}, [api, session.id]);
	useEffect(() => { if (focus) terminalRef.current?.focus(); }, [focus]);
	const offer = localUrl && localUrl !== dismissed && session.status === "running" ? localUrl : undefined;
	const copy = () => { const text = terminalRef.current?.getSelection(); if (text) void navigator.clipboard.writeText(text).catch(() => report.current("The clipboard refused the copy.")); };
	const paste = () => void navigator.clipboard.readText().then(text => { if (text && current.current.status === "running") terminalRef.current?.paste(text); terminalRef.current?.focus(); }, () => report.current("The clipboard could not be read. Press Ctrl+V instead."));
	// Add to chat: the selected output goes into the open composer as a quoted block.
	const addToChat = () => { const text = terminalRef.current?.getSelection(); if (!text?.trim()) return; if (!attachToComposer({ text: terminalContext(terminalTitle(current.current), text) })) showToast("info", "Open a chat to add terminal output to it."); };
	return <div className="terminal-view relative h-full w-full overflow-hidden bg-background p-1" onPointerDown={onFocus} onFocusCapture={onFocus}>
		<ContextMenu.Root>
			<ContextMenu.Trigger render={<div ref={host} className="h-full w-full" />} />
			<DropdownMenuContent className="w-48">
				<DropdownMenuItem disabled={!selection} onClick={copy}><Copy />Copy</DropdownMenuItem>
				<DropdownMenuItem disabled={session.status !== "running"} onClick={paste}><ClipboardPaste />Paste</DropdownMenuItem>
				<DropdownMenuItem onClick={() => terminalRef.current?.selectAll()}><TextSelect />Select all</DropdownMenuItem>
				<DropdownMenuItem onClick={() => { terminalRef.current?.clear(); setScrolledUp(false); }}><Eraser />Clear</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem disabled={!selection.trim()} onClick={addToChat}><MessageSquarePlus />Add to chat</DropdownMenuItem>
			</DropdownMenuContent>
		</ContextMenu.Root>
		{scrolledUp && <button type="button" onClick={() => { terminalRef.current?.scrollToBottom(); setScrolledUp(false); terminalRef.current?.focus(); }}
			className="absolute bottom-2 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-md border border-border/60 bg-background px-2 py-0.5 text-xs font-medium text-foreground shadow-xs hover:bg-accent/60"><ArrowDown className="size-3.5" />Jump to latest</button>}
		{offer && <div role="status" aria-label="Local server" className="absolute right-2 bottom-2 z-10 flex max-w-[calc(100%-1rem)] items-center gap-1.5 rounded-md border border-border/60 bg-background py-0.5 pr-0.5 pl-2 text-xs">
			<Globe className="size-3.5 shrink-0 text-muted-foreground" />
			<span className="min-w-0 truncate font-mono text-muted-foreground">{offer.replace(/^https?:\/\//, "").replace(/\/$/, "")}</span>
			<button type="button" onClick={() => { openLink(offer, false); setDismissed(offer); }} className="h-6 shrink-0 rounded-md px-2 font-medium text-foreground hover:bg-accent/60">Open in browser</button>
			<Tip label="Dismiss"><button type="button" aria-label="Dismiss" onClick={() => setDismissed(offer)} className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent/60 hover:text-foreground"><X className="size-3.5" /></button></Tip>
		</div>}
	</div>;
}

/** A terminal action: an icon with its label shown on hover. */
function TerminalAction({ label, disabled, onClick, className, children }: { label: string; disabled?: boolean; onClick: () => void; className: string; children: ReactNode }) {
	return <Popover>
		<PopoverTrigger openOnHover delay={300} render={<button type="button" aria-label={label} aria-disabled={disabled} onClick={disabled ? undefined : onClick} className={cn(className, disabled && "cursor-not-allowed opacity-45")} />}>{children}</PopoverTrigger>
		<PopoverContent side="bottom" sideOffset={6} className="pointer-events-none w-auto gap-0 px-2 py-1 text-xs select-none">{label}</PopoverContent>
	</Popover>;
}

type WorkspaceProps = {
	/** Where the layout is remembered: a pane tab or a chat's drawer. */
	layoutKey: string;
	scope: { projectId?: string; taskId?: string };
	/** Terminals that belong in this layout from the start (a tab's own terminal). */
	adopt?: readonly string[];
	mode: "panel" | "drawer";
	emptyText: string;
	children?: ReactNode;
};

/** The terminal layout: one terminal full-bleed, splits up to four, a list on the right once there are more. */
function TerminalWorkspace({ layoutKey, scope, adopt = [], mode, emptyText, children }: WorkspaceProps) {
	const api = window.phaseoDesktop?.workspace;
	const sessions = useTerminalSessions();
	const [layouts, setLayouts] = usePersistedState<Record<string, TerminalLayout>>("phaseo.desktop.terminalLayouts", {});
	const [error, setError] = useState("");
	const [busy, setBusy] = useState(false);
	const [focusRequest, setFocusRequest] = useState(0);
	const container = useRef<HTMLDivElement>(null);
	const stored = layouts[layoutKey] ?? emptyLayout();
	const running = sessions.filter(session => session.status === "running" && !session.ephemeral).map(session => session.id);
	const layout = reconcile(stored, running, adopt);
	const runningRef = useRef(running); runningRef.current = running;
	const save = useCallback((update: (layout: TerminalLayout) => TerminalLayout) => setLayouts(current => {
		const next = update(reconcile(current[layoutKey] ?? emptyLayout(), runningRef.current, adopt));
		return Object.fromEntries(Object.entries({ ...current, [layoutKey]: next }).filter(([, value]) => value.groups.length).slice(-200));
		// adopt is fixed for a surface.
	}), [layoutKey, setLayouts]);

	// A terminal closes when its process exits, and its transcript goes with it.
	useEffect(() => onTerminalExit(session => {
		if (!layoutTerminalIds(layouts[layoutKey] ?? emptyLayout()).includes(session.id) && !adopt.includes(session.id)) return;
		save(value => removeTerminal(value, session.id));
		void deleteTranscript(session.id);
	}), [layouts, layoutKey, adopt, save]);

	const ids = layoutTerminalIds(layout);
	const group = activeGroup(layout);
	const activeId = layout.activeTerminalId && ids.includes(layout.activeTerminalId) ? layout.activeTerminalId : group?.terminalIds[0];
	const visible = group?.terminalIds ?? [];
	const splittable = canSplit(layout);
	const byId = new Map(sessions.map(session => [session.id, session]));
	const label = (id: string) => terminalTitle(byId.get(id));

	const run = async (action: () => Promise<void>) => {
		if (busy) return;
		setBusy(true); setError("");
		try { await action(); } catch (reason) { setError((reason instanceof Error ? reason.message : String(reason)).replace(/^Error invoking remote method '[^']+': (?:Error: )?/, "")); } finally { setBusy(false); }
	};
	const create = () => run(async () => { const session = await createTerminal(scope); save(value => addGroup(value, session.id)); setFocusRequest(value => value + 1); });
	const splitActive = (direction: SplitDirection) => { if (!splittable) return; void run(async () => { const session = await createTerminal(scope); save(value => split(value, session.id, direction)); setFocusRequest(value => value + 1); }); };
	const close = (id: string) => {
		if (!window.confirm(`Close ${label(id)}? Its process will be stopped.`)) return;
		save(value => removeTerminal(value, id));
		void run(() => closeTerminal(id));
	};
	const activate = (id: string) => { if (id !== layout.activeTerminalId) save(value => ({ ...value, activeTerminalId: id })); setFocusRequest(value => value + 1); };

	const owns = () => Boolean(container.current?.contains(document.activeElement));
	useCommand("terminal.split", () => { if (!owns()) return false; splitActive("horizontal"); });
	useCommand("terminal.splitVertical", () => { if (!owns()) return false; splitActive("vertical"); });
	useCommand("terminal.new", () => { if (!owns()) return false; void create(); });
	useCommand("terminal.close", () => { if (!owns() || !activeId) return false; close(activeId); });

	const keyHint = (command: Parameters<typeof shortcut>[0]) => { const key = shortcut(command); return key ? ` (${key})` : ""; };
	const splitLabel = splittable ? `Split terminal side by side${keyHint("terminal.split")}` : `Split terminal side by side (max ${MAX_TERMINALS_PER_GROUP} per group)`;
	const splitVerticalLabel = splittable ? `Split terminal stacked${keyHint("terminal.splitVertical")}` : `Split terminal stacked (max ${MAX_TERMINALS_PER_GROUP} per group)`;
	const newLabel = `New terminal${keyHint("terminal.new")}`, closeLabel = `Close terminal${keyHint("terminal.close")}`;
	const sidebar = ids.length > 1;

	if (!api) return <div className="flex h-full items-center justify-center p-4 text-center text-sm text-muted-foreground">Open the desktop app to use local terminals.</div>;
	const shell = (content: ReactNode) => <div ref={container} className={cn("terminal-surface relative flex min-h-0 min-w-0 flex-col overflow-hidden bg-background", mode === "panel" ? "h-full flex-1" : "h-full")} data-terminal-owner={mode === "panel" ? "right-panel" : "drawer"}>
		{children}
		{content}
		{error && <p role="alert" className="absolute bottom-2 left-2 z-20 max-w-[70%] rounded-md border border-destructive/30 bg-background px-2 py-1 text-xs text-destructive shadow-xs">{error}</p>}
	</div>;
	if (!ids.length || !activeId) return shell(<div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-4 py-6 text-center text-sm text-muted-foreground">
		<p>{emptyText}</p>
		<button type="button" disabled={busy} onClick={() => void create()} className="h-6 rounded-md border border-border bg-background px-2.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50">{newLabel}</button>
	</div>);

	const view = (id: string) => { const session = byId.get(id); return session ? <TerminalView key={id} session={session} api={api} focus={id === activeId ? focusRequest || 1 : undefined} onFocus={() => { if (id !== layout.activeTerminalId) save(value => ({ ...value, activeTerminalId: id })); }} onError={setError} /> : null; };
	const separator = <div className="h-4 w-px bg-border/80" />;
	const splitClass = (base: string) => cn(base, !splittable && "cursor-not-allowed opacity-64 hover:bg-transparent");
	return shell(<>
		{!sidebar && <div className="pointer-events-none absolute top-2 right-2 z-20">
			<div className="pointer-events-auto inline-flex items-center overflow-hidden rounded-md border border-border/80 bg-background shadow-xs">
				<TerminalAction label={splitLabel} disabled={busy} onClick={() => splitActive("horizontal")} className={splitClass("p-1 text-foreground/90 transition-colors hover:bg-accent")}><SquareSplitHorizontal className="size-3.25" /></TerminalAction>
				{separator}
				<TerminalAction label={splitVerticalLabel} disabled={busy} onClick={() => splitActive("vertical")} className={splitClass("p-1 text-foreground/90 transition-colors hover:bg-accent")}><SquareSplitVertical className="size-3.25" /></TerminalAction>
				{separator}
				<TerminalAction label={newLabel} disabled={busy} onClick={() => void create()} className="p-1 text-foreground/90 transition-colors hover:bg-accent"><Plus className="size-3.25" /></TerminalAction>
				{separator}
				<TerminalAction label={closeLabel} disabled={busy} onClick={() => close(activeId)} className="p-1 text-foreground/90 transition-colors hover:bg-accent"><Trash2 className="size-3.25" /></TerminalAction>
			</div>
		</div>}
		<div className={cn("flex h-full min-h-0 w-full flex-1", sidebar && "gap-1.5")}>
			<div className="min-w-0 flex-1">
				{visible.length > 1
					? <div className="grid h-full w-full min-w-0 gap-0 overflow-hidden" style={group?.splitDirection === "vertical" ? { gridTemplateRows: `repeat(${visible.length}, minmax(0, 1fr))` } : { gridTemplateColumns: `repeat(${visible.length}, minmax(0, 1fr))` }}>
						{visible.map(id => <div key={id} className={cn("min-h-0 min-w-0", group?.splitDirection === "vertical" ? "border-t first:border-t-0" : "border-l first:border-l-0", id === activeId ? "border-border" : "border-border/70")}>{view(id)}</div>)}
					</div>
					: <div className="h-full">{view(activeId)}</div>}
			</div>
			{sidebar && <aside className="flex w-36 min-w-36 flex-col border border-border/70 bg-muted/10" aria-label="Terminals">
				<div className="flex h-[22px] items-stretch justify-end border-b border-border/70">
					<div className="inline-flex h-full items-stretch">
						<TerminalAction label={splitLabel} disabled={busy} onClick={() => splitActive("horizontal")} className={splitClass("inline-flex h-full items-center px-1 text-foreground/90 transition-colors hover:bg-accent/70")}><SquareSplitHorizontal className="size-3.25" /></TerminalAction>
						<TerminalAction label={splitVerticalLabel} disabled={busy} onClick={() => splitActive("vertical")} className={splitClass("inline-flex h-full items-center border-l border-border/70 px-1 text-foreground/90 transition-colors hover:bg-accent/70")}><SquareSplitVertical className="size-3.25" /></TerminalAction>
						<TerminalAction label={newLabel} disabled={busy} onClick={() => void create()} className="inline-flex h-full items-center border-l border-border/70 px-1 text-foreground/90 transition-colors hover:bg-accent/70"><Plus className="size-3.25" /></TerminalAction>
						<TerminalAction label={closeLabel} disabled={busy} onClick={() => close(activeId)} className="inline-flex h-full items-center border-l border-border/70 px-1 text-foreground/90 transition-colors hover:bg-accent/70"><Trash2 className="size-3.25" /></TerminalAction>
					</div>
				</div>
				<div className="min-h-0 flex-1 overflow-y-auto px-1 py-1">
					{layout.groups.map(value => {
						const groupActive = activeId ? value.terminalIds.includes(activeId) : false;
						const GroupIcon = value.terminalIds.length < 2 ? Square : value.splitDirection === "vertical" ? SquareSplitVertical : SquareSplitHorizontal;
						const showHeaders = layout.groups.length > 1 || layout.groups.some(item => item.terminalIds.length > 1);
						return <div key={value.id} className="pb-0.5">
							{showHeaders && <button type="button" onClick={() => activate(groupActive && activeId ? activeId : value.terminalIds[0])}
								className={cn("flex h-[22px] w-full cursor-pointer items-center gap-1 rounded px-1.5 text-[11px]", groupActive ? "bg-accent/50 text-foreground" : "text-muted-foreground hover:bg-accent/40 hover:text-foreground")}>
								<GroupIcon className="size-3 shrink-0" /><span className="min-w-0 flex-1 truncate text-left">{groupLabel(value)}</span><span className="text-[10px] text-muted-foreground/70 tabular-nums">{value.terminalIds.length}</span>
							</button>}
							<div className="flex flex-col gap-0.5">{value.terminalIds.map(id => <div key={id} className={cn("group/tab flex h-6 w-full items-center gap-0.5 rounded-md pr-2 pl-1.5 text-xs", id === activeId ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground")}>
								<button type="button" aria-label={`Close ${label(id)}`} title={`Close ${label(id)}`} onClick={() => close(id)} className="relative flex size-4 shrink-0 items-center justify-center rounded-sm hover:bg-muted">
									<SquareTerminal className="size-3 shrink-0 group-hover/tab:hidden" /><X className="hidden size-3 group-hover/tab:block" />
								</button>
								<button type="button" onClick={() => activate(id)} className="flex min-w-0 flex-1 cursor-pointer items-center gap-1 text-left"><span className="truncate">{label(id)}</span></button>
							</div>)}</div>
						</div>;
					})}
				</div>
			</aside>}
		</div>
	</>);
}

/**
 * A terminal pane tab: `terminalId` is the tab's first terminal. Splits and new terminals made here stay in this tab,
 * in the same project and chat as that terminal.
 */
export function TerminalSurface({ projectId, terminalId }: { projectId: string; terminalId: string }) {
	const sessions = useTerminalSessions();
	const origin = sessions.find(session => session.id === terminalId);
	const adopt = useRef([terminalId]).current;
	return <TerminalWorkspace layoutKey={`tab:${terminalId}`} scope={{ ...(projectId ? { projectId } : {}), ...(origin?.taskId ? { taskId: origin.taskId } : {}) }} adopt={adopt} mode="panel" emptyText="No terminal sessions for this chat yet." />;
}

/** The chat's terminal drawer: under the chat, 280 px by default, resizable between 180 px and 75% of the window. */
export function TerminalDrawer({ projectId, taskId }: { projectId?: string; taskId: string }) {
	const [heights, setHeights] = usePersistedState<Record<string, number>>("phaseo.desktop.terminalDrawerHeight", {});
	const preferred = heights[taskId] ?? TERMINAL_DRAWER_HEIGHT.default;
	const [maximum, setMaximum] = useState(maxDrawerHeight);
	const height = clampDrawerHeight(preferred, maximum);
	const drag = useRef<{ pointerId: number; startY: number; startHeight: number; drawer: HTMLElement | null; height: number } | undefined>(undefined);
	useEffect(() => { const resize = () => setMaximum(maxDrawerHeight()); window.addEventListener("resize", resize); return () => window.removeEventListener("resize", resize); }, []);
	useLayoutEffect(() => { if (drag.current) drag.current.drawer?.style.setProperty("height", `${drag.current.height}px`); });
	const sessions = useTerminalSessions();
	const adopt = useRef<string[]>([]);
	// Terminals opened for this chat elsewhere (a pane tab, the API) also appear in its drawer.
	const own = terminalsFor(sessions, { projectId, taskId }).map(session => session.id);
	if (own.join() !== adopt.current.join()) adopt.current = own;
	const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
		if (event.button !== 0) return;
		event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
		drag.current = { pointerId: event.pointerId, startY: event.clientY, startHeight: height, drawer: event.currentTarget.parentElement, height };
	};
	// The height goes straight to the element while dragging; state is written once on release.
	const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
		const state = drag.current;
		if (!state || state.pointerId !== event.pointerId) return;
		state.height = clampDrawerHeight(state.startHeight + state.startY - event.clientY, maximum);
		state.drawer?.style.setProperty("height", `${state.height}px`);
	};
	const onPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
		const state = drag.current;
		if (!state || state.pointerId !== event.pointerId) return;
		drag.current = undefined;
		if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
		if (state.height !== state.startHeight) setHeights(current => Object.fromEntries(Object.entries({ ...current, [taskId]: state.height }).slice(-200)));
	};
	return <aside data-thread-terminal-drawer aria-label="Terminal" className="relative flex min-w-0 shrink-0 flex-col overflow-hidden border-t border-border/80 bg-background" style={{ height }}>
		<div role="separator" aria-orientation="horizontal" aria-label="Resize terminal" className="absolute inset-x-0 top-0 z-20 h-1.5 cursor-row-resize"
			onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd} onLostPointerCapture={onPointerEnd} onDoubleClick={() => setHeights(current => ({ ...current, [taskId]: TERMINAL_DRAWER_HEIGHT.default }))} />
		<TerminalWorkspace layoutKey={`chat:${taskId}`} scope={{ ...(projectId ? { projectId } : {}), taskId }} adopt={adopt.current} mode="drawer" emptyText="No terminal sessions for this chat yet." />
	</aside>;
}

/** The previous project terminal panel, kept for the current right pane until it mounts terminal tabs. */
export function Terminals({ initialProjectId }: { initialProjectId?: string } = {}) {
	const sessions = useTerminalSessions();
	const projectId = initialProjectId || undefined;
	const adopt = useRef<string[]>([]);
	const own = terminalsFor(sessions, { projectId }).map(session => session.id);
	if (own.join() !== adopt.current.join()) adopt.current = own;
	return <TerminalWorkspace layoutKey={`project:${projectId ?? "personal"}`} scope={projectId ? { projectId } : {}} adopt={adopt.current} mode="panel" emptyText="No terminal sessions for this project yet." />;
}

export function AuthTerminal({ id }: { id: string }) {
	const api = window.phaseoDesktop?.workspace;
	const sessions = useTerminalSessions();
	const session = sessions.find(value => value.id === id);
	const [error, setError] = useState("");
	return <section className="task-auth-terminal" aria-label="Native sign-in terminal"><strong>{session?.title ?? "Native sign-in"}</strong>{error && <p role="alert">{error}</p>}{api && session && <div className="h-80"><TerminalView session={session} api={api} onError={setError} /></div>}</section>;
}
