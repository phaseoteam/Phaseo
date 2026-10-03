import { app, autoUpdater, BrowserWindow, dialog, ipcMain, Menu, safeStorage, shell } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { DesktopAppAction, DesktopUpdateState, DesktopWindowAction } from "../shared/desktop";
import { isAllowedExternalUrl } from "../shared/desktop";
import { validateCommand } from "../shared/workspace";
import { WorkspaceRuntime } from "./workspaceRuntime";
import { resolveNativeCommand } from "./nativeProcess";
import { SecretVault } from "./secretVault";
import { signInNative } from "./accountConnections";
import { gitReview, listProjectFiles, readProjectFile } from "./projectFiles";
import { apiModels, codexModels } from "./modelCatalog";
import { openCodeModels, piModels } from "./nativeModels";
import { TerminalService } from "./terminalService";
import { contentHash, writeProjectFile } from "./projectEdits";
import { gitBranches, gitCommand } from "./gitOperations";
import { piEntries } from "./piAdapter";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const preloadPath = path.join(currentDirectory, "../preload/index.cjs");
const rendererPath = path.join(currentDirectory, "../renderer/index.html");
const developmentUrl = process.env.PHASEO_DESKTOP_DEV_URL;
const updateFeedUrl = process.env.PHASEO_DESKTOP_UPDATE_URL;
let workspaceRuntime: WorkspaceRuntime;
let shutdownComplete = false;
let shutdownStarted = false;
const signIns = new Map<string, AbortController>();
let credentialVault: SecretVault;
let terminalService: TerminalService;
ipcMain.handle("workspace:terminals", event => {
	if (!senderWindow(event)) throw new Error("Invalid terminal request.");
	return workspaceRuntime.store.getTerminals();
});
ipcMain.handle("workspace:terminal", (event, command: unknown) => {
	if (!senderWindow(event)) throw new Error("Invalid terminal request.");
	return terminalService.command(command);
});
ipcMain.handle("workspace:open-link", async (event, value: unknown) => {
	if (!senderWindow(event) || typeof value !== "string") throw new Error("Invalid link.");
	const url = new URL(value);
	if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) throw new Error("Use a web link.");
	await shell.openExternal(url.href);
});
ipcMain.handle("workspace:models", async (event, harness: unknown, accountId: unknown, projectId: unknown) => {
	if (!senderWindow(event) || !["codex", "phaseo", "opencode", "pi"].includes(String(harness)) || (accountId !== undefined && typeof accountId !== "string") || (projectId !== undefined && typeof projectId !== "string")) throw new Error("Model discovery is unavailable for this harness.");
	const project = projectId ? workspaceRuntime.store.get().projects.find(value => value.id === projectId) : undefined;
	if (projectId && !project) throw new Error("Project is unavailable.");
	const cwd = project?.directory ?? app.getPath("userData");
	const account = accountId ? workspaceRuntime.store.get().accounts.find(value => value.id === accountId && value.harness === harness && value.configured) : undefined;
	if (accountId && !account) throw new Error("Account is unavailable.");
	if (harness === "phaseo") {
		if (!account) throw new Error("Choose an API account.");
		return apiModels(account, credentialVault.get(account.id));
	}
	if (harness === "opencode") return openCodeModels(cwd);
	if (harness === "pi") return piModels(cwd);
	return codexModels(cwd, account);
});
app.on("before-quit", event => {
	if (!workspaceRuntime || shutdownComplete) return;
	event.preventDefault();
	if (shutdownStarted) return;
	shutdownStarted = true;
	terminalService?.close();
	for (const controller of signIns.values()) controller.abort();
	void workspaceRuntime.close().catch(() => { console.error("Workspace shutdown failed."); }).finally(() => { shutdownComplete = true; app.quit(); });
});

ipcMain.handle("workspace:sign-in", async (event, id: unknown) => {
	if (!senderWindow(event) || typeof id !== "string") throw new Error("Invalid sign-in request.");
	const account = workspaceRuntime.store.get().accounts.find(value => value.id === id);
	if (!account) throw new Error("Account no longer exists.");
	if (signIns.has(id)) throw new Error("Sign-in is already in progress.");
	const controller = new AbortController(); signIns.set(id, controller);
	try {
		await signInNative(account, url => shell.openExternal(url), controller.signal);
		if (shutdownStarted || controller.signal.aborted) throw new Error("Sign-in cancelled.");
		account.configured = true; workspaceRuntime.store.saveAccount(account);
		const state = workspaceRuntime.store.get(); workspaceRuntime.onChange(state); return state;
	} finally { signIns.delete(id); }
});
ipcMain.handle("workspace:cancel-sign-in", (event, id: unknown) => {
	if (!senderWindow(event) || typeof id !== "string") throw new Error("Invalid sign-in request.");
	signIns.get(id)?.abort();
});

