import { app, autoUpdater, BrowserWindow, dialog, ipcMain, Menu, Notification, safeStorage, shell } from "electron";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import type { DesktopAppAction, DesktopUpdateState, DesktopWindowAction } from "../shared/desktop";
import { isAllowedExternalUrl } from "../shared/desktop";
import { validateCommand } from "../shared/workspace";
import { WorkspaceRuntime } from "./workspaceRuntime";
import { resolveNativeCommand } from "./nativeProcess";
import { resolveGrokCommand } from "./grokLaunch";
import { grokAccountStatus } from "./grokAccountStatus";
import { grokModelCatalog } from "./grokModelCatalog";
import { SecretVault } from "./secretVault";
import { signInNative } from "./accountConnections";
import { gitReview, listProjectFiles, readProjectFile } from "./projectFiles";
import { editorInstallations, findEditor, launchEditor, openProjectTarget } from "./projectEditors";
import { apiModels, codexModels } from "./modelCatalog";
import { openCodeModels, piModels } from "./nativeModels";
import { resolveOpenCodeCommand } from "./openCodeService";
import { TerminalService } from "./terminalService";
import { contentHash, writeProjectFile } from "./projectEdits";
import { gitBranches, gitCommand } from "./gitOperations";
import { piEntries } from "./piAdapter";
import { exportFilename, saveTaskExport, taskExport } from "./taskExport";
import { readConversation } from "./taskImport";
import { nativeAccountStatus } from "./accountStatus";
import { checkAcpAgent } from "./acpAgentStatus";
import { validateMcpCommand } from "../shared/mcp";
import { validatePreferences } from "../shared/preferences";
import { TaskNotifications } from "./taskNotifications";
import { MissionService } from "./missionService";
import { validateMissionCommand } from "../shared/missions";
import { cursorAccountStatus, cursorModels, cursorSignIn } from "./cursorAccounts";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const preloadPath = path.join(currentDirectory, "../preload/index.cjs");
const rendererPath = path.join(currentDirectory, "../renderer/index.html");
const developmentUrl = process.env.PHASEO_DESKTOP_DEV_URL;
const updateFeedUrl = process.env.PHASEO_DESKTOP_UPDATE_URL;
let workspaceRuntime: WorkspaceRuntime;
let shutdownComplete = false;
let shutdownStarted = false;
const signIns = new Map<string, AbortController>();
const accountChecks = new Map<string, AbortController>();
const agentChecks = new Map<string, AbortController>();
let credentialVault: SecretVault;
let terminalService: TerminalService;
let taskNotifications: TaskNotifications;
let missionService: MissionService;
ipcMain.handle("workspace:missions", event => { if (!senderWindow(event)) throw new Error("Invalid mission request."); return workspaceRuntime.store.missions.list(); });
ipcMain.handle("workspace:mission", (event, value: unknown) => { if (!senderWindow(event)) throw new Error("Invalid mission request."); return missionService.command(validateMissionCommand(value)); });
ipcMain.handle("workspace:preferences", event => { if (!senderWindow(event)) throw new Error("Invalid preferences request."); return { preferences: workspaceRuntime.store.getPreferences(), notificationsSupported: Notification.isSupported() }; });
ipcMain.handle("workspace:save-preferences", (event, value: unknown) => { if (!senderWindow(event)) throw new Error("Invalid preferences request."); const preferences = workspaceRuntime.store.savePreferences(validatePreferences(value)); taskNotifications.configure(preferences); return preferences; });
ipcMain.handle("workspace:mcp", (event, value: unknown) => {
	if (!senderWindow(event)) throw new Error("Invalid MCP request.");
	return workspaceRuntime.mcp(validateMcpCommand(value));
});
ipcMain.handle("workspace:terminals", event => {
	if (!senderWindow(event)) throw new Error("Invalid terminal request.");
	return terminalService.get();
});
ipcMain.handle("workspace:terminal", (event, command: unknown) => {
	if (!senderWindow(event)) throw new Error("Invalid terminal request.");
	if (command && typeof command === "object" && "type" in command && command.type === "open" && "projectId" in command && typeof command.projectId === "string") workspaceRuntime.assertProjectAvailable(command.projectId);
	return terminalService.command(command);
});
ipcMain.handle("workspace:open-link", async (event, value: unknown) => {
	if (!senderWindow(event) || typeof value !== "string") throw new Error("Invalid link.");
	const url = new URL(value);
	if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) throw new Error("Use a web link.");
	await shell.openExternal(url.href);
});
ipcMain.handle("workspace:models", async (event, harness: unknown, accountId: unknown, projectId: unknown) => {
	if (!senderWindow(event) || !["codex", "phaseo", "opencode", "pi", "cursor", "grok"].includes(String(harness)) || (accountId !== undefined && typeof accountId !== "string") || (projectId !== undefined && typeof projectId !== "string")) throw new Error("Model discovery is unavailable for this harness.");
	const project = projectId ? workspaceRuntime.store.getProjects().find(value => value.id === projectId) : undefined;
	if (projectId && !project) throw new Error("Project is unavailable.");
	const cwd = project?.directory ?? app.getPath("userData");
	const account = accountId ? workspaceRuntime.store.getAccounts().find(value => value.id === accountId && value.harness === harness && value.configured) : undefined;
	if (accountId && !account) throw new Error("Account is unavailable.");
	if (harness === "phaseo") {
		if (!account) throw new Error("Choose an API account.");
		return apiModels(account, credentialVault.get(account.secretId ?? account.id));
	}
	if (harness === "cursor") { if (!account || account.archived) throw new Error("Choose a connected Cursor account."); return cursorModels(credentialVault.get(account.secretId ?? account.id)); }
	if (harness === "opencode") return openCodeModels(cwd, await workspaceRuntime.openCode.connect());
	if (harness === "pi") return piModels(cwd);
	if (harness === "grok") return grokModelCatalog(cwd, account);
	return codexModels(cwd, account);
});
app.on("before-quit", event => {
	if (!workspaceRuntime || shutdownComplete) return;
	event.preventDefault();
	if (shutdownStarted) return;
	shutdownStarted = true;
	missionService?.close();
	taskNotifications?.dismiss();
	terminalService?.close();
	for (const controller of signIns.values()) controller.abort();
	for (const controller of accountChecks.values()) controller.abort();
	for (const controller of agentChecks.values()) controller.abort();
	void workspaceRuntime.close().catch(() => { console.error("Workspace shutdown failed."); }).finally(() => { shutdownComplete = true; app.quit(); });
});

