import { lazy, Suspense, useEffect } from "react";
import { projectScopeKey } from "./shell/codeThreads";
import { projectScopes } from "../shared/projectShelf";
import { setDynamicCommands, useCommand, useCommands, useKeybindingDispatcher, useKeybindings } from "./lib/keybindings";
import { readPersistedValue, writePersistedValue } from "./lib/persistedState";
import { requestThemeEditor } from "./lib/themeEditorRequest";
import { draftWorkspaceKey } from "./chat/WorktreeTarget";
import { openInFavouriteEditor } from "./shell/PaletteExtras";
import { projectActionCommands } from "../shared/projectSettings";
import { sidebarOrder } from "./lib/sidebarOrder";
import { X } from "lucide-react";
import { useThreadActions } from "./shell/threadActions";
import { runUndo } from "./shell/threadUndo";
import { isSettled } from "../shared/threadLifecycle";
import { useAppTheme } from "./lib/appTheme";
import { useWorkspace, WorkspaceProvider } from "./app/workspace";
import { useAppCommandHost } from "./lib/appCommands";
import { Titlebar } from "./shell/Titlebar";
import { typeIntoComposer } from "./chat/composerFocusRedirect";
import { HistoryNavigation } from "./shell/HistoryNavigation";
import { moveRegionFocus } from "./shell/focusRegions";
import { showToast } from "./components/ui/toast";
import { Sidebar } from "./shell/Sidebar";
import { RightPanel } from "./shell/RightPanel";
import { BrowserMiniPlayerHost } from "./components/browser/BrowserMiniPlayer";
import { CommandPalette } from "./shell/CommandPalette";
import { Toaster } from "./components/ui/toast";
import { QuitHoldNotice } from "./shell/QuitHoldNotice";
import { QuitRecoveryOffer } from "./chat/UsageLimitNotice";
import { ChatNotifications } from "./app/ChatNotifications";
import { GuideRunNotices } from "./views/pullRequests/GuideRunNotices";
import { saveChatPreferences, useDiffColours, useWorkspacePreferences } from "./lib/workspacePreferences";
import { useAppFonts } from "./lib/appFonts";
import { useAnimations } from "./lib/animations";

