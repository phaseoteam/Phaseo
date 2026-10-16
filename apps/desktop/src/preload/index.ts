import { contextBridge, ipcRenderer } from "electron";
import type { PhaseoDesktopApi } from "../shared/desktop";

const taskOpenListeners = new Set<(taskId?: string) => void>();
let pendingTaskOpen: { id?: string } | undefined;
ipcRenderer.on("workspace:open-task", (_event, id?: string) => { if (taskOpenListeners.size) for (const listener of taskOpenListeners) listener(id); else pendingTaskOpen = { id }; });

const desktopApi: PhaseoDesktopApi = {
	platform: process.platform,
	browserDownload: command => ipcRenderer.invoke("desktop:browser-download", command),
	onBrowserDownloads: listener => { const subscription = (_event: Electron.IpcRendererEvent, values: Parameters<typeof listener>[0]) => listener(values); ipcRenderer.on("desktop:browser-downloads", subscription); return () => ipcRenderer.removeListener("desktop:browser-downloads", subscription); },
	browser: command => ipcRenderer.invoke("desktop:browser", command),
	onBrowserOpenTab: listener => { const subscription = (_event: Electron.IpcRendererEvent, request: Parameters<typeof listener>[0]) => listener(request); ipcRenderer.on("desktop:browser-open-tab", subscription); return () => ipcRenderer.removeListener("desktop:browser-open-tab", subscription); },
	onBrowserState: listener => { const subscription = (_event: Electron.IpcRendererEvent, state: Parameters<typeof listener>[0]) => listener(state); ipcRenderer.on("desktop:browser-state", subscription); return () => ipcRenderer.removeListener("desktop:browser-state", subscription); },
	browserCapture: id => ipcRenderer.invoke("desktop:browser-capture", id),
	browserPick: (id, cancel) => ipcRenderer.invoke("desktop:browser-pick", id, cancel === true),
	browserLocalServers: () => ipcRenderer.invoke("desktop:browser-local-servers"),
	browserProbe: url => ipcRenderer.invoke("desktop:browser-probe", url),
	browserRecordingSource: id => ipcRenderer.invoke("desktop:browser-recording-source", id),
	browserRecordingSave: (mimeType, data) => ipcRenderer.invoke("desktop:browser-recording-save", mimeType, data),
	browserRecordingReveal: path => ipcRenderer.invoke("desktop:browser-recording-reveal", path),
	onBrowserAgentTab: listener => { const subscription = (_event: Electron.IpcRendererEvent, tab: Parameters<typeof listener>[0]) => listener(tab); ipcRenderer.on("desktop:browser-agent-tab", subscription); return () => ipcRenderer.removeListener("desktop:browser-agent-tab", subscription); },
	onBrowserKey: listener => { const subscription = (_event: Electron.IpcRendererEvent, key: Parameters<typeof listener>[0]) => listener(key); ipcRenderer.on("desktop:browser-key", subscription); return () => ipcRenderer.removeListener("desktop:browser-key", subscription); },
	workspace: {
		missions: () => ipcRenderer.invoke("workspace:missions"),
		mission: command => ipcRenderer.invoke("workspace:mission", command),
		onMissionsChange: listener => { const subscription = (_event: Electron.IpcRendererEvent, missions: Parameters<typeof listener>[0]) => listener(missions); ipcRenderer.on("workspace:missions-changed", subscription); return () => ipcRenderer.removeListener("workspace:missions-changed", subscription); },
		preferences: () => ipcRenderer.invoke("workspace:preferences"),
		savePreferences: preferences => ipcRenderer.invoke("workspace:save-preferences", preferences),
		globalInstructions: () => ipcRenderer.invoke("workspace:global-instructions"),
		saveGlobalInstructions: edit => ipcRenderer.invoke("workspace:save-global-instructions", edit),
		onOpenTask: listener => { taskOpenListeners.add(listener); if (pendingTaskOpen) { const pending = pendingTaskOpen; pendingTaskOpen = undefined; listener(pending.id); } return () => { taskOpenListeners.delete(listener); }; },
		get: () => ipcRenderer.invoke("workspace:get"),
		nativeActions: target => ipcRenderer.invoke("workspace:native-actions", target),
		promptCommands: (projectId, request) => ipcRenderer.invoke("workspace:prompt-commands", projectId, request),
		mcpPrompts: (taskId, request) => ipcRenderer.invoke("workspace:mcp-prompts", taskId, request),
		mcpPromptAttachments: (taskId, messages) => ipcRenderer.invoke("workspace:mcp-prompt-attachments", taskId, messages),
		overview: () => ipcRenderer.invoke("workspace:overview"),
		onOverviewChange: listener => { const subscription = (_event: Electron.IpcRendererEvent, state: Parameters<typeof listener>[0]) => listener(state); ipcRenderer.on("workspace:overview-changed", subscription); return () => ipcRenderer.removeListener("workspace:overview-changed", subscription); },
		task: id => ipcRenderer.invoke("workspace:task", id),
		taskHistory: query => ipcRenderer.invoke("workspace:task-history", query),
		conversationPage: query => ipcRenderer.invoke("workspace:conversation-page", query),
		command: command => ipcRenderer.invoke("workspace:command", command),
		chooseProject: () => ipcRenderer.invoke("workspace:choose-project"),
		updateProject: update => ipcRenderer.invoke("workspace:update-project", update),
		projectFile: projectId => ipcRenderer.invoke("workspace:project-file", projectId),
		createWorktree: (id, branch, base) => ipcRenderer.invoke("workspace:create-worktree", id, branch, base),
		pullRequestWorktree: (id, number) => ipcRenderer.invoke("workspace:pull-request-worktree", id, number),
		pullRequestCheckoutHere: (id, number) => ipcRenderer.invoke("workspace:pull-request-checkout-here", id, number),
		pullRequestGuide: (id, number, write) => ipcRenderer.invoke("workspace:pull-request-guide", id, number, write === true),
		removeWorktree: id => ipcRenderer.invoke("workspace:remove-worktree", id),
		pasteImage: (id, name, bytes) => ipcRenderer.invoke("workspace:paste-image", id, name, bytes),
		chooseAttachments: id => ipcRenderer.invoke("workspace:choose-attachments", id),
		exportTask: (id, format) => ipcRenderer.invoke("workspace:export-task", id, format),
		importTask: configuration => ipcRenderer.invoke("workspace:import-task", configuration),
		attachment: (taskId, id) => ipcRenderer.invoke("workspace:attachment", taskId, id),
		installations: () => ipcRenderer.invoke("workspace:installations"),
		updateHarness: harness => ipcRenderer.invoke("workspace:update-harness", harness),
		cancelHarnessUpdate: () => ipcRenderer.invoke("workspace:cancel-harness-update"),
		harnessUpdateStatus: () => ipcRenderer.invoke("workspace:harness-update-status"),
		checkAgent: id => ipcRenderer.invoke("workspace:check-agent", id),
		mcp: command => ipcRenderer.invoke("workspace:mcp", command),
		models: (harness, accountId, projectId) => ipcRenderer.invoke("workspace:models", harness, accountId, projectId),
		refreshModels: (harness, accountId) => ipcRenderer.invoke("workspace:refresh-models", harness, accountId),
		onModelsChange: listener => { const subscription = (_event: Electron.IpcRendererEvent, change: Parameters<typeof listener>[0]) => listener(change); ipcRenderer.on("workspace:models-changed", subscription); return () => ipcRenderer.removeListener("workspace:models-changed", subscription); },
		linkTitle: url => ipcRenderer.invoke("workspace:link-title", url),
		openLink: url => ipcRenderer.invoke("workspace:open-link", url),
		terminals: () => ipcRenderer.invoke("workspace:terminals"),
		terminal: command => ipcRenderer.invoke("workspace:terminal", command),
		onTerminalEvent: listener => {
			const subscription = (_event: Electron.IpcRendererEvent, event: Parameters<typeof listener>[0]) => listener(event);
			ipcRenderer.on("workspace:terminal-event", subscription);
			return () => ipcRenderer.removeListener("workspace:terminal-event", subscription);
		},
		signInPhaseo: id => ipcRenderer.invoke("workspace:phaseo-sign-in", id),
		cancelPhaseoSignIn: () => ipcRenderer.invoke("workspace:phaseo-cancel-sign-in"),
		signIn: id => ipcRenderer.invoke("workspace:sign-in", id),
		accountStatus: (harness, id) => ipcRenderer.invoke("workspace:account-status", harness, id),
		usageHubs: request => ipcRenderer.invoke("workspace:usage-hubs", request),
		cancelSignIn: id => ipcRenderer.invoke("workspace:cancel-sign-in", id),
		listFiles: (id, directory) => ipcRenderer.invoke("workspace:list-files", id, directory),
		searchFiles: (id, query) => ipcRenderer.invoke("workspace:search-files", id, query),
		editors: () => ipcRenderer.invoke("workspace:editors"),
		openProject: (id, request) => ipcRenderer.invoke("workspace:open-project", id, request),
		readFile: (id, filename) => ipcRenderer.invoke("workspace:read-file", id, filename),
		readDocument: (id, filename) => ipcRenderer.invoke("workspace:read-document", id, filename),
		writeDocument: (id, filename, text, expectedHash) => ipcRenderer.invoke("workspace:write-document", id, filename, text, expectedHash),
		gitReview: id => ipcRenderer.invoke("workspace:git-review", id),
		pullRequestContents: (id, query) => ipcRenderer.invoke("workspace:pull-request-contents", id, query),
		pullRequestFiles: (id, query) => ipcRenderer.invoke("workspace:pull-request-files", id, query),
		pullRequestThreads: (id, query) => ipcRenderer.invoke("workspace:pull-request-threads", id, query),
		pullRequest: (id, number) => ipcRenderer.invoke("workspace:pull-request", id, number),
		pullRequests: (id, cursor) => ipcRenderer.invoke("workspace:pull-requests", id, cursor),
		pullRequestView: (id, number) => ipcRenderer.invoke("workspace:pull-request-view", id, number),
		pullRequestCandidates: (id, query) => ipcRenderer.invoke("workspace:pull-request-candidates", id, query),
		pullRequestAction: (id, request) => ipcRenderer.invoke("workspace:pull-request-action", id, request),
		pullRequestBehind: (id, query) => ipcRenderer.invoke("workspace:pull-request-behind", id, query),
		pullRequestFilesViewed: (id, number) => ipcRenderer.invoke("workspace:pull-request-files-viewed", id, number),
		setPullRequestFilesViewed: (id, request) => ipcRenderer.invoke("workspace:pull-request-set-files-viewed", id, request),
		gitHunks: (id, filename, staged) => ipcRenderer.invoke("workspace:git-hunks", id, filename, staged),
		gitDiffContents: (id, request) => ipcRenderer.invoke("workspace:git-diff-contents", id, request),
		gitCommand: (id, command) => ipcRenderer.invoke("workspace:git-command", id, command),
		gitBranches: id => ipcRenderer.invoke("workspace:git-branches", id),
		gitDiff: (id, request) => ipcRenderer.invoke("workspace:git-diff", id, request),
		gitDiffFile: (id, request) => ipcRenderer.invoke("workspace:git-diff-file", id, request),
		gitRefs: id => ipcRenderer.invoke("workspace:git-refs", id),
		projectTree: (id, request, refresh) => ipcRenderer.invoke("workspace:project-tree", id, request, refresh === true),
		filePreview: (id, filename) => ipcRenderer.invoke("workspace:file-preview", id, filename),
	},
	getRuntimeInfo: () => ipcRenderer.invoke("desktop:get-runtime-info"),
	getWindowState: () => ipcRenderer.invoke("desktop:get-window-state"),
	performWindowAction: (action) => ipcRenderer.invoke("desktop:window-action", action),
	performAppAction: (action) => ipcRenderer.invoke("desktop:app-action", action),
	keybindings: {
		get: () => ipcRenderer.invoke("desktop:keybindings"),
		save: entries => ipcRenderer.invoke("desktop:save-keybindings", entries),
		open: () => ipcRenderer.invoke("desktop:open-keybindings"),
		onChange: listener => {
			const subscription = (_event: Electron.IpcRendererEvent, state: Parameters<typeof listener>[0]) => listener(state);
			ipcRenderer.on("desktop:keybindings-changed", subscription);
			return () => ipcRenderer.removeListener("desktop:keybindings-changed", subscription);
		},
	},
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