ipcMain.handle("workspace:sign-in", async (event, id: unknown) => {
	if (!senderWindow(event) || typeof id !== "string") throw new Error("Invalid sign-in request.");
	const account = workspaceRuntime.store.getAccounts().find(value => value.id === id);
	if (!account) throw new Error("Account no longer exists.");
	if (account.kind !== "native" || account.archived) throw new Error("Choose an active native account for sign-in.");
	if (signIns.has(id) || accountChecks.has(id)) throw new Error("Sign-in or an account check is already in progress.");
	const releaseAccount = workspaceRuntime.beginAccountSignIn(id);
	const controller = new AbortController(); signIns.set(id, controller);
	try {
		if (account.harness === "cursor") {
			if (!credentialVault.available()) throw new Error("Secure credential storage is unavailable on this device.");
			const result = await cursorSignIn(url => shell.openExternal(url), controller.signal);
			if (shutdownStarted || controller.signal.aborted) throw new Error("Sign-in cancelled."); const current = workspaceRuntime.store.getAccounts().find(value => value.id === account.id && !value.archived); if (!current) throw new Error("Account is unavailable.");
			const oldSecret = current.secretId ?? current.id; const newSecret = randomUUID(); credentialVault.set(newSecret, result.apiKey); current.secretId = newSecret; current.configured = true;
			try { workspaceRuntime.store.saveAccount(current); } catch (error) { credentialVault.remove(newSecret); throw error; } credentialVault.remove(oldSecret);
		} else {
			await signInNative(account, url => shell.openExternal(url), controller.signal);
			if (shutdownStarted || controller.signal.aborted) throw new Error("Sign-in cancelled.");
			if (account.harness === "grok") {
				const status = await grokAccountStatus(account.configDirectory!, account, AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]));
				if (status.authenticated !== true) throw new Error("Grok did not confirm this profile is signed in.");
				if (shutdownStarted || controller.signal.aborted) throw new Error("Sign-in cancelled.");
			}
			const current = workspaceRuntime.store.getAccounts().find(value => value.id === account.id); if (!current) throw new Error("Account no longer exists.");
			current.configured = true; workspaceRuntime.store.saveAccount(current);
		}
		const state = workspaceRuntime.store.getOverview(); workspaceRuntime.onChange(state); return state;
	} finally { signIns.delete(id); releaseAccount(); }
});
ipcMain.handle("workspace:cancel-sign-in", (event, id: unknown) => {
	if (!senderWindow(event) || typeof id !== "string") throw new Error("Invalid sign-in request.");
	signIns.get(id)?.abort();
});
ipcMain.handle("workspace:account-status", async (event, harness: unknown, id: unknown) => {
	if (!senderWindow(event) || (harness !== "codex" && harness !== "claude" && harness !== "cursor" && harness !== "grok") || (id !== undefined && typeof id !== "string")) throw new Error("Invalid account status request.");
	const account = id ? workspaceRuntime.store.getAccounts().find(value => value.id === id && value.harness === harness && (value.kind === "native" || harness === "cursor")) : undefined;
	if (id && !account) throw new Error("Account no longer exists.");
	const key = id as string | undefined ?? harness; if (accountChecks.has(key) || (id && signIns.has(id))) throw new Error("An account check or sign-in is already in progress.");
	const controller = new AbortController(); accountChecks.set(key, controller);
	try {
		const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]);
		const cwd = account?.configDirectory ?? app.getPath("userData");
		const status = harness === "cursor" ? await cursorAccountStatus(account?.configured ? credentialVault.get(account.secretId ?? account.id) : undefined) : harness === "grok" ? await grokAccountStatus(cwd, account, signal) : await nativeAccountStatus(harness, cwd, account, signal);
		if (shutdownStarted) throw new Error("The workspace is shutting down.");
		if (account && status.authenticated !== null) { const current = workspaceRuntime.store.getAccounts().find(value => value.id === account.id); if (current) { current.configured = status.authenticated; workspaceRuntime.store.saveAccount(current); workspaceRuntime.onChange(workspaceRuntime.store.getOverview()); } }
		return status;
	} finally { accountChecks.delete(key); }
});
ipcMain.handle("workspace:check-agent", async (event, id: unknown) => {
	if (!senderWindow(event) || typeof id !== "string") throw new Error("Invalid agent check.");
	const agent = workspaceRuntime.store.getAgents().find(value => value.id === id); if (!agent) throw new Error("Agent no longer exists.");
	if (agentChecks.has(id)) throw new Error("This agent is already being checked.");
	const controller = new AbortController(); agentChecks.set(id, controller);
	try { return await checkAcpAgent(agent, app.getPath("userData"), AbortSignal.any([controller.signal, AbortSignal.timeout(30000)])); }
	finally { agentChecks.delete(id); }
});