/** The app-wide commands behind the keyboard shortcuts (Settings → Keyboard shortcuts). */
function useShortcuts() {
	const { setCommandsOpen, select, openSettings, openUsage, setMode, setSidebarOpen, setRightPanel, rightPanel, overview, selectedId, mode, settings, usagePage, scheduled, inboxPage, pullRequestsPage, compareId, codeView, theme, setTheme, newChatProjectId, setNewChatProjectId } = useWorkspace();
	const threadActions = useThreadActions();
	useKeybindings();
	// Project actions with shortcuts become commands of their own (Settings → Keyboard shortcuts → Project actions).
	useEffect(() => setDynamicCommands(projectActionCommands(overview.projects)), [overview.projects]);
	// draftRoute: the New chat page is what the main column shows; modelPickerOpen is read when a key is pressed.
	const draftRoute = !selectedId && !settings && !usagePage && !scheduled && !inboxPage && !pullRequestsPage && !compareId && !(mode === "code" && codeView === "factory");
	useKeybindingDispatcher(() => ({ chatMode: mode === "chat", codeMode: mode === "code", chatOpen: Boolean(selectedId) && !settings, paneOpen: Boolean(rightPanel) && !settings, settingsOpen: Boolean(settings),
		usagePageOpen: usagePage && !settings, draftRoute, modelPickerOpen: Boolean(document.getElementById("model-picker-list")) }), typeIntoComposer);
	useCommand("commandPalette.toggle", () => setCommandsOpen(open => !open));
	useCommand("chat.new", () => select(undefined));
	useCommand("settings.open", () => openSettings());
	useCommand("mode.chat", () => setMode("chat"));
	useCommand("mode.code", () => setMode("code"));
	useCommand("sidebar.toggle", () => setSidebarOpen(open => !open));
	// Code chats always work in a project, so a chat without one is a Chat-mode chat.
	useCommand("chat.newWithoutProject", () => { setMode("chat"); select(undefined); });
	useCommand("usage.open", () => openUsage());
	useCommand("theme.select", () => openSettings("appearance"));
	// System, then light, then dark, and round again.
	const richText = useWorkspacePreferences().chat.richTextComposer;
	useCommand("composer.richText", () => { void saveChatPreferences({ richTextComposer: !richText }); });
	useCommand("appearance.cycle", () => {
		const next = theme === "system" ? "light" : theme === "light" ? "dark" : "system";
		setTheme(next); showToast("info", `Appearance: ${next === "system" ? "System" : next === "light" ? "Light" : "Dark"}`);
	});
	useCommand("themeEditor.toggle", () => { openSettings("appearance"); requestThemeEditor(); });
	useCommand("workspace.focusNext", () => moveRegionFocus(1));
	useCommand("workspace.focusPrevious", () => moveRegionFocus(-1));
	const openChat = () => overview.tasks.find(value => value.id === selectedId);
	// A new Code chat in the open chat's project (or the last one chosen), in the project's own checkout, not a worktree.
	useCommand("chat.newLocal", () => {
		const projectId = openChat()?.projectId ?? newChatProjectId, project = overview.projects.find(value => value.id === projectId), root = project?.worktree?.sourceProjectId ?? project?.id;
		setMode("code");
		if (root) { setNewChatProjectId(root); writePersistedValue(draftWorkspaceKey, { ...readPersistedValue<Record<string, string>>(draftWorkspaceKey, {}), [root]: "local" }); }
		select(undefined);
	});
	useCommand("editor.openFavorite", () => { const projectId = openChat()?.projectId; if (!projectId) return false; void openInFavouriteEditor(projectId); });
	// The composer's own controls, marked with data-composer-shortcut; nothing happens when the open composer has no such control.
	useCommands(["composer.mode", "composer.workspace", "composer.branch"], command => {
		const control = document.querySelector<HTMLButtonElement>(`main [data-composer-shortcut="${command}"]`);
		if (!control || control.disabled) return false;
		control.focus(); control.click();
	});
	useCommand("thread.pin", () => { const task = openChat(); if (!task) return false; void threadActions.pin(task); });
	useCommand("thread.copyReference", () => {
		const task = openChat(); if (!task) return false;
		void navigator.clipboard.writeText(task.id).then(() => showToast("success", "Chat ID copied"), () => showToast("error", "Could not copy the chat ID"));
	});
	useCommand("terminal.toggle", () => setRightPanel(rightPanel === "terminal" ? undefined : "terminal"));
	useCommand("rightPanel.toggle", () => setRightPanel(rightPanel ? undefined : "restore"));
	// Undo the last settle, snooze, unpin or archive; settle the open Code chat and move to the next, or un-settle it.
	useCommand("thread.undo", () => runUndo());
	useCommand("thread.settle", () => {
		const task = overview.tasks.find(value => value.id === selectedId);
		if (!task?.projectId) return false;
		let scope: string[] = []; try { scope = projectScopes(JSON.parse(localStorage.getItem(projectScopeKey) ?? "[]")); } catch { /* All projects. */ }
		void (isSettled(task) ? threadActions.unsettle(task) : threadActions.settle(task, scope));
	});
	// Ctrl+1–9 open the chats shown in the sidebar; Ctrl+Shift+[ and ] step through them.
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

// Each view loads on its own when first shown, so the sidebar paints without waiting for the code of every page.
const SettingsPage = lazy(() => import("./settings/SettingsPage").then(module => ({ default: module.SettingsPage })));
const ScheduledTasks = lazy(() => import("./views/ScheduledTasks").then(module => ({ default: module.ScheduledTasks })));
const Inbox = lazy(() => import("./views/Inbox").then(module => ({ default: module.Inbox })));
const Usage = lazy(() => import("./views/Usage").then(module => ({ default: module.Usage })));
const PullRequestsPage = lazy(() => import("./views/pullRequests/PullRequestsPage").then(module => ({ default: module.PullRequestsPage })));
const NewChat = lazy(() => import("./chat/NewChat").then(module => ({ default: module.NewChat })));
const ChatView = lazy(() => import("./chat/ChatView").then(module => ({ default: module.ChatView })));
const CompareView = lazy(() => import("./chat/CompareView").then(module => ({ default: module.CompareView })));
const FactoryPage = lazy(() => import("./factory/FactoryPage").then(module => ({ default: module.FactoryPage })));

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
	useAppCommandHost();
	return <div className="flex h-full flex-col">
		<Titlebar />
		<div className="relative flex min-h-0 flex-1">
			{(sidebarOpen || settings) && <Sidebar />}
			{/* A maximised pane takes the chat column's place. */}
			<main className="relative min-w-0 flex-1 bg-background [&:has(~aside[data-maximized])]:hidden"><Suspense><Main /></Suspense><BrowserMiniPlayerHost /></main>
			<RightPanel />
			<ErrorBanner />
		</div>
		<CommandPalette />
		<HistoryNavigation />
		<Toaster />
		<QuitHoldNotice />
		<ChatNotifications />
		<GuideRunNotices />
		<QuitRecoveryOffer />
	</div>;
}

export function App() {
	useAppTheme();
	useDiffColours();
	useAppFonts();
	useAnimations();
	return <WorkspaceProvider><Shell /></WorkspaceProvider>;
}
