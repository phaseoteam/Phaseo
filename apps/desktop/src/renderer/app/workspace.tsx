import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { WorkspaceApi, WorkspaceCommand } from "../../shared/workspace";
import { emptyOverview, type TaskOverview, type WorkspaceOverview } from "../../shared/workspaceOverview";
import { usePersistedState } from "../lib/persistedState";

/** The Usage page's views. */
export type UsageView = "cost" | "tokens" | "limits";
import type { ThemePreference } from "../types";

export type WorkspaceMode = "chat" | "code";
/** Code's two views: its threads, or Factory's issues and pull requests. */
export type CodeView = "threads" | "factory";
/** Where Code ▸ Factory is: the open item (`owner/name#number`) and its tab, or the new issue form. */
export type FactoryRoute = { item?: string; tab?: string; page?: "new" };
export type RightPanelSurface = "changes" | "files" | "diff" | "terminal" | "browser" | "agents" | "pulls" | "side";
/** A surface to show in the right pane, "files" for Files, or "restore" to reopen the chat's own tabs. */
export type RightPanelTab = RightPanelSurface | "files" | "restore";
export type SettingsPage = "general" | "appearance" | "notifications" | "accounts" | "usage" | "agents" | "mcp" | "code-hosts" | "outside-agents" | "keyboard" | "diagnostics" | "experimental" | "project" | FactorySettingsPage;
/** Factory's pages in Settings. */
export type FactorySettingsPage = "factory-repositories" | "factory-issues" | "factory-pulls" | "factory-notes" | "factory-checking";
export type CompareGroup = { id: string; title: string; taskIds: string[]; createdAt: string };

type WorkspaceState = {
	api?: WorkspaceApi;
	overview: WorkspaceOverview;
	setOverview: (overview: WorkspaceOverview) => void;
	command: (command: WorkspaceCommand) => Promise<WorkspaceOverview | undefined>;
	error: string;
	setError: (error: string) => void;
	mode: WorkspaceMode;
	setMode: (mode: WorkspaceMode) => void;
	/** Code's view, kept while in Chat. */
	codeView: CodeView;
	/** Opens Code on this view. */
	setCodeView: (view: CodeView) => void;
	factoryRoute: FactoryRoute;
	/** Opens Code ▸ Factory, on an item, its tab or the new issue form when given. */
	openFactory: (route?: FactoryRoute) => void;
	/** Opens a Code thread, even one the overview hasn't listed yet (Factory has just made it). */
	openThread: (id: string) => void;
	selectedId?: string;
	select: (id?: string) => void;
	compareId?: string;
	/** Opens a comparison; a Code fan-out stays in Code. */
	openCompare: (id?: string, mode?: WorkspaceMode) => void;
	compareGroups: CompareGroup[];
	saveCompareGroup: (group: CompareGroup) => void;
	removeCompareGroup: (id: string) => void;
	newChatProjectId: string;
	setNewChatProjectId: (id: string) => void;
	theme: ThemePreference;
	setTheme: (theme: ThemePreference) => void;
	resolvedTheme: "light" | "dark";
	sidebarOpen: boolean;
	setSidebarOpen: (open: boolean | ((open: boolean) => boolean)) => void;
	rightPanel?: RightPanelTab;
	setRightPanel: (tab?: RightPanelTab) => void;
	settings?: SettingsPage;
	/** The scheduled tasks page, opened from the top of the sidebar. */
	scheduled: boolean;
	openScheduled: () => void;
	/** The Pull requests page: every project's pull requests, opened from the Code sidebar under Scheduled tasks. Pull requests belong to projects, so it opens in Code mode. */
	pullRequestsPage: boolean;
	openPullRequests: () => void;
	/** The Inbox: what needs the person across every chat and agent, and Autopilot's decisions. It keeps the current mode. */
	inboxPage: boolean;
	/** Usage: cost and tokens across every harness, today's pace, what got done, and the subscription limits. It keeps the current mode. */
	usagePage: boolean;
	/** Opens Usage, on a given view when asked (the rings open Limits). */
	openUsage: (view?: UsageView) => void;
	usageView: UsageView;
	setUsageView: (view: UsageView) => void;
	openInbox: () => void;
	openSettings: (page?: SettingsPage) => void;
	/** The project the Project settings page shows. */
	settingsProjectId?: string;
	openProjectSettings: (projectId: string) => void;
	closeSettings: () => void;
	commandsOpen: boolean;
	setCommandsOpen: (open: boolean | ((open: boolean) => boolean)) => void;
	history: { back: () => void; forward: () => void; canBack: boolean; canForward: boolean };
	taskById: (id: string) => TaskOverview | undefined;
};

