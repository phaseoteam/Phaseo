import { AgentThreadsPanel } from "./components/AgentThreadsPanel";
import { lazy, Suspense, useEffect, useState, useCallback, useRef, type CSSProperties } from "react";
import { Sidebar } from "./components/Sidebar";
import { DesktopFrame } from "./components/DesktopFrame";
import { ToolsResizeHandle } from "./components/ToolsResizeHandle";
import { Topbar } from "./components/Topbar";
import { usePersistedState } from "./lib/persistedState";
import type { ProductSurface, ThemePreference } from "./types";
import { PlatformHome } from "./views/PlatformHome";
import { SectionPlaceholder } from "./views/SectionPlaceholder";
import { ContextLinkPanel } from "./views/ContextLinkPanel";
import { richLink } from "./lib/richLink";
import { GitHubMark } from "./components/GitHubMark";
import { BrowserPanel } from "./views/BrowserPanel";
import { PanelRightClose, Minimize2, X, Files, Terminal, Globe, Inbox as InboxIcon, Settings2, GitBranch } from "lucide-react";
import { TaskWorkspace } from "./views/TaskWorkspace";
import { Accounts } from "./views/Accounts";
import { Projects } from "./views/Projects";
import { Proposals } from "./views/Proposals";
import { Agents } from "./views/Agents";
import { McpConnections } from "./views/McpConnections";
import { Inbox } from "./views/Inbox";
import { WorkspaceSettings } from "./views/WorkspaceSettings";
import { AppearanceSettings } from "./views/AppearanceSettings";
import { SettingsNavigation } from "./components/SettingsNavigation";
import { ScrollArea } from "./components/ScrollArea";
import { Missions } from "./views/Missions";
import { CommandPalette } from "./components/CommandPalette";

const Terminals = lazy(() => import("./views/Terminals").then(module => ({ default: module.Terminals })));

const labels: Record<string, string> = {
	inbox: "Inbox",
	missions: "Missions",
	projects: "Projects",
	repositories: "Repositories",
	proposals: "Proposals",
	agents: "Agents",
	rooms: "Rooms",
	models: "Models",
	providers: "Providers",
	gateway: "Gateway",
	observability: "Observability",
};

type NavigationLocation = { surface: ProductSurface; workspaceItem: string; platformItem: string; taskId?: string };

