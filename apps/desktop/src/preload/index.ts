import { contextBridge, ipcRenderer } from "electron";
import type { PhaseoDesktopApi } from "../shared/desktop";

const taskOpenListeners = new Set<(taskId?: string) => void>();
let pendingTaskOpen: { id?: string } | undefined;
ipcRenderer.on("workspace:open-task", (_event, id?: string) => { if (taskOpenListeners.size) for (const listener of taskOpenListeners) listener(id); else pendingTaskOpen = { id }; });

const desktopApi: PhaseoDesktopApi = {
	workspace: {
		missions: () => ipcRenderer.invoke("workspace:missions"),
		mission: command => ipcRenderer.invoke("workspace:mission", command),
		onMissionsChange: listener => { const subscription = (_event: Electron.IpcRendererEvent, missions: Parameters<typeof listener>[0]) => listener(missions); ipcRenderer.on("workspace:missions-changed", subscription); return () => ipcRenderer.removeListener("workspace:missions-changed", subscription); },
		preferences: () => ipcRenderer.invoke("workspace:preferences"),
		savePreferences: preferences => ipcRenderer.invoke("workspace:save-preferences", preferences),
		onOpenTask: listener => { taskOpenListeners.add(listener); if (pendingTaskOpen) { const pending = pendingTaskOpen; pendingTaskOpen = undefined; listener(pending.id); } return () => { taskOpenListeners.delete(listener); }; },
		get: () => ipcRenderer.invoke("workspace:get"),
		overview: () => ipcRenderer.invoke("workspace:overview"),
		onOverviewChange: listener => { const subscription = (_event: Electron.IpcRendererEvent, state: Parameters<typeof listener>[0]) => listener(state); ipcRenderer.on("workspace:overview-changed", subscription); return () => ipcRenderer.removeListener("workspace:overview-changed", subscription); },
		task: id => ipcRenderer.invoke("workspace:task", id),
		taskHistory: query => ipcRenderer.invoke("workspace:task-history", query),
		command: command => ipcRenderer.invoke("workspace:command", command),
		chooseProject: () => ipcRenderer.invoke("workspace:choose-project"),
		createWorktree: (id, branch, base) => ipcRenderer.invoke("workspace:create-worktree", id, branch, base),
		removeWorktree: id => ipcRenderer.invoke("workspace:remove-worktree", id),
		chooseAttachments: id => ipcRenderer.invoke("workspace:choose-attachments", id),
		exportTask: (id, format) => ipcRenderer.invoke("workspace:export-task", id, format),
		importTask: configuration => ipcRenderer.invoke("workspace:import-task", configuration),
		attachment: (taskId, id) => ipcRenderer.invoke("workspace:attachment", taskId, id),
		installations: () => ipcRenderer.invoke("workspace:installations"),
		checkAgent: id => ipcRenderer.invoke("workspace:check-agent", id),
		mcp: command => ipcRenderer.invoke("workspace:mcp", command),
		models: (harness, accountId, projectId) => ipcRenderer.invoke("workspace:models", harness, accountId, projectId),
		openLink: url => ipcRenderer.invoke("workspace:open-link", url),
		terminals: () => ipcRenderer.invoke("workspace:terminals"),
		terminal: command => ipcRenderer.invoke("workspace:terminal", command),
		onTerminalEvent: listener => {
			const subscription = (_event: Electron.IpcRendererEvent, event: Parameters<typeof listener>[0]) => listener(event);
			ipcRenderer.on("workspace:terminal-event", subscription);
			return () => ipcRenderer.removeListener("workspace:terminal-event", subscription);
		},
		signIn: id => ipcRenderer.invoke("workspace:sign-in", id),
		accountStatus: (harness, id) => ipcRenderer.invoke("workspace:account-status", harness, id),
		cancelSignIn: id => ipcRenderer.invoke("workspace:cancel-sign-in", id),
		listFiles: (id, directory) => ipcRenderer.invoke("workspace:list-files", id, directory),
		readFile: (id, filename) => ipcRenderer.invoke("workspace:read-file", id, filename),
		readDocument: (id, filename) => ipcRenderer.invoke("workspace:read-document", id, filename),
		writeDocument: (id, filename, text, expectedHash) => ipcRenderer.invoke("workspace:write-document", id, filename, text, expectedHash),
		gitReview: id => ipcRenderer.invoke("workspace:git-review", id),
		gitCommand: (id, command) => ipcRenderer.invoke("workspace:git-command", id, command),
		gitBranches: id => ipcRenderer.invoke("workspace:git-branches", id),
	},
	getRuntimeInfo: () => ipcRenderer.invoke("desktop:get-runtime-info"),
	getWindowState: () => ipcRenderer.invoke("desktop:get-window-state"),
	performWindowAction: (action) => ipcRenderer.invoke("desktop:window-action", action),
	performAppAction: (action) => ipcRenderer.invoke("desktop:app-action", action),
	checkForUpdates: () => ipcRenderer.invoke("desktop:check-for-updates"),
	installUpdate: () => ipcRenderer.invoke("desktop:install-update"),
	onWindowStateChange: (listener) => {
		const subscription = (_event: Electron.IpcRendererEvent, state: Parameters<typeof listener>[0]) => listener(state);
		ipcRenderer.on("desktop:window-state", subscription);
		return () => ipcRenderer.removeListener("desktop:window-state", subscription);
	},
	onUpdateStateChange: (listener) => {
		const subscription = (_event: Electron.IpcRendererEvent, state: Parameters<typeof listener>[0]) => listener(state);
		ipcRenderer.on("desktop:update-state", subscription);
		return () => ipcRenderer.removeListener("desktop:update-state", subscription);
	},
	openExternal: (url) => ipcRenderer.invoke("desktop:open-external", url),
};

contextBridge.exposeInMainWorld("phaseoDesktop", desktopApi);