function projectRoot(event: Electron.IpcMainInvokeEvent, id: unknown) {
	if (!senderWindow(event) || typeof id !== "string") throw new Error("Invalid project request.");
	const project = workspaceRuntime.store.getProjects().find(value => value.id === id);
	if (!project) throw new Error("Project no longer exists.");
	workspaceRuntime.assertProjectAvailable(project.id);
	return project.directory;
}
ipcMain.handle("workspace:list-files", (event, id: unknown, directory: unknown) => {
	const root = projectRoot(event, id);
	if (typeof directory !== "string") throw new Error("Invalid directory.");
	return listProjectFiles(root, directory);
});
ipcMain.handle("workspace:editors", event => {
	if (!senderWindow(event)) throw new Error("Untrusted editor request.");
	return editorInstallations();
});
ipcMain.handle("workspace:open-project", (event, id: unknown, request: unknown) => openProjectTarget(projectRoot(event, id), request, {
	find: findEditor, launch: launchEditor, reveal: filename => shell.showItemInFolder(filename), openFolder: directory => shell.openPath(directory),
}));
ipcMain.handle("workspace:read-file", (event, id: unknown, filename: unknown) => {
	const root = projectRoot(event, id);
	if (typeof filename !== "string") throw new Error("Invalid filename.");
	return readProjectFile(root, filename);
});
ipcMain.handle("workspace:git-review", (event, id: unknown) => gitReview(projectRoot(event, id)));
ipcMain.handle("workspace:git-command", (event, id: unknown, command: unknown) => { const root = projectRoot(event, id); return workspaceRuntime.mutateProject(id as string, () => gitCommand(root, command)); });
ipcMain.handle("workspace:git-branches", (event, id: unknown) => gitBranches(projectRoot(event, id)));
ipcMain.handle("workspace:create-worktree", (event, id: unknown, branch: unknown, base: unknown) => {
	projectRoot(event, id);
	if (typeof id !== "string" || typeof branch !== "string" || typeof base !== "string") throw new Error("Invalid worktree request.");
	return workspaceRuntime.createWorktree(id, branch, base);
});
ipcMain.handle("workspace:remove-worktree", (event, id: unknown) => {
	if (!senderWindow(event) || typeof id !== "string") throw new Error("Invalid worktree request.");
	return workspaceRuntime.removeWorktree(id);
});
ipcMain.handle("workspace:read-document", async (event, id: unknown, filename: unknown) => {
	const root = projectRoot(event, id);
	if (typeof filename !== "string") throw new Error("Invalid file request.");
	const text = await readProjectFile(root, filename);
	return { text, hash: contentHash(text) };
});
ipcMain.handle("workspace:write-document", async (event, id: unknown, filename: unknown, text: unknown, expectedHash: unknown) => {
	const root = projectRoot(event, id);
	if (typeof filename !== "string" || typeof text !== "string" || typeof expectedHash !== "string" || !/^[a-f0-9]{64}$/.test(expectedHash)) throw new Error("Invalid file edit.");
	return workspaceRuntime.mutateProject(id as string, () => writeProjectFile(root, filename, text, expectedHash));
});

