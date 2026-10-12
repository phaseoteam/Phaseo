import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { WorkspaceApi, WorkspaceCommand } from "../../shared/workspace";
import { emptyOverview, type TaskOverview, type WorkspaceOverview } from "../../shared/workspaceOverview";
import { usePersistedState } from "../lib/persistedState";
import type { ThemePreference } from "../types";

export type WorkspaceMode = "chat" | "code";
export type RightPanelTab = "changes" | "files" | "terminal" | "browser" | "agents";
export type SettingsPage = "general" | "accounts" | "appearance" | "agents" | "mcp" | "missions";
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
	selectedId?: string;
	select: (id?: string) => void;
	compareId?: string;
	openCompare: (id?: string) => void;
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
	openSettings: (page?: SettingsPage) => void;
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

type Location = { mode: WorkspaceMode; selectedId?: string; compareId?: string };

export function WorkspaceProvider({ children }: { children: ReactNode }) {
	const api = window.phaseoDesktop?.workspace;
	const [overview, setOverview] = useState<WorkspaceOverview>(emptyOverview);
	const [error, setError] = useState("");
	const [mode, setModeState] = usePersistedState<WorkspaceMode>("phaseo.desktop.workspaceMode", "chat");
	const [selectedId, setSelectedId] = usePersistedState<string | undefined>("phaseo.desktop.selectedTask", undefined);
	const [compareId, setCompareId] = usePersistedState<string | undefined>("phaseo.desktop.selectedCompare", undefined);
	const [compareGroups, setCompareGroups] = usePersistedState<CompareGroup[]>("phaseo.desktop.compareGroups", []);
	const [newChatProjectId, setNewChatProjectId] = usePersistedState("phaseo.desktop.newChatProject", "");
	const [theme, setTheme] = usePersistedState<ThemePreference>("phaseo.desktop.theme", "system");
	const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("dark");
	const [sidebarOpen, setSidebarOpen] = usePersistedState("phaseo.desktop.sidebarOpen", true);
	const [rightPanel, setRightPanel] = usePersistedState<RightPanelTab | undefined>("phaseo.desktop.rightPanel", undefined);
	const [settings, setSettings] = useState<SettingsPage>();
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

	const location = useMemo(() => ({ mode, selectedId, compareId }), [mode, selectedId, compareId]);
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
		setModeState(target.mode); setSelectedId(target.selectedId); setCompareId(target.compareId);
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

	useEffect(() => api?.onOpenTask(id => { if (id) { setSelectedId(id); setCompareId(undefined); } }), [api, setSelectedId, setCompareId]);

	const taskById = useCallback((id: string) => overview.tasks.find(task => task.id === id), [overview.tasks]);
	const select = useCallback((id?: string) => {
		setCompareId(undefined); setSelectedId(id); setSettings(undefined);
		const task = id ? overview.tasks.find(value => value.id === id) : undefined;
		if (task) setModeState(task.projectId ? "code" : "chat");
	}, [overview.tasks, setCompareId, setSelectedId, setModeState]);
	const openCompare = useCallback((id?: string) => { setSelectedId(undefined); setCompareId(id); setSettings(undefined); if (id) setModeState("chat"); }, [setSelectedId, setCompareId, setModeState]);
	const setMode = useCallback((next: WorkspaceMode) => {
		setModeState(next); setSettings(undefined);
		const task = selectedId ? overview.tasks.find(value => value.id === selectedId) : undefined;
		if (task && (next === "code") !== Boolean(task.projectId)) setSelectedId(undefined);
		if (next === "code") setCompareId(undefined);
	}, [selectedId, overview.tasks, setModeState, setSelectedId, setCompareId]);

	const value: WorkspaceState = {
		api, overview, setOverview, command, error, setError,
		mode, setMode, selectedId, select, compareId, openCompare,
		compareGroups,
		saveCompareGroup: group => setCompareGroups(current => [group, ...current.filter(value => value.id !== group.id)]),
		removeCompareGroup: id => setCompareGroups(current => current.filter(value => value.id !== id)),
		newChatProjectId, setNewChatProjectId,
		theme, setTheme, resolvedTheme,
		sidebarOpen, setSidebarOpen,
		rightPanel, setRightPanel,
		settings, openSettings: page => setSettings(page ?? "general"), closeSettings: () => setSettings(undefined),
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

/** Phaseo accounts that can currently call the gateway. */
export function usablePhaseoAccounts(overview: WorkspaceOverview) {
	return overview.accounts.filter(account => account.harness === "phaseo" && account.configured && !account.archived && (!account.oauthExpiresAt || Date.parse(account.oauthExpiresAt) > Date.now()));
}
