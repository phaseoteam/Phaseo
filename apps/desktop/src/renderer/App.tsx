import { lazy, Suspense, useEffect, useState, useCallback } from "react";
import { Sidebar } from "./components/Sidebar";
import { DesktopFrame } from "./components/DesktopFrame";
import { Topbar } from "./components/Topbar";
import { usePersistedState } from "./lib/persistedState";
import type { ProductSurface, ThemePreference } from "./types";
import { PlatformHome } from "./views/PlatformHome";
import { SectionPlaceholder } from "./views/SectionPlaceholder";
import { BrowserPanel } from "./views/BrowserPanel";
import { PanelRightClose, X } from "lucide-react";
import { TaskWorkspace } from "./views/TaskWorkspace";
import { Accounts } from "./views/Accounts";
import { Projects } from "./views/Projects";
import { Proposals } from "./views/Proposals";
import { Agents } from "./views/Agents";
import { McpConnections } from "./views/McpConnections";
import { Inbox } from "./views/Inbox";
import { WorkspaceSettings } from "./views/WorkspaceSettings";
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
	const [tool, setTool] = useState<"projects" | "proposals" | "terminals" | "browser">();
	const [chatCommandsOpen, setChatCommandsOpen] = useState(false);
	const [chatContext, setChatContext] = useState<{ id?: string; projectId?: string }>({});
	const onChatContext = useCallback((context: { id?: string; projectId?: string }) => setChatContext(context), []);
	const settingsPages = ["settings", "accounts", "agents", "mcp", "missions"];
	const settingsOpen = settingsPages.includes(workspaceItem);
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
	else settingsContent = <WorkspaceSettings />;
	const footer = <><button type="button" onClick={() => setWorkspaceItem("inbox")}>Inbox</button><button type="button" onClick={() => setWorkspaceItem("settings")}>Settings</button><button type="button" onClick={() => setSurface("platform")}>Platform</button></>;
	const content = surface === "workspace" ? <div className="chat-shell">
		<div className="chat-shell-main"><TaskWorkspace key={taskRevision} onContextChange={onChatContext} onOverlayChange={setChatCommandsOpen} footer={footer} />
		{(settingsOpen || workspaceItem === "inbox") && <section className="chat-settings-overlay" aria-label={settingsOpen ? "Settings" : "Inbox"}>
			<header className="chat-settings-header"><nav aria-label="Settings sections">{settingsOpen && settingsPages.map(page => <button key={page} type="button" aria-pressed={workspaceItem === page} onClick={() => setWorkspaceItem(page)}>{({ settings: "General", accounts: "Accounts", agents: "Agents", mcp: "MCP", missions: "Schedules" } as Record<string, string>)[page]}</button>)}</nav><button type="button" aria-label="Back to chat" onClick={() => setWorkspaceItem("tasks")}><X size={16} /></button></header>
			<div className="chat-settings-content">{settingsOpen ? settingsContent : <Inbox onOpenTask={id => navigateWorkspace("tasks", id)} />}</div>
		</section>}
		</div>
		{tool && !settingsOpen && workspaceItem !== "inbox" && <aside className="chat-tools" aria-label="Chat tools"><header className="chat-tools-header"><nav aria-label="Chat tool tabs">{(["projects", "proposals", "terminals", "browser"] as const).map(page => <button type="button" key={page} aria-pressed={tool === page} onClick={() => setTool(page)}>{({ projects: "Files & Git", proposals: "PRs", terminals: "Terminal", browser: "Browser" })[page]}</button>)}</nav><button type="button" aria-label="Close tools" onClick={() => setTool(undefined)}><PanelRightClose size={16} /></button></header><div className="chat-tools-content">
			{tool === "projects" && <Projects key={chatContext.projectId ?? "personal"} initialProjectId={chatContext.projectId ?? ""} />}
			{tool === "proposals" && <Proposals key={chatContext.projectId ?? "personal"} initialProjectId={chatContext.projectId ?? ""} />}
			{tool === "terminals" && <Terminals key={chatContext.projectId ?? "personal"} initialProjectId={chatContext.projectId ?? ""} />}
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
					<Topbar surface={surface} theme={resolvedTheme} onThemeChange={setTheme} onNewTask={() => navigateWorkspace("tasks")} onCommands={() => setCommandsOpen(true)} onChats={() => { setSurface("workspace"); setWorkspaceItem("tasks"); }} onTools={() => setTool(value => value ? undefined : "browser")} />
					<main className="content-scroll"><Suspense fallback={<p className="page task-muted" role="status">Loading workspace…</p>}>{content}</Suspense></main>
				</div>
			</div>
			{commandsOpen && <CommandPalette onClose={() => setCommandsOpen(false)} onNavigate={navigateWorkspace} onTheme={setTheme} />}
		</div>
	);
}