ipcMain.handle("workspace:get", event => {
	if (!senderWindow(event)) throw new Error("Untrusted workspace request.");
	return workspaceRuntime.store.get();
});
ipcMain.handle("workspace:overview", event => {
	if (!senderWindow(event)) throw new Error("Untrusted workspace request.");
	return workspaceRuntime.store.getOverview();
});
ipcMain.handle("workspace:task-history", (event, query: unknown) => {
	if (!senderWindow(event)) throw new Error("Untrusted workspace request.");
	return workspaceRuntime.store.taskHistory(query);
});
ipcMain.handle("workspace:task", (event, id: unknown) => {
	if (!senderWindow(event) || typeof id !== "string" || !id || id.length > 200) throw new Error("Invalid task request.");
	return workspaceRuntime.store.getTaskView(id);
});
ipcMain.handle("workspace:conversation-page", (event, query: unknown) => {
	if (!senderWindow(event)) throw new Error("Untrusted workspace request.");
	return workspaceRuntime.store.conversationPage(query);
});
ipcMain.handle("workspace:export-task", async (event, id: unknown, format: unknown) => {
	const window = senderWindow(event);
	if (!window || typeof id !== "string" || (format !== "markdown" && format !== "json")) throw new Error("Invalid conversation export.");
	const task = workspaceRuntime.store.getTask(id);
	const extension = format === "markdown" ? "md" : "json";
	const result = await dialog.showSaveDialog(window, { title: "Export conversation", defaultPath: exportFilename(task.title, format), filters: [{ name: format === "markdown" ? "Markdown" : "JSON with files", extensions: [extension] }] });
	if (result.canceled || !result.filePath) return false;
	if (shutdownStarted) throw new Error("The workspace is shutting down.");
	const content = await taskExport(task, format, workspaceRuntime.attachments);
	await saveTaskExport(result.filePath, content); return true;
});
ipcMain.handle("workspace:import-task", async (event, value: unknown) => {
	const window = senderWindow(event); if (!window) throw new Error("Invalid conversation import.");
	const command = validateCommand(value); if (command.type !== "create-task") throw new Error("Choose a destination for the imported conversation.");
	const result = await dialog.showOpenDialog(window, { title: "Import conversation", properties: ["openFile"], filters: [{ name: "Phaseo conversation", extensions: ["json"] }] });
	if (result.canceled || !result.filePaths[0]) return undefined;
	return workspaceRuntime.importTask(command, await readConversation(result.filePaths[0]));
});
ipcMain.handle("workspace:command", (event, value: unknown) => {
	if (!senderWindow(event)) throw new Error("Untrusted workspace request.");
	return workspaceRuntime.command(validateCommand(value));
});
ipcMain.handle("workspace:choose-project", async event => {
	const window = senderWindow(event);
	if (!window) throw new Error("Untrusted workspace request.");
	const result = await dialog.showOpenDialog(window, { properties: ["openDirectory"], title: "Open project" });
	if (!result.canceled && result.filePaths[0]) workspaceRuntime.store.addProject(result.filePaths[0]);
	const state = workspaceRuntime.store.getOverview(); workspaceRuntime.onChange(state); return state;
});
ipcMain.handle("workspace:choose-attachments", async (event, id: unknown) => {
	const window = senderWindow(event); if (!window || typeof id !== "string") throw new Error("Invalid attachment request.");
	if (workspaceRuntime.store.getTask(id).archived) throw new Error("Restore this task before adding files.");
	const result = await dialog.showOpenDialog(window, { properties: ["openFile", "multiSelections"], title: "Attach files", filters: [{ name: "Images and documents", extensions: ["pdf", "png", "jpg", "jpeg", "gif", "webp", "txt", "md", "csv", "json", "ts", "py"] }, { name: "All files", extensions: ["*"] }] });
	if (result.canceled) return { attachments: [], errors: [] };
	if (result.filePaths.length > 10) throw new Error("Choose up to 10 attachments.");
	if (shutdownStarted) throw new Error("The workspace is shutting down.");
	const imported = await Promise.allSettled(result.filePaths.map(filename => workspaceRuntime.attachments.import(id, filename)));
	return { attachments: imported.flatMap(value => value.status === "fulfilled" ? [value.value] : []), errors: imported.flatMap(value => value.status === "rejected" ? [value.reason instanceof Error ? value.reason.message : "Attachment import failed."] : []) };
});
ipcMain.handle("workspace:attachment", async (event, taskId: unknown, id: unknown) => {
	if (!senderWindow(event) || typeof taskId !== "string" || typeof id !== "string") throw new Error("Invalid attachment request.");
	const task = workspaceRuntime.store.getTask(taskId); const attachment = workspaceRuntime.store.getAttachment(id);
	if (!attachment || (attachment.taskId !== task.id && ![...task.messages, ...task.queue].some(message => message.attachments?.some(value => value.id === id)))) throw new Error("Attachment is unavailable for this task.");
	const content = await workspaceRuntime.attachments.read(id);
	return { attachment, text: content.text, dataUrl: content.dataUrl };
});
ipcMain.handle("workspace:installations", async event => {
	if (!senderWindow(event)) throw new Error("Untrusted workspace request.");
	return Promise.all((["codex", "claude", "opencode", "pi", "cursor", "grok"] as const).map(async harness => {
		try {
			if (harness === "cursor") return { harness, installed: true, version: "SDK 1.0.31" };
			if (harness === "grok") { await resolveGrokCommand(); return { harness, installed: true }; }
			if (harness === "opencode") { const command = await resolveOpenCodeCommand(app.getPath("userData")); return { harness, installed: true, version: command.version }; }
			await resolveNativeCommand(harness, harness === "codex" ? "@openai/codex/bin/codex.js" : harness === "pi" ? piEntries : undefined);
			return { harness, installed: true };
		} catch (error) { return { harness, installed: false, error: error instanceof Error ? error.message : "Installation is unavailable." }; }
	}));
});