export function App() {
	const [surface, setSurface] = usePersistedState<ProductSurface>("phaseo.desktop.surface", "workspace");
	const [workspaceItem, setWorkspaceItem] = usePersistedState("phaseo.desktop.workspace.item", "tasks");
	const [platformItem, setPlatformItem] = usePersistedState("phaseo.desktop.platform.item", "overview");
	const [collapsed, setCollapsed] = usePersistedState("phaseo.desktop.sidebar.collapsed", false);
	const [theme, setTheme] = usePersistedState<ThemePreference>("phaseo.desktop.theme", "system");
	const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">(() => window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
	const activeItem = surface === "workspace" ? workspaceItem : platformItem;
	const [taskRevision, setTaskRevision] = useState(0);
	const [commandsOpen, setCommandsOpen] = useState(false);
	const [toolsWidth, setToolsWidth] = usePersistedState("phaseo.desktop.tools.width", 480);
	const safeToolsWidth = Number.isFinite(toolsWidth) ? Math.max(320, Math.min(900, toolsWidth)) : 480;
	const [tool, setTool] = useState<"projects" | "proposals" | "terminals" | "browser" | "link" | "agents">();
	const [toolsExpanded, setToolsExpanded] = useState(false);
	useEffect(() => { if (!tool) setToolsExpanded(false); }, [tool]);
	const [contextLink, setContextLink] = useState<{ url: string; request: number }>();
	useEffect(() => { const open = (event: Event) => { const url = (event as CustomEvent<unknown>).detail; if (typeof url !== "string" || !/^https?:\/\//i.test(url)) return; setContextLink({ url, request: Date.now() }); setTool("link"); }; window.addEventListener("phaseo:open-context-link", open); return () => window.removeEventListener("phaseo:open-context-link", open); }, []);
	const [chatCommandsOpen, setChatCommandsOpen] = useState(false);
	const [chatContext, setChatContext] = useState<{ id?: string; projectId?: string }>({});
	useEffect(() => {
		if (!toolsExpanded) return;
		const shell = document.querySelector<HTMLElement>(".chat-shell");
		const dock = shell?.querySelector<HTMLElement>(".chat-composer-dock");
		if (!shell || !dock) return;
		const observer = new ResizeObserver(() => shell.style.setProperty("--tools-composer-height", `${dock.getBoundingClientRect().height + 32}px`));
		observer.observe(dock);
		return () => { observer.disconnect(); shell.style.removeProperty("--tools-composer-height"); };
	}, [toolsExpanded, chatContext.id]);
	const [navigation, setNavigation] = useState<{ entries: NavigationLocation[]; index: number }>({ entries: [], index: -1 });
	const restoring = useRef<NavigationLocation | undefined>(undefined);
	useEffect(() => {
		const location = { surface, workspaceItem, platformItem, taskId: chatContext.id };
		if (restoring.current) {
			if (JSON.stringify(restoring.current) === JSON.stringify(location)) restoring.current = undefined;
			return;
		}
		setNavigation(previous => {
			if (JSON.stringify(previous.entries[previous.index]) === JSON.stringify(location)) return previous;
			const entries = [...previous.entries.slice(0, previous.index + 1), location].slice(-100);
			return { entries, index: entries.length - 1 };
		});
	}, [surface, workspaceItem, platformItem, chatContext.id]);
	const moveNavigation = (direction: number) => {
		const index = navigation.index + direction;
		const location = navigation.entries[index];
		if (!location) return;
		restoring.current = location;
		setNavigation(previous => ({ ...previous, index }));
		setSurface(location.surface); setWorkspaceItem(location.workspaceItem); setPlatformItem(location.platformItem);
		if (location.taskId) window.localStorage.setItem("phaseo.desktop.selectedTask", JSON.stringify(location.taskId));
		else window.localStorage.removeItem("phaseo.desktop.selectedTask");
		setChatContext({ id: location.taskId });
		setTaskRevision(value => value + 1);
	};
	const onChatContext = useCallback((context: { id?: string; projectId?: string }) => setChatContext(context), []);
	const settingsPages = ["settings", "appearance", "accounts", "agents", "mcp", "missions"];
	const settingsOpen = settingsPages.includes(workspaceItem);
	const wasSettingsOpen = useRef(false);
	useEffect(() => {
		if (wasSettingsOpen.current && !settingsOpen) document.querySelector<HTMLButtonElement>('[aria-label="Open settings"]')?.focus();
		wasSettingsOpen.current = settingsOpen;
	}, [settingsOpen]);
	useEffect(() => {
		if (!settingsOpen) return;
		const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape" && !event.defaultPrevented && !event.isComposing && !(event.target instanceof HTMLElement && event.target.closest('[role="dialog"], [role="listbox"], [data-slot="select-content"]'))) { event.preventDefault(); setWorkspaceItem("tasks"); } };
		window.addEventListener("keydown", closeOnEscape);
		return () => window.removeEventListener("keydown", closeOnEscape);
	}, [settingsOpen, setWorkspaceItem]);
	const navigateWorkspace = (page: string, taskId?: string) => {
		if (page === "tasks") {
			if (taskId) window.localStorage.setItem("phaseo.desktop.selectedTask", JSON.stringify(taskId));
			else window.localStorage.removeItem("phaseo.desktop.selectedTask");
			setTaskRevision(value => value + 1);
		}
		setSurface("workspace");
		if (["projects", "repositories", "proposals", "terminals", "browser"].includes(page)) { setTool(page === "repositories" ? "projects" : page as "projects" | "proposals" | "terminals" | "browser"); setWorkspaceItem("tasks"); }
		else setWorkspaceItem(["home", "rooms"].includes(page) ? "tasks" : page);
	};

	useEffect(() => {
		return window.phaseoDesktop?.workspace.onOpenTask(id => { if (id) window.localStorage.setItem("phaseo.desktop.selectedTask", JSON.stringify(id)); setTaskRevision(value => value + 1); setSurface("workspace"); setWorkspaceItem(id ? "tasks" : "inbox"); });
	}, [setSurface, setWorkspaceItem]);

	useEffect(() => {
		const media = window.matchMedia("(prefers-color-scheme: dark)");
		const applyTheme = () => { const resolved = theme === "system" ? (media.matches ? "dark" : "light") : theme; document.documentElement.dataset.theme = resolved; setResolvedTheme(resolved); };
		applyTheme();
		media.addEventListener("change", applyTheme);
		return () => media.removeEventListener("change", applyTheme);
	}, [theme]);

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.isComposing || !(event.metaKey || event.ctrlKey)) return;
			if (event.key.toLowerCase() === "k") { event.preventDefault(); if (!event.repeat) setCommandsOpen(value => !value); }
			if (event.key === "1") {
				event.preventDefault();
				setSurface("workspace");
			}
			if (event.key === "2") {
				event.preventDefault();
				setSurface("platform");
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [setSurface]);

	const changeItem = (item: string) => {
		if (item === "settings") { setSurface("workspace"); setWorkspaceItem(item); return; }
		if (surface === "workspace") setWorkspaceItem(item);
		else setPlatformItem(item);
	};

	let settingsContent;
	if (workspaceItem === "accounts") settingsContent = <Accounts />;
	else if (workspaceItem === "agents") settingsContent = <Agents />;
	else if (workspaceItem === "mcp") settingsContent = <McpConnections />;
	else if (workspaceItem === "missions") settingsContent = <Missions onOpenTask={id => navigateWorkspace("tasks", id)} onNewTask={() => navigateWorkspace("tasks")} />;
	else if (workspaceItem === "appearance") settingsContent = <AppearanceSettings theme={theme} onThemeChange={setTheme} />;
	else settingsContent = <WorkspaceSettings />;
	const footer = <><button type="button" onClick={() => setWorkspaceItem("inbox")}><InboxIcon size={16} />Inbox</button><button type="button" aria-label="Open settings" onClick={() => setWorkspaceItem("settings")}><Settings2 size={16} />Settings</button></>;
	const content = surface === "workspace" ? <div className={`chat-shell${toolsExpanded && tool ? " tools-expanded" : ""}${collapsed ? " chats-collapsed" : ""}`}>
		<div className="chat-shell-main"><div className="chat-live-workspace" inert={settingsOpen || workspaceItem === "inbox"}><TaskWorkspace key={taskRevision} onContextChange={onChatContext} onOverlayChange={setChatCommandsOpen} sidebarCollapsed={collapsed} footer={footer} /></div>
		{(settingsOpen || workspaceItem === "inbox") && <section className="chat-settings-overlay" aria-label={settingsOpen ? "Settings" : "Inbox"}>
			{settingsOpen && <SettingsNavigation active={workspaceItem} onSelect={setWorkspaceItem} onBack={() => setWorkspaceItem("tasks")} />}
			<div className="settings-page-main"><header className="chat-settings-header"><span>{settingsOpen ? "Settings" : "Inbox"}</span><button type="button" aria-label="Close settings" title="Back to chat" onClick={() => setWorkspaceItem("tasks")}><X size={16} /></button></header>
			<ScrollArea className="settings-content-scroll" viewportClassName="chat-settings-content">{settingsOpen ? settingsContent : <Inbox onOpenTask={id => navigateWorkspace("tasks", id)} />}</ScrollArea></div>
		</section>}
		</div>
		{tool && !settingsOpen && workspaceItem !== "inbox" && <aside className="chat-tools" aria-label="Chat tools" style={{ "--tools-width": `${safeToolsWidth}px` } as CSSProperties}><ToolsResizeHandle width={safeToolsWidth} onChange={setToolsWidth} onRestore={() => setToolsExpanded(false)} onExpand={() => setToolsExpanded(true)} onClose={() => setTool(undefined)} /><header className="chat-tools-header"><nav aria-label="Chat tool tabs">{(["agents", "projects", "terminals", "browser"] as const).map(page => <button type="button" key={page} aria-pressed={tool === page} onClick={() => setTool(page)}>{page === "agents" ? <GitBranch size={14} /> : page === "projects" ? <Files size={14} /> : page === "terminals" ? <Terminal size={14} /> : <Globe size={14} />}<span>{({ agents: "Agents", projects: "Files & Git", proposals: "PRs", terminals: "Terminal", browser: "Browser" })[page]}</span></button>)}{contextLink && <button type="button" aria-pressed={tool === "link"} onClick={() => setTool("link")}>{richLink(contextLink.url)?.github ? <GitHubMark /> : <Globe size={14} />}<span>{richLink(contextLink.url)?.label ?? richLink(contextLink.url)?.fallback}</span></button>}</nav>{toolsExpanded && <button type="button" aria-label="Restore tools size" onClick={() => setToolsExpanded(false)}><Minimize2 size={16} /></button>}<button type="button" aria-label="Close tools" onClick={() => setTool(undefined)}><PanelRightClose size={16} /></button></header><div className="chat-tools-content">
			{tool === "link" && contextLink && <ContextLinkPanel key={contextLink.request} link={contextLink} projectId={chatContext.projectId} context={chatContext.id ?? "draft"} covered={commandsOpen || chatCommandsOpen || settingsOpen || workspaceItem === "inbox"} />}
			{tool === "agents" && <AgentThreadsPanel id={chatContext.id} onOpen={id => { window.localStorage.setItem("phaseo.desktop.selectedTask", JSON.stringify(id)); setTaskRevision(value => value + 1); }} />}
			{tool === "projects" && <Projects key={chatContext.projectId ?? "personal"} initialProjectId={chatContext.projectId ?? ""} />}
			{tool === "proposals" && <Proposals key={chatContext.projectId ?? "personal"} initialProjectId={chatContext.projectId ?? ""} />}
			{tool === "terminals" && <Suspense fallback={<p className="task-muted" role="status">Opening terminal…</p>}><Terminals key={chatContext.projectId ?? "personal"} initialProjectId={chatContext.projectId ?? ""} /></Suspense>}
			{tool === "browser" && <BrowserPanel context={chatContext.id ?? "draft"} covered={commandsOpen || chatCommandsOpen || settingsOpen || workspaceItem === "inbox"} />}
		</div></aside>}
	</div> : activeItem === "overview" ? <PlatformHome /> : <SectionPlaceholder title={labels[activeItem] ?? "Platform"} />;

	return (
		<div className="desktop-root">
			<DesktopFrame
				theme={theme}
				onThemeChange={setTheme}
				onNavigate={navigateWorkspace}
			/>
			<div className="app-shell">
				{surface === "platform" && <Sidebar
				surface={surface}
				activeItem={activeItem}
				collapsed={collapsed}
				onSurfaceChange={setSurface}
				onItemChange={changeItem}
					onCollapsedChange={setCollapsed}
					onSearch={() => setCommandsOpen(true)}
				/>}
				<div className="app-main">
					<Topbar canBack={navigation.index > 0} canForward={navigation.index < navigation.entries.length - 1} onBack={() => moveNavigation(-1)} onForward={() => moveNavigation(1)} onSurfaceChange={setSurface} surface={surface} theme={resolvedTheme} onThemeChange={setTheme} onNewTask={() => navigateWorkspace("tasks")} onCommands={() => setCommandsOpen(true)} onChats={() => setCollapsed(value => !value)} onTools={() => setTool(value => value ? undefined : "browser")} />
					<main className="content-scroll"><Suspense fallback={<p className="page task-muted" role="status">Loading workspace…</p>}>{content}</Suspense></main>
				</div>
			</div>
			{commandsOpen && <CommandPalette onClose={() => setCommandsOpen(false)} onNavigate={navigateWorkspace} onTheme={setTheme} />}
		</div>
	);
}
