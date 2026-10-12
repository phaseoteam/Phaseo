import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { Files, GitBranch, GitPullRequest, Globe, SquareTerminal, X } from "lucide-react";
import { useWorkspace, type RightPanelTab } from "../app/workspace";
import { usePersistedState } from "../lib/persistedState";
import { cn } from "../lib/utils";
import { Projects } from "../views/Projects";
import { Proposals } from "../views/Proposals";
import { BrowserPanel } from "../views/BrowserPanel";
import { AgentThreadsPanel } from "../components/AgentThreadsPanel";

const Terminals = lazy(() => import("../views/Terminals").then(module => ({ default: module.Terminals })));

const tabs: { id: RightPanelTab | "pulls"; label: string; icon: ReactNode }[] = [
	{ id: "changes", label: "Files & changes", icon: <Files /> },
	{ id: "pulls", label: "Pull requests", icon: <GitPullRequest /> },
	{ id: "terminal", label: "Terminal", icon: <SquareTerminal /> },
	{ id: "browser", label: "Browser", icon: <Globe /> },
	{ id: "agents", label: "Agents", icon: <GitBranch /> },
];

export function RightPanel() {
	const { rightPanel, setRightPanel, selectedId, overview, newChatProjectId, select, commandsOpen, settings } = useWorkspace();
	const [width, setWidth] = usePersistedState("phaseo.desktop.rightPanelWidth", 440);
	const [tab, setTab] = useState<RightPanelTab | "pulls">(rightPanel ?? "changes");
	const [link, setLink] = useState<{ url: string; request: number }>();
	const dragging = useRef<{ x: number; width: number } | undefined>(undefined);
	useEffect(() => { if (rightPanel && rightPanel !== "files") setTab(rightPanel); }, [rightPanel]);
	useEffect(() => {
		const open = (event: Event) => {
			const url = (event as CustomEvent<unknown>).detail;
			if (typeof url !== "string" || !/^https?:\/\//i.test(url)) return;
			setLink({ url, request: Date.now() }); setRightPanel("browser"); setTab("browser");
		};
		window.addEventListener("phaseo:open-context-link", open);
		return () => window.removeEventListener("phaseo:open-context-link", open);
	}, [setRightPanel]);
	if (!rightPanel) return null;
	const task = overview.tasks.find(value => value.id === selectedId);
	const projectId = task?.projectId ?? (selectedId ? undefined : newChatProjectId || undefined) ?? "";
	const safeWidth = Number.isFinite(width) ? Math.max(320, Math.min(960, width)) : 440;
	const content = tab === "changes" ? <Projects key={projectId || "personal"} initialProjectId={projectId} />
		: tab === "pulls" ? <Proposals key={projectId || "personal"} initialProjectId={projectId} />
		: tab === "terminal" ? <Suspense fallback={<p className="p-4 text-xs text-muted-foreground">Opening terminal…</p>}><Terminals key={projectId || "personal"} initialProjectId={projectId} /></Suspense>
		: tab === "browser" ? <BrowserPanel context={selectedId ?? "draft"} covered={commandsOpen || !!settings} requestedLink={link} />
		: <AgentThreadsPanel id={selectedId} onOpen={select} />;
	return <aside aria-label="Tools" style={{ width: safeWidth }} className="relative flex shrink-0 flex-col border-l border-border bg-sidebar/40">
		<div role="separator" aria-orientation="vertical" aria-label="Resize panel" tabIndex={0}
			onPointerDown={event => { dragging.current = { x: event.clientX, width: safeWidth }; event.currentTarget.setPointerCapture(event.pointerId); }}
			onPointerMove={event => { if (dragging.current) setWidth(dragging.current.width + dragging.current.x - event.clientX); }}
			onPointerUp={() => { dragging.current = undefined; }}
			onKeyDown={event => { if (event.key === "ArrowLeft") setWidth(safeWidth + 24); if (event.key === "ArrowRight") setWidth(safeWidth - 24); }}
			className="absolute inset-y-0 -left-1 z-10 w-2 cursor-col-resize hover:bg-ring/20 focus-visible:bg-ring/30" />
		<nav className="flex h-10 shrink-0 items-end gap-0.5 border-b border-border px-2" aria-label="Tool tabs">
			{tabs.map(value => <button key={value.id} type="button" aria-pressed={tab === value.id} title={value.label} onClick={() => setTab(value.id)}
				className={cn("flex h-9 items-center gap-1.5 border-b-2 px-2.5 text-xs font-medium whitespace-nowrap transition-colors [&_svg]:size-3.5", tab === value.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
				{value.icon}<span className={cn(safeWidth < 460 && tab !== value.id && "sr-only")}>{value.label}</span>
			</button>)}
			<button type="button" aria-label="Close panel" onClick={() => setRightPanel(undefined)} className="mb-1.5 ml-auto grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"><X className="size-4" /></button>
		</nav>
		<div className="chat-tools-content legacy-panel min-h-0 flex-1 overflow-auto">{content}</div>
	</aside>;
}