function getWindowState(window: BrowserWindow) {
	return {
		isFocused: window.isFocused(),
		isFullScreen: window.isFullScreen(),
		isMaximized: window.isMaximized(),
	};
}

function broadcastWindowState(window: BrowserWindow) {
	window.webContents.send("desktop:window-state", getWindowState(window));
}

function broadcastUpdateState(state: DesktopUpdateState) {
	for (const window of BrowserWindow.getAllWindows()) window.webContents.send("desktop:update-state", state);
}

function createWindow(): BrowserWindow {
	const window = new BrowserWindow({
		width: 1440,
		height: 920,
		minWidth: 1040,
		minHeight: 680,
		show: false,
		backgroundColor: "#101112",
		title: "Phaseo",
		frame: process.platform === "darwin",
		titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "hidden",
		trafficLightPosition: process.platform === "darwin" ? { x: 14, y: 13 } : undefined,
		webPreferences: {
			preload: preloadPath,
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true,
			webSecurity: true,
		},
	});

	if (process.platform === "win32" && "setBackgroundMaterial" in window) {
		window.setBackgroundMaterial("mica");
	}

	window.once("ready-to-show", () => window.show());
	window.on("blur", () => broadcastWindowState(window));
	window.on("focus", () => broadcastWindowState(window));
	window.on("maximize", () => broadcastWindowState(window));
	window.on("unmaximize", () => broadcastWindowState(window));
	window.on("enter-full-screen", () => broadcastWindowState(window));
	window.on("leave-full-screen", () => broadcastWindowState(window));
	window.webContents.setWindowOpenHandler(({ url }) => {
		if (isAllowedExternalUrl(url)) void shell.openExternal(url);
		return { action: "deny" };
	});
	window.webContents.on("will-navigate", (event, url) => {
		const currentUrl = window.webContents.getURL();
		if (url !== currentUrl) event.preventDefault();
	});

	if (developmentUrl) {
		void window.loadURL(developmentUrl);
	} else {
		void window.loadFile(rendererPath);
	}

	return window;
}

