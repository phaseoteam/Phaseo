import { lazy, Suspense, useEffect, useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { DesktopFrame } from "./components/DesktopFrame";
import { Topbar } from "./components/Topbar";
import { usePersistedState } from "./lib/persistedState";
import type { ProductSurface, ThemePreference } from "./types";
import { PlatformHome } from "./views/PlatformHome";
import { SectionPlaceholder } from "./views/SectionPlaceholder";
import { WorkspaceHome } from "./views/WorkspaceHome";
import { TaskWorkspace } from "./views/TaskWorkspace";
import { Accounts } from "./views/Accounts";
import { Projects } from "./views/Projects";
import { Agents } from "./views/Agents";
import { McpConnections } from "./views/McpConnections";
import { Inbox } from "./views/Inbox";
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
	const [workspaceItem, setWorkspaceItem] = usePersistedState("phaseo.desktop.workspace.item", "home");
	const [platformItem, setPlatformItem] = usePersistedState("phaseo.desktop.platform.item", "overview");
	const [collapsed, setCollapsed] = usePersistedState("phaseo.desktop.sidebar.collapsed", false);
	const [theme, setTheme] = usePersistedState<ThemePreference>("phaseo.desktop.theme", "system");
	const activeItem = surface === "workspace" ? workspaceItem : platformItem;
	const [taskRevision, setTaskRevision] = useState(0);
	const [commandsOpen, setCommandsOpen] = useState(false);
	const navigateWorkspace = (page: string, taskId?: string) => {
		if (page === "tasks") {
			if (taskId) window.localStorage.setItem("phaseo.desktop.selectedTask", JSON.stringify(taskId));
			else window.localStorage.removeItem("phaseo.desktop.selectedTask");
			setTaskRevision(value => value + 1);
		}
		setSurface("workspace"); setWorkspaceItem(page);
	};

	useEffect(() => {
		const media = window.matchMedia("(prefers-color-scheme: dark)");
		const applyTheme = () => { document.documentElement.dataset.theme = theme === "system" ? (media.matches ? "dark" : "light") : theme; };
		applyTheme();
		media.addEventListener("change", applyTheme);
		return () => media.removeEventListener("change", applyTheme);
	}, [theme]);

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (!(event.metaKey || event.ctrlKey)) return;
			if (event.key.toLowerCase() === "k") { event.preventDefault(); setCommandsOpen(value => !value); }
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
		if (surface === "workspace") setWorkspaceItem(item);
		else setPlatformItem(item);
	};

	let content;
	if (surface === "workspace" && (activeItem === "projects" || activeItem === "repositories")) content = <Projects />;
	else if (surface === "workspace" && activeItem === "terminals") content = <Terminals />;
	else if (surface === "workspace" && activeItem === "agents") content = <Agents />;
	else if (surface === "workspace" && activeItem === "mcp") content = <McpConnections />;
	else if (surface === "workspace" && activeItem === "accounts") content = <Accounts />;
	else if (surface === "workspace" && activeItem === "inbox") content = <Inbox onOpenTask={id => navigateWorkspace("tasks", id)} />;
	else if (surface === "workspace" && activeItem === "tasks") content = <TaskWorkspace key={taskRevision} />;
	else if (surface === "workspace" && activeItem === "home") content = <WorkspaceHome onNavigate={navigateWorkspace} />;
	else if (surface === "platform" && activeItem === "overview") content = <PlatformHome />;
	else content = <SectionPlaceholder title={labels[activeItem] ?? "Workspace"} />;

	return (
		<div className="desktop-root">
			<DesktopFrame
				theme={theme}
				onThemeChange={setTheme}
				onNavigate={navigateWorkspace}
			/>
			<div className="app-shell">
				<Sidebar
				surface={surface}
				activeItem={activeItem}
				collapsed={collapsed}
				onSurfaceChange={setSurface}
				onItemChange={changeItem}
					onCollapsedChange={setCollapsed}
					onSearch={() => setCommandsOpen(true)}
				/>
				<div className="app-main">
					<Topbar surface={surface} theme={theme} onThemeChange={setTheme} onNewTask={() => navigateWorkspace("tasks")} onCommands={() => setCommandsOpen(true)} />
					<main className="content-scroll"><Suspense fallback={<p className="page task-muted" role="status">Loading workspace…</p>}>{content}</Suspense></main>
				</div>
			</div>
			{commandsOpen && <CommandPalette onClose={() => setCommandsOpen(false)} onNavigate={navigateWorkspace} onTheme={setTheme} />}
		</div>
	);
}