function projectRoot(event: Electron.IpcMainInvokeEvent, id: unknown) {
	if (!senderWindow(event) || typeof id !== "string") throw new Error("Invalid project request.");
	const project = workspaceRuntime.store.get().projects.find(value => value.id === id);
	if (!project) throw new Error("Project no longer exists.");
	return project.directory;
}
ipcMain.handle("workspace:list-files", (event, id: unknown, directory: unknown) => {
	const root = projectRoot(event, id);
	if (typeof directory !== "string") throw new Error("Invalid directory.");
	return listProjectFiles(root, directory);
});
ipcMain.handle("workspace:read-file", (event, id: unknown, filename: unknown) => {
	const root = projectRoot(event, id);
	if (typeof filename !== "string") throw new Error("Invalid filename.");
	return readProjectFile(root, filename);
});
ipcMain.handle("workspace:git-review", (event, id: unknown) => gitReview(projectRoot(event, id)));
ipcMain.handle("workspace:git-command", (event, id: unknown, command: unknown) => gitCommand(projectRoot(event, id), command));
ipcMain.handle("workspace:git-branches", (event, id: unknown) => gitBranches(projectRoot(event, id)));
ipcMain.handle("workspace:read-document", async (event, id: unknown, filename: unknown) => {
	const root = projectRoot(event, id);
	if (typeof filename !== "string") throw new Error("Invalid file request.");
	const text = await readProjectFile(root, filename);
	return { text, hash: contentHash(text) };
});
ipcMain.handle("workspace:write-document", async (event, id: unknown, filename: unknown, text: unknown, expectedHash: unknown) => {
	const root = projectRoot(event, id);
	if (typeof filename !== "string" || typeof text !== "string" || typeof expectedHash !== "string" || !/^[a-f0-9]{64}$/.test(expectedHash)) throw new Error("Invalid file edit.");
	return writeProjectFile(root, filename, text, expectedHash);
});

ipcMain.handle("workspace:get", event => {
	if (!senderWindow(event)) throw new Error("Untrusted workspace request.");
	return workspaceRuntime.store.get();
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
	const state = workspaceRuntime.store.get(); workspaceRuntime.onChange(state); return state;
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
	return Promise.all((["codex", "claude", "opencode", "pi"] as const).map(async harness => {
		try {
			await resolveNativeCommand(harness, harness === "codex" ? "@openai/codex/bin/codex.js" : harness === "opencode" ? "opencode-ai/bin/opencode" : harness === "pi" ? piEntries : undefined);
			return { harness, installed: true };
		} catch { return { harness, installed: false }; }
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

autoUpdater.on("update-available", () => broadcastUpdateState({ status: "available" }));
autoUpdater.on("update-not-available", () => broadcastUpdateState({ status: "unavailable" }));
autoUpdater.on("update-downloaded", (_event, notes, name) => {
	void notes;
	broadcastUpdateState({ status: "ready", version: name });
});
autoUpdater.on("error", (error) => broadcastUpdateState({ status: "error", message: error.message }));

app.whenReady().then(() => {
	const workspaceDirectory = path.join(app.getPath("userData"), "workspace");
	const vault = new SecretVault(path.join(workspaceDirectory, "credentials"), {
		available: () => safeStorage.isEncryptionAvailable() && (process.platform !== "linux" || safeStorage.getSelectedStorageBackend() !== "basic_text"),
		encrypt: value => safeStorage.encryptString(value), decrypt: value => safeStorage.decryptString(value),
	});
	credentialVault = vault;
	workspaceRuntime = new WorkspaceRuntime(workspaceDirectory, undefined, vault);
	terminalService = new TerminalService(workspaceRuntime.store, path.join(workspaceDirectory, "terminals"));
	terminalService.onEvent = event => { for (const window of BrowserWindow.getAllWindows()) window.webContents.send("workspace:terminal-event", event); };
	workspaceRuntime.onChange = state => {
		for (const window of BrowserWindow.getAllWindows()) window.webContents.send("workspace:changed", state);
	};
	if (process.platform !== "darwin") Menu.setApplicationMenu(null);
	createWindow();
	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) createWindow();
	});
});

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") app.quit();
});