function senderWindow(event: Electron.IpcMainInvokeEvent): BrowserWindow | null {
	if (event.senderFrame !== event.sender.mainFrame) return null;
	return BrowserWindow.fromWebContents(event.sender);
}

ipcMain.handle("desktop:get-runtime-info", (event) => senderWindow(event) ? ({
		platform: process.platform,
		version: app.getVersion(),
		isPackaged: app.isPackaged,
	}) : null);

ipcMain.handle("desktop:get-window-state", (event) => {
	const window = senderWindow(event);
	return window ? getWindowState(window) : { isFocused: true, isFullScreen: false, isMaximized: false };
});

ipcMain.handle("desktop:window-action", (event, action: DesktopWindowAction) => {
	const window = senderWindow(event);
	if (!window) return;
	if (action === "close") window.close();
	else if (action === "minimize") window.minimize();
	else if (action === "toggle-maximize") {
		if (window.isMaximized()) window.unmaximize();
		else window.maximize();
	}
});

ipcMain.handle("desktop:app-action", (event, action: DesktopAppAction) => {
	const window = senderWindow(event);
	if (!window) return;
	const contents = window.webContents;
	const actions: Partial<Record<DesktopAppAction, () => void>> = {
		copy: () => contents.copy(), cut: () => contents.cut(), paste: () => contents.paste(),
		"select-all": () => contents.selectAll(), reload: () => contents.reload(),
		"toggle-full-screen": () => window.setFullScreen(!window.isFullScreen()),
		"zoom-in": () => contents.setZoomLevel(contents.getZoomLevel() + 0.5),
		"zoom-out": () => contents.setZoomLevel(contents.getZoomLevel() - 0.5),
		"zoom-reset": () => contents.setZoomLevel(0), quit: () => app.quit(),
	};
	actions[action]?.();
});

ipcMain.handle("desktop:check-for-updates", async (event): Promise<DesktopUpdateState> => {
	if (!senderWindow(event)) return { status: "error", message: "Untrusted update request." };
	if (!app.isPackaged || !updateFeedUrl) return { status: "unsupported", message: "Updates are configured in release builds." };
	broadcastUpdateState({ status: "checking" });
	try {
		autoUpdater.setFeedURL({ url: updateFeedUrl });
		await autoUpdater.checkForUpdates();
		return { status: "checking" };
	} catch (error) {
		const state = { status: "error", message: error instanceof Error ? error.message : "Update check failed." } as const;
		broadcastUpdateState(state);
		return state;
	}
});

