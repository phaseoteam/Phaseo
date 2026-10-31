import { useEffect } from "react";
import { setDynamicCommands, useCommand, useKeybindingDispatcher, useKeybindings } from "./lib/keybindings";
import { projectActionCommands } from "../shared/projectSettings";
import { sidebarOrder } from "./lib/sidebarOrder";
import { X } from "lucide-react";
import { useThreadActions } from "./shell/threadActions";
import { runUndo } from "./shell/threadUndo";
import { isSettled } from "../shared/threadLifecycle";
import { useAppTheme } from "./lib/appTheme";
import { useWorkspace, WorkspaceProvider } from "./app/workspace";
import { Titlebar } from "./shell/Titlebar";
import { HistoryNavigation } from "./shell/HistoryNavigation";
import { Sidebar } from "./shell/Sidebar";
import { RightPanel } from "./shell/RightPanel";
import { BrowserMiniPlayerHost } from "./components/browser/BrowserMiniPlayer";
import { CommandPalette } from "./shell/CommandPalette";
import { Toaster } from "./components/ui/toast";
import { QuitRecoveryOffer } from "./chat/UsageLimitNotice";
import { SettingsPage } from "./settings/SettingsPage";
import { ScheduledTasks } from "./views/ScheduledTasks";
import { Inbox } from "./views/Inbox";
import { Usage } from "./views/Usage";
import { PullRequestsPage } from "./views/pullRequests/PullRequestsPage";
import { ChatNotifications } from "./app/ChatNotifications";
import { NewChat } from "./chat/NewChat";
import { ChatView } from "./chat/ChatView";
import { CompareView } from "./chat/CompareView";
import { GuideRunNotices } from "./views/pullRequests/GuideRunNotices";
import { FactoryPage } from "./factory/FactoryPage";

/** The app-wide commands behind the keyboard shortcuts (Settings → Keyboard shortcuts). */
function useShortcuts() {
	const { setCommandsOpen, select, openSettings, setMode, setSidebarOpen, setRightPanel, rightPanel, overview, selectedId, mode, settings } = useWorkspace();
	const threadActions = useThreadActions();
	useKeybindings();
	// Project actions with shortcuts become commands of their own (Settings → Keyboard shortcuts → Project actions).
	useEffect(() => setDynamicCommands(projectActionCommands(overview.projects)), [overview.projects]);
	useKeybindingDispatcher(() => ({ chatMode: mode === "chat", codeMode: mode === "code", chatOpen: Boolean(selectedId) && !settings, paneOpen: Boolean(rightPanel) && !settings, settingsOpen: Boolean(settings) }));
	useCommand("commandPalette.toggle", () => setCommandsOpen(open => !open));
	useCommand("chat.new", () => select(undefined));
	useCommand("settings.open", () => openSettings());
	useCommand("mode.chat", () => setMode("chat"));
	useCommand("mode.code", () => setMode("code"));
	useCommand("sidebar.toggle", () => setSidebarOpen(open => !open));
	useCommand("terminal.toggle", () => setRightPanel(rightPanel === "terminal" ? undefined : "terminal"));
	useCommand("rightPanel.toggle", () => setRightPanel(rightPanel ? undefined : "restore"));
	// T3: undo the last settle, snooze, unpin or archive; settle the open Code chat and move to the next, or un-settle it.
	useCommand("thread.undo", () => runUndo());
	useCommand("thread.settle", () => {
		const task = overview.tasks.find(value => value.id === selectedId);
		if (!task?.projectId) return false;
		let scope = ""; try { scope = JSON.parse(localStorage.getItem("phaseo.desktop.codeProjectScope") ?? "\"\"") as string; } catch { /* All projects. */ }
		void (isSettled(task) ? threadActions.unsettle(task) : threadActions.settle(task, scope));
	});
	// T3: Ctrl+1–9 open the chats shown in the sidebar; Ctrl+Shift+[ and ] step through them.
	const jump = (index: number) => { const id = sidebarOrder()[index]; if (!id) return false; select(id); };
	const step = (direction: number) => { const order = sidebarOrder(); if (!order.length) return false; const index = selectedId ? order.indexOf(selectedId) : -1; select(order[index < 0 ? (direction > 0 ? 0 : order.length - 1) : (index + direction + order.length) % order.length]); };
	useCommand("thread.jump.1", () => jump(0)); useCommand("thread.jump.2", () => jump(1)); useCommand("thread.jump.3", () => jump(2));
	useCommand("thread.jump.4", () => jump(3)); useCommand("thread.jump.5", () => jump(4)); useCommand("thread.jump.6", () => jump(5));
	useCommand("thread.jump.7", () => jump(6)); useCommand("thread.jump.8", () => jump(7)); useCommand("thread.jump.9", () => jump(8));
	useCommand("thread.previous", () => step(-1));
	useCommand("thread.next", () => step(1));
	useCommand("view.zoomIn", () => void window.phaseoDesktop?.performAppAction("zoom-in"));
	useCommand("view.zoomOut", () => void window.phaseoDesktop?.performAppAction("zoom-out"));
	useCommand("view.zoomReset", () => void window.phaseoDesktop?.performAppAction("zoom-reset"));
}

function Main() {
	const { selectedId, compareId, compareGroups, settings, scheduled, pullRequestsPage, inboxPage, usagePage, mode, codeView } = useWorkspace();
	if (settings) return <SettingsPage />;
	if (inboxPage) return <Inbox />;
	if (usagePage) return <Usage />;
	if (scheduled) return <ScheduledTasks />;
	if (pullRequestsPage) return <PullRequestsPage />;
	if (mode === "code" && codeView === "factory") return <FactoryPage />;
	const group = compareGroups.find(value => value.id === compareId);
	if (group) return <CompareView key={group.id} group={group} />;
	// One ChatView across chats: its task cache and composer editor survive switching, so nothing flickers.
	if (selectedId) return <ChatView id={selectedId} />;
	return <NewChat />;
}

function ErrorBanner() {
	const { error, setError } = useWorkspace();
	if (!error) return null;
	return <div role="alert" className="absolute bottom-24 left-1/2 z-40 flex max-w-xl -translate-x-1/2 items-start gap-3 rounded-xl border border-destructive/30 bg-popover px-4 py-3 text-[13px] shadow-lg">
		<span className="min-w-0 flex-1 whitespace-pre-wrap text-destructive">{error}</span>
		<button type="button" aria-label="Dismiss" onClick={() => setError("")} className="grid size-5 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"><X className="size-3.5" /></button>
	</div>;
}

function Shell() {
	const { sidebarOpen, settings } = useWorkspace();
	useShortcuts();
	return <div className="flex h-full flex-col">
		<Titlebar />
		<div className="relative flex min-h-0 flex-1">
			{(sidebarOpen || settings) && <Sidebar />}
			{/* A maximised pane takes the chat column's place. */}
			<main className="relative min-w-0 flex-1 bg-background [&:has(~aside[data-maximized])]:hidden"><Main /><BrowserMiniPlayerHost /></main>
			<RightPanel />
			<ErrorBanner />
		</div>
		<CommandPalette />
		<HistoryNavigation />
		<Toaster />
		<ChatNotifications />
		<GuideRunNotices />
		<QuitRecoveryOffer />
	</div>;
}

export function App() {
	useAppTheme();
	return <WorkspaceProvider><Shell /></WorkspaceProvider>;
}