const WorkspaceContext = createContext<WorkspaceState | undefined>(undefined);

export function errorText(reason: unknown) {
	return (reason instanceof Error ? reason.message : String(reason)).replace(/^Error invoking remote method '[^']+': (?:Error: )?/, "");
}

type Location = { mode: WorkspaceMode; codeView?: CodeView; factoryRoute?: FactoryRoute; selectedId?: string; compareId?: string; settings?: SettingsPage; settingsProjectId?: string; scheduled?: boolean; pullRequests?: boolean; inbox?: boolean; usage?: boolean };

export function WorkspaceProvider({ children }: { children: ReactNode }) {
	const api = window.phaseoDesktop?.workspace;
	const [overview, setOverview] = useState<WorkspaceOverview>(emptyOverview);
	const [error, setError] = useState("");
	const [mode, setModeState] = usePersistedState<WorkspaceMode>("phaseo.desktop.workspaceMode", "chat");
	const [codeView, setCodeViewState] = usePersistedState<CodeView>("phaseo.desktop.codeView", "threads");
	const [factoryRoute, setFactoryRoute] = usePersistedState<FactoryRoute>("phaseo.desktop.factoryRoute", {});
	const [selectedId, setSelectedId] = usePersistedState<string | undefined>("phaseo.desktop.selectedTask", undefined);
	const [compareId, setCompareId] = usePersistedState<string | undefined>("phaseo.desktop.selectedCompare", undefined);
	const [compareGroups, setCompareGroups] = usePersistedState<CompareGroup[]>("phaseo.desktop.compareGroups", []);
	const [newChatProjectId, setNewChatProjectId] = usePersistedState("phaseo.desktop.newChatProject", "");
	const [theme, setTheme] = usePersistedState<ThemePreference>("phaseo.desktop.theme", "system");
	const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("dark");
	const [sidebarOpen, setSidebarOpen] = usePersistedState("phaseo.desktop.sidebarOpen", true);
	const [rightPanel, setRightPanel] = usePersistedState<RightPanelTab | undefined>("phaseo.desktop.rightPanel", undefined);
	const [settings, setSettingsState] = useState<SettingsPage>();
	const [scheduled, setScheduled] = useState(false);
	const [pullRequestsPage, setPullRequestsPage] = useState(false);
	const [inboxPage, setInboxPage] = useState(false);
	const [usagePage, setUsagePage] = useState(false);
	const [usageView, setUsageView] = usePersistedState<UsageView>("phaseo.desktop.usageView", "cost");
	const [settingsProjectId, setSettingsProjectId] = useState<string>();
	const setSettings = useCallback((page?: SettingsPage) => { setSettingsState(page); if (page) { setScheduled(false); setPullRequestsPage(false); setInboxPage(false); setUsagePage(false); } }, []);
	const [commandsOpen, setCommandsOpen] = useState(false);
	const [navigation, setNavigation] = useState<{ entries: Location[]; index: number }>({ entries: [], index: -1 });

	useEffect(() => {
		if (!api) return;
		let active = true;
		void api.overview().then(value => { if (active) setOverview(value); }, reason => { if (active) setError(errorText(reason)); });
		const unsubscribe = api.onOverviewChange(setOverview);
		return () => { active = false; unsubscribe(); };
	}, [api]);

	useEffect(() => {
		const media = window.matchMedia("(prefers-color-scheme: dark)");
		const apply = () => {
			const resolved = theme === "system" ? (media.matches ? "dark" : "light") : theme;
			document.documentElement.classList.toggle("dark", resolved === "dark");
			document.documentElement.dataset.theme = resolved;
			setResolvedTheme(resolved);
		};
		apply();
		media.addEventListener("change", apply);
		return () => media.removeEventListener("change", apply);
	}, [theme]);

	const location = useMemo(() => ({ mode, ...(mode === "code" ? { codeView } : {}), ...(mode === "code" && codeView === "factory" ? { factoryRoute } : {}), selectedId, compareId, settings, ...(settings === "project" && settingsProjectId ? { settingsProjectId } : {}), ...(scheduled ? { scheduled } : {}), ...(pullRequestsPage ? { pullRequests: true } : {}), ...(inboxPage ? { inbox: true } : {}), ...(usagePage ? { usage: true } : {}) }), [mode, codeView, factoryRoute, selectedId, compareId, settings, settingsProjectId, scheduled, pullRequestsPage, inboxPage, usagePage]);
	useEffect(() => {
		setNavigation(previous => {
			if (JSON.stringify(previous.entries[previous.index]) === JSON.stringify(location)) return previous;
			const entries = [...previous.entries.slice(0, previous.index + 1), location].slice(-100);
			return { entries, index: entries.length - 1 };
		});
	}, [location]);
	const move = (direction: number) => {
		const target = navigation.entries[navigation.index + direction];
		if (!target) return;
		setNavigation(previous => ({ ...previous, index: previous.index + direction }));
		setModeState(target.mode); if (target.codeView) setCodeViewState(target.codeView); if (target.factoryRoute) setFactoryRoute(target.factoryRoute); setSelectedId(target.selectedId); setCompareId(target.compareId); setSettings(target.settings); setSettingsProjectId(target.settingsProjectId); setScheduled(Boolean(target.scheduled)); setPullRequestsPage(Boolean(target.pullRequests)); setInboxPage(Boolean(target.inbox)); setUsagePage(Boolean(target.usage));
	};

	const command = useCallback(async (value: WorkspaceCommand) => {
		if (!api) { setError("Open the desktop application to use your local workspace."); return; }
		setError("");
		try { const state = await api.command(value); setOverview(state); return state; }
		catch (reason) {
			if (["approval", "answer", "form-answer"].includes(value.type)) throw new Error(errorText(reason), { cause: reason });
			setError(errorText(reason));
		}
	}, [api]);

	// Notifications and scheduled tasks open a chat from anywhere, including the settings page.
	useEffect(() => api?.onOpenTask(id => { if (id) { setCodeViewState("threads"); setSelectedId(id); setCompareId(undefined); setSettings(undefined); setScheduled(false); setPullRequestsPage(false); setInboxPage(false); setUsagePage(false); } }), [api, setSelectedId, setCompareId, setSettings, setCodeViewState]);

	const taskById = useCallback((id: string) => overview.tasks.find(task => task.id === id), [overview.tasks]);
	const select = useCallback((id?: string) => {
		setCompareId(undefined); setSelectedId(id); setSettings(undefined); setScheduled(false); setPullRequestsPage(false); setInboxPage(false); setUsagePage(false);
		const task = id ? overview.tasks.find(value => value.id === id) : undefined;
		if (task) setModeState(task.projectId ? "code" : "chat");
		// A Code thread, or a new chat in Code, shows in Threads.
		if (task ? task.projectId : mode === "code") setCodeViewState("threads");
	}, [overview.tasks, mode, setCompareId, setSelectedId, setModeState, setSettings, setCodeViewState]);
	const openThread = useCallback((id: string) => {
		setCompareId(undefined); setSelectedId(id); setSettings(undefined); setScheduled(false); setPullRequestsPage(false); setInboxPage(false); setUsagePage(false);
		setModeState("code"); setCodeViewState("threads");
	}, [setCompareId, setSelectedId, setModeState, setSettings, setCodeViewState]);
	const openCompare = useCallback((id?: string, mode: WorkspaceMode = "chat") => { setSelectedId(undefined); setCompareId(id); setSettings(undefined); setScheduled(false); setPullRequestsPage(false); setInboxPage(false); setUsagePage(false); if (id) setModeState(mode); }, [setSelectedId, setCompareId, setModeState, setSettings]);
	const openScheduled = useCallback(() => { setSelectedId(undefined); setCompareId(undefined); setSettings(undefined); setPullRequestsPage(false); setInboxPage(false); setUsagePage(false); setScheduled(true); }, [setSelectedId, setCompareId, setSettings]);
	const openPullRequests = useCallback(() => { setSelectedId(undefined); setCompareId(undefined); setSettings(undefined); setScheduled(false); setInboxPage(false); setUsagePage(false); setPullRequestsPage(true); setModeState("code"); setCodeViewState("threads"); }, [setSelectedId, setCompareId, setModeState, setSettings, setCodeViewState]);
	const openInbox = useCallback(() => { setSelectedId(undefined); setCompareId(undefined); setSettings(undefined); setScheduled(false); setPullRequestsPage(false); setUsagePage(false); setInboxPage(true); }, [setSelectedId, setCompareId, setSettings]);
	const openUsage = useCallback((view?: UsageView) => { setSelectedId(undefined); setCompareId(undefined); setSettings(undefined); setScheduled(false); setPullRequestsPage(false); setInboxPage(false); if (view) setUsageView(view); setUsagePage(true); }, [setSelectedId, setCompareId, setSettings, setUsageView]);
	const setMode = useCallback((next: WorkspaceMode) => {
		setModeState(next); setSettings(undefined); setScheduled(false); setPullRequestsPage(false); setInboxPage(false); setUsagePage(false);
		const task = selectedId ? overview.tasks.find(value => value.id === selectedId) : undefined;
		if (task && (next === "code") !== Boolean(task.projectId)) setSelectedId(undefined);
		if (next === "code") setCompareId(undefined);
	}, [selectedId, overview.tasks, setModeState, setSelectedId, setCompareId, setSettings]);
	const setCodeView = useCallback((view: CodeView) => { setMode("code"); setCodeViewState(view); }, [setMode, setCodeViewState]);
	const openFactory = useCallback((route?: FactoryRoute) => { setMode("code"); setCodeViewState("factory"); if (route) setFactoryRoute(route); }, [setMode, setCodeViewState, setFactoryRoute]);

	const value: WorkspaceState = {
		api, overview, setOverview, command, error, setError,
		mode, setMode, codeView, setCodeView, factoryRoute, openFactory, openThread, selectedId, select, compareId, openCompare,
		compareGroups,
		saveCompareGroup: group => setCompareGroups(current => [group, ...current.filter(value => value.id !== group.id)]),
		removeCompareGroup: id => setCompareGroups(current => current.filter(value => value.id !== id)),
		newChatProjectId, setNewChatProjectId,
		theme, setTheme, resolvedTheme,
		sidebarOpen, setSidebarOpen,
		rightPanel, setRightPanel,
		scheduled, openScheduled,
		pullRequestsPage, openPullRequests,
		inboxPage, openInbox, usagePage, openUsage, usageView, setUsageView,
		settings, openSettings: page => setSettings(page ?? "general"), closeSettings: () => setSettings(undefined),
		settingsProjectId, openProjectSettings: id => { setSettingsProjectId(id); setSettings("project"); },
		commandsOpen, setCommandsOpen,
		history: { back: () => move(-1), forward: () => move(1), canBack: navigation.index > 0, canForward: navigation.index < navigation.entries.length - 1 },
		taskById,
	};
	return <WorkspaceContext value={value}>{children}</WorkspaceContext>;
}

export function useWorkspace() {
	const value = useContext(WorkspaceContext);
	if (!value) throw new Error("useWorkspace must be used inside WorkspaceProvider");
	return value;
}

/** For components that also render outside the workspace, such as message previews and tests. */
export function useOptionalWorkspace() { return useContext(WorkspaceContext); }

/** Phaseo accounts that can currently call the gateway. */
export function usablePhaseoAccounts(overview: WorkspaceOverview) {
	return overview.accounts.filter(account => account.harness === "phaseo" && account.configured && !account.archived && (!account.oauthExpiresAt || Date.parse(account.oauthExpiresAt) > Date.now()));
}