ipcMain.handle("desktop:install-update", (event) => {
	if (senderWindow(event)) autoUpdater.quitAndInstall();
});

ipcMain.handle("desktop:open-external", async (event, url: unknown) => {
	if (!senderWindow(event) || typeof url !== "string" || !isAllowedExternalUrl(url)) return false;
	await shell.openExternal(url);
	return true;
});

app.setAppUserModelId("app.phaseo.desktop");
const primaryInstance = app.requestSingleInstanceLock();
if (!primaryInstance) app.quit();
app.on("second-instance", () => {
	const window = BrowserWindow.getAllWindows()[0];
	if (window?.isMinimized()) window.restore(); window?.show(); window?.focus();
});

autoUpdater.on("update-available", () => broadcastUpdateState({ status: "available" }));
autoUpdater.on("update-not-available", () => broadcastUpdateState({ status: "unavailable" }));
autoUpdater.on("update-downloaded", (_event, notes, name) => {
	void notes;
	broadcastUpdateState({ status: "ready", version: name });
});
autoUpdater.on("error", (error) => broadcastUpdateState({ status: "error", message: error.message }));

app.whenReady().then(() => {
	if (!primaryInstance) return;
	const workspaceDirectory = path.join(app.getPath("userData"), "workspace");
	const vault = new SecretVault(path.join(workspaceDirectory, "credentials"), {
		available: () => safeStorage.isEncryptionAvailable() && (process.platform !== "linux" || safeStorage.getSelectedStorageBackend() !== "basic_text"),
		encrypt: value => safeStorage.encryptString(value), decrypt: value => safeStorage.decryptString(value),
	});
	credentialVault = vault;
	workspaceRuntime = new WorkspaceRuntime(workspaceDirectory, undefined, vault);
	taskNotifications = new TaskNotifications({
		focused: () => Boolean(BrowserWindow.getFocusedWindow()), supported: () => Notification.isSupported(),
		show: (title, body, click) => { const notification = new Notification({ title, body, silent: true }); notification.on("click", click); notification.on("failed", () => {}); notification.show(); return () => { notification.removeAllListeners(); notification.close(); }; },
		open: taskId => { if (shutdownStarted) return; const window = BrowserWindow.getAllWindows().find(value => !value.isDestroyed()) ?? createWindow(); if (window.isMinimized()) window.restore(); window.show(); window.focus(); const id = taskId && workspaceRuntime.store.getOverview().tasks.some(value => value.id === taskId) ? taskId : undefined; const navigate = () => { if (!window.isDestroyed()) window.webContents.send("workspace:open-task", id); }; if (window.webContents.isLoading()) window.webContents.once("did-finish-load", navigate); else navigate(); },
	}, workspaceRuntime.store.getPreferences());
	taskNotifications.update(workspaceRuntime.store.getOverview());
	app.on("browser-window-focus", () => taskNotifications.dismiss());
	missionService = new MissionService(workspaceRuntime);
	missionService.onChange = () => { const missions = workspaceRuntime.store.missions.list(); for (const window of BrowserWindow.getAllWindows()) window.webContents.send("workspace:missions-changed", missions); };
	terminalService = new TerminalService(workspaceRuntime.store, path.join(workspaceDirectory, "terminals"));
	workspaceRuntime.onTerminalAuth = (request, signal) => terminalService.authenticate(request, signal);
	workspaceRuntime.getTerminals = () => terminalService.get();
	terminalService.onEvent = event => { for (const window of BrowserWindow.getAllWindows()) window.webContents.send("workspace:terminal-event", event); };
	workspaceRuntime.onChange = state => {
		missionService.observe(state);
		taskNotifications.update(state);
		const overview = state;
		for (const window of BrowserWindow.getAllWindows()) window.webContents.send("workspace:overview-changed", overview);
	};
	if (process.platform !== "darwin") Menu.setApplicationMenu(null);
	createWindow();
	missionService.start();
	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) createWindow();
	});
});

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") app.quit();
});
